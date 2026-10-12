"use client";

import { Check, Pencil, Settings, SquarePen, Trash2, X } from "lucide-react";
import { useState } from "react";
import AgentStatus from "./AgentStatus";
import Logo from "./Logo";
import type { ChatSession, ConnectionState, ServerStatus } from "@/lib/types";

interface Props {
  open: boolean;
  chats: ChatSession[];
  activeId: string | null;
  status: ServerStatus | null;
  connection: ConnectionState;
  onClose: () => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onOpenSettings: () => void;
}

export default function Sidebar(props: Props) {
  const { open, chats, activeId, status, connection } = props;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const sorted = [...chats].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  function startRename(chat: ChatSession) {
    setEditingId(chat.id);
    setDraft(chat.title);
  }

  function commitRename() {
    if (editingId && draft.trim()) props.onRename(editingId, draft.trim());
    setEditingId(null);
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={props.onClose}
          aria-hidden="true"
        />
      )}

      <aside
        aria-label="Sidebar"
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col bg-rail text-rail-text transition-transform motion-reduce:transition-none lg:static lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-14 shrink-0 items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <Logo size={26} />
            <span className="text-[15px] font-semibold tracking-tight text-white">TENETIC AI</span>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            aria-label="Close sidebar"
            className="rounded-lg p-1.5 text-rail-muted hover:bg-rail-hover hover:text-white lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-3 pb-3">
          <button
            type="button"
            onClick={props.onNew}
            className="flex w-full items-center gap-2 rounded-lg border border-rail-line px-3 py-2 text-sm font-medium text-white hover:bg-rail-hover"
          >
            <SquarePen className="h-4 w-4" aria-hidden="true" />
            New chat
          </button>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-3" aria-label="Chat history">
          <div className="px-2 pb-2 text-xs text-rail-muted">Recent conversations</div>
          {sorted.length === 0 && (
            <p className="px-2 py-2 text-sm text-rail-muted">Your conversations will appear here.</p>
          )}
          <ul className="space-y-0.5">
            {sorted.map((chat) => {
              const active = chat.id === activeId;
              return (
                <li key={chat.id}>
                  {editingId === chat.id ? (
                    <div className="flex items-center gap-1 rounded-lg bg-rail-hover px-2 py-1.5">
                      <input
                        autoFocus
                        value={draft}
                        maxLength={80}
                        aria-label="Chat name"
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename();
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="min-w-0 flex-1 bg-transparent text-sm text-white focus:outline-none"
                      />
                      <Check className="h-4 w-4 shrink-0 text-rail-muted" aria-hidden="true" />
                    </div>
                  ) : (
                    <div
                      className={`group flex items-center rounded-lg ${
                        active ? "bg-rail-hover text-white" : "hover:bg-rail-hover/60"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => props.onSelect(chat.id)}
                        aria-current={active ? "page" : undefined}
                        className="min-w-0 flex-1 truncate px-3 py-2 text-left text-sm"
                      >
                        {chat.title}
                      </button>
                      <div className="flex shrink-0 pr-1 opacity-100 transition-opacity focus-within:opacity-100 lg:opacity-0 lg:group-hover:opacity-100">
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => startRename(chat)}
                          aria-label={`Rename ${chat.title}`}
                          className="rounded p-1.5 text-rail-muted hover:text-white"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => props.onDelete(chat.id)}
                          aria-label={`Delete ${chat.title}`}
                          className="rounded p-1.5 text-rail-muted hover:text-white"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="shrink-0 space-y-3 border-t border-rail-line p-4">
          <AgentStatus status={status} connection={connection} variant="sidebar" />
          <button
            type="button"
            onClick={props.onOpenSettings}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-rail-hover hover:text-white"
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
            Settings
          </button>
        </div>
      </aside>
    </>
  );
}
