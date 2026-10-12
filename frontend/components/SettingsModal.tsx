"use client";

import { Trash2, X } from "lucide-react";
import { useEffect } from "react";
import { connectionLabel } from "./AgentStatus";
import { API_URL } from "@/lib/api";
import type { ConnectionState, ServerStatus } from "@/lib/types";

interface Props {
  open: boolean;
  status: ServerStatus | null;
  connection: ConnectionState;
  chatCount: number;
  onClose: () => void;
  onClearAll: () => void;
}

export default function SettingsModal({ open, status, connection, chatCount, onClose, onClearAll }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const rows: Array<[string, string]> = [
    ["Connection", connectionLabel(status, connection)],
    ["Mode", status ? (status.mode === "demo" ? "Demo (no Databricks calls)" : "Live") : "Unknown"],
    ["Databricks configured", status ? (status.databricks_configured ? "Yes" : "No") : "Unknown"],
    ["Genie agents", status ? String(status.genie_agents) : "Unknown"],
    ["Backend URL", API_URL],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="relative w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 id="settings-title" className="text-lg font-semibold">
            Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="rounded-lg p-1.5 text-muted hover:bg-paper"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <dl className="mt-5 divide-y divide-line text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 py-2.5">
              <dt className="text-muted">{label}</dt>
              <dd className="min-w-0 truncate text-right font-medium">{value}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-4 text-sm text-muted">
          Credentials stay on the server. Change them in your backend .env file, then restart the backend.
        </p>

        <div className="mt-6 border-t border-line pt-5">
          <button
            type="button"
            disabled={chatCount === 0}
            onClick={() => {
              if (window.confirm("Delete all saved conversations from this browser?")) {
                onClearAll();
                onClose();
              }
            }}
            className="flex items-center gap-2 rounded-lg border border-danger-line px-3 py-2 text-sm font-medium text-danger hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Delete all chat history
          </button>
        </div>
      </div>
    </div>
  );
}
