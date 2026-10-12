import type { ChatApiResponse, ServerStatus } from "./types";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

const CHAT_TIMEOUT_MS = 120_000;
const STATUS_TIMEOUT_MS = 8_000;

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status = 0, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init: RequestInit = {}, timeoutMs = CHAT_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
    });

    if (!res.ok) {
      let message = `The server returned an error (HTTP ${res.status}).`;
      try {
        const body = (await res.json()) as { message?: unknown };
        if (typeof body.message === "string" && body.message) message = body.message;
      } catch {
        // body wasn't JSON; keep the generic message
      }
      throw new ApiError(message, res.status);
    }

    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError("The request timed out. Try again, or ask a narrower question.", 408);
    }
    throw new ApiError(`Can't reach the backend at ${API_URL}. Check that it is running, then retry.`, 0);
  } finally {
    clearTimeout(timer);
  }
}

export function sendChat(message: string, conversationId: string): Promise<ChatApiResponse> {
  return request<ChatApiResponse>("/api/chat", {
    method: "POST",
    body: JSON.stringify({ message, conversation_id: conversationId }),
  });
}

export async function sendChatStream(
  message: string,
  conversationId: string,
  onDelta: (delta: string) => void,
): Promise<ChatApiResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);
  let responseText = "";

  try {
    const res = await fetch(`${API_URL}/api/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({ message, conversation_id: conversationId }),
      signal: controller.signal,
    });

    if (!res.ok) {
      let message = `The server returned an error (HTTP ${res.status}).`;
      try {
        const body = (await res.json()) as { message?: unknown };
        if (typeof body.message === "string" && body.message) message = body.message;
      } catch {
        // body wasn't JSON; keep the generic message
      }
      throw new ApiError(message, res.status);
    }
    if (!res.body) throw new ApiError("The server did not provide a response stream.", 502);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let completed: ChatApiResponse | null = null;

    const processLine = (line: string) => {
      if (!line.startsWith("data:")) return;
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(line.slice(5).trim()) as Record<string, unknown>;
      } catch {
        throw new ApiError("The server returned an invalid streaming response.", 502);
      }
      if (typeof event.error === "string") {
        throw new ApiError(
          event.error,
          502,
          typeof event.code === "string" ? event.code : undefined,
        );
      }
      if (typeof event.delta === "string") {
        responseText += event.delta;
        onDelta(event.delta);
      }
      if (event.done === true) {
        completed = {
          response: responseText,
          conversation_id: typeof event.conversation_id === "string" ? event.conversation_id : conversationId,
          agent: typeof event.agent === "string" ? event.agent : null,
          execution_time: typeof event.execution_time === "number" ? event.execution_time : null,
          timestamp: typeof event.timestamp === "string" ? event.timestamp : new Date().toISOString(),
        };
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) processLine(line.replace(/\r$/, ""));
      if (done) break;
    }
    if (buffer) processLine(buffer.replace(/\r$/, ""));
    if (!completed) throw new ApiError("The response stream ended before the answer was complete.", 502);
    return completed;
  } catch (err) {
    if (err instanceof ApiError && err.code === "auth_failed" && !responseText) {
      return await sendChat(message, conversationId);
    }
    if (err instanceof ApiError) throw err;
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError("The request timed out. Try again, or ask a narrower question.", 408);
    }
    throw new ApiError(`Can't reach the backend at ${API_URL}. Check that it is running, then retry.`, 0);
  } finally {
    clearTimeout(timer);
  }
}

export function getStatus(): Promise<ServerStatus> {
  return request<ServerStatus>("/api/config/status", { method: "GET" }, STATUS_TIMEOUT_MS);
}
