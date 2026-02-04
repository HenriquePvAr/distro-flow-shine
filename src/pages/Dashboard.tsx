import { useMemo, useState } from "react";
import {
  LayoutDashboard,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Package,
  AlertTriangle,
  Lock,
} from "lucide-react";
import { useStore } from "@/store/useStore";
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
import { format, subDays, startOfMonth, endOfMonth, eachDayOfInterval, isWithinInterval } from "date-fns";
import { ptBR } from "date-fns/locale";

const chartConfig = {
  entradas: {
    label: "Entradas",
    color: "hsl(var(--chart-1))",
  },
  saidas: {
    label: "Saídas",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig;

type Period = "7d" | "30d" | "month";

export default function Dashboard() {
  const { sales, expenses, products } = useStore();
  const { isAdmin } = useAuth();
  const [period, setPeriod] = useState<Period>("7d");

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

  const filteredSales = useMemo(
    () =>
      sales.filter((s) =>
        isWithinInterval(new Date(s.date), { start: dateRange.start, end: dateRange.end })
      ),
    [sales, dateRange]
  );

  const filteredExpenses = useMemo(
    () =>
      expenses.filter((e) =>
        isWithinInterval(new Date(e.date), { start: dateRange.start, end: dateRange.end })
      ),
    [expenses, dateRange]
  );

  const totalRevenue = filteredSales.reduce((sum, s) => sum + s.total, 0);
  const grossProfit = filteredSales.reduce((sum, s) => sum + s.profit, 0);
  const totalExpenses = filteredExpenses.reduce((sum, e) => sum + e.value, 0);
  const realProfit = grossProfit - totalExpenses;

  const inventoryValue = products.reduce((sum, p) => sum + p.costPrice * p.stock, 0);
  const lowStockProducts = products.filter((p) => p.stock < 5);

  const chartData = useMemo(() => {
    const days = eachDayOfInterval({ start: dateRange.start, end: dateRange.end });

    return days.map((day) => {
      const dayStr = format(day, "yyyy-MM-dd");
      const dayEntradas = sales
        .filter((s) => format(new Date(s.date), "yyyy-MM-dd") === dayStr)
        .reduce((sum, s) => sum + s.total, 0);
      const daySaidas = expenses
        .filter((e) => format(new Date(e.date), "yyyy-MM-dd") === dayStr)
        .reduce((sum, e) => sum + e.value, 0);

      return {
        date: format(day, "dd/MM", { locale: ptBR }),
        entradas: dayEntradas,
        saidas: daySaidas,
      };
    });
  }, [sales, expenses, dateRange]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <LayoutDashboard className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
            <p className="text-sm text-muted-foreground">Visão geral do sistema</p>
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

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Faturamento
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">
              {totalRevenue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </p>
            <p className="text-xs text-muted-foreground">
              {filteredSales.length} vendas no período
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Lucro Bruto
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">
              {grossProfit.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </p>
            <p className="text-xs text-muted-foreground">
              Margem: {totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(1) : 0}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Despesas
            </CardTitle>
            <TrendingDown className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">
              {totalExpenses.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </p>
            <p className="text-xs text-muted-foreground">
              {filteredExpenses.length} lançamentos
            </p>
          </CardContent>
        </Card>

        {isAdmin ? (
          <Card className={realProfit >= 0 ? "border-emerald-500/50" : "border-destructive/50"}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Lucro Real
              </CardTitle>
              {realProfit >= 0 ? (
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-destructive" />
              )}
            </CardHeader>
            <CardContent>
              <p
                className={`text-2xl font-bold ${
                  realProfit >= 0 ? "text-emerald-600" : "text-destructive"
                }`}
              >
                {realProfit.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </p>
              <p className="text-xs text-muted-foreground">
                Lucro Bruto - Despesas
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-muted">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Lucro Real
              </CardTitle>
              <Lock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-muted-foreground">••••••</p>
              <p className="text-xs text-muted-foreground">
                Restrito a administradores
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Secondary Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Valor em Estoque
            </CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">
              {inventoryValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </p>
            <p className="text-xs text-muted-foreground">
              {products.reduce((sum, p) => sum + p.stock, 0)} unidades totais
            </p>
          </CardContent>
        </Card>

        <Card className={lowStockProducts.length > 0 ? "border-amber-500/50" : ""}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Alertas de Estoque
            </CardTitle>
            <AlertTriangle
              className={`h-4 w-4 ${
                lowStockProducts.length > 0 ? "text-amber-500" : "text-muted-foreground"
              }`}
            />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">{lowStockProducts.length}</p>
            <p className="text-xs text-muted-foreground">
              {lowStockProducts.length > 0
                ? `Produtos com estoque baixo: ${lowStockProducts.map((p) => p.name).slice(0, 3).join(", ")}${lowStockProducts.length > 3 ? "..." : ""}`
                : "Todos os produtos com estoque adequado"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-medium">Fluxo de Caixa</CardTitle>
          <p className="text-sm text-muted-foreground">
            Comparativo de entradas e saídas por dia
          </p>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[300px] w-full">
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                className="text-xs"
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) =>
                  value.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                    notation: "compact",
                  })
                }
                className="text-xs"
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => (
                      <span>
                        {name === "entradas" ? "Entradas" : "Saídas"}:{" "}
                        {Number(value).toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}
                      </span>
                    )}
                  />
                }
              />
              <Bar
                dataKey="entradas"
                fill="hsl(var(--chart-1))"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="saidas"
                fill="hsl(var(--chart-2))"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ChartContainer>

          <div className="flex justify-center gap-6 mt-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-[hsl(var(--chart-1))]" />
              <span className="text-sm text-muted-foreground">Entradas (Vendas)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-[hsl(var(--chart-2))]" />
              <span className="text-sm text-muted-foreground">Saídas (Despesas)</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
