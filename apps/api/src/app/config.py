from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[4]
DATA_DIR = REPO_ROOT / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(REPO_ROOT / ".env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    contact_email: str = "anonymous@example.com"
    database_path: Path = DATA_DIR / "research.db"

    llm_chain: str = "groq,cerebras,openrouter,ollama"

    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"
    cerebras_api_key: str = ""
    cerebras_model: str = "llama-3.3-70b"
    openrouter_api_key: str = ""
    openrouter_model: str = "meta-llama/llama-3.3-70b-instruct:free"
    ollama_base_url: str = "http://localhost:11434/v1"
    ollama_model: str = ""

    firecrawl_api_key: str = ""

    max_concurrent_fetches: int = 8


settings = Settings()
DATA_DIR.mkdir(parents=True, exist_ok=True)

USER_AGENT = f"BusinessResearchPlatform/0.1 (research tool; contact: {settings.contact_email})"
