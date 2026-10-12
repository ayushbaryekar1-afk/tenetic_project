"use client";

import { ArrowUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const MAX_LENGTH = 4000;

interface Props {
  disabled: boolean;
  onSend: (text: string) => void;
}

export default function ChatInput({ disabled, onSend }: Props) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  function submit() {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
    ref.current?.focus();
  }

  const canSend = value.trim().length > 0 && !disabled;

  return (
    <div className="shrink-0 border-t border-line bg-paper px-4 pb-4 pt-3 sm:px-6">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-end gap-2 rounded-2xl border border-line bg-surface p-2 focus-within:border-accent">
          <textarea
            ref={ref}
            value={value}
            rows={1}
            maxLength={MAX_LENGTH}
            placeholder="Ask anything about your data..."
            aria-label="Message"
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            className="max-h-[200px] min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-[15px] leading-6 text-ink placeholder:text-muted focus:outline-none"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!canSend}
            aria-label="Send message"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-line disabled:text-muted"
          >
            <ArrowUp className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-2 text-center text-xs text-muted">
          Enter sends. Shift+Enter adds a new line.
          {value.length > MAX_LENGTH - 400 && ` ${MAX_LENGTH - value.length} characters left.`}
        </p>
      </div>
    </div>
  );
}
