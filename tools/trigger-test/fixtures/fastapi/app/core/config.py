from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: Literal["local", "test", "staging", "production"] = "local"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    database_url: str  # required: no default, so the app refuses to start without it
    jwt_secret: SecretStr = Field(min_length=32)  # SecretStr prints as '**********'
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = Field(default=30, ge=1, le=1440)
    cors_origins: list[str] = []  # JSON in env: CORS_ORIGINS='["https://app.example.com"]'

    @property
    def docs_enabled(self) -> bool:
        return self.app_env != "production"


@lru_cache
def get_settings() -> Settings:
    # Raises ValidationError listing every missing/invalid variable -> fail fast at startup.
    return Settings()
