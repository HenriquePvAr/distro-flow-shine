import { History } from "lucide-react";

export default function Historico() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <History className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Histórico de Vendas</h1>
          <p className="text-sm text-muted-foreground">Relatórios e movimentações</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="h-4 w-20 bg-muted rounded animate-pulse" />
            <div className="mt-2 h-7 w-28 bg-muted rounded animate-pulse" />
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="p-4 border-b border-border">
          <div className="flex flex-wrap gap-4">
            <div className="h-10 w-40 bg-muted rounded animate-pulse" />
            <div className="h-10 w-40 bg-muted rounded animate-pulse" />
            <div className="h-10 w-32 bg-muted rounded animate-pulse" />
          </div>
        </div>
        <div className="p-4">
          <div className="space-y-3">
            <div className="h-10 bg-muted/30 rounded animate-pulse" />
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-12 bg-muted/50 rounded animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
