from dataclasses import dataclass
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    conversation_id: Optional[str] = Field(
        default=None, max_length=128, pattern=r"^[A-Za-z0-9_\-]+$"
    )

    @field_validator("message")
    @classmethod
    def not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Message cannot be empty")
        return value


class ChatResponse(BaseModel):
    response: str
    conversation_id: str
    agent: Optional[str] = None
    execution_time: float
    timestamp: str


@dataclass
class AgentReply:
    """Internal result returned by the demo and Databricks services."""

    text: str
    agent: Optional[str] = None
