"use client";

import { useMemo, useState, useEffect } from "react";
import {
  LayoutDashboard,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Package,
  AlertTriangle,
  Lock,
  Loader2,
  WifiOff,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  format,
  subDays,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isWithinInterval,
  parseISO,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";

const chartConfig = {
  entradas: { label: "Receitas", color: "hsl(var(--chart-1))" },
  saidas: { label: "Despesas", color: "hsl(var(--chart-2))" },
  saldo: { label: "Saldo", color: "hsl(var(--chart-3))" },
} satisfies ChartConfig;

type Period = "7d" | "30d" | "month";

const formatCurrency = (v: number) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface FinancialEntry {
  id: string;
  type: "receivable" | "payable";
  total_amount: number;
  due_date: string;
  status: string;
}

interface Product {
  id: string;
  name: string;
  stock: number;
  min_stock: number | null;
  cost_price: number | null;
}

export default function Dashboard() {
  const { isAdmin } = useAuth();
  const [period, setPeriod] = useState<Period>("7d");
  const [isOnline, setIsOnline] = useState(
    typeof window !== "undefined" ? navigator.onLine : true
  );

  const [transactions, setTransactions] = useState<FinancialEntry[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Monitora status online/offline
  useEffect(() => {
    const handleStatusChange = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", handleStatusChange);
    window.addEventListener("offline", handleStatusChange);
    return () => {
      window.removeEventListener("online", handleStatusChange);
      window.removeEventListener("offline", handleStatusChange);
    };
  }, []);

  // Intervalo de datas (local)
  const dateRange = useMemo(() => {
    const now = new Date();
    switch (period) {
      case "7d":
        return { start: subDays(now, 6), end: now };
      case "30d":
        return { start: subDays(now, 29), end: now };
      case "month":
        return { start: startOfMonth(now), end: endOfMonth(now) };
    }
  }, [period]);

  // Busca dados do Supabase (somente o que precisa do período)
  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoadError(null);

      if (!navigator.onLine) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        // 1) Financeiro: filtra pelo período já na query (melhor performance)
        const { data: finData, error: finError } = await supabase
          .from("financial_entries")
          .select("id,type,total_amount,due_date,status")
          .gte("due_date", dateRange.start.toISOString())
          .lte("due_date", dateRange.end.toISOString());

        if (finError) throw finError;

        // 2) Produtos
        const { data: prodData, error: prodError } = await supabase
          .from("products")
          .select("id,name,stock,min_stock,cost_price")
          .order("name");

        if (prodError) throw prodError;

        if (!cancelled) {
          setTransactions((finData as FinancialEntry[]) || []);
          setProducts((prodData as Product[]) || []);
        }
      } catch (error: any) {
        console.error("Erro ao carregar dashboard:", error);
        if (!cancelled) {
          setLoadError(error?.message || "Erro ao carregar dados.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [isOnline, dateRange.start, dateRange.end]);

  // Filtra (extra safety)
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (!t.due_date) return false;
      const d = parseISO(t.due_date);
      return isWithinInterval(d, { start: dateRange.start, end: dateRange.end });
    });
  }, [transactions, dateRange]);

  // KPIs (somente pagos)
  const paidTransactions = useMemo(
    () => filteredTransactions.filter((t) => t.status === "paid"),
    [filteredTransactions]
  );

  const totalRevenue = useMemo(() => {
    return paidTransactions
      .filter((t) => t.type === "receivable")
      .reduce((sum, t) => sum + Number(t.total_amount || 0), 0);
  }, [paidTransactions]);

  const totalExpenses = useMemo(() => {
    return paidTransactions
      .filter((t) => t.type === "payable")
      .reduce((sum, t) => sum + Number(t.total_amount || 0), 0);
  }, [paidTransactions]);

  const netProfit = totalRevenue - totalExpenses;

  const inventoryValue = useMemo(() => {
    return products.reduce(
      (sum, p) =>
        sum + Number(p.cost_price || 0) * Number(p.stock || 0),
      0
    );
  }, [products]);

  const lowStockProducts = useMemo(() => {
    return products.filter((p) => Number(p.stock || 0) <= Number(p.min_stock ?? 5));
  }, [products]);

  // Gráfico diário (usa paidTransactions)
  const chartData = useMemo(() => {
    const days = eachDayOfInterval({ start: dateRange.start, end: dateRange.end });

    return days.map((day) => {
      const dayKey = format(day, "yyyy-MM-dd");

      const dayTrans = paidTransactions.filter((t) => {
        if (!t.due_date) return false;
        return format(parseISO(t.due_date), "yyyy-MM-dd") === dayKey;
      });

      const dayRevenue = dayTrans
        .filter((t) => t.type === "receivable")
        .reduce((sum, t) => sum + Number(t.total_amount || 0), 0);

      const dayExpenses = dayTrans
        .filter((t) => t.type === "payable")
        .reduce((sum, t) => sum + Number(t.total_amount || 0), 0);

      return {
        date: format(day, "dd/MM", { locale: ptBR }),
        entradas: dayRevenue,
        saidas: dayExpenses,
        saldo: dayRevenue - dayExpenses,
      };
    });
  }, [paidTransactions, dateRange]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <LayoutDashboard className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Visão geral financeira e estoque
            </p>
          </div>
        </div>

        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Últimos 7 dias</SelectItem>
            <SelectItem value="30d">Últimos 30 dias</SelectItem>
            <SelectItem value="month">Este mês</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!isOnline && (
        <Alert variant="destructive" className="bg-red-50 text-red-900 border-red-200">
          <WifiOff className="h-4 w-4" />
          <AlertTitle>Modo Offline</AlertTitle>
          <AlertDescription>
            Você está sem internet. Os dados exibidos podem estar desatualizados.
            Vá para o <strong>PDV</strong> para realizar vendas offline.
          </AlertDescription>
        </Alert>
      )}

      {loadError && (
        <Alert variant="destructive" className="bg-red-50 text-red-900 border-red-200">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Erro ao carregar</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Faturamento (Receitas)
            </CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">
              {formatCurrency(totalRevenue)}
            </p>
            <p className="text-xs text-muted-foreground">Total recebido no período</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Despesas Pagas
            </CardTitle>
            <TrendingDown className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">
              {formatCurrency(totalExpenses)}
            </p>
            <p className="text-xs text-muted-foreground">Total pago no período</p>
          </CardContent>
        </Card>

        {isAdmin ? (
          <Card className={netProfit >= 0 ? "border-emerald-500/30" : "border-destructive/30"}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Saldo (Lucro Caixa)
              </CardTitle>
              {netProfit >= 0 ? (
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-destructive" />
              )}
            </CardHeader>
            <CardContent>
              <p
                className={`text-2xl font-bold ${
                  netProfit >= 0 ? "text-emerald-600" : "text-destructive"
                }`}
              >
                {formatCurrency(netProfit)}
              </p>
              <p className="text-xs text-muted-foreground">Receitas − Despesas</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-muted">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Saldo</CardTitle>
              <Lock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-muted-foreground">••••••</p>
              <p className="text-xs text-muted-foreground">Restrito a administradores</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Patrimônio em Estoque
            </CardTitle>
            <Package className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">
              {formatCurrency(inventoryValue)}
            </p>
            <p className="text-xs text-muted-foreground">Valor de custo total</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg font-medium">Fluxo de Caixa Diário</CardTitle>
            <p className="text-sm text-muted-foreground">
              Comparativo de entradas e saídas por dia
            </p>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tickLine={false} axisLine={false} className="text-xs" />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) =>
                    Number(value || 0).toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                      notation: "compact",
                    })
                  }
                  className="text-xs"
                />
                <ChartTooltip
                  cursor={{ fill: "hsl(var(--muted)/0.3)" }}
                  content={
                    <ChartTooltipContent
                      formatter={(value, name) => {
                        const labels: Record<string, string> = {
                          entradas: "Receitas",
                          saidas: "Despesas",
                          saldo: "Saldo",
                        };
                        return (
                          <span className="font-mono">
                            {labels[name as string] || String(name)}:{" "}
                            {formatCurrency(Number(value))}
                          </span>
                        );
                      }}
                    />
                  }
                />
                <Bar dataKey="entradas" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="saidas" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="saldo" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className={lowStockProducts.length > 0 ? "border-amber-500/50 h-full" : "h-full"}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-foreground">
              Alertas de Estoque
            </CardTitle>
            <AlertTriangle
              className={`h-4 w-4 ${
                lowStockProducts.length > 0 ? "text-amber-500" : "text-muted-foreground"
              }`}
            />
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2 mb-4">
              <span className="text-3xl font-bold">{lowStockProducts.length}</span>
              <span className="text-sm text-muted-foreground">produtos abaixo do mínimo</span>
            </div>

            <div className="space-y-3">
              {lowStockProducts.slice(0, 5).map((product) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between text-sm border-b pb-2 last:border-0"
                >
                  <span className="font-medium truncate max-w-[150px]">{product.name}</span>
                  <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">
                    Restam: {product.stock}
                  </Badge>
                </div>
              ))}

              {lowStockProducts.length === 0 && (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground text-sm text-center">
                  <Package className="h-8 w-8 mb-2 opacity-20" />
                  <p>Estoque saudável!</p>
                </div>
              )}

              {lowStockProducts.length > 5 && (
                <p className="text-xs text-center text-muted-foreground pt-2">
                  + {lowStockProducts.length - 5} outros produtos
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
