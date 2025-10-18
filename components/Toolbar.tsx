"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { Bot } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useUiStore } from "@/lib/store";

type ToolbarProps = {
  className?: string;
};

export function Toolbar({ className }: ToolbarProps) {
  const { user, signIn, signOut, isLoading } = useAuth();
  const aiTrayOpen = useUiStore((state) => state.aiTrayOpen);
  const toggleAiTray = useUiStore((state) => state.toggleAiTray);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSignIn = () => {
    startTransition(async () => {
      setError(null);
      try {
        await signIn();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to sign in";
        setError(message);
      }
    });
  };

  const handleSignOut = () => {
    startTransition(async () => {
      setError(null);
      try {
        await signOut();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to sign out";
        setError(message);
      }
    });
  };

  const isBusy = isLoading || isPending;

  return (
    <header
      className={cn(
        "flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-background/75 px-4 py-3 shadow-sm backdrop-blur-sm",
        className,
      )}
      role="banner"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 text-lg font-bold text-white shadow-sm">
          PB
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Pulseboard</h1>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center">
        {user ? (
          <button
            type="button"
            onClick={() => toggleAiTray()}
            className={cn(
              "inline-flex items-center gap-2 rounded-md border border-border/80 px-3 py-2 text-sm font-medium transition",
              aiTrayOpen
                ? "bg-purple-600 text-white shadow hover:bg-purple-700"
                : "text-foreground hover:bg-muted",
            )}
          >
            <Bot className="h-4 w-4" />
            <span>Ask AI</span>
          </button>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        {user ? (
          <>
            <div className="flex items-center gap-2">
              {user.photoURL ? (
                <Image
                  src={user.photoURL}
                  alt={user.displayName ?? "User avatar"}
                  width={32}
                  height={32}
                  className="rounded-full border border-border/60"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-muted text-sm font-medium text-foreground">
                  {(user.displayName ?? user.email ?? "?").charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-foreground">
                  {user.displayName ?? user.email ?? "Signed in"}
                </span>
                <span className="text-xs text-muted-foreground">Google account</span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={isBusy}
              className="rounded-md border border-border/80 px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isBusy ? "Signing out…" : "Sign out"}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={handleSignIn}
            disabled={isBusy}
            className="rounded-md border border-border/80 px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isBusy ? "Signing in…" : "Sign in with Google"}
          </button>
        )}
      </div>
      {error ? (
        <p className="sr-only" role="alert">
          {error}
        </p>
      ) : null}
    </header>
  );
}

export default Toolbar;

