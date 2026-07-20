"""Documentary-tab research assistant: answer questions grounded in a single run's data."""
from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.llm.client import llm
from app.rag.retriever import answer_question, build_corpus, retrieve

router = APIRouter()


class ChatTurn(BaseModel):
    role: str
    content: str


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
    history: list[ChatTurn] = Field(default_factory=list)


@router.post("/jobs/{job_id}/ask")
async def ask(job_id: str, req: AskRequest) -> dict:
    name, chunks = build_corpus(job_id)
    hits = retrieve(chunks, req.question)
    answer, grounded = await answer_question(
        llm, name or "this company", req.question, hits, [t.model_dump() for t in req.history]
    )
    return {
        "answer": answer,
        "grounded": grounded,
        "sources": [{"label": h["label"], "snippet": h["text"][:200]} for h in hits],
    }
