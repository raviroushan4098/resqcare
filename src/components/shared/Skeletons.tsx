import { cn } from "@/lib/utils";

const Bar = ({ className }: { className?: string }) => <div className={cn("animate-pulse rounded bg-[#e3eaf2]", className)} />;

/** Skeletons match the final layout's size to avoid layout shift. */
export function ResultCardSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-3 rounded-card border border-border bg-surface p-4">
      <Bar className="h-6 w-2/3" />
      <Bar className="h-4 w-1/3" />
      <div className="flex gap-2">
        <Bar className="h-7 w-24 rounded-full" />
        <Bar className="h-7 w-24 rounded-full" />
      </div>
      <Bar className="h-4 w-full" />
      <div className="flex gap-2">
        <Bar className="h-14 flex-1" />
        <Bar className="h-14 w-28" />
      </div>
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-4">
      <Bar className="h-8 w-3/4" />
      <Bar className="h-5 w-1/2" />
      <Bar className="h-14 w-full" />
      <div className="grid gap-3 sm:grid-cols-3">
        <Bar className="h-28" />
        <Bar className="h-28" />
        <Bar className="h-28" />
      </div>
      <Bar className="h-40 w-full" />
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="space-y-2 rounded-card border border-border bg-surface p-4">
      <Bar className="h-6 w-full" />
      {Array.from({ length: rows }, (_, i) => (
        <Bar key={i} className="h-11 w-full" />
      ))}
    </div>
  );
}

export function ChartSkeleton() {
  return <Bar className="h-64 w-full rounded-card" />;
}

export function LoadingRegion({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
