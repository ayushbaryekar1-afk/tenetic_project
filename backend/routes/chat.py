import json
import logging
import time
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from config import settings
from errors import AppError
from models.chat import AgentReply, ChatRequest, ChatResponse
from services import databricks_service, demo_service

logger = logging.getLogger("tenetic.chat")
router = APIRouter(prefix="/api", tags=["chat"])


async def _generate(message: str, conversation_id: str) -> AgentReply:
    try:
        if settings.demo_mode:
            return await demo_service.generate_demo_response(message)
        return await databricks_service.send_message_to_databricks(message, conversation_id)
    except AppError:
        raise
    except Exception:  # never leak internals to the browser
        logger.exception("Unexpected error while generating a reply")
        raise AppError("Something went wrong on the server. Please try again.", 500, "internal_error")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    conversation_id = req.conversation_id or uuid.uuid4().hex
    started = time.perf_counter()
    reply = await _generate(req.message, conversation_id)
    return ChatResponse(
        response=reply.text,
        conversation_id=conversation_id,
        agent=reply.agent,
        execution_time=round(time.perf_counter() - started, 2),
        timestamp=_now(),
    )


@router.post("/chat/stream")
async def chat_stream(req: ChatRequest) -> StreamingResponse:
    """Stream response deltas as server-sent events."""
    conversation_id = req.conversation_id or uuid.uuid4().hex
    started = time.perf_counter()

    async def events():
        agent = None
        try:
            if settings.demo_mode:
                reply = await demo_service.generate_demo_response(req.message)
                yield f"data: {json.dumps({'delta': reply.text})}\n\n"
                agent = reply.agent
            else:
                async for event in databricks_service.stream_message_to_databricks(req.message, conversation_id):
                    if "delta" in event:
                        yield f"data: {json.dumps({'delta': event['delta']})}\n\n"
                    if event.get("done"):
                        agent = event.get("agent")

            done = {
                "done": True,
                "conversation_id": conversation_id,
                "agent": agent,
                "execution_time": round(time.perf_counter() - started, 2),
                "timestamp": _now(),
            }
            yield f"data: {json.dumps(done)}\n\n"
        except AppError as exc:
            yield f"data: {json.dumps({'error': exc.message, 'code': exc.code})}\n\n"
        except Exception:
            logger.exception("Unexpected error while streaming a reply")
            yield f"data: {json.dumps({'error': 'Something went wrong on the server. Please try again.', 'code': 'internal_error'})}\n\n"

    return StreamingResponse(events(), media_type="text/event-stream")
