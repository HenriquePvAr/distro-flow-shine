import { ShoppingCart } from "lucide-react";

export default function PDV() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <ShoppingCart className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Terminal de Vendas</h1>
          <p className="text-sm text-muted-foreground">PDV - Ponto de Venda</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="h-10 bg-muted rounded animate-pulse" />
          </div>
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm min-h-[400px]">
            <div className="h-5 w-32 bg-muted rounded animate-pulse mb-4" />
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-muted/50 rounded animate-pulse" />
              ))}
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="h-5 w-24 bg-muted rounded animate-pulse mb-4" />
          <div className="space-y-4">
            <div className="h-10 bg-muted/50 rounded animate-pulse" />
            <div className="h-10 bg-muted/50 rounded animate-pulse" />
            <div className="h-12 bg-primary/20 rounded animate-pulse mt-6" />
          </div>
        </div>
      </div>
    </div>
  );
}
