import { isConfigured, isDemoMode, jsonResponse } from "../_lib";

interface Env {
  DEMO_MODE?: string;
  DATABRICKS_HOST?: string;
  DATABRICKS_TOKEN?: string;
  DATABRICKS_AGENT_ENDPOINT?: string;
  GENIE_AGENT_COUNT?: string;
}

export async function onRequestGet({ env }: { env: Env }): Promise<Response> {
  return jsonResponse({
    status: "ok",
    app_name: "Tenetic AI",
    mode: isDemoMode(env) ? "demo" : "live",
    databricks_configured: isConfigured(env),
    genie_agents: Math.max(1, Number.parseInt(env.GENIE_AGENT_COUNT ?? "6", 10) || 6),
  });
}
