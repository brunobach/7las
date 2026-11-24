import { cn } from "cn"

export function Logo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span className="relative flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-brand" aria-hidden="true">
        <span className="size-4 rounded-full border-[2.5px] border-primary-foreground" />
        <span className="absolute size-1 rounded-full bg-primary-foreground" />
      </span>
      {!compact && <span className="font-heading text-lg font-medium tracking-[-0.04em]">7las</span>}
    </div>
  )
}
