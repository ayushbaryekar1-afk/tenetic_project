import { Eraser, Menu } from "lucide-react";
import AgentStatus from "./AgentStatus";
import type { ConnectionState, ServerStatus } from "@/lib/types";

interface Props {
  title: string;
  status: ServerStatus | null;
  connection: ConnectionState;
  canClear: boolean;
  onMenu: () => void;
  onClear: () => void;
}

export default function Header({ title, status, connection, canClear, onMenu, onClear }: Props) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-3 sm:px-5">
      <button
        type="button"
        onClick={onMenu}
        aria-label="Open sidebar"
        className="rounded-lg p-2 text-ink-soft hover:bg-paper lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      <h1 className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink">{title}</h1>

      <AgentStatus status={status} connection={connection} variant="header" />

      <button
        type="button"
        onClick={onClear}
        disabled={!canClear}
        className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-sm text-ink-soft hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Eraser className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Clear conversation</span>
        <span className="sm:hidden">Clear</span>
      </button>
    </header>
  );
}
