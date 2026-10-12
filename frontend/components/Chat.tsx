"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ChatInput from "./ChatInput";
import ChatMessage from "./ChatMessage";
import Header from "./Header";
import LoadingIndicator from "./LoadingIndicator";
import SettingsModal from "./SettingsModal";
import Sidebar from "./Sidebar";
import { ApiError, getStatus, sendChatStream } from "@/lib/api";
import { makeTitle, uid } from "@/lib/format";
import { loadChats, saveChats } from "@/lib/storage";
import type { ChatSession, ConnectionState, Message, ServerStatus } from "@/lib/types";

const SUGGESTIONS = [
  "What is the total sales?",
  "Show the monthly revenue trend",
  "Which region is underperforming?",
  "Who are our top customers?",
];

export default function Chat() {
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [loadingIds, setLoadingIds] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("checking");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load saved chats once, in the browser only.
  useEffect(() => {
    const stored = loadChats();
    setChats(stored);
    const latest = [...stored].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    setActiveId(latest ? latest.id : null);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveChats(chats);
  }, [chats, hydrated]);

  // Poll backend status.
  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const s = await getStatus();
        if (cancelled) return;
        setStatus(s);
        setConnection("online");
      } catch {
        if (cancelled) return;
        setConnection("offline");
      }
    }
    void check();
    const timer = setInterval(check, 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const activeChat = useMemo(() => chats.find((c) => c.id === activeId) ?? null, [chats, activeId]);
  const messages = useMemo(() => activeChat?.messages ?? [], [activeChat]);
  const isLoading = activeId !== null && loadingIds.includes(activeId);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isLoading, activeId]);

  const patchChat = useCallback((id: string, fn: (c: ChatSession) => ChatSession) => {
    setChats((prev) => prev.map((c) => (c.id === id ? fn(c) : c)));
  }, []);

  const ask = useCallback(
    async (chatId: string, conversationId: string, text: string) => {
      const replyId = uid();
      const replyTimestamp = new Date().toISOString();
      let streamedText = "";
      setLoadingIds((prev) => [...prev, chatId]);
      try {
        const res = await sendChatStream(text, conversationId, (delta) => {
          streamedText += delta;
          const partial: Message = {
            id: replyId,
            role: "assistant",
            content: streamedText,
            timestamp: replyTimestamp,
          };
          patchChat(chatId, (c) => ({
            ...c,
            messages: c.messages.some((m) => m.id === replyId)
              ? c.messages.map((m) => (m.id === replyId ? partial : m))
              : [...c.messages, partial],
          }));
        });
        const reply: Message = {
          id: replyId,
          role: "assistant",
          content: res.response,
          timestamp: res.timestamp ?? replyTimestamp,
          agent: res.agent ?? null,
          executionTime: res.execution_time ?? null,
        };
        patchChat(chatId, (c) => ({
          ...c,
          updatedAt: reply.timestamp,
          messages: c.messages.some((m) => m.id === replyId)
            ? c.messages.map((m) => (m.id === replyId ? reply : m))
            : [...c.messages, reply],
        }));
      } catch (err) {
        const content = err instanceof ApiError ? err.message : "Something went wrong. Please try again.";
        const failure: Message = {
          id: replyId,
          role: "assistant",
          content,
          timestamp: replyTimestamp,
          error: true,
        };
        patchChat(chatId, (c) => ({
          ...c,
          messages: c.messages.some((m) => m.id === replyId)
            ? c.messages.map((m) => (m.id === replyId ? failure : m))
            : [...c.messages, failure],
        }));
      } finally {
        setLoadingIds((prev) => prev.filter((id) => id !== chatId));
      }
    },
    [patchChat],
  );

  const send = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text || isLoading) return;
      const now = new Date().toISOString();
      const userMessage: Message = { id: uid(), role: "user", content: text, timestamp: now };

      if (activeChat) {
        patchChat(activeChat.id, (c) => ({ ...c, updatedAt: now, messages: [...c.messages, userMessage] }));
        void ask(activeChat.id, activeChat.conversationId, text);
      } else {
        const session: ChatSession = {
          id: uid(),
          conversationId: uid(),
          title: makeTitle(text),
          createdAt: now,
          updatedAt: now,
          messages: [userMessage],
        };
        setChats((prev) => [session, ...prev]);
        setActiveId(session.id);
        void ask(session.id, session.conversationId, text);
      }
    },
    [activeChat, isLoading, patchChat, ask],
  );

  const retry = useCallback(
    (errorId: string) => {
      if (!activeChat || isLoading) return;
      const index = activeChat.messages.findIndex((m) => m.id === errorId);
      if (index < 0) return;
      const lastUser = [...activeChat.messages.slice(0, index)].reverse().find((m) => m.role === "user");
      if (!lastUser) return;
      patchChat(activeChat.id, (c) => ({ ...c, messages: c.messages.filter((m) => m.id !== errorId) }));
      void ask(activeChat.id, activeChat.conversationId, lastUser.content);
    },
    [activeChat, isLoading, patchChat, ask],
  );

  const clearConversation = useCallback(() => {
    if (!activeChat) return;
    patchChat(activeChat.id, (c) => ({
      ...c,
      conversationId: uid(), // fresh context on the backend
      messages: [],
      updatedAt: new Date().toISOString(),
    }));
  }, [activeChat, patchChat]);

  const newChat = useCallback(() => {
    setActiveId(null);
    setSidebarOpen(false);
  }, []);

  const selectChat = useCallback((id: string) => {
    setActiveId(id);
    setSidebarOpen(false);
  }, []);

  const deleteChat = useCallback(
    (id: string) => {
      setChats((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) setActiveId(null);
    },
    [activeId],
  );

  const renameChat = useCallback(
    (id: string, title: string) => patchChat(id, (c) => ({ ...c, title })),
    [patchChat],
  );

  const clearAll = useCallback(() => {
    setChats([]);
    setActiveId(null);
  }, []);

  const lastMessage = messages[messages.length - 1];

  return (
    <div className="flex h-dvh overflow-hidden bg-paper text-ink">
      <Sidebar
        open={sidebarOpen}
        chats={chats}
        activeId={activeId}
        status={status}
        connection={connection}
        onClose={() => setSidebarOpen(false)}
        onNew={newChat}
        onSelect={selectChat}
        onDelete={deleteChat}
        onRename={renameChat}
        onOpenSettings={() => {
          setSettingsOpen(true);
          setSidebarOpen(false);
        }}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          title={activeChat ? activeChat.title : "AI Assistant"}
          status={status}
          connection={connection}
          canClear={messages.length > 0 && !isLoading}
          onMenu={() => setSidebarOpen(true)}
          onClear={clearConversation}
        />

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
            {messages.length === 0 && !isLoading ? (
              <div className="flex min-h-[55vh] flex-col justify-center">
                <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">AI Assistant</h2>
                <p className="mt-3 max-w-xl text-[15px] leading-7 text-muted">
                  Ask a question about your data in plain language. The Super Agent sends it to the right
                  Genie agent and answers from your connected tables and knowledge sources.
                </p>
                <div className="mt-8 grid gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="rounded-xl border border-line bg-surface px-4 py-3 text-left text-sm text-ink-soft hover:border-accent hover:text-ink"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-6" role="log" aria-live="polite" aria-label="Conversation">
                {messages.map((m) => (
                  <ChatMessage
                    key={m.id}
                    message={m}
                    canRetry={!isLoading && m.id === lastMessage?.id}
                    onRetry={retry}
                  />
                ))}
                {isLoading && lastMessage?.role !== "assistant" && <LoadingIndicator />}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </main>

        <ChatInput disabled={isLoading} onSend={send} />
      </div>

      <SettingsModal
        open={settingsOpen}
        status={status}
        connection={connection}
        chatCount={chats.length}
        onClose={() => setSettingsOpen(false)}
        onClearAll={clearAll}
      />
    </div>
  );
}
