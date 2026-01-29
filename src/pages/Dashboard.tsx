import { LayoutDashboard } from "lucide-react";

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <LayoutDashboard className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Visão geral do sistema</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="h-4 w-24 bg-muted rounded animate-pulse" />
            <div className="mt-3 h-8 w-32 bg-muted rounded animate-pulse" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm min-h-[300px]">
          <div className="h-5 w-40 bg-muted rounded animate-pulse mb-4" />
          <div className="h-[200px] bg-muted/50 rounded animate-pulse" />
        </div>
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm min-h-[300px]">
          <div className="h-5 w-40 bg-muted rounded animate-pulse mb-4" />
          <div className="h-[200px] bg-muted/50 rounded animate-pulse" />
        </div>
      </div>
    </div>
  );
}
