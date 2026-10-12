import type { ConnectionState, ServerStatus } from "@/lib/types";

interface Props {
  status: ServerStatus | null;
  connection: ConnectionState;
  variant: "header" | "sidebar";
}

export function connectionLabel(status: ServerStatus | null, connection: ConnectionState): string {
  if (connection === "checking") return "Checking connection…";
  if (connection === "offline" || !status) return "Backend offline";
  if (status.mode === "demo") return "Demo mode";
  return status.databricks_configured ? "Databricks configured (not verified)" : "Databricks not configured";
}

function dotColor(status: ServerStatus | null, connection: ConnectionState): string {
  if (connection === "checking") return "bg-rail-muted";
  if (connection === "offline" || !status) return "bg-danger";
  if (status.mode === "live" && !status.databricks_configured) return "bg-warn";
  return "bg-ok";
}

export default function AgentStatus({ status, connection, variant }: Props) {
  if (variant === "sidebar") {
    return (
      <div className="flex items-center gap-2 text-sm text-rail-text" role="status">
        <span className={`h-2 w-2 rounded-full ${dotColor(status, connection)}`} aria-hidden="true" />
        {connectionLabel(status, connection)}
      </div>
    );
  }

  const agents =
    connection !== "online" || !status
      ? null
      : status.mode === "demo"
        ? "Simulated agents"
        : `${status.genie_agents} Genie agents configured`;

  return (
    <div className="hidden text-right leading-tight md:block">
      <div className="text-sm font-medium text-ink">Powered by Databricks Super Agent</div>
      {agents && <div className="text-xs text-muted">{agents}</div>}
    </div>
  );
}
