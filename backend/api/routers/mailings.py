from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import UUID4, BaseModel, StringConstraints
from sqlalchemy import func, literal, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.common import get_session, require_admin
from backend.api.security import validate_twa_data
from backend.database.models import AppMailing, AppMailingRecipient, User

router = APIRouter(prefix="/api/admin/mailings")


class MailingRequest(BaseModel):
    id: UUID4
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4096)]


@router.post("", status_code=202)
async def create_mailing(
    request: MailingRequest,
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session),
):
    await require_admin(user_data, session)
    mailing_id = str(request.id)
    created = await session.scalar(
        insert(AppMailing)
        .values(id=mailing_id, created_by=user_data["id"], text=request.text)
        .on_conflict_do_nothing(index_elements=[AppMailing.id])
        .returning(AppMailing.id)
    )
    if created is None:
        mailing = await session.get(AppMailing, mailing_id)
        if mailing.created_by != user_data["id"] or mailing.text != request.text:
            raise HTTPException(status_code=409, detail="Этот номер рассылки уже используется")
        return {"id": mailing_id}

    await session.execute(insert(AppMailingRecipient).from_select(
        [AppMailingRecipient.mailing_id, AppMailingRecipient.user_id],
        select(literal(mailing_id), User.id).where(User.id > 0, User.banned.is_not(True)),
    ))
    await session.commit()
    return {"id": mailing_id}


@router.get("")
async def get_mailings(
    user_data: dict = Depends(validate_twa_data),
    session: AsyncSession = Depends(get_session),
):
    await require_admin(user_data, session)
    mailings = (await session.scalars(select(AppMailing).order_by(
        AppMailing.created_at.desc(), AppMailing.id.desc(),
    ).limit(50))).all()
    counts = {mailing.id: {} for mailing in mailings}
    if mailings:
        rows = await session.execute(
            select(AppMailingRecipient.mailing_id, AppMailingRecipient.status, func.count())
            .where(AppMailingRecipient.mailing_id.in_(counts))
            .group_by(AppMailingRecipient.mailing_id, AppMailingRecipient.status)
        )
        for mailing_id, status, count in rows:
            counts[mailing_id][status] = count

    return [
        {"id": mailing.id, "text": mailing.text, "created_at": mailing.created_at, "counts": counts[mailing.id]}
        for mailing in mailings
    ]
