import os
import subprocess
import sys

from aiogram.types import TelegramObject
from aiogram.utils.i18n import I18nMiddleware, I18n

from paths import LOCALES


class DatabaseI18nMiddleware(I18nMiddleware):
    async def get_locale(self, event: TelegramObject, data: dict) -> str:
        return "ru"

    def __init__(self):
        # FOR DOCKER
        venv_path = os.path.join(sys.prefix, 'bin', 'pybabel')  # pathlib
        subprocess.run([venv_path, 'extract', '-o', os.path.join(LOCALES, 'messages.pot'), 'backend'])
        subprocess.run([venv_path, 'compile', '-d', LOCALES, '-D', 'messages'])

        # FOR LOCAL
        # subprocess.run(f'pybabel extract --input-dirs=backend -o {LOCALES}/messages.pot ')
        # subprocess.run(f'pybabel compile -f -d {LOCALES} -D messages')

        # pot...
        # subprocess.run(f'pybabel init -i {LOCALES}/messages.pot -d {LOCALES} -D messages -l uz')
        # subprocess.run(f'pybabel init -i {LOCALES}/messages.pot -d {LOCALES} -D messages -l ru')
        i18n = I18n(path=LOCALES, default_locale='ru', domain="messages")

        super().__init__(i18n, middleware_key='i18n')
        I18n.set_current(i18n)
