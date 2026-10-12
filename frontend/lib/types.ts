export type Role = "user" | "assistant";

export interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: string;
  agent?: string | null;
  executionTime?: number | null;
  error?: boolean;
}

export interface ChatSession {
  id: string;
  /** Sent to the backend; rotates when the conversation is cleared. */
  conversationId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
}

export interface ChatApiResponse {
  response: string;
  conversation_id: string;
  agent?: string | null;
  execution_time?: number | null;
  timestamp?: string;
}

export interface ServerStatus {
  status: string;
  app_name: string;
  mode: "demo" | "live";
  databricks_configured: boolean;
  genie_agents: number;
}

export type ConnectionState = "checking" | "online" | "offline";
