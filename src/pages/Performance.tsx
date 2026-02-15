"use client";

import React, {
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
  Package,
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
  id: string; // financial_entries.id (uuid)
  total_amount: number;
  entity_name: string;
  description: string;
  created_at: string;

  seller_name: string;
  seller_key: string;

  commission_value: number;
  reference?: string | null; // pode ser sale_id (uuid) OU "PDV-xxxx"
  month_key: string; // YYYY-MM (cache p/ filtro rápido)
}

type SaleItem = {
  id: string;
  sale_id: string;
  quantity: number;
  unit_price?: number | null;
  total_price?: number | null;

  product_id?: string | null;

  // join (se FK existir)
  products?: { name?: string | null } | null;

  // NÃO selecionamos no SQL, mas pode existir em alguns schemas e não quebra
  product_name?: string | null;
  name?: string | null;
};

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

// chave normalizada (p/ comparar rápido)
const normalizeSellerKey = (name?: string) =>
  normalizeSellerName(name).trim().toLowerCase();

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

const isUuid = (v: string | null | undefined) =>
  !!v &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );

const monthKeyFromIso = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
};

const monthBounds = (monthKey: string) => {
  // monthKey = "YYYY-MM"
  const [yStr, mStr] = monthKey.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) return { from: null as string | null, to: null as string | null };
  const from = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const to = new Date(y, m, 1, 0, 0, 0, 0); // início do mês seguinte
  return { from: from.toISOString(), to: to.toISOString() };
};

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

  // vendedores CADASTRADOS (profiles)
  const [allSellers, setAllSellers] = useState<Person[]>([]);

  // filtros
  type RangeKey = "today" | "week" | "month" | "7" | "30" | "90" | "all";
  const [range, setRange] = useState<RangeKey>("month");
  const [sellerFilter, setSellerFilter] = useState<string>("all");
  const [customerSearch, setCustomerSearch] = useState("");

  // ✅ filtro por mês (YYYY-MM) para buscar/mostrar histórico
  const [monthFilter, setMonthFilter] = useState<string>(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  });

  // evita travar com listas grandes
  const deferredCustomerSearch = useDeferredValue(customerSearch);

  // paginação leve (render)
  const [customerLimit, setCustomerLimit] = useState(15);
  const [sellerLimit, setSellerLimit] = useState(12);

  // limite do fetch (DB)
  const DEFAULT_FETCH_LIMIT = 800;
  const MAX_FETCH_LIMIT = 3000;
  const STEP_FETCH = 700;
  const [fetchLimit, setFetchLimit] = useState(DEFAULT_FETCH_LIMIT);

  // controle de “request mais recente” (evita setState fora de ordem)
  const requestIdRef = useRef(0);

  // ✅ cache de itens (sale_items) por sale_id (uuid)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [itemsCache, setItemsCache] = useState<Record<string, SaleItem[]>>({});
  const [itemsLoading, setItemsLoading] = useState<Record<string, boolean>>({});

  const resetPaging = useCallback(() => {
    setCustomerLimit(15);
    setSellerLimit(12);
  }, []);

  const buildFromDateIso = useCallback((rk: RangeKey) => {
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
  }, []);

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
        .map((p: any) => ({ id: String(p.id), name: String(p.name) }));

      setAllSellers(mapped);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao carregar vendedores cadastrados");
    }
  }, []);

  /**
   * ✅ Perf fix:
   * - suporte a monthFilter (YYYY-MM) -> gte/lt no created_at
   * - suporte a limitOverride (evita “stale state” do fetchLimit)
   * - mapeia seller_key + month_key (cache p/ filtros)
   */
  const fetchSales = useCallback(
    async (opts?: { keepLimit?: boolean; limitOverride?: number }) => {
      const currentRequest = ++requestIdRef.current;

      setLoading(true);
      try {
        const limitToUse =
          typeof opts?.limitOverride === "number"
            ? opts.limitOverride
            : opts?.keepLimit
            ? fetchLimit
            : DEFAULT_FETCH_LIMIT;

        if (!opts?.keepLimit && typeof opts?.limitOverride !== "number") {
          setFetchLimit(DEFAULT_FETCH_LIMIT);
        }

        // ✅ se range === month, usamos monthFilter (permite escolher qualquer mês)
        let fromIso: string | null = null;
        let toIso: string | null = null;

        if (range === "month" && monthFilter) {
          const b = monthBounds(monthFilter);
          fromIso = b.from;
          toIso = b.to;
        } else {
          fromIso = buildFromDateIso(range);
          toIso = null;
        }

        let q = supabase
          .from("financial_entries")
          .select(
            "id,total_amount,entity_name,description,created_at,seller_name,commission_value,reference"
          )
          .eq("type", "receivable")
          .or("reference.ilike.PDV-%,reference.not.is.null")
          .order("created_at", { ascending: false })
          .limit(limitToUse);

        if (fromIso) q = q.gte("created_at", fromIso);
        if (toIso) q = q.lt("created_at", toIso);

        const { data, error } = await q;
        if (error) throw error;

        if (currentRequest !== requestIdRef.current) return;

        const mapped: Sale[] = (data || []).map((s: any) => {
          const description = String(s.description || "");

          let finalSellerName = s.seller_name
            ? normalizeSellerName(s.seller_name)
            : "";
          if (!finalSellerName)
            finalSellerName = normalizeSellerName(
              extractSellerName(description)
            );

          const createdAt = String(s.created_at || "");
          return {
            id: String(s.id),
            total_amount: toNumber(s.total_amount),
            entity_name: String(s.entity_name || ""),
            description,
            created_at: createdAt,
            seller_name: finalSellerName,
            seller_key: normalizeSellerKey(finalSellerName),
            commission_value: toNumber(s.commission_value),
            reference: s.reference ?? null,
            month_key: monthKeyFromIso(createdAt),
          };
        });

        setSales(mapped);
        resetPaging();

        // ✅ reseta expansão/itens quando refaz consulta (evita mistura de cache)
        setExpanded({});
        setItemsLoading({});
        setItemsCache({});
      } catch (err) {
        console.error(err);
        toast.error("Erro ao carregar dados de performance");
      } finally {
        if (currentRequest === requestIdRef.current) setLoading(false);
      }
    },
    [range, monthFilter, fetchLimit, buildFromDateIso, resetPaging]
  );

  useEffect(() => {
    fetchSales();
    fetchSellers();
  }, [fetchSales, fetchSellers]);

  const loadMoreFromDb = useCallback(() => {
    const nextLimit = Math.min(fetchLimit + STEP_FETCH, MAX_FETCH_LIMIT);
    setFetchLimit(nextLimit);
    fetchSales({ keepLimit: true, limitOverride: nextLimit });
  }, [fetchLimit, fetchSales]);

  // Normaliza o filtro 1x
  const sellerFilterKey = useMemo(() => {
    if (sellerFilter === "all") return "all";
    return normalizeSellerKey(sellerFilter);
  }, [sellerFilter]);

  // ✅ Lista de vendedores: CADASTRO + vendedores nas vendas
  const sellersList = useMemo(() => {
    const set = new Set<string>();

    for (const s of allSellers) set.add(normalizeSellerName(s.name));
    for (let i = 0; i < sales.length; i++)
      set.add(normalizeSellerName(sales[i].seller_name));

    return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [allSellers, sales]);

  // Vendas filtradas por vendedor (usa seller_key cache)
  const salesFilteredBySeller = useMemo(() => {
    if (sellerFilterKey === "all") return sales;
    return sales.filter((s) => s.seller_key === sellerFilterKey);
  }, [sales, sellerFilterKey]);

  // ✅ Vendas do vendedor no mês selecionado (para listar embaixo)
  const sellerMonthSales = useMemo(() => {
    if (sellerFilterKey === "all") return [];
    if (!monthFilter) return salesFilteredBySeller;
    return salesFilteredBySeller.filter((s) => s.month_key === monthFilter);
  }, [salesFilteredBySeller, sellerFilterKey, monthFilter]);

  // Totais Gerais
  const totalRevenue = useMemo(() => {
    let sum = 0;
    for (let i = 0; i < salesFilteredBySeller.length; i++)
      sum += salesFilteredBySeller[i].total_amount;
    return sum;
  }, [salesFilteredBySeller]);

  const totalCommissions = useMemo(() => {
    let sum = 0;
    for (let i = 0; i < salesFilteredBySeller.length; i++)
      sum += salesFilteredBySeller[i].commission_value;
    return sum;
  }, [salesFilteredBySeller]);

  const overallTicket = useMemo(() => {
    const count = salesFilteredBySeller.length || 1;
    return totalRevenue / count;
  }, [totalRevenue, salesFilteredBySeller.length]);

  // ✅ Totais do vendedor no mês
  const sellerMonthTotals = useMemo(() => {
    let revenue = 0;
    let comm = 0;
    for (let i = 0; i < sellerMonthSales.length; i++) {
      revenue += sellerMonthSales[i].total_amount;
      comm += sellerMonthSales[i].commission_value;
    }
    return { revenue, comm, count: sellerMonthSales.length };
  }, [sellerMonthSales]);

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

    stats.sort((a, b) => b.totalRevenue - a.totalRevenue);
    return stats;
  }, [salesFilteredBySeller]);

  const maxRevenue = useMemo(() => {
    if (!sellerStats.length) return 1;
    let max = 1;
    for (let i = 0; i < sellerStats.length; i++)
      if (sellerStats[i].totalRevenue > max) max = sellerStats[i].totalRevenue;
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
    return customerStats.filter((c) =>
      (c.name || "").toLowerCase().includes(s)
    );
  }, [customerStats, deferredCustomerSearch]);

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

  const showReset =
    range !== "month" ||
    sellerFilter !== "all" ||
    monthFilter !== monthKeyFromIso(new Date().toISOString());

  // -----------------------------
  // ITENS DA VENDA (EXPAND)
  // ✅ FIX REAL: select "safe" (sem colunas suspeitas) + fallback sem JOIN
  // -----------------------------
  const fetchSaleItemsSafe = useCallback(async (saleId: string) => {
    // 1) tenta com join (se FK existir)
    const q1 = await supabase
      .from("sale_items")
      .select(
        `
        id,
        sale_id,
        quantity,
        unit_price,
        total_price,
        product_id,
        products:product_id ( name )
      `
      )
      .eq("sale_id", saleId)
      .order("id", { ascending: true });

    if (!q1.error) return (q1.data as SaleItem[]) || [];

    // 2) fallback: sem join (se não existir relacionamento/foreign key)
    const q2 = await supabase
      .from("sale_items")
      .select(
        `
        id,
        sale_id,
        quantity,
        unit_price,
        total_price,
        product_id
      `
      )
      .eq("sale_id", saleId)
      .order("id", { ascending: true });

    if (q2.error) {
      console.error("[sale_items] erro:", q1.error, q2.error);
      throw q2.error;
    }

    return (q2.data as SaleItem[]) || [];
  }, []);

  const toggleSaleItems = useCallback(
    async (sale: Sale) => {
      const saleId = isUuid(sale.reference) ? (sale.reference as string) : null;

      if (!saleId) {
        toast.error("Esta venda não tem sale_id (reference não é UUID).");
        return;
      }

      const opened = !!expanded[sale.id];
      if (opened) {
        setExpanded((prev) => ({ ...prev, [sale.id]: false }));
        return;
      }

      setExpanded((prev) => ({ ...prev, [sale.id]: true }));

      if (itemsCache[saleId]) return; // já em cache

      setItemsLoading((prev) => ({ ...prev, [saleId]: true }));
      try {
        const items = await fetchSaleItemsSafe(saleId);

        setItemsCache((prev) => ({
          ...prev,
          [saleId]: items,
        }));
      } catch (e) {
        console.error(e);
        toast.error("Erro ao buscar itens da venda.");
      } finally {
        setItemsLoading((prev) => ({ ...prev, [saleId]: false }));
      }
    },
    [expanded, itemsCache, fetchSaleItemsSafe]
  );

  const getItemName = (it: SaleItem) =>
    it?.products?.name ||
    it.product_name ||
    it.name ||
    it.product_id ||
    "Item";

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
        <Card className="sm:min-w-[560px]">
          <CardContent className="p-3 sm:p-4 space-y-2">
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
                    <SelectItem value="month">Por mês (seletor)</SelectItem>
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
                    const now = new Date();
                    const y = now.getFullYear();
                    const m = String(now.getMonth() + 1).padStart(2, "0");

                    setRange("month");
                    setMonthFilter(`${y}-${m}`);
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

            {/* ✅ seletor de mês (só aparece quando range=month) */}
            {range === "month" && (
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                <div className="sm:col-span-7">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      Mês:
                    </span>
                    <Input
                      type="month"
                      value={monthFilter}
                      onChange={(e) => {
                        setMonthFilter(e.target.value);
                        setFetchLimit(DEFAULT_FETCH_LIMIT);
                      }}
                      className="h-10"
                    />
                  </div>
                </div>
                <div className="sm:col-span-5 flex items-center">
                  <span className="text-xs text-muted-foreground">
                    *Ao trocar o mês, clique em atualizar (⟳) se quiser.
                  </span>
                </div>
              </div>
            )}

            {sellerFilter !== "all" && (
              <div className="text-xs text-muted-foreground">
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
              <span className="font-semibold">
                {formatCurrency(totalRevenue)}
              </span>
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
                    <div
                      key={stat.name}
                      className="rounded-xl border bg-muted/20 p-3"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-background">
                          {getRankIcon(index)}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-medium truncate">
                                {stat.name}
                              </div>
                              <div className="mt-1 flex flex-wrap gap-2">
                                <Pill className="bg-background">
                                  {stat.salesCount} vendas
                                </Pill>
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
                    <div
                      key={c.name}
                      className="rounded-xl border bg-muted/20 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{c.name}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            Última: {formatDate(c.lastPurchase)}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Pill className="bg-background">
                              {c.purchaseCount} compras
                            </Pill>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <Badge
                            variant="outline"
                            className={getClassificationBadge(
                              c.classification || "C"
                            )}
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
                              className={getClassificationBadge(
                                customer.classification || "C"
                              )}
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

      {/* ✅ VENDAS DO VENDEDOR (MÊS) + ITENS + COMISSÃO POR VENDA */}
      {sellerFilterKey !== "all" && (
        <Card className="overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              <CardTitle>Vendas do vendedor no mês</CardTitle>
            </div>
            <p className="text-sm text-muted-foreground">
              {sellerFilter} • {monthFilter}
            </p>
          </CardHeader>

          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <KpiCard
                title="Vendas no mês"
                value={`${sellerMonthTotals.count}`}
                sub="Quantidade de vendas filtradas"
              />
              <KpiCard
                title="Total vendido"
                value={formatCurrency(sellerMonthTotals.revenue)}
                accentClass="border-slate-500/20"
              />
              <KpiCard
                title="Comissão total"
                value={formatCurrency(sellerMonthTotals.comm)}
                accentClass="border-green-500/30 bg-green-500/5"
              />
            </div>

            {sellerMonthSales.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                Nenhuma venda encontrada para esse mês.
              </div>
            ) : (
              <>
                {/* ✅ MOBILE (SEM SCROLL LATERAL): cards */}
                <div className="space-y-2 sm:hidden">
                  {sellerMonthSales.map((s) => {
                    const saleId = isUuid(s.reference) ? (s.reference as string) : null;
                    const open = !!expanded[s.id];
                    const loadingIt = saleId ? !!itemsLoading[saleId] : false;
                    const items = saleId ? itemsCache[saleId] || [] : [];

                    return (
                      <div key={s.id} className="rounded-xl border bg-muted/20 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs text-muted-foreground">
                              {formatDate(s.created_at)}
                            </div>
                            <div className="mt-1 font-medium truncate">
                              {s.entity_name || "—"}
                            </div>

                            <div className="mt-2 flex flex-wrap gap-2">
                              <Pill className="bg-background">
                                Total:{" "}
                                <span className="ml-1 font-semibold">
                                  {formatCurrency(s.total_amount)}
                                </span>
                              </Pill>
                              <Pill className="bg-emerald-50 text-emerald-700 border-emerald-200">
                                Comissão:{" "}
                                <span className="ml-1 font-semibold">
                                  {formatCurrency(s.commission_value)}
                                </span>
                              </Pill>
                            </div>
                          </div>

                          <div className="shrink-0">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-9"
                              disabled={!saleId || loadingIt}
                              title={
                                !saleId
                                  ? "Sem sale_id (reference não é UUID)"
                                  : "Ver itens"
                              }
                              onClick={() => toggleSaleItems(s)}
                            >
                              {loadingIt ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <Package className="h-4 w-4 mr-2" />
                              )}
                              {open ? "Ocultar" : "Ver"}
                              <ChevronDown
                                className={clsx(
                                  "h-4 w-4 ml-2 transition-transform",
                                  open && "rotate-180"
                                )}
                              />
                            </Button>
                          </div>
                        </div>

                        {open && (
                          <div className="mt-3 rounded-lg border bg-background p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium">Itens da venda</p>
                              {!saleId ? (
                                <span className="text-xs text-muted-foreground">
                                  Sem vínculo (reference não é UUID)
                                </span>
                              ) : null}
                            </div>

                            {!saleId ? (
                              <p className="text-sm text-muted-foreground">
                                Não foi possível buscar itens dessa venda.
                              </p>
                            ) : loadingIt ? (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Carregando itens...
                              </div>
                            ) : items.length === 0 ? (
                              <p className="text-sm text-muted-foreground">
                                Nenhum item encontrado.
                              </p>
                            ) : (
                              <div className="grid gap-2">
                                {items.map((it) => (
                                  <div
                                    key={it.id}
                                    className="flex items-center justify-between gap-3 rounded-md border p-3"
                                  >
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium truncate">
                                        {getItemName(it)}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        Qtd:{" "}
                                        <span className="font-semibold text-foreground">
                                          {Number(it.quantity) || 0}
                                        </span>
                                        {typeof it.unit_price === "number" ? (
                                          <>
                                            {" "}
                                            • Un:{" "}
                                            <span className="font-semibold text-foreground">
                                              {formatCurrency(Number(it.unit_price))}
                                            </span>
                                          </>
                                        ) : null}
                                      </p>
                                    </div>

                                    {typeof it.total_price === "number" ? (
                                      <span className="text-sm font-semibold whitespace-nowrap">
                                        {formatCurrency(Number(it.total_price))}
                                      </span>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* ✅ DESKTOP: tabela normal */}
                <div className="hidden sm:block rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Comissão</TableHead>
                        <TableHead className="text-right w-[180px]">Itens</TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {sellerMonthSales.map((s) => {
                        const saleId = isUuid(s.reference) ? (s.reference as string) : null;
                        const open = !!expanded[s.id];
                        const loadingIt = saleId ? !!itemsLoading[saleId] : false;
                        const items = saleId ? itemsCache[saleId] || [] : [];

                        return (
                          <React.Fragment key={s.id}>
                            <TableRow>
                              <TableCell className="whitespace-nowrap">
                                {formatDate(s.created_at)}
                              </TableCell>

                              <TableCell
                                className="max-w-[320px] truncate"
                                title={s.entity_name}
                              >
                                {s.entity_name || "—"}
                              </TableCell>

                              <TableCell className="text-right font-mono font-semibold">
                                {formatCurrency(s.total_amount)}
                              </TableCell>

                              <TableCell className="text-right font-mono font-semibold text-emerald-700">
                                {formatCurrency(s.commission_value)}
                              </TableCell>

                              <TableCell className="text-right">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-9"
                                  disabled={!saleId || loadingIt}
                                  title={
                                    !saleId
                                      ? "Sem sale_id (reference não é UUID)"
                                      : "Ver itens"
                                  }
                                  onClick={() => toggleSaleItems(s)}
                                >
                                  {loadingIt ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  ) : (
                                    <Package className="h-4 w-4 mr-2" />
                                  )}
                                  {open ? "Ocultar" : "Ver"}
                                  <ChevronDown
                                    className={clsx(
                                      "h-4 w-4 ml-2 transition-transform",
                                      open && "rotate-180"
                                    )}
                                  />
                                </Button>
                              </TableCell>
                            </TableRow>

                            {open && (
                              <TableRow>
                                <TableCell colSpan={5} className="bg-muted/20">
                                  <div className="p-3 rounded-lg border bg-background space-y-2">
                                    <div className="flex items-center justify-between">
                                      <p className="text-sm font-medium">
                                        Itens da venda
                                      </p>
                                      {!saleId ? (
                                        <span className="text-xs text-muted-foreground">
                                          Sem vínculo com sale_items (reference não é UUID)
                                        </span>
                                      ) : null}
                                    </div>

                                    {!saleId ? (
                                      <p className="text-sm text-muted-foreground">
                                        Não foi possível buscar itens dessa venda.
                                      </p>
                                    ) : loadingIt ? (
                                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Carregando itens...
                                      </div>
                                    ) : items.length === 0 ? (
                                      <p className="text-sm text-muted-foreground">
                                        Nenhum item encontrado.
                                      </p>
                                    ) : (
                                      <div className="grid gap-2 sm:grid-cols-2">
                                        {items.map((it) => (
                                          <div
                                            key={it.id}
                                            className="flex items-center justify-between gap-3 rounded-md border p-3"
                                          >
                                            <div className="min-w-0">
                                              <p className="text-sm font-medium truncate">
                                                {getItemName(it)}
                                              </p>
                                              <p className="text-xs text-muted-foreground">
                                                Qtd:{" "}
                                                <span className="font-semibold text-foreground">
                                                  {Number(it.quantity) || 0}
                                                </span>
                                                {typeof it.unit_price === "number" ? (
                                                  <>
                                                    {" "}
                                                    • Un:{" "}
                                                    <span className="font-semibold text-foreground">
                                                      {formatCurrency(Number(it.unit_price))}
                                                    </span>
                                                  </>
                                                ) : null}
                                              </p>
                                            </div>

                                            {typeof it.total_price === "number" ? (
                                              <span className="text-sm font-semibold whitespace-nowrap">
                                                {formatCurrency(Number(it.total_price))}
                                              </span>
                                            ) : null}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

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
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={loadMoreFromDb}
          >
            Carregar mais histórico <ChevronDown className="h-4 w-4 ml-2" />
          </Button>
        )}
      </div>
    </div>
  );
}
