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
  Calendar,
  Filter
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

// --- CONFIGURAÇÃO DO GRÁFICO ---
const chartConfig = {
  entradas: { label: "Receitas", color: "#10b981" }, // Emerald 500
  saidas: { label: "Despesas", color: "#ef4444" },   // Red 500
  saldo: { label: "Saldo", color: "#3b82f6" },       // Blue 500
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

  // --- MONITORA CONEXÃO ---
  useEffect(() => {
    const handleStatusChange = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", handleStatusChange);
    window.addEventListener("offline", handleStatusChange);
    return () => {
      window.removeEventListener("online", handleStatusChange);
      window.removeEventListener("offline", handleStatusChange);
    };
  }, []);

  // --- INTERVALO DE DATAS ---
  const dateRange = useMemo(() => {
    const now = new Date();
    switch (period) {
      case "7d": return { start: subDays(now, 6), end: now };
      case "30d": return { start: subDays(now, 29), end: now };
      case "month": return { start: startOfMonth(now), end: endOfMonth(now) };
    }
  }, [period]);

  // --- CARREGAR DADOS ---
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
        console.error("Erro dashboard:", error);
        if (!cancelled) setLoadError(error?.message || "Erro ao carregar.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [isOnline, dateRange.start, dateRange.end]);

  // --- CÁLCULOS ---
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

  const totalRevenue = useMemo(() => 
    paidTransactions.filter((t) => t.type === "receivable")
      .reduce((sum, t) => sum + Number(t.total_amount || 0), 0)
  , [paidTransactions]);

  const totalExpenses = useMemo(() => 
    paidTransactions.filter((t) => t.type === "payable")
      .reduce((sum, t) => sum + Number(t.total_amount || 0), 0)
  , [paidTransactions]);

  const netProfit = totalRevenue - totalExpenses;

  const inventoryValue = useMemo(() => 
    products.reduce((sum, p) => sum + Number(p.cost_price || 0) * Number(p.stock || 0), 0)
  , [products]);

  const lowStockProducts = useMemo(() => 
    products.filter((p) => Number(p.stock || 0) <= Number(p.min_stock ?? 5))
  , [products]);

  const chartData = useMemo(() => {
    const days = eachDayOfInterval({ start: dateRange.start, end: dateRange.end });
    return days.map((day) => {
      const dayKey = format(day, "yyyy-MM-dd");
      const dayTrans = paidTransactions.filter((t) => 
        t.due_date && format(parseISO(t.due_date), "yyyy-MM-dd") === dayKey
      );
      const rev = dayTrans.filter(t => t.type === "receivable").reduce((s, t) => s + Number(t.total_amount), 0);
      const exp = dayTrans.filter(t => t.type === "payable").reduce((s, t) => s + Number(t.total_amount), 0);
      return {
        date: format(day, "dd/MM", { locale: ptBR }),
        entradas: rev,
        saidas: exp,
        saldo: rev - exp,
      };
    });
  }, [paidTransactions, dateRange]);

  // --- RENDERIZAÇÃO ---
  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center flex-col gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground animate-pulse">Atualizando dados...</p>
      </div>
    );
  }

  // Componente de Card KPI (Mobile First: 100% width)
  const KpiCard = ({
    title,
    icon,
    value,
    sub,
    valueClassName,
    bgClass,
  }: {
    title: string;
    icon: React.ReactNode;
    value: string;
    sub: string;
    valueClassName?: string;
    bgClass?: string;
  }) => (
    <Card className={`border-none shadow-sm ${bgClass || "bg-white"}`}>
      <CardContent className="p-4 flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
          <div className={`text-2xl font-bold ${valueClassName || "text-gray-900"}`}>
            {value}
          </div>
          <p className="text-[10px] text-muted-foreground/80">{sub}</p>
        </div>
        <div className="h-10 w-10 rounded-full bg-white/50 flex items-center justify-center shadow-sm">
          {icon}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-full bg-slate-50/50 pb-20">
      
      {/* HEADER FIXO MOBILE */}
      <div className="sticky top-0 bg-white/80 backdrop-blur-md border-b z-10 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="h-5 w-5 text-primary" />
          <span className="font-bold text-lg">Visão Geral</span>
        </div>
        <div className="flex items-center gap-2">
           {!isOnline && <WifiOff className="h-4 w-4 text-destructive animate-pulse" />}
           
           <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
             <SelectTrigger className="h-8 w-[130px] text-xs bg-slate-100 border-none">
               <Calendar className="h-3 w-3 mr-2 text-muted-foreground"/>
               <SelectValue />
             </SelectTrigger>
             <SelectContent>
               <SelectItem value="7d">7 dias</SelectItem>
               <SelectItem value="30d">30 dias</SelectItem>
               <SelectItem value="month">Este mês</SelectItem>
             </SelectContent>
           </Select>
        </div>
      </div>

      <div className="p-4 space-y-4">
        
        {/* ALERTA DE ERRO */}
        {loadError && (
          <Alert variant="destructive" className="bg-red-50 border-red-100">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Atenção</AlertTitle>
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        )}

        {/* CARDS DE KPI (Vertical Stack no Mobile) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          
          <KpiCard
            title="Receitas"
            value={formatCurrency(totalRevenue)}
            sub="Vendas e recebimentos"
            icon={<TrendingUp className="h-5 w-5 text-emerald-600" />}
            valueClassName="text-emerald-700"
            bgClass="bg-emerald-50/50 border border-emerald-100"
          />

          <KpiCard
            title="Despesas"
            value={formatCurrency(totalExpenses)}
            sub="Contas pagas"
            icon={<TrendingDown className="h-5 w-5 text-rose-600" />}
            valueClassName="text-rose-700"
            bgClass="bg-rose-50/50 border border-rose-100"
          />

          {isAdmin ? (
            <KpiCard
              title="Lucro Líquido"
              value={formatCurrency(netProfit)}
              sub="Resultado do período"
              icon={<DollarSign className="h-5 w-5 text-blue-600" />}
              valueClassName={netProfit >= 0 ? "text-blue-700" : "text-rose-700"}
              bgClass="bg-blue-50/50 border border-blue-100"
            />
          ) : (
            <KpiCard
              title="Lucro"
              value="R$ •••"
              sub="Acesso restrito"
              icon={<Lock className="h-5 w-5 text-gray-400" />}
              bgClass="bg-gray-50 border border-gray-100"
            />
          )}

          <KpiCard
            title="Estoque (Custo)"
            value={formatCurrency(inventoryValue)}
            sub="Valor investido"
            icon={<Package className="h-5 w-5 text-purple-600" />}
            valueClassName="text-purple-700"
            bgClass="bg-purple-50/50 border border-purple-100"
          />
        </div>

        {/* GRÁFICO (Com scroll interno para não quebrar a página) */}
        <Card className="shadow-sm border-slate-100">
          <CardHeader className="pb-2 border-b border-slate-50">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Fluxo Financeiro
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="w-full overflow-x-auto pb-2 scrollbar-hide">
              {/* Define largura mínima para garantir legibilidade das barras */}
              <div className="h-[250px] min-w-[500px]"> 
                <ChartContainer config={chartConfig} className="h-full w-full">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <XAxis 
                      dataKey="date" 
                      tickLine={false} 
                      axisLine={false} 
                      tickMargin={10} 
                      fontSize={11}
                      tick={{ fill: '#6b7280' }}
                    />
                    <YAxis 
                      tickLine={false} 
                      axisLine={false} 
                      fontSize={11}
                      tick={{ fill: '#6b7280' }}
                      tickFormatter={(value) => 
                        new Intl.NumberFormat("pt-BR", { notation: "compact", compactDisplay: "short" }).format(value)
                      } 
                    />
                    <ChartTooltip 
                      cursor={{ fill: "rgba(0,0,0,0.05)" }} 
                      content={<ChartTooltipContent indicator="dot" className="bg-white border shadow-lg" />} 
                    />
                    <Bar dataKey="entradas" fill={chartConfig.entradas.color} radius={[4, 4, 0, 0]} maxBarSize={30} />
                    <Bar dataKey="saidas" fill={chartConfig.saidas.color} radius={[4, 4, 0, 0]} maxBarSize={30} />
                  </BarChart>
                </ChartContainer>
              </div>
            </div>
            <p className="text-[10px] text-center text-muted-foreground mt-2 flex items-center justify-center gap-1">
               <span className="inline-block w-1 h-1 rounded-full bg-slate-400"></span>
               Deslize o gráfico para ver mais dias
            </p>
          </CardContent>
        </Card>

        {/* LISTA DE ESTOQUE BAIXO */}
        <Card className={`shadow-sm border-slate-100 ${lowStockProducts.length > 0 ? "border-amber-200 ring-1 ring-amber-100" : ""}`}>
           <CardHeader className="pb-2 border-b border-slate-50">
             <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <AlertTriangle className={`h-4 w-4 ${lowStockProducts.length > 0 ? "text-amber-500" : "text-muted-foreground"}`} />
                  Alertas de Estoque
                </CardTitle>
                {lowStockProducts.length > 0 && (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                    {lowStockProducts.length} itens
                  </Badge>
                )}
             </div>
           </CardHeader>
           <CardContent className="p-0">
             {lowStockProducts.length === 0 ? (
               <div className="py-8 text-center text-muted-foreground text-sm flex flex-col items-center">
                 <Package className="h-8 w-8 mb-2 opacity-20" />
                 Tudo certo com o estoque!
               </div>
             ) : (
               <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
                 {lowStockProducts.map(p => (
                   <div key={p.id} className="p-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                      <div className="min-w-0 pr-3">
                        <p className="font-medium text-sm text-gray-900 truncate">{p.name}</p>
                        <p className="text-[11px] text-muted-foreground">Mínimo: {p.min_stock ?? 5}</p>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-sm font-bold text-amber-600">{p.stock}</span>
                        <span className="text-[10px] text-amber-600/80">unid.</span>
                      </div>
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