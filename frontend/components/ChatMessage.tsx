"use client";

import { AlertCircle, Check, Copy, RotateCcw } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Logo from "./Logo";
import { formatTime } from "@/lib/format";
import type { Message } from "@/lib/types";

interface Props {
  message: Message;
  canRetry: boolean;
  onRetry: (id: string) => void;
}

export default function ChatMessage({ message, canRetry, onRetry }: Props) {
  const [copied, setCopied] = useState(false);

  if (message.role === "user") {
    return (
      <div className="flex justify-end animate-rise">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-[15px] leading-6 text-white [overflow-wrap:anywhere] sm:max-w-[75%]">
          {message.content}
        </div>
      </div>
    );
  }

  if (message.error) {
    return (
      <div className="flex items-start gap-3 animate-rise" role="alert">
        <Logo size={28} />
        <div className="min-w-0 max-w-full rounded-2xl border border-danger-line bg-danger-soft px-4 py-3">
          <div className="flex items-start gap-2 text-[15px] leading-6 text-danger">
            <AlertCircle className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{message.content}</span>
          </div>
          {canRetry && (
            <button
              type="button"
              onClick={() => onRetry(message.id)}
              className="mt-3 flex items-center gap-2 rounded-lg border border-danger-line bg-surface px-3 py-1.5 text-sm font-medium text-danger hover:bg-white"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked by the browser; nothing else to do.
    }
  }

  const meta = [
    message.agent,
    formatTime(message.timestamp),
    typeof message.executionTime === "number" ? `${message.executionTime.toFixed(2)}s` : null,
  ].filter(Boolean);

  return (
    <div className="flex items-start gap-3 animate-rise">
      <Logo size={28} />
      <div className="min-w-0 flex-1">
        <div className="rounded-2xl border border-line bg-surface px-5 py-4">
          <div className="chat-md">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                table: ({ children }) => (
                  <div className="overflow-x-auto">
                    <table>{children}</table>
                  </div>
                ),
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer">
                    {children}
                  </a>
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        </div>
        <div className="mt-1.5 flex items-center gap-3 px-1 text-xs text-muted">
          <span className="min-w-0 truncate">{meta.join(" • ")}</span>
          <button
            type="button"
            onClick={copy}
            className="flex items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-line/60 hover:text-ink"
            aria-label="Copy response"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
    </div>
  );
}
