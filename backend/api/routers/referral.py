import re
from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response
from loguru import logger
from pydantic import BaseModel, Field, SecretStr, StringConstraints, field_validator, model_validator
from sqlalchemy import func, select, update
from sqlalchemy.orm import aliased

from backend.admin_stats import stats_period
from backend.api.common import get_session, require_admin
from backend.api.security import validate_twa_data
from backend.database.models import PartnerAccount, PartnerEarning, PartnerWithdrawal, Payment, ReferralAttribution, TrackingLink, User
from backend.friends import friend_invite_link
from backend.referral_analytics import PAGE_SIZE, referral_member, referral_report
from backend.referrals import MIN_WITHDRAWAL, link_data, new_partner_link, partner_balance, require_partner
from backend.telegram.notify import notify
from settings import settings

router = APIRouter()

PageNumber = Annotated[int, Query(ge=1, le=100000)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


def date_filter(
    period: Literal["week", "month", "custom", "all"] = "week",
    start_date: str | None = None,
    end_date: str | None = None,
):
    try:
        return stats_period(period, start_date, end_date)
    except (ValueError, OverflowError) as exc:
        raise HTTPException(422, "Проверьте даты начала и окончания периода") from exc


async def analytics_scope(admin, user_data, session):
    if admin:
        await require_admin(user_data, session)
        return None
    await require_partner(session, user_data["id"])
    return user_data["id"]


@router.get("/api/referral")
async def get_referrals(
    dates=Depends(date_filter), admin: bool = False, source_id: int | None = None, branch_id: int | None = None, page: PageNumber = 1,
    user_data: dict = Depends(validate_twa_data), session=Depends(get_session),
):
    partner_id = await analytics_scope(admin, user_data, session)
    (start_date, end_date), bounds = dates
    result = await referral_report(session, bounds, partner_id, source_id, page, branch_id)
    if result is None:
        raise HTTPException(404, "Ветка не найдена")
    return {**result, "start_date": start_date, "end_date": end_date}


@router.get("/api/referral/members/{member_id}")
async def get_referral_member(
    member_id: int, dates=Depends(date_filter), admin: bool = False, page: PageNumber = 1,
    user_data: dict = Depends(validate_twa_data), session=Depends(get_session),
):
    partner_id = await analytics_scope(admin, user_data, session)
    result = await referral_member(session, member_id, dates[1], partner_id, page)
    if result is None:
        raise HTTPException(404, "Участник не найден")
    return result


@router.get("/api/referral/links")
async def get_links(user_data: dict = Depends(validate_twa_data), session=Depends(get_session)):
    user_id = user_data["id"]
    await require_partner(session, user_id)
    links = (await session.scalars(select(TrackingLink).where(
        TrackingLink.partner_id == user_id, TrackingLink.archived.is_(False)
    ).order_by(TrackingLink.id))).all()
    return {"friend": friend_invite_link(settings.BOT_LINK, user_id), "partner": [link_data(link) for link in links]}


class LinkRequest(BaseModel):
    name: Name


@router.post("/api/referral/links")
async def create_link(req: LinkRequest, user_data: dict = Depends(validate_twa_data), session=Depends(get_session)):
    await require_partner(session, user_data["id"], lock=True)
    link = new_partner_link(user_data["id"], req.name)
    session.add(link)
    await session.commit()
    return link_data(link)


def withdrawal_data(withdrawal):
    return {key: getattr(withdrawal, key) for key in (
        "id", "amount_kopecks", "status", "created_at", "resolved_at", "note",
    )}


def payout_card_cipher() -> Fernet | None:
    key = settings.REFERRAL_PAYOUT_CARD_KEY
    if key is None:
        return None
    try:
        return Fernet(key.get_secret_value())
    except ValueError:
        logger.error("Invalid REFERRAL_PAYOUT_CARD_KEY")
        return None


@router.get("/api/referral/finance")
async def get_finance(
    dates=Depends(date_filter), page: PageNumber = 1, withdrawal_page: PageNumber = 1,
    user_data: dict = Depends(validate_twa_data), session=Depends(get_session),
):
    user_id = user_data["id"]
    await require_partner(session, user_id)
    start, end = dates[1]
    query = (select(PartnerEarning, ReferralAttribution.id.label("member_id"), Payment.is_topup)
             .outerjoin(Payment, Payment.id == PartnerEarning.payment_id)
             .outerjoin(ReferralAttribution, ReferralAttribution.user_id == Payment.user_id)
             .where(PartnerEarning.partner_id == user_id))
    if start is not None:
        query = query.where(PartnerEarning.created_at >= start)
    if end is not None:
        query = query.where(PartnerEarning.created_at <= end)
    earnings = (await session.execute(query.order_by(PartnerEarning.created_at.desc(), PartnerEarning.id.desc())
                                      .offset((page - 1) * PAGE_SIZE).limit(PAGE_SIZE + 1))).all()
    withdrawal_query = select(PartnerWithdrawal).where(PartnerWithdrawal.partner_id == user_id)
    if start is not None:
        withdrawal_query = withdrawal_query.where(PartnerWithdrawal.created_at >= start)
    if end is not None:
        withdrawal_query = withdrawal_query.where(PartnerWithdrawal.created_at <= end)
    withdrawals = (await session.scalars(withdrawal_query
                                         .order_by(PartnerWithdrawal.created_at.desc(), PartnerWithdrawal.id.desc())
                                         .offset((withdrawal_page - 1) * PAGE_SIZE).limit(PAGE_SIZE + 1))).all()
    return {
        "balance": await partner_balance(session, user_id),
        "card_payouts_enabled": payout_card_cipher() is not None,
        "earnings": [{"id": row.id, "amount_kopecks": row.amount_kopecks, "created_at": row.created_at,
                      "available_at": row.created_at, "member_id": member_id, "is_topup": topup}
                     for row, member_id, topup in earnings[:PAGE_SIZE]],
        "withdrawals": [withdrawal_data(row) for row in withdrawals[:PAGE_SIZE]],
        "more_earnings": len(earnings) > PAGE_SIZE, "more_withdrawals": len(withdrawals) > PAGE_SIZE,
    }


class WithdrawalRequest(BaseModel):
    request_key: UUID
    amount_kopecks: int | None = Field(default=None, ge=MIN_WITHDRAWAL)
    payout_method: Literal["sbp", "card"] = "sbp"
    payout_phone: str | None = Field(default=None, min_length=1, max_length=32)
    payout_bank: Name | None = None
    payout_card_number: SecretStr | None = Field(default=None, max_length=32)

    @field_validator("payout_phone")
    @classmethod
    def normalize_payout_phone(cls, phone: str | None) -> str | None:
        if phone is None:
            return None
        digits = re.sub(r"[\s()-]", "", phone)
        if not re.fullmatch(r"(?:\+7|[78])?[0-9]{10}", digits):
            raise ValueError("Укажите телефон для СБП в формате +7 и 10 цифр")
        return "+7" + digits[-10:]

    @field_validator("payout_card_number")
    @classmethod
    def normalize_card_number(cls, value: SecretStr | None) -> SecretStr | None:
        if value is None:
            return None
        number = re.sub(r"[\s-]", "", value.get_secret_value())
        if not re.fullmatch(r"[0-9]{13,19}", number):
            raise ValueError("Проверьте номер карты")
        checksum = sum(map(int, number[::-2]))
        for digit in map(int, number[-2::-2]):
            doubled = digit * 2
            checksum += doubled - 9 if doubled > 9 else doubled
        if checksum % 10:
            raise ValueError("Проверьте номер карты")
        return SecretStr(number)

    @model_validator(mode="after")
    def check_payout_details(self):
        if self.payout_method == "card":
            if self.payout_card_number is None or self.payout_phone is not None or self.payout_bank is not None:
                raise ValueError("Для перевода по карте укажите только номер карты")
        elif self.payout_phone is None or self.payout_bank is None or self.payout_card_number is not None:
            raise ValueError("Для СБП укажите телефон и банк получателя")
        return self


@router.post("/api/referral/withdraw")
async def request_withdrawal(
    req: WithdrawalRequest, background_tasks: BackgroundTasks,
    user_data: dict = Depends(validate_twa_data), session=Depends(get_session),
):
    user_id = user_data["id"]
    await require_partner(session, user_id, lock=True)
    request_key = str(req.request_key)
    existing = await session.scalar(select(PartnerWithdrawal).where(
        PartnerWithdrawal.partner_id == user_id, PartnerWithdrawal.request_key == request_key,
    ))
    if existing:
        return withdrawal_data(existing)
    pending = await session.scalar(select(PartnerWithdrawal.id).where(
        PartnerWithdrawal.partner_id == user_id, PartnerWithdrawal.status == "pending",
    ).limit(1))
    if pending:
        raise HTTPException(409, "Одна заявка уже ожидает обработки")
    available = (await partner_balance(session, user_id))["available"]
    amount = req.amount_kopecks if req.amount_kopecks is not None else available
    if amount < MIN_WITHDRAWAL:
        raise HTTPException(409, f"Минимальная сумма вывода {MIN_WITHDRAWAL / 100:g} ₽")
    if amount > available:
        raise HTTPException(409, "Доступная сумма изменилась. Обновите баланс.")
    withdrawal = PartnerWithdrawal(
        partner_id=user_id, amount_kopecks=amount, request_key=request_key,
        payout_phone=req.payout_phone, payout_bank=req.payout_bank,
    )
    if req.payout_card_number is not None:
        cipher = payout_card_cipher()
        if cipher is None:
            raise HTTPException(503, "Перевод по карте временно недоступен")
        number = req.payout_card_number.get_secret_value()
        withdrawal.payout_card_encrypted = cipher.encrypt(number.encode("ascii")).decode("ascii")
        withdrawal.payout_card_last4 = number[-4:]
    session.add(withdrawal)
    await session.commit()
    if settings.REFERRAL_WITHDRAWAL_ADMIN_ID is not None:
        rubles, kopecks = divmod(amount, 100)
        background_tasks.add_task(
            notify, settings.REFERRAL_WITHDRAWAL_ADMIN_ID,
            "<b>Новая заявка на вывод</b>\n\n"
            f"Заявка №{withdrawal.id} на {rubles},{kopecks:02d} ₽.\n"
            "В разделе «Партнёры» откройте вкладку «Заявки».",
            "tab=profile&page=admin&section=partners", "Открыть раздел «Партнёры»",
        )
    return withdrawal_data(withdrawal)


async def _assign_legacy_branch(session, user_id):
    """Будущие оплаты старой личной ветки получают владельца при первом включении."""
    edge = ReferralAttribution
    branch = select(edge.id, edge.user_id).where(
        edge.inviter_id == user_id, edge.kind == "legacy", edge.partner_id.is_(None),
    ).cte("legacy_branch", recursive=True)
    branch = branch.union_all(select(edge.id, edge.user_id).join(branch, edge.inviter_id == branch.c.user_id)
                             .where(edge.partner_id.is_(None)))
    await session.execute(update(edge).where(edge.id.in_(select(branch.c.id)), edge.partner_id.is_(None))
                          .values(partner_id=user_id))


class AccessRequest(BaseModel):
    user: Name
    enabled: bool


@router.get("/api/admin/referral/accounts")
async def admin_accounts(
    page: PageNumber = 1, user_data: dict = Depends(validate_twa_data), session=Depends(get_session),
):
    await require_admin(user_data, session)
    rows = (await session.execute(select(PartnerAccount, User.username, User.tg_first_name).join(
        User, User.id == PartnerAccount.user_id
    ).order_by(PartnerAccount.changed_at.desc(), User.id)
      .offset((page - 1) * PAGE_SIZE).limit(PAGE_SIZE + 1))).all()
    return {"accounts": [{"id": str(account.user_id), "username": username, "name": name,
                          "enabled": account.enabled, "changed_at": account.changed_at}
                         for account, username, name in rows[:PAGE_SIZE]], "more": len(rows) > PAGE_SIZE}


@router.post("/api/admin/referral/access")
async def set_access(req: AccessRequest, user_data: dict = Depends(validate_twa_data), session=Depends(get_session)):
    await require_admin(user_data, session)
    target = req.user.removeprefix("@")
    if target.removeprefix("-").isascii() and target.removeprefix("-").isdigit():
        identifier = int(target)
        if not -(2**63) <= identifier < 2**63:
            raise HTTPException(422, "Некорректный ID")
        selector = User.id == identifier
    else:
        selector = func.lower(User.username) == target.lower()
    user = await session.scalar(select(User).where(selector).with_for_update(key_share=True))
    if not user:
        raise HTTPException(404, "Пользователь не найден")
    if req.enabled and user.banned:
        raise HTTPException(409, "Аккаунт заблокирован")
    account = await session.get(PartnerAccount, user.id, with_for_update=True)
    if not account and req.enabled:
        account = PartnerAccount(user_id=user.id, enabled=True)
        session.add_all([account, new_partner_link(user.id, "Основная ссылка")])
        await _assign_legacy_branch(session, user.id)
    elif account:
        account.enabled = req.enabled
    await session.commit()
    return {"id": str(user.id), "username": user.username, "enabled": req.enabled}


@router.get("/api/admin/referral/withdrawals")
async def admin_withdrawals(
    response: Response,
    status: Literal["pending", "paid", "rejected", "all"] = "pending", page: PageNumber = 1,
    user_data: dict = Depends(validate_twa_data), session=Depends(get_session),
):
    await require_admin(user_data, session)
    query = (select(PartnerWithdrawal, User.username, User.tg_first_name)
             .join(User, User.id == PartnerWithdrawal.partner_id))
    if status != "all":
        query = query.where(PartnerWithdrawal.status == status)
    rows = (await session.execute(query.order_by(PartnerWithdrawal.created_at.desc(), PartnerWithdrawal.id.desc())
                                   .offset((page - 1) * PAGE_SIZE).limit(PAGE_SIZE + 1))).all()
    response.headers["Cache-Control"] = "no-store"
    return {"withdrawals": [{**withdrawal_data(row), "partner_id": str(row.partner_id),
                             "username": username, "name": name,
                             "payout_phone": row.payout_phone, "payout_bank": row.payout_bank,
                             "payout_card_last4": row.payout_card_last4}
                            for row, username, name in rows[:PAGE_SIZE]], "more": len(rows) > PAGE_SIZE}


@router.get("/api/admin/referral/withdrawals/{withdrawal_id}/card")
async def admin_withdrawal_card(
    withdrawal_id: int, response: Response,
    user_data: dict = Depends(validate_twa_data), session=Depends(get_session),
):
    await require_admin(user_data, session)
    encrypted = await session.scalar(select(PartnerWithdrawal.payout_card_encrypted).where(
        PartnerWithdrawal.id == withdrawal_id, PartnerWithdrawal.status == "pending",
    ))
    if not encrypted:
        raise HTTPException(404, "Номер карты недоступен")
    cipher = payout_card_cipher()
    if cipher is None:
        raise HTTPException(503, "Не удалось открыть номер карты")
    try:
        number = cipher.decrypt(encrypted.encode("ascii")).decode("ascii")
    except InvalidToken as exc:
        logger.error("Could not decrypt card for withdrawal {}", withdrawal_id)
        raise HTTPException(503, "Не удалось открыть номер карты") from exc
    logger.info("Admin {} viewed card for withdrawal {}", user_data["id"], withdrawal_id)
    response.headers["Cache-Control"] = "no-store"
    return {"card_number": number}


class ResolveWithdrawal(BaseModel):
    status: Literal["paid", "rejected"]
    note: str | None = Field(default=None, max_length=240)


@router.post("/api/admin/referral/withdrawals/{withdrawal_id}")
async def resolve_withdrawal(
    withdrawal_id: int, req: ResolveWithdrawal,
    user_data: dict = Depends(validate_twa_data), session=Depends(get_session),
):
    admin = await require_admin(user_data, session)
    row = await session.get(PartnerWithdrawal, withdrawal_id)
    if not row:
        raise HTTPException(404, "Заявка не найдена")
    await session.get(PartnerAccount, row.partner_id, with_for_update=True)
    await session.refresh(row, with_for_update=True)
    if row.status == req.status:
        return withdrawal_data(row)
    if row.status != "pending":
        raise HTTPException(409, "Заявка уже обработана")
    row.status = req.status
    row.resolved_at = datetime.utcnow()
    row.resolved_by = admin.id if admin else None
    row.note = (req.note or "").strip() or None
    row.payout_card_encrypted = None
    await session.commit()
    return withdrawal_data(row)
