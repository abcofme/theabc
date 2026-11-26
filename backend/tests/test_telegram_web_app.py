import importlib.util
import os
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch


class TelegramWebAppTest(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        config = {
            "BOT_TOKEN": "123456789:offline-test-token", "WEB_APP_URL": "https://entry.example/",
            "TELEGRAM_API_URL": "", "TELEGRAM_API_CA_FILE": "",
            "ACCOUNT_ID": "test", "SECRET_KEY": "test", "BOT_LINK": "https://t.me/example",
            "REQUESTS_CHAT_ID": "1", "SUPPORT_CHAT_ID": "1", "POSTGRES_DB": "test",
            "POSTGRES_HOST": "localhost", "POSTGRES_PORT": "5432", "POSTGRES_USER": "test",
            "POSTGRES_PASSWORD": "test", "REDIS_PORT": "6379", "REDIS_DB": "0",
            "REDIS_HOST": "localhost", "REDIS_PASSWORD": "test",
        }
        with patch.dict(os.environ, config):
            from settings import Settings, settings
            from backend.telegram.web_app import configure_web_app_menu
        cls.Settings = Settings
        cls.settings = settings
        cls.configure_menu = staticmethod(configure_web_app_menu)

    def test_separate_launch_origin_keeps_browser_url(self):
        config = self.Settings.model_construct(
            WEB_APP_URL="https://entry.example/", TELEGRAM_WEB_APP_URL="https://app.example/",
        )
        self.assertEqual(config.telegram_web_app_url, "https://app.example/")
        self.assertEqual(config.WEB_APP_URL, "https://entry.example/")

    def test_existing_installations_keep_their_launch_url(self):
        config = self.Settings.model_construct(WEB_APP_URL="https://entry.example/")
        self.assertEqual(config.telegram_web_app_url, "https://entry.example/")

    async def test_menu_opens_final_origin(self):
        bot = AsyncMock()
        with patch.object(self.settings, "TELEGRAM_WEB_APP_URL", "https://app.example/"):
            await self.configure_menu(bot)
        button = bot.set_chat_menu_button.await_args.kwargs["menu_button"]
        self.assertEqual(button.type, "web_app")
        self.assertEqual(button.web_app.url, "https://app.example/")
        self.assertEqual(button.text, "Открыть дневник")

    async def test_menu_is_untouched_without_explicit_configuration(self):
        bot = AsyncMock()
        with patch.object(self.settings, "TELEGRAM_WEB_APP_URL", ""):
            await self.configure_menu(bot)
        bot.set_chat_menu_button.assert_not_awaited()

    def test_diary_and_test_buttons_open_final_origin(self):
        with (
            patch.object(self.settings, "TELEGRAM_WEB_APP_URL", "https://app.example/"),
            patch("aiogram.utils.i18n.gettext", side_effect=lambda text: text),
        ):
            source = Path(__file__).resolve().parents[1] / "telegram" / "keyboards" / "start.py"
            spec = importlib.util.spec_from_file_location("launch_keyboards_test", source)
            keyboards = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(keyboards)
            for keyboard in [keyboards.start_kb(), keyboards.about_diary_kb(), keyboards.categories_kb()]:
                links = [button.web_app.url for row in keyboard.inline_keyboard for button in row if button.web_app]
                self.assertEqual(len(links), 1)
                self.assertTrue(links[0].startswith("https://app.example/"))
            self.assertEqual(keyboards.categories_kb().inline_keyboard[0][0].web_app.url,
                             "https://app.example/?tab=tests")


if __name__ == "__main__":
    unittest.main()
