import { useMemo, useState } from "react";
import {
  LayoutDashboard,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Package,
  AlertTriangle,
  Lock,
  Target,
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
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format, subDays, startOfMonth, endOfMonth, eachDayOfInterval, isWithinInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Progress } from "@/components/ui/progress";

const chartConfig = {
  faturamento: {
    label: "Faturamento",
    color: "hsl(var(--chart-1))",
  },
  cmv: {
    label: "CMV",
    color: "hsl(var(--chart-4))",
  },
  despesas: {
    label: "Despesas",
    color: "hsl(var(--chart-2))",
  },
  lucro: {
    label: "Lucro Líquido",
    color: "hsl(var(--chart-3))",
  },
} satisfies ChartConfig;

type Period = "7d" | "30d" | "month";

const formatCurrency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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
      sales.filter(
        (s) =>
          s.status === "active" &&
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

  // KPI calculations
  const totalRevenue = filteredSales.reduce((sum, s) => sum + s.total, 0);
  const grossProfit = filteredSales.reduce((sum, s) => sum + s.profit, 0);
  const cmv = totalRevenue - grossProfit; // Cost of goods sold (WAC-based)
  const totalExpenses = filteredExpenses.reduce((sum, e) => sum + e.value, 0);
  const fixedExpenses = filteredExpenses
    .filter((e) => e.isFixed)
    .reduce((sum, e) => sum + e.value, 0);
  const variableExpenses = totalExpenses - fixedExpenses;
  const netProfit = grossProfit - totalExpenses;

  // Break-even calculation
  const grossMarginPct = totalRevenue > 0 ? grossProfit / totalRevenue : 0;
  const breakEvenTarget = grossMarginPct > 0 ? fixedExpenses / grossMarginPct : 0;
  const breakEvenRemaining = Math.max(0, breakEvenTarget - totalRevenue);
  const breakEvenProgress =
    breakEvenTarget > 0 ? Math.min(100, (totalRevenue / breakEvenTarget) * 100) : 100;

  const inventoryValue = products.reduce((sum, p) => sum + p.costPrice * p.stock, 0);
  const lowStockProducts = products.filter((p) => p.stock < 5);

  // DRE Chart Data
  const chartData = useMemo(() => {
    const days = eachDayOfInterval({ start: dateRange.start, end: dateRange.end });

    return days.map((day) => {
      const dayStr = format(day, "yyyy-MM-dd");

      const daySales = sales.filter(
        (s) => s.status === "active" && format(new Date(s.date), "yyyy-MM-dd") === dayStr
      );
      const dayFaturamento = daySales.reduce((sum, s) => sum + s.total, 0);
      const dayGrossProfit = daySales.reduce((sum, s) => sum + s.profit, 0);
      const dayCMV = dayFaturamento - dayGrossProfit;

      const dayDespesas = expenses
        .filter((e) => format(new Date(e.date), "yyyy-MM-dd") === dayStr)
        .reduce((sum, e) => sum + e.value, 0);

      const dayLucro = dayGrossProfit - dayDespesas;

      return {
        date: format(day, "dd/MM", { locale: ptBR }),
        faturamento: dayFaturamento,
        cmv: dayCMV,
        despesas: dayDespesas,
        lucro: Math.max(0, dayLucro),
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
            <p className="text-2xl font-bold text-foreground">{formatCurrency(totalRevenue)}</p>
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
            <p className="text-2xl font-bold text-emerald-600">{formatCurrency(grossProfit)}</p>
            <p className="text-xs text-muted-foreground">
              Margem: {totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(1) : 0}%
              {" · "}CMV: {formatCurrency(cmv)}
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
            <p className="text-2xl font-bold text-destructive">{formatCurrency(totalExpenses)}</p>
            <p className="text-xs text-muted-foreground">
              Fixas: {formatCurrency(fixedExpenses)} · Variáveis: {formatCurrency(variableExpenses)}
            </p>
          </CardContent>
        </Card>

        {isAdmin ? (
          <Card className={netProfit >= 0 ? "border-emerald-500/50" : "border-destructive/50"}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Lucro Líquido
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
              <p className="text-xs text-muted-foreground">Lucro Bruto − Despesas</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-muted">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Lucro Líquido
              </CardTitle>
              <Lock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-muted-foreground">••••••</p>
              <p className="text-xs text-muted-foreground">Restrito a administradores</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Break-even + Secondary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Break-even Card */}
        <Card className="border-primary/30">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Meta de Break-even
            </CardTitle>
            <Target className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent className="space-y-3">
            {fixedExpenses === 0 ? (
              <div>
                <p className="text-sm text-muted-foreground">
                  Cadastre despesas fixas para calcular o ponto de equilíbrio.
                </p>
              </div>
            ) : (
              <>
                <div>
                  <p className="text-2xl font-bold text-foreground">
                    {breakEvenRemaining > 0
                      ? `Faltam ${formatCurrency(breakEvenRemaining)}`
                      : "Meta atingida! ✓"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Meta: {formatCurrency(breakEvenTarget)} em vendas
                  </p>
                </div>
                <Progress value={breakEvenProgress} className="h-2" />
                <p className="text-xs text-muted-foreground text-right">
                  {breakEvenProgress.toFixed(0)}% atingido
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Valor em Estoque
            </CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">{formatCurrency(inventoryValue)}</p>
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
                ? `${lowStockProducts.map((p) => p.name).slice(0, 3).join(", ")}${lowStockProducts.length > 3 ? "..." : ""}`
                : "Todos com estoque adequado"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* DRE Summary */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-medium">DRE — Demonstrativo de Resultado</CardTitle>
            <p className="text-sm text-muted-foreground">Resultado real do período selecionado</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <DRERow label="Faturamento Bruto" value={totalRevenue} />
              <DRERow label="(−) CMV (Custo Médio Ponderado)" value={-cmv} negative />
              <DRERow label="= Lucro Bruto" value={grossProfit} bold highlight />
              <DRERow label="(−) Despesas Fixas" value={-fixedExpenses} negative />
              <DRERow label="(−) Despesas Variáveis" value={-variableExpenses} negative />
              <div className="border-t border-border pt-2 mt-2">
                <DRERow
                  label="= Lucro Líquido"
                  value={netProfit}
                  bold
                  highlight
                  colored
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-medium">Fluxo de Caixa — DRE Diário</CardTitle>
          <p className="text-sm text-muted-foreground">
            Faturamento, CMV, despesas e lucro líquido por dia
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
                    formatter={(value, name) => {
                      const labels: Record<string, string> = {
                        faturamento: "Faturamento",
                        cmv: "CMV",
                        despesas: "Despesas",
                        lucro: "Lucro Líquido",
                      };
                      return (
                        <span>
                          {labels[name as string] || name}: {formatCurrency(Number(value))}
                        </span>
                      );
                    }}
                  />
                }
              />
              <Bar dataKey="faturamento" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="cmv" fill="hsl(var(--chart-4))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="despesas" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="lucro" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>

          <div className="flex flex-wrap justify-center gap-4 mt-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-[hsl(var(--chart-1))]" />
              <span className="text-sm text-muted-foreground">Faturamento</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-[hsl(var(--chart-4))]" />
              <span className="text-sm text-muted-foreground">CMV</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-[hsl(var(--chart-2))]" />
              <span className="text-sm text-muted-foreground">Despesas</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-[hsl(var(--chart-3))]" />
              <span className="text-sm text-muted-foreground">Lucro Líquido</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// DRE Row helper
function DRERow({
  label,
  value,
  bold,
  negative,
  highlight,
  colored,
}: {
  label: string;
  value: number;
  bold?: boolean;
  negative?: boolean;
  highlight?: boolean;
  colored?: boolean;
}) {
  const textColor = colored
    ? value >= 0
      ? "text-emerald-600"
      : "text-destructive"
    : negative
    ? "text-destructive"
    : "text-foreground";

  return (
    <div
      className={`flex items-center justify-between py-1 px-2 rounded ${
        highlight ? "bg-muted/50" : ""
      }`}
    >
      <span
        className={`text-sm ${bold ? "font-semibold text-foreground" : "text-muted-foreground"}`}
      >
        {label}
      </span>
      <span className={`text-sm font-mono ${bold ? "font-bold" : "font-medium"} ${textColor}`}>
        {formatCurrency(Math.abs(value))}
      </span>
    </div>
  );
}
