from html import escape
from secrets import token_urlsafe

from aiogram.filters import StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery
from aiogram.utils.i18n import gettext
from sqlalchemy import exists, func, select

from backend.database.models import Payment, ReferralAttribution, TrackingLink, User
from backend.database.patterns.dao import DataAccessObject
from backend.telegram.bot import dp, bot
from backend.telegram.callback_data.admin import AdminMenu
from backend.telegram.filters.admin import AdminCallbackFilter, AdminMessageFilter
from backend.telegram.keyboards.admin.menu import admin_menu_kb
from backend.telegram.states.admin import AdminStates
from backend.telegram.utils.message import (
    edit_scheduled_message, schedule_previous_message, Message, schedule_message_deletion, delete_pending_messages
)
from backend.referrals import link_url


@dp.callback_query(AdminMenu.filter(), AdminCallbackFilter())
async def AdminMenu_callback(
        callback: CallbackQuery, callback_data: AdminMenu,
        user: User, state: FSMContext, dao: DataAccessObject
):
    await schedule_previous_message(user, callback.message, state)
    # await delete_pending_messages(user)
    await state.set_state(AdminStates.link)
    paid = exists().where(Payment.user_id == ReferralAttribution.user_id, Payment.success.is_(True))
    invited = func.count(ReferralAttribution.id)
    async with dao.session.begin():
        rows = (await dao.session.execute(
            select(TrackingLink, invited, invited.filter(paid))
            .outerjoin(ReferralAttribution, ReferralAttribution.source_id == TrackingLink.id)
            .where(TrackingLink.partner_id.is_(None), TrackingLink.archived.is_(False))
            .group_by(TrackingLink.id).order_by(TrackingLink.id.desc()).limit(12)
        )).all()
    by_links = "".join(
        f"<b>{escape(link.name)}</b>\n<blockquote>{escape(link_url(link.code, partner=False))}</blockquote>\n"
        f"Всего: {total} чел.\nСовершили оплату: {payers} чел.\n\n"
        for link, total, payers in rows
    )

    await edit_scheduled_message(
        user=user,
        text=gettext("messages.admin.menu").format(
            by_links=by_links
        ),
        kb=admin_menu_kb()
    )


@dp.message(StateFilter(AdminStates.link), AdminMessageFilter())
async def AdminStatesLink_handler(
        message: Message, user: User, state: FSMContext, dao: DataAccessObject
):
    name = (message.text or "").strip()
    if not name or len(name) > 100:
        await message.answer("Введите название кампании до 100 символов.")
        return
    link = TrackingLink(name=name, code=token_urlsafe(10))
    async with dao.session.begin():
        dao.session.add(link)
    msg = await bot.send_message(chat_id=user.id, text=link_url(link.code, partner=False))
    await message.delete()
    await schedule_message_deletion(user, msg)
