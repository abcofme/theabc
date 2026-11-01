from urllib.parse import urlsplit

from aiogram import F
from aiogram.filters import CommandObject, CommandStart
from aiogram.types import CallbackQuery, Message
from aiogram.utils.keyboard import InlineKeyboardBuilder

from backend.database.models import User
from backend.telegram.bot import dp
from backend.telegram.callback_data.start import WebLogin
from backend.web_auth import LOGIN_PREFIX, confirm_login, parse_login_code
from settings import settings

SITE = urlsplit(settings.WEB_APP_URL).netloc
EXPIRED_TEXT = "⌛ <b>Ссылка для входа устарела</b>\n\nНажми «Войти через Telegram» на сайте ещё раз."


# Сайт и установленное приложение входят через бота (backend/web_auth.py). Ссылку могут подсунуть,
# поэтому вход — только после явного подтверждения. Обработчик стоит раньше общего /start
@dp.message(CommandStart(deep_link=True, magic=F.args.startswith(LOGIN_PREFIX)))
async def web_login_handler(message: Message, command: CommandObject):
    code = command.args.removeprefix(LOGIN_PREFIX)
    if not parse_login_code(code):
        await message.answer(EXPIRED_TEXT)
        return
    keyboard = InlineKeyboardBuilder()
    keyboard.button(text="✅ Войти", callback_data=WebLogin(code=code))
    await message.answer(
        f"🔐 <b>Вход в «Азбуку Я» на {SITE}</b>\n\n"
        "Нажми «Войти», и дневник откроется в браузере под этим аккаунтом Telegram.\n\n"
        "<i>Если вход начат не тобой, ничего не нажимай.</i>",
        reply_markup=keyboard.as_markup(),
    )


@dp.callback_query(WebLogin.filter())
async def web_login_confirm(callback: CallbackQuery, callback_data: WebLogin, user: User):
    await callback.answer()
    if not await confirm_login(callback_data.code, user.id):
        await callback.message.edit_text(EXPIRED_TEXT)
        return
    await callback.message.edit_text("✅ <b>Вход подтвержден</b>\n\nВозвращайся в браузер — дневник уже открывается.")
