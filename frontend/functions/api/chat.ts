import { errorResponse, jsonResponse, processChat } from "./_lib";

interface Env {
  DEMO_MODE?: string;
  DATABRICKS_HOST?: string;
  DATABRICKS_TOKEN?: string;
  DATABRICKS_AGENT_ENDPOINT?: string;
  GENIE_AGENT_COUNT?: string;
  REQUEST_TIMEOUT_SECONDS?: string;
}

export async function onRequestPost({ request, env }: { request: Request; env: Env }): Promise<Response> {
  try {
    return jsonResponse(await processChat(request, env));
  } catch (error) {
    return errorResponse(error);
  }
}
