import subprocess
import sys
import os
from alembic import command
from alembic.config import Config

from paths import ALEMBIC_FILE


def create_migration():
    name = input('Please input name [update]: ') or 'update'
    config = Config(ALEMBIC_FILE, ini_section="alembic")

    result = command.revision(config, autogenerate=True, message=name)

    if result:
        print(result)
    else:
        print('No migrations needed!')


if __name__ == "__main__":
    create_migration()


async def run_async_upgrade():
    venv_path = os.path.join(sys.prefix, 'bin', 'alembic')

    # FOR DOCKER
    subprocess.run([venv_path, 'upgrade', 'head'])
    subprocess.run(['alembic', 'upgrade', 'head'])

    # FOR LOCAL
    # subprocess.run(f'alembic upgrade head')
