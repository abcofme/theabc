import pathlib

PROJECT = pathlib.PurePath(__file__).parent
BACKEND = PROJECT / "backend"
ALEMBIC = PROJECT / "migrations"
ALEMBIC_FILE = PROJECT / "alembic.ini"
LOCALES = BACKEND / "resources" / "locales"
IMAGES = BACKEND / "resources" / "images"
