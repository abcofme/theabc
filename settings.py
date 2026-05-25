from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

# Явная загрузка файла .env
load_dotenv()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env')

    DEBUG: bool = False
    BOT_TOKEN: str

    ACCOUNT_ID: str
    SECRET_KEY: str
    BOT_LINK: str
    REQUESTS_CHAT_ID: int
    SUPPORT_CHAT_ID: int

    POSTGRES_DB: str
    POSTGRES_HOST: str
    POSTGRES_PORT: str
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str

    REDIS_DB: int = None
    REDIS_HOST: str = None
    REDIS_PORT: int = None
    REDIS_PASSWORD: str = None

    @property
    def url(self) -> str:
        return (
            f"postgresql+asyncpg://"
            f"{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@"
            f"{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/"
            f"{self.POSTGRES_DB}"
        )


settings = Settings()
