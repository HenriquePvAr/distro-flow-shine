"use client";

import { useEffect, useMemo, useState, useDeferredValue } from "react";
import {
  Trophy,
  Users,
  TrendingUp,
  Medal,
  Crown,
  Award,
  Loader2,
  CalendarDays,
  Filter,
  Search,
  X,
  RefreshCcw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// --- TIPAGEM ---
interface Sale {
  id: string;
  total_amount: number;
  entity_name: string; // Cliente
  description: string;
  created_at: string;

  // ✅ pré-processado
  seller_name: string;
}

interface SellerStat {
  name: string;
  totalRevenue: number;
  salesCount: number;
  averageTicket: number;
}

interface CustomerStat {
  name: string;
  totalSpent: number;
  purchaseCount: number;
  lastPurchase: string;
  classification?: "A" | "B" | "C";
  percentageOfTotal?: number;
  cumulativePct?: number;
}

// --- UTILS ---
const formatCurrency = (value: number) =>
  (value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatDate = (iso: string) => {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR");
};

const toNumber = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// tenta pegar vendedor de "Vend: João" ou "Vendedor: João", até antes do "|" ou fim
const extractSellerName = (description?: string) => {
  const desc = description || "";
  const match = desc.match(/Vend:\s*([^|]+)/i) || desc.match(/Vendedor:\s*([^|]+)/i);
  const sellerName = match ? match[1].trim() : "";
  return sellerName.length ? sellerName : "Venda Balcão";
};

export default function Performance() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  // filtros
  const [range, setRange] = useState<"7" | "30" | "90" | "all">("30");
  const [sellerFilter, setSellerFilter] = useState<string>("all");
  const [customerSearch, setCustomerSearch] = useState("");

  // ✅ deixa digitação suave no mobile (evita travar com listas grandes)
  const deferredCustomerSearch = useDeferredValue(customerSearch);

  // ✅ paginação leve (evita render enorme)
  const [customerLimit, setCustomerLimit] = useState(20);
  const [sellerLimit, setSellerLimit] = useState(30);

  // ✅ limites seguros de fetch (performance)
  const FETCH_LIMIT = 3000; // ajuste se precisar (quanto maior, mais pesado)

  const resetPaging = () => {
    setCustomerLimit(20);
    setSellerLimit(30);
  };

  const fetchSales = async () => {
    setLoading(true);
    try {
      // ✅ pega só o que você usa (bem mais leve)
      let q = supabase
        .from("financial_entries")
        .select("id,total_amount,entity_name,description,created_at")
        .eq("type", "receivable")
        .ilike("reference", "PDV%")
        .order("created_at", { ascending: false })
        .limit(FETCH_LIMIT);

      if (range !== "all") {
        const days = Number(range);
        const from = new Date();
        from.setDate(from.getDate() - days);
        q = q.gte("created_at", from.toISOString());
      }

      const { data, error } = await q;
      if (error) throw error;

      // ✅ pré-processa seller_name UMA vez (regex só aqui)
      const mapped: Sale[] = (data || []).map((s: any) => {
        const description = String(s.description || "");
        return {
          id: String(s.id),
          total_amount: toNumber(s.total_amount),
          entity_name: String(s.entity_name || ""),
          description,
          created_at: String(s.created_at || ""),
          seller_name: extractSellerName(description),
        };
      });

      setSales(mapped);
      resetPaging();
    } catch (error) {
      console.error("Erro ao carregar vendas:", error);
      toast.error("Erro ao carregar dados de performance");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSales();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  // lista de vendedores (para filtro)
  const sellersList = useMemo(() => {
    const set = new Set<string>();
    for (const s of sales) set.add(s.seller_name);
    return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [sales]);

  // vendas filtradas por vendedor (para tudo abaixo)
  const salesFilteredBySeller = useMemo(() => {
    if (sellerFilter === "all") return sales;
    return sales.filter((s) => s.seller_name === sellerFilter);
  }, [sales, sellerFilter]);

  // --- KPIs gerais ---
  const totalRevenue = useMemo(() => {
    return salesFilteredBySeller.reduce((sum, s) => sum + s.total_amount, 0);
  }, [salesFilteredBySeller]);

  const overallTicket = useMemo(() => {
    const count = salesFilteredBySeller.length || 1;
    return totalRevenue / count;
  }, [totalRevenue, salesFilteredBySeller.length]);

  // --- ANÁLISE DE VENDEDORES ---
  const sellerStats = useMemo(() => {
    const statsMap = new Map<string, SellerStat>();

    for (const sale of salesFilteredBySeller) {
      const name = sale.seller_name;
      const existing = statsMap.get(name);
      if (existing) {
        existing.totalRevenue += sale.total_amount;
        existing.salesCount += 1;
      } else {
        statsMap.set(name, {
          name,
          totalRevenue: sale.total_amount,
          salesCount: 1,
          averageTicket: 0,
        });
      }
    }

    const stats = Array.from(statsMap.values()).map((s) => ({
      ...s,
      averageTicket: s.salesCount > 0 ? s.totalRevenue / s.salesCount : 0,
    }));

    stats.sort((a, b) => b.totalRevenue - a.totalRevenue);
    return stats;
  }, [salesFilteredBySeller]);

  const maxRevenue =
    sellerStats.length > 0 ? Math.max(...sellerStats.map((s) => s.totalRevenue)) : 1;

  // --- CURVA ABC DE CLIENTES ---
  const customerStats = useMemo(() => {
    const customerMap = new Map<string, CustomerStat>();

    for (const sale of salesFilteredBySeller) {
      const customerName = (sale.entity_name || "Cliente Avulso").trim();
      const lower = customerName.toLowerCase();

      // ignora “avulsos/balcão”
      if (lower === "cliente avulso" || lower === "cliente balcão" || lower === "cliente balcao") {
        continue;
      }

      const existing = customerMap.get(customerName);
      if (existing) {
        existing.totalSpent += sale.total_amount;
        existing.purchaseCount += 1;
        if (new Date(sale.created_at) > new Date(existing.lastPurchase)) {
          existing.lastPurchase = sale.created_at;
        }
      } else {
        customerMap.set(customerName, {
          name: customerName,
          totalSpent: sale.total_amount,
          purchaseCount: 1,
          lastPurchase: sale.created_at,
        });
      }
    }

    const customers = Array.from(customerMap.values()).sort(
      (a, b) => b.totalSpent - a.totalSpent
    );

    const total = customers.reduce((sum, c) => sum + c.totalSpent, 0);
    let accumulated = 0;

    return customers.map((customer) => {
      accumulated += customer.totalSpent;

      const cumulativePct = total > 0 ? (accumulated / total) * 100 : 0;
      const percentageOfTotal = total > 0 ? (customer.totalSpent / total) * 100 : 0;

      let classification: "A" | "B" | "C";
      if (cumulativePct <= 80) classification = "A";
      else if (cumulativePct <= 95) classification = "B";
      else classification = "C";

      return {
        ...customer,
        classification,
        percentageOfTotal,
        cumulativePct,
      };
    });
  }, [salesFilteredBySeller]);

  const classificationCounts = useMemo(
    () => ({
      A: customerStats.filter((c) => c.classification === "A").length,
      B: customerStats.filter((c) => c.classification === "B").length,
      C: customerStats.filter((c) => c.classification === "C").length,
    }),
    [customerStats]
  );

  const identifiedCustomers = customerStats.length;

  // filtro de busca na tabela de clientes (✅ usando deferred)
  const customerStatsFiltered = useMemo(() => {
    const s = deferredCustomerSearch.trim().toLowerCase();
    if (!s) return customerStats;
    return customerStats.filter((c) => (c.name || "").toLowerCase().includes(s));
  }, [customerStats, deferredCustomerSearch]);

  // ✅ paginação render (evita travar no mobile)
  const customerVisible = useMemo(
    () => customerStatsFiltered.slice(0, customerLimit),
    [customerStatsFiltered, customerLimit]
  );

  const sellerVisible = useMemo(
    () => sellerStats.slice(0, sellerLimit),
    [sellerStats, sellerLimit]
  );

  const getRankIcon = (index: number) => {
    switch (index) {
      case 0:
        return <Crown className="h-5 w-5 text-amber-500" />;
      case 1:
        return <Medal className="h-5 w-5 text-slate-400" />;
      case 2:
        return <Award className="h-5 w-5 text-amber-700" />;
      default:
        return (
          <span className="w-5 text-center font-bold text-muted-foreground">
            {index + 1}
          </span>
        );
    }
  };

  const getClassificationColor = (classification: "A" | "B" | "C") => {
    switch (classification) {
      case "A":
        return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
      case "B":
        return "bg-amber-500/10 text-amber-600 border-amber-500/20";
      case "C":
        return "bg-slate-500/10 text-slate-600 border-slate-500/20";
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header + filtros */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Trophy className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Performance</h1>
            <p className="text-sm text-muted-foreground">
              Análise de vendedores e clientes
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          {/* período */}
          <Select value={range} onValueChange={(v) => setRange(v as any)}>
            <SelectTrigger className="w-full sm:w-[210px]">
              <CalendarDays className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
              <SelectItem value="all">Tudo</SelectItem>
            </SelectContent>
          </Select>

          {/* vendedor */}
          <Select value={sellerFilter} onValueChange={(v) => { setSellerFilter(v); resetPaging(); }}>
            <SelectTrigger className="w-full sm:w-[230px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Vendedor" />
            </SelectTrigger>
            <SelectContent>
              {sellersList.map((s) => (
                <SelectItem key={s} value={s}>
                  {s === "all" ? "Todos os vendedores" : s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" onClick={fetchSales} title="Atualizar">
            <RefreshCcw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>

          {(range !== "30" || sellerFilter !== "all") && (
            <Button
              variant="outline"
              onClick={() => {
                setRange("30");
                setSellerFilter("all");
                resetPaging();
              }}
            >
              <X className="h-4 w-4 mr-2" />
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Vendas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{salesFilteredBySeller.length}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Faturamento: <span className="font-semibold">{formatCurrency(totalRevenue)}</span>
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Ticket Médio Geral
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(overallTicket)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              (no período e filtros atuais)
            </p>
          </CardContent>
        </Card>

        <Card className="border-emerald-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Clientes Identificados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">{identifiedCustomers}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Clientes “avulsos/balcão” ignorados
            </p>
          </CardContent>
        </Card>

        <Card className="border-amber-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              ABC (A/B/C)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-sm">
              <span className="font-semibold text-emerald-600">A:</span> {classificationCounts.A}
              <span className="font-semibold text-amber-600 ml-2">B:</span> {classificationCounts.B}
              <span className="font-semibold text-muted-foreground ml-2">C:</span> {classificationCounts.C}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              A até 80% acumulado, B até 95%
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Seller Ranking */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <CardTitle>Ranking de Vendedores</CardTitle>
            </div>
            <p className="text-sm text-muted-foreground">
              Performance por faturamento total (considerando filtros)
            </p>
          </CardHeader>

          <CardContent className="space-y-4">
            {sellerStats.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhuma venda registrada ainda.
              </p>
            ) : (
              <>
                {sellerVisible.map((stat, index) => (
                  <div
                    key={stat.name}
                    className="flex items-center gap-4 p-3 rounded-lg bg-muted/30"
                  >
                    <div className="flex items-center justify-center w-8">
                      {getRankIcon(index)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1 gap-3">
                        <span className="font-medium truncate">{stat.name}</span>
                        <span className="text-sm font-bold whitespace-nowrap">
                          {formatCurrency(stat.totalRevenue)}
                        </span>
                      </div>

                      <Progress value={(stat.totalRevenue / maxRevenue) * 100} className="h-2" />

                      <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                        <span>{stat.salesCount} vendas</span>
                        <span className="whitespace-nowrap">
                          Ticket médio: {formatCurrency(stat.averageTicket)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}

                {sellerStats.length > sellerLimit && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setSellerLimit((v) => v + 30)}
                  >
                    Ver mais vendedores
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Customer ABC */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <CardTitle>Melhores Clientes (Curva ABC)</CardTitle>
            </div>
            <p className="text-sm text-muted-foreground">
              Classificação por valor de compras (com acumulado)
            </p>
          </CardHeader>

          <CardContent className="space-y-3">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar cliente pelo nome..."
                value={customerSearch}
                onChange={(e) => {
                  setCustomerSearch(e.target.value);
                  setCustomerLimit(20); // ✅ reseta paginação ao buscar
                }}
              />
            </div>

            {customerStatsFiltered.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhum cliente identificado com compras.
              </p>
            ) : (
              <>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead className="text-center">Classe</TableHead>
                        <TableHead className="text-center">Compras</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {customerVisible.map((customer) => (
                        <TableRow key={customer.name}>
                          <TableCell>
                            <div className="space-y-0.5">
                              <p className="font-medium truncate max-w-[170px] sm:max-w-none">
                                {customer.name}
                              </p>
                              <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2">
                                <span>{customer.percentageOfTotal?.toFixed(1)}% do total</span>
                                <span>•</span>
                                <span>Acum.: {customer.cumulativePct?.toFixed(1)}%</span>
                                <span>•</span>
                                <span>Última: {formatDate(customer.lastPurchase)}</span>
                              </div>
                            </div>
                          </TableCell>

                          <TableCell className="text-center">
                            <Badge
                              variant="outline"
                              className={getClassificationColor(customer.classification || "C")}
                            >
                              {customer.classification}
                            </Badge>
                          </TableCell>

                          <TableCell className="text-center">
                            {customer.purchaseCount}
                          </TableCell>

                          <TableCell className="text-right font-mono font-medium">
                            {formatCurrency(customer.totalSpent)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {customerStatsFiltered.length > customerLimit && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setCustomerLimit((v) => v + 20)}
                  >
                    Ver mais clientes
                  </Button>
                )}

                <div className="text-xs text-muted-foreground">
                  Mostrando {Math.min(customerLimit, customerStatsFiltered.length)} de {customerStatsFiltered.length}.
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ABC Explanation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sobre a Curva ABC</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
              <Badge className="bg-emerald-500 text-white">A</Badge>
              <div>
                <p className="font-medium text-emerald-700">Clientes Premium</p>
                <p className="text-sm text-muted-foreground">
                  Clientes que somam até <strong>80% do faturamento acumulado</strong>.
                  Prioridade máxima.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <Badge className="bg-amber-500 text-white">B</Badge>
              <div>
                <p className="font-medium text-amber-700">Clientes Regulares</p>
                <p className="text-sm text-muted-foreground">
                  Do <strong>80% até 95%</strong> do faturamento acumulado. Potencial de crescimento.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-500/5 border border-slate-500/20">
              <Badge variant="secondary">C</Badge>
              <div>
                <p className="font-medium">Clientes Ocasionais</p>
                <p className="text-sm text-muted-foreground">
                  Acima de <strong>95%</strong> do acumulado. Manter relacionamento.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* dica: se bater muito dado */}
      {sales.length >= FETCH_LIMIT && (
        <div className="text-xs text-muted-foreground">
          ⚠️ Carreguei só as últimas {FETCH_LIMIT} vendas para manter performance.
          Se quiser, eu faço paginação no Supabase também (page/offset).
        </div>
      )}
    </div>
  );
}
