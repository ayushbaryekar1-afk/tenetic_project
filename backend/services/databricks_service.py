"""
Databricks Super Agent client.

ALL Databricks-specific logic lives in this file. If your endpoint uses a different
request or response schema, change ONLY these three places:

  1. _build_url()       -> how the endpoint URL is built
  2. _build_payload()   -> REQUEST mapping  (what we send)
  3. _parse_response()  -> RESPONSE mapping (how we read the answer / agent name)

The Tenetic Super Agent uses the Responses API format:
{"input": [{"role": "user", "content": "..."}]}.
"""
import logging
import json
from collections import OrderedDict
from typing import Any, AsyncIterator, Dict, List, Optional

import httpx

from config import is_placeholder_token, settings
from errors import AppError
from models.chat import AgentReply

logger = logging.getLogger("tenetic.databricks")


class DatabricksError(AppError):
    def __init__(self, message: str, status_code: int = 502, code: str = "databricks_error"):
        super().__init__(message, status_code, code)


# --- In-memory conversation memory -------------------------------------------------
# Agents on Databricks are stateless, so we replay recent turns on every call.
# (Swap this for Redis/a database if you deploy multiple backend instances.)
MAX_TURNS_KEPT = 10          # user+assistant pairs replayed to the agent
MAX_CONVERSATIONS = 500      # oldest conversations are evicted first
_histories: "OrderedDict[str, List[Dict[str, str]]]" = OrderedDict()


def _remember(conversation_id: str, user_text: str, assistant_text: str) -> None:
    history = _histories.pop(conversation_id, [])
    history += [
        {"role": "user", "content": user_text},
        {"role": "assistant", "content": assistant_text},
    ]
    _histories[conversation_id] = history[-MAX_TURNS_KEPT * 2:]
    while len(_histories) > MAX_CONVERSATIONS:
        _histories.popitem(last=False)


# --- 1. URL ------------------------------------------------------------------------
def _build_url() -> str:
    endpoint = settings.databricks_agent_endpoint
    if endpoint.startswith(("http://", "https://")):
        return endpoint  # full URL supplied
    # Just an endpoint name, e.g. "my-super-agent"
    return f"{settings.databricks_host}/serving-endpoints/{endpoint}/invocations"


# --- 2. REQUEST MAPPING (edit here) ------------------------------------------------
def _build_payload(messages: List[Dict[str, str]]) -> Dict[str, Any]:
    return {"input": messages}

    # Custom pyfunc / simple question-answer model:
    #   return {"dataframe_records": [{"question": messages[-1]["content"]}]}


# --- 3. RESPONSE MAPPING (edit here) -----------------------------------------------
def _content_to_text(content: Any) -> Optional[str]:
    if isinstance(content, str):
        return content.strip() or None
    if isinstance(content, list):
        parts = []
        for part in content:
            if isinstance(part, str):
                parts.append(part)
            elif isinstance(part, dict) and isinstance(part.get("text"), str):
                parts.append(part["text"])
        joined = "\n".join(p for p in parts if p.strip()).strip()
        return joined or None
    return None


def _extract_agent(data: Dict[str, Any]) -> Optional[str]:
    custom = data.get("custom_outputs")
    if isinstance(custom, dict):
        for key in ("agent", "agent_name", "genie", "genie_name"):
            if isinstance(custom.get(key), str) and custom[key].strip():
                return custom[key].strip()
    messages = data.get("messages")
    if isinstance(messages, list):
        for m in reversed(messages):
            if isinstance(m, dict) and m.get("role") == "assistant" and isinstance(m.get("name"), str):
                return m["name"]
    return None


def _parse_response(data: Any) -> AgentReply:
    """Tries the common Databricks response shapes in order. Add your own branch if needed."""
    if not isinstance(data, dict):
        raise DatabricksError("The Super Agent returned an unexpected response.", 502, "bad_response")

    text: Optional[str] = None

    # a) OpenAI-style chat completion: {"choices": [{"message": {"content": ...}}]}
    choices = data.get("choices")
    if isinstance(choices, list) and choices and isinstance(choices[0], dict):
        message = choices[0].get("message")
        if isinstance(message, dict):
            text = _content_to_text(message.get("content"))

    # b) Responses-style: {"output": [{"type": "message", "content": [{"text": ...}]}]}
    if not text and isinstance(data.get("output"), list):
        for item in reversed(data["output"]):
            if isinstance(item, dict) and item.get("type") in (None, "message"):
                text = _content_to_text(item.get("content"))
                if text:
                    break

    # c) Agent framework: {"messages": [{"role": "assistant", "content": ...}]}
    if not text and isinstance(data.get("messages"), list):
        for m in reversed(data["messages"]):
            if isinstance(m, dict) and m.get("role") == "assistant":
                text = _content_to_text(m.get("content"))
                if text:
                    break

    # d) MLflow pyfunc: {"predictions": ["..."]} or [{"response": "..."}]
    if not text and isinstance(data.get("predictions"), list) and data["predictions"]:
        first = data["predictions"][0]
        if isinstance(first, str):
            text = first.strip() or None
        elif isinstance(first, dict):
            for key in ("response", "answer", "result", "text", "content", "output"):
                text = _content_to_text(first.get(key))
                if text:
                    break

    # e) Plain keys
    if not text:
        for key in ("response", "answer", "result", "text", "content", "output"):
            text = _content_to_text(data.get(key))
            if text:
                break

    if not text:
        logger.warning("Unrecognised Databricks response shape. Top-level keys: %s", list(data.keys()))
        raise DatabricksError(
            "The Super Agent replied in a format this app doesn't recognise yet.", 502, "bad_response"
        )

    return AgentReply(text=text, agent=_extract_agent(data))


def _stream_delta(data: Any) -> Optional[str]:
    if not isinstance(data, dict):
        return None
    if data.get("type") in {"response.output_text.delta", "response.refusal.delta"}:
        delta = data.get("delta")
        return delta if isinstance(delta, str) else None
    choices = data.get("choices")
    if isinstance(choices, list) and choices and isinstance(choices[0], dict):
        delta = choices[0].get("delta")
        if isinstance(delta, dict):
            content = delta.get("content")
            if isinstance(content, str):
                return content or None
            if isinstance(content, list):
                parts = [
                    part if isinstance(part, str) else part.get("text", "")
                    for part in content
                    if isinstance(part, str) or isinstance(part, dict)
                ]
                joined = "".join(part for part in parts if isinstance(part, str))
                return joined or None
    delta = data.get("delta")
    if isinstance(delta, dict):
        return _content_to_text(delta.get("text"))
    return None


def _sse_json(data_lines: List[str]) -> Optional[Any]:
    raw = "\n".join(data_lines).strip()
    if not raw or raw == "[DONE]":
        return None
    try:
        return json.loads(raw)
    except ValueError as exc:
        raise DatabricksError("The Super Agent returned an invalid streaming response.", 502, "bad_response") from exc


def _raise_upstream_error(status: int, body: str) -> None:
    if status >= 400 or 300 <= status < 400:
        logger.warning("Databricks returned HTTP %s: %s", status, body[:300])
        if status in (401, 403) or 300 <= status < 400:
            raise DatabricksError(
                "Databricks rejected the server's credentials. Check DATABRICKS_TOKEN and its permissions.",
                502,
                "auth_failed",
            )
        if status == 404:
            raise DatabricksError(
                "The Super Agent endpoint was not found. Check DATABRICKS_AGENT_ENDPOINT.", 502, "not_found"
            )
        if status == 429:
            raise DatabricksError(
                "The Super Agent is busy right now. Please try again in a moment.", 429, "rate_limited"
            )
        if status in (400, 422):
            raise DatabricksError(
                "Databricks couldn't process the request. The request mapping in "
                "databricks_service.py may need adjusting for your endpoint.",
                502,
                "bad_request",
            )
        raise DatabricksError(
            "The Super Agent is currently unavailable. If the endpoint was idle, it may be starting up; "
            "try again shortly.",
            503,
            "upstream_unavailable",
        )


def _check_configuration() -> None:
    if not settings.databricks_configured:
        raise DatabricksError(
            "Databricks is not configured on the server. Set DATABRICKS_HOST, DATABRICKS_TOKEN and "
            "DATABRICKS_AGENT_ENDPOINT, or set DEMO_MODE=true.",
            503,
            "not_configured",
        )
    if is_placeholder_token(settings.databricks_token):
        raise DatabricksError(
            "DATABRICKS_TOKEN in backend/.env is still a placeholder. Replace it with a valid Databricks PAT "
            "that has CAN QUERY permission on the endpoint, then restart the backend.",
            401,
            "placeholder_token",
        )


async def stream_message_to_databricks(message: str, conversation_id: str) -> AsyncIterator[Dict[str, Any]]:
    _check_configuration()
    messages = list(_histories.get(conversation_id, [])) + [{"role": "user", "content": message}]
    headers = {
        "Authorization": f"******",
        "Content-Type": "application/json",
        "Accept": "text/event-stream, application/json",
    }
    timeout = httpx.Timeout(settings.request_timeout, connect=10.0)
    payload = _build_payload(messages)
    payload["stream"] = True
    reply_parts: List[str] = []
    agent: Optional[str] = None

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream("POST", _build_url(), json=payload, headers=headers) as resp:
                if resp.status_code in (400, 422):
                    await resp.aread()
                    logger.info("Endpoint rejected streaming; retrying once without stream mode.")
                    payload.pop("stream")
                    fallback = await client.post(_build_url(), json=payload, headers=headers)
                    _raise_upstream_error(fallback.status_code, fallback.text)
                    try:
                        reply = _parse_response(fallback.json())
                    except ValueError as exc:
                        raise DatabricksError(
                            "The Super Agent returned a response that isn't valid JSON.", 502, "bad_response"
                        ) from exc
                    reply_parts.append(reply.text)
                    yield {"delta": reply.text}
                    agent = reply.agent
                else:
                    if resp.status_code >= 400 or 300 <= resp.status_code < 400:
                        body = (await resp.aread()).decode(errors="replace")
                        _raise_upstream_error(resp.status_code, body)
                    content_type = resp.headers.get("content-type", "").lower()
                    if "text/event-stream" not in content_type:
                        await resp.aread()
                        try:
                            reply = _parse_response(resp.json())
                        except (ValueError, json.JSONDecodeError) as exc:
                            raise DatabricksError(
                                "The Super Agent returned a response that isn't valid JSON.", 502, "bad_response"
                            ) from exc
                        reply_parts.append(reply.text)
                        yield {"delta": reply.text}
                        agent = reply.agent
                    else:
                        data_lines: List[str] = []

                        async for line in resp.aiter_lines():
                            if line.startswith("data:"):
                                data_lines.append(line[5:].lstrip())
                            elif not line and data_lines:
                                event_data = _sse_json(data_lines)
                                data_lines = []
                                if event_data is None:
                                    continue
                                if isinstance(event_data, dict):
                                    response_data = event_data.get("response")
                                    if isinstance(response_data, dict):
                                        agent = _extract_agent(response_data) or agent
                                        if not reply_parts:
                                            try:
                                                completed_reply = _parse_response(response_data)
                                            except DatabricksError:
                                                completed_reply = None
                                            if completed_reply:
                                                reply_parts.append(completed_reply.text)
                                                yield {"delta": completed_reply.text}
                                                agent = completed_reply.agent or agent
                                    agent = _extract_agent(event_data) or agent
                                delta = _stream_delta(event_data)
                                if delta:
                                    reply_parts.append(delta)
                                    yield {"delta": delta}

                        if data_lines:
                            event_data = _sse_json(data_lines)
                            delta = _stream_delta(event_data)
                            if delta:
                                reply_parts.append(delta)
                                yield {"delta": delta}
                            if isinstance(event_data, dict):
                                agent = _extract_agent(event_data) or agent
    except httpx.TimeoutException as exc:
        raise DatabricksError(
            "The Super Agent took too long to respond. Try again, or ask a narrower question.",
            504,
            "timeout",
        ) from exc
    except httpx.RequestError as exc:
        logger.warning("Could not reach Databricks: %s", type(exc).__name__)
        raise DatabricksError(
            "Can't reach Databricks. Check DATABRICKS_HOST and the server's network access.",
            502,
            "unreachable",
        ) from exc

    full_text = "".join(reply_parts)
    if not full_text:
        raise DatabricksError("The Super Agent returned an empty streaming response.", 502, "bad_response")
    _remember(conversation_id, message, full_text)
    yield {"done": True, "agent": agent}


# --- Public API --------------------------------------------------------------------
async def send_message_to_databricks(message: str, conversation_id: str) -> AgentReply:
    _check_configuration()

    messages = list(_histories.get(conversation_id, [])) + [{"role": "user", "content": message}]
    headers = {
        "Authorization": f"Bearer {settings.databricks_token}",
        "Content-Type": "application/json",
    }
    timeout = httpx.Timeout(settings.request_timeout, connect=10.0)

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(_build_url(), json=_build_payload(messages), headers=headers)
    except httpx.TimeoutException:
        raise DatabricksError(
            "The Super Agent took too long to respond. Try again, or ask a narrower question.",
            504,
            "timeout",
        )
    except httpx.RequestError as exc:
        logger.warning("Could not reach Databricks: %s", type(exc).__name__)
        raise DatabricksError(
            "Can't reach Databricks. Check DATABRICKS_HOST and the server's network access.",
            502,
            "unreachable",
        )

    _raise_upstream_error(resp.status_code, resp.text)

    try:
        data = resp.json()
    except ValueError:
        raise DatabricksError("The Super Agent returned a response that isn't valid JSON.", 502, "bad_response")

    reply = _parse_response(data)
    _remember(conversation_id, message, reply.text)
    return reply
