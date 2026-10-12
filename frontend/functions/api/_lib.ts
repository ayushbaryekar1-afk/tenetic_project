interface Env {
  DEMO_MODE?: string;
  DATABRICKS_HOST?: string;
  DATABRICKS_TOKEN?: string;
  DATABRICKS_AGENT_ENDPOINT?: string;
  GENIE_AGENT_COUNT?: string;
  REQUEST_TIMEOUT_SECONDS?: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AgentReply {
  text: string;
  agent: string | null;
}

interface ChatResult {
  response: string;
  conversation_id: string;
  agent: string | null;
  execution_time: number;
  timestamp: string;
}

interface ApiFailure {
  status: number;
  code: string;
  message: string;
}

const histories = new Map<string, Message[]>();
const MAX_TURNS_KEPT = 10;
const MAX_CONVERSATIONS = 500;

const demoRules: Array<[string[], string, string]> = [
  [
    ["total sales", "total revenue", "sales total"],
    "Sales Genie",
    "Based on the connected data, the total sales are **₹24.6 Cr**.\n\nWant me to break this down by region, product line, or month?",
  ],
  [
    ["region", "regional", "underperform"],
    "Sales Genie",
    "Here is a sample regional breakdown (demo data):\n\n| Region | Sales | Share |\n|---|---|---|\n| West | ₹8.9 Cr | 36% |\n| South | ₹6.8 Cr | 28% |\n| North | ₹5.4 Cr | 22% |\n| East | ₹3.5 Cr | 14% |\n\nEast has the smallest share of sales.",
  ],
  [
    ["trend", "monthly", "month"],
    "Finance Genie",
    "Monthly revenue has grown steadily across the last four quarters in this demo dataset, with the largest jump in the most recent quarter.\n\nIn live mode this answer comes from your Databricks tables.",
  ],
  [
    ["customer", "client"],
    "Customer Genie",
    "Top customers (demo data):\n\n1. Northwind Traders\n2. Contoso Retail\n3. Fabrikam Industries\n\nI can also show retention or churn if you'd like.",
  ],
  [
    ["inventory", "stock"],
    "Inventory Genie",
    "Inventory levels look healthy overall in this demo dataset. Three SKUs are below their reorder threshold and flagged for review.",
  ],
];

function failure(status: number, code: string, message: string): ApiFailure {
  return { status, code, message };
}

function isPlaceholderToken(value: string): boolean {
  const token = value.trim();
  if (!token) return true;
  const normalized = token.toLowerCase();
  return (
    [
      "generated",
      "placeholder",
      "your-token",
      "your token",
      "<token>",
      "<your token>",
      "paste your",
      "paste token",
      "replace me",
      "example token",
    ].some((marker) => normalized.includes(marker)) ||
    token.includes("<") ||
    token.includes(">")
  );
}

function extractText(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) {
    const text = value
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .filter((part) => part.trim())
      .join("\n")
      .trim();
    return text || null;
  }
  return null;
}

function extractAgent(data: Record<string, unknown>): string | null {
  const custom = data.custom_outputs;
  if (custom && typeof custom === "object") {
    const output = custom as Record<string, unknown>;
    for (const key of ["agent", "agent_name", "genie", "genie_name"]) {
      if (typeof output[key] === "string" && output[key].trim()) return output[key].trim();
    }
  }
  if (Array.isArray(data.messages)) {
    for (const message of [...data.messages].reverse()) {
      if (
        message &&
        typeof message === "object" &&
        "role" in message &&
        message.role === "assistant" &&
        "name" in message &&
        typeof message.name === "string"
      ) {
        return message.name;
      }
    }
  }
  return null;
}

function parseReply(data: unknown): AgentReply {
  if (!data || typeof data !== "object") {
    throw failure(502, "bad_response", "The Super Agent returned an unexpected response.");
  }
  const result = data as Record<string, unknown>;
  let text: string | null = null;

  if (Array.isArray(result.choices) && result.choices[0] && typeof result.choices[0] === "object") {
    const message = (result.choices[0] as Record<string, unknown>).message;
    if (message && typeof message === "object") {
      text = extractText((message as Record<string, unknown>).content);
    }
  }
  if (!text && Array.isArray(result.output)) {
    for (const item of [...result.output].reverse()) {
      if (item && typeof item === "object") {
        const outputItem = item as Record<string, unknown>;
        if (outputItem.type === undefined || outputItem.type === "message") {
          text = extractText(outputItem.content);
          if (text) break;
        }
      }
    }
  }
  if (!text && Array.isArray(result.messages)) {
    for (const item of [...result.messages].reverse()) {
      if (item && typeof item === "object") {
        const message = item as Record<string, unknown>;
        if (message.role === "assistant") {
          text = extractText(message.content);
          if (text) break;
        }
      }
    }
  }
  if (!text && Array.isArray(result.predictions) && result.predictions.length > 0) {
    const prediction = result.predictions[0];
    if (typeof prediction === "string") text = prediction.trim() || null;
    else if (prediction && typeof prediction === "object") {
      const item = prediction as Record<string, unknown>;
      for (const key of ["response", "answer", "result", "text", "content", "output"]) {
        text = extractText(item[key]);
        if (text) break;
      }
    }
  }
  if (!text) {
    for (const key of ["response", "answer", "result", "text", "content", "output"]) {
      text = extractText(result[key]);
      if (text) break;
    }
  }
  if (!text) {
    throw failure(502, "bad_response", "The Super Agent replied in a format this app doesn't recognise yet.");
  }
  return { text, agent: extractAgent(result) };
}

function remember(conversationId: string, userText: string, assistantText: string): void {
  const history = histories.get(conversationId) ?? [];
  history.push(
    { role: "user", content: userText },
    { role: "assistant", content: assistantText },
  );
  histories.delete(conversationId);
  histories.set(conversationId, history.slice(-MAX_TURNS_KEPT * 2));
  while (histories.size > MAX_CONVERSATIONS) {
    const oldest = histories.keys().next().value;
    if (oldest === undefined) break;
    histories.delete(oldest);
  }
}

function demoReply(message: string): AgentReply {
  const normalized = message.toLowerCase();
  for (const [keywords, agent, text] of demoRules) {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      return { text, agent: `${agent} (demo)` };
    }
  }
  if (["hi", "hello", "hey"].includes(normalized) || normalized.includes("help")) {
    return {
      text: "Hello! I'm the Tenetic AI assistant. Ask me about sales, customers, inventory, or finance and I'll route the question to the right Genie agent.",
      agent: "Super Agent (demo)",
    };
  }
  const snippet = message.length <= 160 ? message : `${message.slice(0, 157)}...`;
  return {
    text: `This is a demo response to: *"${snippet}"*\n\nDemo mode is on, so no Databricks call was made. Set \`DEMO_MODE=false\` in the hosting settings to query your real Super Agent.`,
    agent: "Super Agent (demo)",
  };
}

async function databricksReply(env: Env, message: string, conversationId: string): Promise<AgentReply> {
  const host = (env.DATABRICKS_HOST ?? "").trim().replace(/\/+$/, "");
  const token = (env.DATABRICKS_TOKEN ?? "").trim();
  const endpoint = (env.DATABRICKS_AGENT_ENDPOINT ?? "").trim();
  if (!host || !token || !endpoint) {
    throw failure(
      503,
      "not_configured",
      "Databricks is not configured on the server. Add DATABRICKS_HOST, DATABRICKS_TOKEN and DATABRICKS_AGENT_ENDPOINT, or enable demo mode.",
    );
  }
  if (isPlaceholderToken(token)) {
    throw failure(
      401,
      "placeholder_token",
      "The Databricks token is still a placeholder. Add a valid token with Can Query permission.",
    );
  }
  const baseHost = /^https?:\/\//i.test(host) ? host : `https://${host}`;
  const url = /^https?:\/\//i.test(endpoint)
    ? endpoint
    : `${baseHost}/serving-endpoints/${encodeURIComponent(endpoint)}/invocations`;
  const messages = [...(histories.get(conversationId) ?? []), { role: "user" as const, content: message }];
  const timeout = Math.min(Math.max(Number(env.REQUEST_TIMEOUT_SECONDS) || 180, 1), 240);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout * 1000);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ input: messages }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw failure(504, "timeout", "The Super Agent took too long to respond. Please try again.");
    }
    throw failure(502, "unreachable", "Can't reach Databricks. Check the configured workspace host.");
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403 || (response.status >= 300 && response.status < 400)) {
      throw failure(502, "auth_failed", "Databricks rejected the server's credentials. Check the token and endpoint permissions.");
    }
    if (response.status === 404) {
      throw failure(502, "not_found", "The Super Agent endpoint was not found. Check DATABRICKS_AGENT_ENDPOINT.");
    }
    if (response.status === 429) {
      throw failure(429, "rate_limited", "The Super Agent is busy right now. Please try again in a moment.");
    }
    if (response.status === 400 || response.status === 422) {
      throw failure(502, "bad_request", "Databricks couldn't process this request.");
    }
    throw failure(503, "upstream_unavailable", "The Super Agent is currently unavailable. Please try again shortly.");
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw failure(502, "bad_response", "The Super Agent returned a response that isn't valid JSON.");
  }
  return parseReply(data);
}

export async function processChat(request: Request, env: Env): Promise<ChatResult> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw failure(422, "validation_error", "The request was not valid.");
  }
  if (!body || typeof body !== "object") {
    throw failure(422, "validation_error", "The request was not valid.");
  }
  const input = body as Record<string, unknown>;
  if (typeof input.message !== "string" || input.message.trim().length < 1 || input.message.length > 4000) {
    throw failure(422, "validation_error", "Enter a message between 1 and 4000 characters.");
  }
  const message = input.message.trim();
  const conversationId =
    input.conversation_id === undefined || input.conversation_id === null ? crypto.randomUUID().replaceAll("-", "") : input.conversation_id;
  if (
    typeof conversationId !== "string" ||
    conversationId.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(conversationId)
  ) {
    throw failure(422, "validation_error", "The conversation ID is not valid.");
  }

  const started = Date.now();
  const reply = env.DEMO_MODE?.toLowerCase() === "true"
    ? demoReply(message)
    : await databricksReply(env, message, conversationId);
  remember(conversationId, message, reply.text);
  return {
    response: reply.text,
    conversation_id: conversationId,
    agent: reply.agent,
    execution_time: Math.round((Date.now() - started) / 10) / 100,
    timestamp: new Date().toISOString(),
  };
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function errorResponse(error: unknown): Response {
  if (error && typeof error === "object" && "status" in error && "code" in error && "message" in error) {
    const apiError = error as ApiFailure;
    return jsonResponse({ error: apiError.code, message: apiError.message }, apiError.status);
  }
  return jsonResponse({ error: "internal_error", message: "Something went wrong on the server. Please try again." }, 500);
}

export function isConfigured(env: Env): boolean {
  return Boolean(env.DATABRICKS_HOST && env.DATABRICKS_TOKEN && env.DATABRICKS_AGENT_ENDPOINT);
}
