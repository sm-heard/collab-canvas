"use client";

import Toolbar from "@/components/Toolbar";
import { useAuth } from "@/hooks/useAuth";

export default function Home() {
  const { user, isLoading } = useAuth();

  return (
    <div className="flex min-h-screen flex-col gap-6 bg-muted/30 p-6">
      <Toolbar />
      <main className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-background/70 p-12 text-center shadow-inner">
        <div className="max-w-lg space-y-4">
          {isLoading ? (
            <>
              <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">
                Checking session…
              </p>
              <h2 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                Preparing your canvas
              </h2>
              <p className="text-base text-muted-foreground">
                Hang tight while we verify your account.
              </p>
            </>
          ) : user ? (
            <>
              <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">
                Welcome back
              </p>
              <h2 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                You’re signed in and ready to create.
              </h2>
              <p className="text-base text-muted-foreground">
                Canvas editing features are coming next. For now, explore the toolbar and stay tuned for live collaboration updates.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">
                Sign in required
              </p>
              <h2 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                Access the canvas with your Google account.
              </h2>
              <p className="text-base text-muted-foreground">
                Use the button in the toolbar to sign in. Once authenticated, you’ll unlock the shared canvas experience.
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

