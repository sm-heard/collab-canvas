import Link from "next/link";

import { cn } from "@/lib/utils";

type ToolbarProps = {
  className?: string;
};

export function Toolbar({ className }: ToolbarProps) {
  return (
    <header
      className={cn(
        "flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-background/75 px-4 py-3 shadow-sm backdrop-blur-sm",
        className,
      )}
      role="banner"
    >
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-muted-foreground">Collab Canvas</p>
        <h1 className="text-lg font-semibold tracking-tight text-foreground">
          Multiplayer design experiments
        </h1>
      </div>
      <nav aria-label="Primary" className="flex items-center gap-2">
        <Link
          href="#"
          className="rounded-md border border-border/80 px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
        >
          Sign in
        </Link>
      </nav>
    </header>
  );
}

export default Toolbar;

