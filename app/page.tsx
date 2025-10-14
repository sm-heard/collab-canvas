import Toolbar from "@/components/Toolbar";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col gap-6 bg-muted/30 p-6">
      <Toolbar />
      <main className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-background/70 p-12 text-center shadow-inner">
        <div className="max-w-lg space-y-4">
          <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">
            Coming soon
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            Real-time design collaboration without the bloat.
          </h2>
          <p className="text-base text-muted-foreground">
            Sign in to sketch ideas with your team. Pan, zoom, draw rectangles, and
            watch everyone move in real time.
          </p>
        </div>
      </main>
    </div>
  );
}
