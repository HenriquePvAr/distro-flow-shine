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
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";
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
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
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
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground leading-tight">
          {title}
        </CardTitle>
        <div className="shrink-0">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${valueClassName ?? "text-foreground"}`}>
          {value}
        </div>
        <p className="text-xs text-muted-foreground mt-1">{sub}</p>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500 p-4 pb-24 md:p-8">
      {/* HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <LayoutDashboard className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">
              Dashboard
            </h1>
            <p className="text-sm text-muted-foreground">
              Visão geral do seu negócio
            </p>
          </div>
        </div>

        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-full sm:w-[180px]">
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
          </AlertDescription>
        </Alert>
      )}

      {loadError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Erro</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {/* KPI GRID - Responsivo (2 colunas no mobile, 4 no desktop) */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Receita"
          icon={<DollarSign className="h-4 w-4 text-emerald-500" />}
          value={formatCurrency(totalRevenue)}
          sub="Total recebido"
          valueClassName="text-emerald-600"
        />

        <KpiCard
          title="Despesas"
          icon={<TrendingDown className="h-4 w-4 text-rose-500" />}
          value={formatCurrency(totalExpenses)}
          sub="Total pago"
          valueClassName="text-rose-600"
        />

        {isAdmin ? (
          <KpiCard
            title="Lucro Líquido"
            icon={
              netProfit >= 0 ? (
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-rose-500" />
              )
            }
            value={formatCurrency(netProfit)}
            sub="Receita - Despesas"
            cardClassName={netProfit >= 0 ? "border-emerald-200 bg-emerald-50/30" : "border-rose-200 bg-rose-50/30"}
            valueClassName={netProfit >= 0 ? "text-emerald-700" : "text-rose-700"}
          />
        ) : (
          <KpiCard
            title="Lucro"
            icon={<Lock className="h-4 w-4 text-muted-foreground" />}
            value="••••••"
            sub="Acesso restrito"
            valueClassName="text-muted-foreground"
          />
        )}

        <KpiCard
          title="Em Estoque"
          icon={<Package className="h-4 w-4 text-blue-500" />}
          value={formatCurrency(inventoryValue)}
          sub="Valor de custo"
          valueClassName="text-blue-600"
        />
      </div>

      {/* GRÁFICOS E ALERTAS */}
      <div className="grid gap-4 md:grid-cols-7">
        
        {/* GRÁFICO - Ocupa 4 colunas no desktop */}
        <Card className="md:col-span-4 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Fluxo de Caixa</CardTitle>
          </CardHeader>
          <CardContent className="pl-0">
            {/* Scroll horizontal no mobile para o gráfico não ficar espremido */}
            <div className="overflow-x-auto pb-2">
              <div className="min-w-[600px] sm:min-w-full h-[300px] sm:h-[350px]">
                <ChartContainer config={chartConfig} className="h-full w-full">
                  <BarChart data={chartData} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="date" 
                      tickLine={false} 
                      axisLine={false} 
                      tickMargin={10} 
                      fontSize={12}
                    />
                    <YAxis 
                      tickLine={false} 
                      axisLine={false} 
                      fontSize={12}
                      tickFormatter={(value) => 
                        new Intl.NumberFormat("pt-BR", { notation: "compact", compactDisplay: "short" }).format(value)
                      } 
                    />
                    <ChartTooltip 
                      cursor={{ fill: "hsl(var(--muted)/0.4)" }} 
                      content={<ChartTooltipContent indicator="dashed" />} 
                    />
                    <Bar dataKey="entradas" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} maxBarSize={40} />
                    <Bar dataKey="saidas" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ChartContainer>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ALERTAS DE ESTOQUE - Ocupa 3 colunas no desktop */}
        <Card className={`md:col-span-3 shadow-sm flex flex-col ${lowStockProducts.length > 0 ? "border-amber-200" : ""}`}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-medium">Alertas de Estoque</CardTitle>
            <AlertTriangle className={`h-5 w-5 ${lowStockProducts.length > 0 ? "text-amber-500" : "text-muted-foreground/30"}`} />
          </CardHeader>
          <CardContent className="flex-1 overflow-auto max-h-[350px]">
            {lowStockProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-8">
                <Package className="h-10 w-10 mb-2 opacity-20" />
                <p className="text-sm">Estoque saudável!</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-amber-50 text-amber-800 text-xs px-3 py-2 rounded-md border border-amber-100 mb-2">
                  <strong>{lowStockProducts.length} produtos</strong> estão abaixo do estoque mínimo.
                </div>
                {lowStockProducts.map((product) => (
                  <div key={product.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{product.name}</p>
                      <p className="text-xs text-muted-foreground">Mínimo: {product.min_stock ?? 5}</p>
                    </div>
                    <Badge variant="outline" className="text-amber-600 bg-white border-amber-200 whitespace-nowrap">
                      Restam: {product.stock}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}