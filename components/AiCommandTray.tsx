"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2, Bot, Undo2, Trash2, RotateCcw } from "lucide-react";
import { nanoid } from "nanoid";

import { cn } from "@/lib/utils";
import type { AiCommandSummary, AiCommandStreamEvent } from "@/lib/ai/types";
import { useUiStore } from "@/lib/store";
import { useAuth } from "@/hooks/useAuth";
import { auth } from "@/lib/firebase";
import { useCanvasHistory } from "@/hooks/useCanvasHistory";

function formatDuration(ms?: number) {
  if (!ms) return "--";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

async function fetchAiStream(payload: object, token: string) {
  const response = await fetch("/api/ai/command", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok || !response.body) {
    throw new Error(`AI request failed (${response.status})`);
  }

  return response.body.getReader();
}

function parseSseChunk(chunk: string): AiCommandStreamEvent | null {
  const lines = chunk.trim().split("\n");
  let eventType: string | null = null;
  let data: string | null = null;

  for (const line of lines) {
    if (line.startsWith("event:")) {
      eventType = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      data = line.slice("data:".length).trim();
    }
  }

  if (!eventType || !data) {
    return null;
  }

  try {
    const parsed = JSON.parse(data) as { status?: string; message?: string; durationMs?: number; result?: unknown };
    switch (eventType) {
      case "init":
        return {
          type: "progress",
          status: "thinking",
          message: parsed.message ?? "Preparing AI command…",
        } satisfies AiCommandStreamEvent;
      case "progress":
        return {
          type: "progress",
          status: (parsed.status as AiCommandStreamEvent["status"]) ?? "running",
          message: parsed.message,
        } satisfies AiCommandStreamEvent;
      case "summary":
        return {
          type: "summary",
          status: "success",
          summary: {
            commandId: "",
            prompt: "",
            status: "success",
            steps: [],
            durationMs: parsed.durationMs,
          },
        } satisfies AiCommandStreamEvent;
      case "error":
        return {
          type: "error",
          status: "error",
          message: parsed.message ?? "AI command failed",
        } satisfies AiCommandStreamEvent;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export function AiCommandTray() {
  const aiTrayOpen = useUiStore((state) => state.aiTrayOpen);
  const aiHistory = useUiStore((state) => state.aiHistory);
  const aiCommandStatus = useUiStore((state) => state.aiCommandStatus);
  const toggleAiTray = useUiStore((state) => state.toggleAiTray);
  const addAiHistoryEntry = useUiStore((state) => state.addAiHistoryEntry);
  const updateAiHistoryEntry = useUiStore((state) => state.updateAiHistoryEntry);
  const clearAiHistory = useUiStore((state) => state.clearAiHistory);
  const setAiCommandStatus = useUiStore((state) => state.setAiCommandStatus);
  const setAiActiveUser = useUiStore((state) => state.setAiActiveUser);
  const { user } = useAuth();
  const { revertLastAiCommand, canRevertAi } = useCanvasHistory();
  const [prompt, setPrompt] = useState("");
  const [activeCommandId, setActiveCommandId] = useState<string | null>(null);
  const [streamMessages, setStreamMessages] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [layoutMode, setLayoutMode] = useState<"none" | "loginForm" | "navBar">("none");

  const canSubmit = prompt.trim().length > 0 && !isStreaming;

  const buildPayload = useCallback(
    (text: string) => {
      if (layoutMode === "loginForm") {
        return {
          prompt: text,
          composite: "loginForm",
          origin: { x: 200, y: 200 },
        };
      }
      if (layoutMode === "navBar") {
        return {
          prompt: text,
          composite: "navBar",
          origin: { x: 160, y: 160 },
          width: 720,
        };
      }
      return { prompt: text };
    },
    [layoutMode],
  );

  const handleClose = useCallback(() => {
    toggleAiTray(false);
  }, [toggleAiTray]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!canSubmit) return;

      const trimmed = prompt.trim();
      const commandId = nanoid();
      const summary: AiCommandSummary = {
        commandId,
        prompt: trimmed,
        status: "thinking",
        steps: [],
      };

      addAiHistoryEntry(summary);
      setPrompt("");
      setActiveCommandId(commandId);
      setStreamMessages([]);
      setErrorMessage(null);
      setIsStreaming(true);
      setAiCommandStatus("thinking");
      if (user?.uid) {
        setAiActiveUser({ userId: user.uid, prompt: trimmed, status: "running" });
      }

      try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
          throw new Error("User is not authenticated.");
        }
        const idToken = await currentUser.getIdToken();

        const payload = buildPayload(trimmed);
        const reader = await fetchAiStream(payload, idToken);
        const decoder = new TextDecoder();

        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          const parts = chunk.split("\n\n").filter(Boolean);
          for (const part of parts) {
            const event = parseSseChunk(part);
            if (!event) continue;

            if (event.type === "progress" && event.message) {
              setStreamMessages((prev) => [...prev, event.message!]);
              setAiCommandStatus(event.status);
              updateAiHistoryEntry(commandId, { status: event.status });
              if (user?.uid) {
                setAiActiveUser({ userId: user.uid, prompt: trimmed, status: "running" });
              }
            }

            if (event.type === "summary" && event.summary) {
              updateAiHistoryEntry(commandId, {
                status: event.summary.status,
                durationMs: event.summary.durationMs,
              });
              setAiCommandStatus("idle");
              setAiActiveUser(null);
            }

            if (event.type === "error" && event.message) {
              setErrorMessage(event.message);
              updateAiHistoryEntry(commandId, { status: "error" });
              setAiCommandStatus("error");
              if (user?.uid) {
                setAiActiveUser({
                  userId: user.uid,
                  prompt: trimmed,
                  status: "error",
                  message: event.message,
                });
              }
            }
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "AI command failed.";
        setErrorMessage(message);
        updateAiHistoryEntry(commandId, { status: "error" });
        setAiCommandStatus("error");
        if (user?.uid) {
          setAiActiveUser({ userId: user.uid, prompt: trimmed, status: "error", message });
        }
      } finally {
        setIsStreaming(false);
        setActiveCommandId(null);
        setAiActiveUser(null);
      }
    },
    [
      prompt,
      canSubmit,
      addAiHistoryEntry,
      setAiCommandStatus,
      updateAiHistoryEntry,
      buildPayload,
      setAiActiveUser,
      user?.uid,
    ],
  );

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "/" && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        toggleAiTray(true);
      }
      if (event.key === "Escape") {
        toggleAiTray(false);
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [toggleAiTray]);

  const statusBadge = useMemo(() => {
    switch (aiCommandStatus) {
      case "thinking":
        return { label: "Thinking", className: "bg-amber-100 text-amber-700" };
      case "running":
        return { label: "Running", className: "bg-blue-100 text-blue-700" };
      case "success":
        return { label: "Done", className: "bg-emerald-100 text-emerald-700" };
      case "error":
        return { label: "Error", className: "bg-rose-100 text-rose-700" };
      default:
        return { label: "Idle", className: "bg-muted text-muted-foreground" };
    }
  }, [aiCommandStatus]);

  return (
    <AnimatePresence>
      {aiTrayOpen ? (
        <motion.aside
          initial={{ opacity: 0, x: 32 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 32 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="pointer-events-auto flex w-full max-w-md flex-col gap-4 rounded-2xl border border-border/60 bg-background/95 p-5 shadow-xl"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-100 text-purple-600">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  AI Command Tray
                </h2>
                <p className="text-xs text-muted-foreground">
                  Type a prompt or press <kbd className="rounded bg-muted px-1 text-[11px]">/</kbd> to focus.
                </p>
              </div>
            </div>
            <span
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium",
                statusBadge.className,
              )}
            >
              {statusBadge.label}
            </span>
          </div>

          <form onSubmit={handleSubmit} className="flex items-end gap-2">
            <div className="flex flex-1 flex-col gap-2">
              <label htmlFor="aiPrompt" className="sr-only">
                Ask the AI to edit the canvas
              </label>
              <textarea
                id="aiPrompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Ask the AI to create a login form, align shapes, or tidy the layout…"
                rows={2}
                className="flex-1 resize-none rounded-xl border border-border/70 bg-background px-3 py-2 text-sm text-foreground shadow-inner outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <label className="inline-flex items-center gap-2" htmlFor="layoutModeSelect">
                  Mode:
                  <select
                    id="layoutModeSelect"
                    value={layoutMode}
                    onChange={(event) => setLayoutMode(event.target.value as typeof layoutMode)}
                    className="rounded-md border border-border/60 px-2 py-1 text-xs"
                  >
                    <option value="none">Basic prompt</option>
                    <option value="loginForm">Composite: Login form</option>
                    <option value="navBar">Composite: Navigation bar</option>
                  </select>
                </label>
              </div>
            </div>
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-purple-600 text-white shadow transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Submit AI command"
            >
              {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>Streaming output</span>
              {streamMessages.length > 0 ? <span>{streamMessages.length} updates</span> : null}
            </div>
            <div className="min-h-[72px] rounded-xl border border-dashed border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
              {streamMessages.length > 0 ? (
                <ul className="space-y-1">
                  {streamMessages.map((message, index) => (
                    <li key={`${message}-${index}`} className="flex items-center gap-2 text-foreground">
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                      <span>{message}</span>
                    </li>
                  ))}
                </ul>
              ) : errorMessage ? (
                <p className="text-rose-600">{errorMessage}</p>
              ) : (
                <p>No updates yet. Submit a prompt to see the AI plan.</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Recent commands
              </span>
              <button
                type="button"
                onClick={clearAiHistory}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted/60"
              >
                <Trash2 className="h-3 w-3" /> Clear
              </button>
            </div>
            <ul className="space-y-2 text-sm">
              {aiHistory.length === 0 ? (
                <li className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-3 text-muted-foreground">
                  No history yet. Prompts will appear here after you run them.
                </li>
              ) : (
                aiHistory.map((entry) => (
                  <li
                    key={entry.commandId}
                    className={cn(
                      "rounded-xl border border-border/60 bg-background/60 p-3 shadow-sm",
                      entry.commandId === activeCommandId && "border-purple-400",
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="line-clamp-2 text-sm text-foreground">{entry.prompt}</p>
                      <span className="text-xs text-muted-foreground">
                        {formatDuration(entry.durationMs)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5",
                          entry.status === "success"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : entry.status === "error"
                              ? "border-rose-200 bg-rose-50 text-rose-700"
                              : entry.status === "running"
                                ? "border-blue-200 bg-blue-50 text-blue-700"
                                : entry.status === "thinking"
                                  ? "border-amber-200 bg-amber-50 text-amber-700"
                                  : "border-muted/80 bg-muted/30 text-muted-foreground",
                        )}
                      >
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span className="capitalize">{entry.status}</span>
                      </span>
                      {entry.steps.length > 0 ? (
                        <span>{entry.steps.length} steps</span>
                      ) : null}
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Undo2 className="h-3 w-3" />
              <span>Undo AI actions via `Cmd+Z` after execution.</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={revertLastAiCommand}
                disabled={!canRevertAi}
                className="inline-flex items-center gap-1 rounded-md border border-border/80 px-2 py-1 text-xs font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RotateCcw className="h-3 w-3" /> Revert last AI action
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:text-foreground"
              >
                Close
              </button>
            </div>
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}

export default AiCommandTray;
