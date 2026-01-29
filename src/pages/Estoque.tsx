import { Package } from "lucide-react";

export default function Estoque() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Package className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Gestão de Estoque</h1>
            <p className="text-sm text-muted-foreground">Controle de produtos e inventário</p>
          </div>
        </div>
        <div className="h-10 w-32 bg-primary/20 rounded animate-pulse" />
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="p-4 border-b border-border">
          <div className="flex gap-4">
            <div className="h-10 flex-1 bg-muted rounded animate-pulse" />
            <div className="h-10 w-32 bg-muted rounded animate-pulse" />
          </div>
        </div>
        <div className="p-4">
          <div className="space-y-3">
            <div className="h-12 bg-muted/30 rounded animate-pulse" />
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-14 bg-muted/50 rounded animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
