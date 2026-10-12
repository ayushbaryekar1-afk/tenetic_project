import { errorResponse, processChat } from "../_lib";

interface Env {
  DEMO_MODE?: string;
  DATABRICKS_HOST?: string;
  DATABRICKS_TOKEN?: string;
  DATABRICKS_AGENT_ENDPOINT?: string;
  GENIE_AGENT_COUNT?: string;
  REQUEST_TIMEOUT_SECONDS?: string;
}

export async function onRequestPost({ request, env }: { request: Request; env: Env }): Promise<Response> {
  let result;
  try {
    result = await processChat(request, env);
  } catch (error) {
    const response = errorResponse(error);
    const body = await response.json() as { error: string; message: string };
    const stream = `data: ${JSON.stringify({ error: body.message, code: body.error })}\n\n`;
    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  const events = [
    { delta: result.response },
    {
      done: true,
      conversation_id: result.conversation_id,
      agent: result.agent,
      execution_time: result.execution_time,
      timestamp: result.timestamp,
    },
  ];
  const stream = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store" },
  });
}
