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

    # Comma-separated browser origins allowed to call the API (CORS). Defaults to local dev;
    # set to your deployed web origin(s) in production, e.g. "https://lynx.example.com".
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    # Global cap on simultaneous outbound HTTP requests. Per-source rate limiters (app.sources.http)
    # are the real politeness guardrail, so this can sit well above the agent count to let the
    # ~15-agent fan-out overlap network waits instead of queueing behind a narrow semaphore.
    max_concurrent_fetches: int = 16


settings = Settings()
DATA_DIR.mkdir(parents=True, exist_ok=True)

USER_AGENT = f"BusinessResearchPlatform/0.1 (research tool; contact: {settings.contact_email})"
