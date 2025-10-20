"use client";

import Toolbar from "@/components/Toolbar";
import Canvas from "@/components/Canvas";
import LiveblocksPresenceSummary from "@/components/LiveblocksPresenceSummary";
import AiCommandTray from "@/components/AiCommandTray";
import BackgroundAudio from "@/components/BackgroundAudio";
import { useAuth } from "@/hooks/useAuth";

function PresenceOverlay() {
  return (
    <div className="pointer-events-none absolute left-0 top-0 flex flex-col gap-3 text-left">
      <LiveblocksPresenceSummary />
    </div>
  );
}

export default function Home() {
  const { user, isLoading } = useAuth();
  const showPresence = !isLoading && !!user;

  return (
    <div className="flex min-h-screen flex-col gap-6 bg-muted/30 p-6">
      <BackgroundAudio />
      <Toolbar />
      <main className="relative flex flex-1 flex-col overflow-hidden rounded-2xl border border-dashed border-border/80 bg-background/70 p-0 shadow-inner">
        {showPresence ? <PresenceOverlay /> : null}
        {showPresence ? (
          <div className="absolute left-1/2 top-16 z-30 -translate-x-1/2">
            <AiCommandTray />
          </div>
        ) : null}
        <div className="flex h-full w-full flex-1 flex-col md:flex-row">
          <div className={showPresence ? "hidden space-y-4 p-12 md:block md:w-80" : "mx-auto max-w-lg space-y-4 p-12 text-center"}>
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
            ) : user ? null : (
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
          {showPresence ? (
            <div className="relative flex flex-1">
              <Canvas />
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}

