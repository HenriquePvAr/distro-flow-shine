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

  useEffect(() => {
    const handleStatusChange = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", handleStatusChange);
    window.addEventListener("offline", handleStatusChange);
    return () => {
      window.removeEventListener("online", handleStatusChange);
      window.removeEventListener("offline", handleStatusChange);
    };
  }, []);

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
        const { data: finData, error: finError } = await supabase
          .from("financial_entries")
          .select("id,type,total_amount,due_date,status")
          .gte("due_date", dateRange.start.toISOString())
          .lte("due_date", dateRange.end.toISOString());

        if (finError) throw finError;

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
        if (!cancelled) setLoadError(error?.message || "Erro ao carregar dados.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [isOnline, dateRange.start, dateRange.end]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (!t.due_date) return false;
      const d = parseISO(t.due_date);
      return isWithinInterval(d, { start: dateRange.start, end: dateRange.end });
    });
  }, [transactions, dateRange]);

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
      (sum, p) => sum + Number(p.cost_price || 0) * Number(p.stock || 0),
      0
    );
  }, [products]);

  const lowStockProducts = useMemo(() => {
    return products.filter(
      (p) => Number(p.stock || 0) <= Number(p.min_stock ?? 5)
    );
  }, [products]);

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

  const KpiCard = ({
    title,
    icon,
    value,
    sub,
    valueClassName,
    cardClassName,
  }: {
    title: string;
    icon: React.ReactNode;
    value: string;
    sub: string;
    valueClassName?: string;
    cardClassName?: string;
  }) => (
    <Card className={cardClassName}>
      <CardHeader className="flex flex-row items-start justify-between pb-2 space-y-0">
        <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground leading-tight">
          {title}
        </CardTitle>
        <div className="shrink-0">{icon}</div>
      </CardHeader>
      <CardContent>
        <p className={`font-bold ${valueClassName ?? "text-foreground"} text-lg sm:text-2xl`}>
          {value}
        </p>
        <p className="text-[11px] sm:text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-5 animate-in fade-in duration-500 p-4 md:p-6 pb-24">
      {/* HEADER */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <LayoutDashboard className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-semibold text-foreground truncate">
              Dashboard
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Visão geral financeira e estoque
            </p>
          </div>
        </div>

        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-full sm:w-44">
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

      {/* KPI GRID - mobile 2 colunas */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Faturamento (Receitas)"
          icon={<DollarSign className="h-4 w-4 text-emerald-500" />}
          value={formatCurrency(totalRevenue)}
          sub="Total recebido no período"
        />

        <KpiCard
          title="Despesas Pagas"
          icon={<TrendingDown className="h-4 w-4 text-destructive" />}
          value={formatCurrency(totalExpenses)}
          sub="Total pago no período"
          valueClassName="text-destructive text-lg sm:text-2xl"
        />

        {isAdmin ? (
          <KpiCard
            title="Saldo (Lucro Caixa)"
            icon={
              netProfit >= 0 ? (
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-destructive" />
              )
            }
            value={formatCurrency(netProfit)}
            sub="Receitas − Despesas"
            cardClassName={netProfit >= 0 ? "border-emerald-500/30" : "border-destructive/30"}
            valueClassName={netProfit >= 0 ? "text-emerald-600 text-lg sm:text-2xl" : "text-destructive text-lg sm:text-2xl"}
          />
        ) : (
          <KpiCard
            title="Saldo"
            icon={<Lock className="h-4 w-4 text-muted-foreground" />}
            value="••••••"
            sub="Restrito a administradores"
            valueClassName="text-muted-foreground text-lg sm:text-2xl"
            cardClassName="border-muted"
          />
        )}

        <KpiCard
          title="Patrimônio em Estoque"
          icon={<Package className="h-4 w-4 text-blue-500" />}
          value={formatCurrency(inventoryValue)}
          sub="Valor de custo total"
        />
      </div>

      {/* CONTEÚDO PRINCIPAL */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* GRÁFICO */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg font-medium">
              Fluxo de Caixa Diário
            </CardTitle>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Comparativo de entradas e saídas por dia
            </p>
          </CardHeader>

          <CardContent>
            {/* Mobile: scroll horizontal para não esmagar as barras */}
            <div className="w-full overflow-x-auto">
              <div className="min-w-[680px] sm:min-w-0">
                <ChartContainer config={chartConfig} className="h-[260px] sm:h-[320px] w-full">
                  <BarChart
                    data={chartData}
                    margin={{ top: 16, right: 18, left: 8, bottom: 6 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      interval={0}
                      tickMargin={8}
                      className="text-[10px] sm:text-xs"
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={64}
                      tickFormatter={(value) =>
                        Number(value || 0).toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                          notation: "compact",
                        })
                      }
                      className="text-[10px] sm:text-xs"
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
              </div>
            </div>

            <p className="mt-2 text-[11px] text-muted-foreground sm:hidden">
              Dica: arraste para o lado para ver melhor o gráfico.
            </p>
          </CardContent>
        </Card>

        {/* ALERTAS DE ESTOQUE */}
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
              <span className="text-sm text-muted-foreground">abaixo do mínimo</span>
            </div>

            <div className="space-y-3">
              {lowStockProducts.slice(0, 5).map((product) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between text-sm border-b pb-2 last:border-0"
                >
                  <span className="font-medium truncate max-w-[160px]">{product.name}</span>
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
