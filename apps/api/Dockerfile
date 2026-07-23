# Backend image — FastAPI + the async multi-agent orchestrator, served by uvicorn.
# Built from the repo root context so the layout matches config.REPO_ROOT (parents[4]),
# which keeps the default data dir at /app/data (mount a volume there to persist the cache/db).
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1

WORKDIR /app/apps/api

# 1) Install dependencies first (cached until the lockfile changes) — no project code yet.
COPY apps/api/pyproject.toml apps/api/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# 2) Copy the source and install the project itself.
COPY apps/api/ ./
RUN uv sync --frozen --no-dev

EXPOSE 8000
# The DB/cache live under /app/data by default (config.DATA_DIR); mount a volume to persist.
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
