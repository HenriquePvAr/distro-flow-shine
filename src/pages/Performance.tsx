"use client";

import {
  useEffect,
  useMemo,
  useState,
  useDeferredValue,
  useCallback,
  useRef,
} from "react";
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
  ChevronDown,
  DollarSign,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// -----------------------------
// TIPOS
// -----------------------------
interface Sale {
  id: string;
  total_amount: number;
  entity_name: string;
  description: string;
  created_at: string;
  seller_name: string;
  commission_value: number;
  reference?: string | null;
}

interface SellerStat {
  name: string;
  totalRevenue: number;
  totalCommission: number;
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

interface Person {
  id: string;
  name: string;
}

// -----------------------------
// UTILS
// -----------------------------
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

// remove lixo tipo "[CANCELADO por ...]" do final
const normalizeSellerName = (name?: string) => {
  const n = String(name || "").trim();
  const cleaned = n.replace(/\s*\[CANCELADO.*?\]\s*$/i, "").trim();
  return cleaned || "Venda Balcão";
};

// Fallback: tenta pegar vendedor da descrição se a coluna seller_name for nula (vendas antigas)
const extractSellerName = (description?: string) => {
  const desc = String(description || "");
  const match =
    desc.match(/Vend:\s*([^|]+)/i) || desc.match(/Vendedor:\s*([^|]+)/i);
  const sellerName = match ? match[1].trim() : "";
  return sellerName.length ? sellerName : "Venda Balcão";
};

const isIgnoredCustomer = (name: string) => {
  const lower = (name || "").trim().toLowerCase();
  return (
    lower === "cliente avulso" ||
    lower === "cliente balcão" ||
    lower === "cliente balcao" ||
    lower === "avulso" ||
    lower === "balcão" ||
    lower === "balcao"
  );
};

const clsx = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(" ");

function KpiCard({
  title,
  value,
  sub,
  accentClass,
}: {
  title: string;
  value: string;
  sub?: React.ReactNode;
  accentClass?: string;
}) {
  return (
    <Card className={clsx("overflow-hidden", accentClass)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="text-2xl font-bold tracking-tight">{value}</div>
        {sub ? (
          <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Pill({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs",
        className
      )}
    >
      {children}
    </span>
  );
}

// -----------------------------
// COMPONENTE PRINCIPAL
// -----------------------------
export default function Performance() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  // 🔥 vendedores CADASTRADOS (profiles)
  const [allSellers, setAllSellers] = useState<Person[]>([]);

  // filtros
  type RangeKey = "today" | "week" | "month" | "7" | "30" | "90" | "all";
  const [range, setRange] = useState<RangeKey>("month");
  const [sellerFilter, setSellerFilter] = useState<string>("all");
  const [customerSearch, setCustomerSearch] = useState("");

  // evita travar com listas grandes
  const deferredCustomerSearch = useDeferredValue(customerSearch);

  // paginação leve (render)
  const [customerLimit, setCustomerLimit] = useState(15);
  const [sellerLimit, setSellerLimit] = useState(12);

  // limite do fetch (DB)
  const DEFAULT_FETCH_LIMIT = 800;
  const MAX_FETCH_LIMIT = 3000;
  const [fetchLimit, setFetchLimit] = useState(DEFAULT_FETCH_LIMIT);

  const requestIdRef = useRef(0);

  const resetPaging = useCallback(() => {
    setCustomerLimit(15);
    setSellerLimit(12);
  }, []);

  const buildFromDateIso = (rk: RangeKey) => {
    if (rk === "all") return null;

    const now = new Date();
    if (rk === "today") {
      const start = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        0,
        0,
        0
      );
      return start.toISOString();
    }

    if (rk === "week") {
      const day = now.getDay();
      const diff = (day === 0 ? -6 : 1) - day;
      const start = new Date(now);
      start.setDate(now.getDate() + diff);
      start.setHours(0, 0, 0, 0);
      return start.toISOString();
    }

    if (rk === "month") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      return start.toISOString();
    }

    const days = Number(rk);
    const from = new Date();
    from.setDate(from.getDate() - days);
    return from.toISOString();
  };

  // ✅ buscar vendedores do cadastro (profiles)
  const fetchSellers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,name")
        .order("name");

      if (error) throw error;

      const mapped: Person[] = (data || [])
        .filter((p: any) => String(p?.name || "").trim().length > 0)
        .map((p: any) => ({
          id: String(p.id),
          name: String(p.name),
        }));

      setAllSellers(mapped);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao carregar vendedores cadastrados");
    }
  }, []);

  const fetchSales = useCallback(
    async (opts?: { keepLimit?: boolean }) => {
      const currentRequest = ++requestIdRef.current;

      setLoading(true);
      try {
        if (!opts?.keepLimit) setFetchLimit(DEFAULT_FETCH_LIMIT);

        const fromIso = buildFromDateIso(range);

        // ✅ pega vendas antigas (PDV-...) e novas (UUID / qualquer reference não nula)
        let q = supabase
          .from("financial_entries")
          .select(
            "id,total_amount,entity_name,description,created_at,seller_name,commission_value,reference"
          )
          .eq("type", "receivable")
          .or("reference.ilike.PDV-%,reference.not.is.null")
          .order("created_at", { ascending: false })
          .limit(opts?.keepLimit ? fetchLimit : DEFAULT_FETCH_LIMIT);

        if (fromIso) q = q.gte("created_at", fromIso);

        const { data, error } = await q;
        if (error) throw error;

        if (currentRequest !== requestIdRef.current) return;

        const mapped: Sale[] = (data || []).map((s: any) => {
          const description = String(s.description || "");

          // Lógica híbrida: pega do banco OU extrai da descrição (antigas)
          let finalSellerName = s.seller_name
            ? normalizeSellerName(s.seller_name)
            : "";

          if (!finalSellerName) {
            finalSellerName = normalizeSellerName(extractSellerName(description));
          }

          return {
            id: String(s.id),
            total_amount: toNumber(s.total_amount),
            entity_name: String(s.entity_name || ""),
            description,
            created_at: String(s.created_at || ""),
            seller_name: finalSellerName,
            commission_value: toNumber(s.commission_value),
            reference: s.reference ?? null,
          };
        });

        setSales(mapped);
        resetPaging();
      } catch (err) {
        console.error(err);
        toast.error("Erro ao carregar dados de performance");
      } finally {
        if (currentRequest === requestIdRef.current) setLoading(false);
      }
    },
    [range, fetchLimit, resetPaging]
  );

  useEffect(() => {
    fetchSales();
    fetchSellers();
  }, [fetchSales, fetchSellers]);

  const loadMoreFromDb = useCallback(async () => {
    setFetchLimit((prev) => Math.min(prev + 700, MAX_FETCH_LIMIT));
    Promise.resolve().then(() => fetchSales({ keepLimit: true }));
  }, [fetchSales]);

  // ✅ Lista de vendedores: agora vem do CADASTRO + também inclui nomes que existirem nas vendas antigas
  const sellersList = useMemo(() => {
    const set = new Set<string>();

    for (const s of allSellers) set.add(normalizeSellerName(s.name));
    for (let i = 0; i < sales.length; i++) set.add(normalizeSellerName(sales[i].seller_name));

    return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [allSellers, sales]);

  // Vendas filtradas
  const salesFilteredBySeller = useMemo(() => {
    if (sellerFilter === "all") return sales;
    return sales.filter((s) => normalizeSellerName(s.seller_name) === normalizeSellerName(sellerFilter));
  }, [sales, sellerFilter]);

  // Totais Gerais
  const totalRevenue = useMemo(() => {
    let sum = 0;
    for (let i = 0; i < salesFilteredBySeller.length; i++) {
      sum += salesFilteredBySeller[i].total_amount;
    }
    return sum;
  }, [salesFilteredBySeller]);

  const totalCommissions = useMemo(() => {
    let sum = 0;
    for (let i = 0; i < salesFilteredBySeller.length; i++) {
      sum += salesFilteredBySeller[i].commission_value;
    }
    return sum;
  }, [salesFilteredBySeller]);

  const overallTicket = useMemo(() => {
    const count = salesFilteredBySeller.length || 1;
    return totalRevenue / count;
  }, [totalRevenue, salesFilteredBySeller.length]);

  // --- RANKING VENDEDORES ---
  const sellerStats = useMemo(() => {
    const map = new Map<
      string,
      { totalRevenue: number; totalCommission: number; salesCount: number }
    >();

    for (let i = 0; i < salesFilteredBySeller.length; i++) {
      const sale = salesFilteredBySeller[i];
      const name = normalizeSellerName(sale.seller_name);

      const prev = map.get(name);
      if (prev) {
        prev.totalRevenue += sale.total_amount;
        prev.totalCommission += sale.commission_value;
        prev.salesCount += 1;
      } else {
        map.set(name, {
          totalRevenue: sale.total_amount,
          totalCommission: sale.commission_value,
          salesCount: 1,
        });
      }
    }

    const stats: SellerStat[] = [];
    for (const [name, v] of map.entries()) {
      stats.push({
        name,
        totalRevenue: v.totalRevenue,
        totalCommission: v.totalCommission,
        salesCount: v.salesCount,
        averageTicket: v.salesCount ? v.totalRevenue / v.salesCount : 0,
      });
    }

    // ✅ mantém no ranking só quem tem vendas (normal), mas o SELECT mostra todos
    stats.sort((a, b) => b.totalRevenue - a.totalRevenue);
    return stats;
  }, [salesFilteredBySeller]);

  const maxRevenue = useMemo(() => {
    if (!sellerStats.length) return 1;
    let max = 1;
    for (let i = 0; i < sellerStats.length; i++) {
      if (sellerStats[i].totalRevenue > max) max = sellerStats[i].totalRevenue;
    }
    return max || 1;
  }, [sellerStats]);

  // --- CURVA ABC ---
  const customerStats = useMemo(() => {
    const customerMap = new Map<string, CustomerStat>();

    for (let i = 0; i < salesFilteredBySeller.length; i++) {
      const sale = salesFilteredBySeller[i];

      const raw = (sale.entity_name || "Cliente Avulso").trim();
      if (!raw || isIgnoredCustomer(raw)) continue;

      const existing = customerMap.get(raw);
      if (existing) {
        existing.totalSpent += sale.total_amount;
        existing.purchaseCount += 1;
        if (new Date(sale.created_at) > new Date(existing.lastPurchase)) {
          existing.lastPurchase = sale.created_at;
        }
      } else {
        customerMap.set(raw, {
          name: raw,
          totalSpent: sale.total_amount,
          purchaseCount: 1,
          lastPurchase: sale.created_at,
        });
      }
    }

    const customers = Array.from(customerMap.values()).sort(
      (a, b) => b.totalSpent - a.totalSpent
    );

    let total = 0;
    for (let i = 0; i < customers.length; i++) total += customers[i].totalSpent;

    let accumulated = 0;

    for (let i = 0; i < customers.length; i++) {
      const c = customers[i];
      accumulated += c.totalSpent;

      const cumulativePct = total > 0 ? (accumulated / total) * 100 : 0;
      const percentageOfTotal = total > 0 ? (c.totalSpent / total) * 100 : 0;

      let classification: "A" | "B" | "C";
      if (cumulativePct <= 80) classification = "A";
      else if (cumulativePct <= 95) classification = "B";
      else classification = "C";

      c.classification = classification;
      c.percentageOfTotal = percentageOfTotal;
      c.cumulativePct = cumulativePct;
    }

    return customers;
  }, [salesFilteredBySeller]);

  const classificationCounts = useMemo(() => {
    let A = 0,
      B = 0,
      C = 0;
    for (let i = 0; i < customerStats.length; i++) {
      const cls = customerStats[i].classification;
      if (cls === "A") A++;
      else if (cls === "B") B++;
      else C++;
    }
    return { A, B, C };
  }, [customerStats]);

  const customerStatsFiltered = useMemo(() => {
    const s = deferredCustomerSearch.trim().toLowerCase();
    if (!s) return customerStats;
    return customerStats.filter((c) => (c.name || "").toLowerCase().includes(s));
  }, [customerStats, deferredCustomerSearch]);

  // Paginação
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
          <span className="w-6 text-center text-sm font-bold text-muted-foreground">
            {index + 1}
          </span>
        );
    }
  };

  const getClassificationBadge = (classification: "A" | "B" | "C") => {
    if (classification === "A")
      return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
    if (classification === "B")
      return "bg-amber-500/10 text-amber-600 border-amber-500/20";
    return "bg-slate-500/10 text-slate-600 border-slate-500/20";
  };

  const showReset = range !== "month" || sellerFilter !== "all";

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-9 w-9 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            Calculando comissões e performance...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={clsx(
        "mx-auto w-full max-w-6xl",
        "px-3 sm:px-4",
        "pb-6",
        "space-y-5 sm:space-y-6",
        "pt-[max(12px,env(safe-area-inset-top))]"
      )}
    >
      {/* HEADER */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-primary/10 p-2.5">
            <Trophy className="h-6 w-6 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-semibold leading-tight">
              Performance
            </h1>
            <p className="text-sm text-muted-foreground">
              Comissões, Ranking e Curva ABC
            </p>
          </div>
        </div>

        {/* FILTROS */}
        <Card className="sm:min-w-[520px]">
          <CardContent className="p-3 sm:p-4">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <div className="sm:col-span-4">
                <Select
                  value={range}
                  onValueChange={(v) => {
                    setRange(v as any);
                    setFetchLimit(DEFAULT_FETCH_LIMIT);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <CalendarDays className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Período" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Hoje</SelectItem>
                    <SelectItem value="week">Esta semana</SelectItem>
                    <SelectItem value="month">Este mês</SelectItem>
                    <SelectItem value="7">Últimos 7 dias</SelectItem>
                    <SelectItem value="30">Últimos 30 dias</SelectItem>
                    <SelectItem value="90">Últimos 90 dias</SelectItem>
                    <SelectItem value="all">Tudo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="sm:col-span-5">
                <Select
                  value={sellerFilter}
                  onValueChange={(v) => {
                    setSellerFilter(v);
                    resetPaging();
                  }}
                >
                  <SelectTrigger className="w-full">
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
              </div>

              <div className="sm:col-span-3 grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => fetchSales({ keepLimit: true })}
                  title="Atualizar"
                >
                  <RefreshCcw className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  className={clsx("w-full", !showReset && "opacity-50")}
                  disabled={!showReset}
                  onClick={() => {
                    setRange("month");
                    setSellerFilter("all");
                    setCustomerSearch("");
                    setFetchLimit(DEFAULT_FETCH_LIMIT);
                    resetPaging();
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {sellerFilter !== "all" && (
              <div className="mt-2 text-xs text-muted-foreground">
                Exibindo apenas vendas de <b>{sellerFilter}</b>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* KPIS GERAIS */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Total de vendas"
          value={`${salesFilteredBySeller.length}`}
          sub={
            <>
              Fat:{" "}
              <span className="font-semibold">{formatCurrency(totalRevenue)}</span>
            </>
          }
        />
        <KpiCard
          title="Ticket médio"
          value={formatCurrency(overallTicket)}
          sub="Por venda realizada"
          accentClass="border-slate-500/20"
        />
        <KpiCard
          title="Comissões Geradas"
          value={formatCurrency(totalCommissions)}
          sub="Total a pagar no período"
          accentClass="border-green-500/30 bg-green-500/5"
        />
        <KpiCard
          title="Curva ABC"
          value={`${classificationCounts.A}/${classificationCounts.B}/${classificationCounts.C}`}
          sub="Clientes A, B e C"
          accentClass="border-amber-500/30"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* RANKING VENDEDORES */}
        <Card className="overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <CardTitle>Ranking de Vendedores</CardTitle>
            </div>
            <p className="text-sm text-muted-foreground">
              Por faturamento e comissão
            </p>
          </CardHeader>

          <CardContent className="space-y-3">
            {sellerStats.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhuma venda encontrada.
              </p>
            ) : (
              <>
                {sellerVisible.map((stat, index) => {
                  const pct = Math.min(100, (stat.totalRevenue / maxRevenue) * 100);
                  return (
                    <div key={stat.name} className="rounded-xl border bg-muted/20 p-3">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-background">
                          {getRankIcon(index)}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-medium truncate">{stat.name}</div>
                              <div className="mt-1 flex flex-wrap gap-2">
                                <Pill className="bg-background">{stat.salesCount} vendas</Pill>
                                <Pill className="bg-emerald-50 text-emerald-700 border-emerald-200">
                                  <DollarSign className="w-3 h-3 mr-1" />
                                  {formatCurrency(stat.totalCommission)}
                                </Pill>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <div className="text-sm text-muted-foreground">
                                Total Vendido
                              </div>
                              <div className="font-bold whitespace-nowrap">
                                {formatCurrency(stat.totalRevenue)}
                              </div>
                            </div>
                          </div>

                          <div className="mt-3">
                            <Progress value={pct} className="h-2" />
                            <div className="mt-1 text-[11px] text-muted-foreground">
                              {pct.toFixed(0)}% do líder
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {sellerStats.length > sellerLimit && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setSellerLimit((v) => v + 12)}
                  >
                    Ver mais <ChevronDown className="h-4 w-4 ml-2" />
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* CURVA ABC CLIENTES */}
        <Card className="overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <CardTitle>Melhores Clientes</CardTitle>
            </div>
            <p className="text-sm text-muted-foreground">
              Classificação ABC por valor de compra
            </p>
          </CardHeader>

          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar cliente..."
                value={customerSearch}
                onChange={(e) => {
                  setCustomerSearch(e.target.value);
                  setCustomerLimit(15);
                }}
              />
            </div>

            {customerStatsFiltered.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhum cliente encontrado.
              </p>
            ) : (
              <>
                {/* Mobile View */}
                <div className="space-y-2 sm:hidden">
                  {customerVisible.map((c) => (
                    <div key={c.name} className="rounded-xl border bg-muted/20 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{c.name}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            Última: {formatDate(c.lastPurchase)}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Pill className="bg-background">{c.purchaseCount} compras</Pill>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <Badge
                            variant="outline"
                            className={getClassificationBadge(c.classification || "C")}
                          >
                            {c.classification}
                          </Badge>
                          <div className="mt-2 font-mono font-semibold whitespace-nowrap">
                            {formatCurrency(c.totalSpent)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop View */}
                <div className="hidden sm:block rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead className="text-center">Classe</TableHead>
                        <TableHead className="text-center">Qtd</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customerVisible.map((customer) => (
                        <TableRow key={customer.name}>
                          <TableCell>
                            <div className="space-y-0.5">
                              <p className="font-medium">{customer.name}</p>
                              <div className="text-xs text-muted-foreground">
                                {customer.percentageOfTotal?.toFixed(1)}% do total
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant="outline"
                              className={getClassificationBadge(customer.classification || "C")}
                            >
                              {customer.classification}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">{customer.purchaseCount}</TableCell>
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
                    onClick={() => setCustomerLimit((v) => v + 15)}
                  >
                    Ver mais <ChevronDown className="h-4 w-4 ml-2" />
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* LEGENDA ABC */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Entenda a Classificação</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:gap-4 md:grid-cols-3">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
              <Badge className="bg-emerald-500 text-white">A</Badge>
              <div className="text-sm">
                <span className="font-bold text-emerald-700">
                  VIPs (80% da receita)
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
              <Badge className="bg-amber-500 text-white">B</Badge>
              <div className="text-sm">
                <span className="font-bold text-amber-700">
                  Regulares (15% da receita)
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-500/5 border border-slate-500/20">
              <Badge variant="secondary">C</Badge>
              <div className="text-sm">
                <span className="font-bold">Ocasionais (5% da receita)</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2 text-center sm:text-left">
        <div className="text-xs text-muted-foreground px-1">
          Carregadas <strong>{sales.length}</strong> vendas.
          {fetchLimit < MAX_FETCH_LIMIT && " Se necessário, carregue mais abaixo."}
        </div>
        {fetchLimit < MAX_FETCH_LIMIT && (
          <Button variant="outline" className="w-full sm:w-auto" onClick={loadMoreFromDb}>
            Carregar mais histórico <ChevronDown className="h-4 w-4 ml-2" />
          </Button>
        )}
      </div>
    </div>
  );
}
