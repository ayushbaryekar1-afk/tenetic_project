import type { ChatSession } from "./types";

const KEY = "tenetic-chats-v1";

export function loadChats(): ChatSession[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ChatSession[]) : [];
  } catch {
    return [];
  }
}

export function saveChats(chats: ChatSession[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(chats));
  } catch {
    // Storage full or unavailable (private mode): the app still works, history just won't persist.
  }
}
