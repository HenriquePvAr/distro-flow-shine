"use client";

import { useEffect, useMemo, useState } from "react";
import {
  History,
  Search,
  Filter,
  MessageCircle,
  Calendar,
  Eye,
  XCircle,
  Package,
  User,
  CreditCard,
  Copy,
  Loader2,
  Hash,
  FileText,
  AlertTriangle,
  Download,
  RefreshCcw,
  Boxes,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Separator } from "@/components/ui/separator";
import {
  format,
  isWithinInterval,
  startOfDay,
  endOfDay,
  parseISO,
  isValid,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { DateRange } from "react-day-picker";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// =====================
// TIPAGEM
// =====================
type SaleStatus = "paid" | "cancelled" | "pending";

interface Sale {
  id: string;
  created_at: string;
  description: string;
  total_amount: number;
  status: SaleStatus;
  entity_name: string;

  // Virtuais extraídos
  seller_name?: string;
  payment_method?: string;
  items_count?: number;
}

type ParsedItem = {
  name: string;
  sku?: string;
  qty: number;
  unit?: string; // "un" | "kg" | etc
  price?: number; // unit price
  total?: number; // line total
};

const formatCurrency = (value: number) =>
  (value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const safeParseDate = (iso: string) => {
  try {
    const d = parseISO(iso);
    if (!isValid(d)) return null;
    return d;
  } catch {
    return null;
  }
};

const formatDate = (dateString: string) => {
  const d = safeParseDate(dateString);
  if (!d) return "-";
  return format(d, "dd/MM/yyyy");
};

const formatTime = (dateString: string) => {
  const d = safeParseDate(dateString);
  if (!d) return "-";
  return format(d, "HH:mm");
};

const copyToClipboard = async (text: string, okMsg = "Copiado!") => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(okMsg);
  } catch {
    toast.error("Não foi possível copiar.");
  }
};

const onlyDigits = (v: string) => (v || "").replace(/\D/g, "");

// =====================
// PARSERS (description)
// =====================
const parseFromDescription = (desc?: string) => {
  const d = desc || "";

  const seller =
    d.match(/Vend:\s*([^|\n]+)/i)?.[1]?.trim() ||
    d.match(/Vendedor:\s*([^|\n]+)/i)?.[1]?.trim() ||
    "";

  const payment =
    d.match(/Pgto:\s*([^|\n]+)/i)?.[1]?.trim() ||
    d.match(/Pagamento:\s*([^|\n]+)/i)?.[1]?.trim() ||
    "";

  const itemsCountRaw =
    d.match(/Itens:\s*(\d+)/i)?.[1] ||
    d.match(/Qtd\s*Itens:\s*(\d+)/i)?.[1] ||
    "";

  const items_count = itemsCountRaw ? Number(itemsCountRaw) : undefined;

  return {
    seller_name: seller || undefined,
    payment_method: payment || undefined,
    items_count: Number.isFinite(items_count as number) ? items_count : undefined,
  };
};

const extractItemsBlock = (desc: string) => {
  const d = desc || "";
  const idx = d.toLowerCase().indexOf("itens:");
  if (idx === -1) return "";
  const block = d.slice(idx);

  const cutAt =
    block.toLowerCase().indexOf("total:") !== -1
      ? block.toLowerCase().indexOf("total:")
      : block.toLowerCase().indexOf("pagamento:") !== -1
      ? block.toLowerCase().indexOf("pagamento:")
      : block.toLowerCase().indexOf("pgto:") !== -1
      ? block.toLowerCase().indexOf("pgto:")
      : -1;

  return cutAt > 0 ? block.slice(0, cutAt) : block;
};

const parseMoney = (v: string) => {
  const raw = (v || "").replace(/[^\d,.-]/g, "").trim();
  if (!raw) return undefined;

  const normalized =
    raw.includes(",") && raw.includes(".")
      ? raw.replace(/\./g, "").replace(",", ".")
      : raw.includes(",")
      ? raw.replace(",", ".")
      : raw;

  const n = Number(normalized);
  return Number.isFinite(n) ? n : undefined;
};

const parseItemsFromDescription = (desc: string): ParsedItem[] => {
  const block = extractItemsBlock(desc);
  if (!block) return [];

  const raw = block.replace(/Itens:\s*/i, "").trim();
  if (!raw) return [];

  const parts = raw
    .split(/\n|;/g)
    .map((p) => p.trim())
    .filter(Boolean);

  const items: ParsedItem[] = [];

  for (const p of parts) {
    const sku = p.match(/SKU:\s*([A-Za-z0-9_-]+)/i)?.[1]?.trim();
    const name =
      p.match(/Nome:\s*([^|]+)/i)?.[1]?.trim() ||
      p.match(/Produto:\s*([^|]+)/i)?.[1]?.trim() ||
      "";

    const qtyRaw =
      p.match(/Qtd:\s*([\d.,]+)/i)?.[1] || p.match(/x\s*([\d.,]+)/i)?.[1] || "";
    const qty = qtyRaw ? Number((qtyRaw || "0").replace(",", ".")) : NaN;

    const unit = p.match(/Un:\s*([A-Za-z]+)/i)?.[1]?.trim();
    const priceRaw =
      p.match(/Preço:\s*([^|]+)/i)?.[1] || p.match(/Unit:\s*([^|]+)/i)?.[1] || "";
    const price = priceRaw ? parseMoney(priceRaw) : undefined;

    const totalRaw = p.match(/Total:\s*([^|]+)/i)?.[1] || "";
    const total = totalRaw ? parseMoney(totalRaw) : undefined;

    const simpleSku = sku || p.match(/^([A-Za-z0-9_-]{3,})\s*-\s*/)?.[1]?.trim();
    const simpleName =
      name ||
      p.match(/-\s*(.*?)\s*(x|\(|$)/i)?.[1]?.trim() ||
      p.replace(/^[A-Za-z0-9_-]+\s*-\s*/i, "").trim();

    const simpleQty =
      Number.isFinite(qty)
        ? qty
        : (() => {
            const m = p.match(/x\s*([\d.,]+)/i)?.[1];
            if (!m) return NaN;
            const n = Number(m.replace(",", "."));
            return Number.isFinite(n) ? n : NaN;
          })();

    const simplePrice =
      price ??
      (() => {
        const m = p.match(/\(\s*(R\$)?\s*([\d.,]+)\s*\)/i)?.[2];
        return m ? parseMoney(m) : undefined;
      })();

    const finalQty = Number.isFinite(simpleQty) ? simpleQty : 1;

    if (!simpleName || simpleName.length < 2) continue;

    items.push({
      sku: simpleSku || undefined,
      name: simpleName,
      qty: finalQty,
      unit: unit || undefined,
      price: simplePrice,
      total,
    });
  }

  return items;
};

// =====================
// STATUS UI
// =====================
const statusLabel = (s: SaleStatus) => {
  if (s === "paid") return "Concluída";
  if (s === "cancelled") return "Cancelada";
  return "Pendente";
};

const statusBadge = (s: SaleStatus) => {
  if (s === "paid") {
    return (
      <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-200">
        Concluída
      </Badge>
    );
  }
  if (s === "cancelled") return <Badge variant="destructive">Cancelada</Badge>;
  return (
    <Badge variant="secondary" className="bg-amber-100 text-amber-800">
      Pendente
    </Badge>
  );
};

// =====================
// EXPORT (CSV/XLSX)
// =====================
const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const toCsv = (rows: Record<string, any>[]) => {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);

  const escape = (v: any) => {
    const s = String(v ?? "");
    if (s.includes('"') || s.includes(",") || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lines = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ];

  return lines.join("\n");
};

// =====================
// COMPONENTE
// =====================
export default function Historico() {
  const { isAdmin, profile } = useAuth();

  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | SaleStatus>("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelOperator, setCancelOperator] = useState(profile?.name || "");
  const [cancelling, setCancelling] = useState(false);

  const [restocking, setRestocking] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    fetchSales();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchSales = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("financial_entries")
        .select("*")
        .eq("type", "receivable")
        .ilike("reference", "PDV%")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const mapped: Sale[] = (data || []).map((row: any) => {
        const parsed = parseFromDescription(row.description);
        return {
          id: String(row.id),
          created_at: String(row.created_at || ""),
          description: String(row.description || ""),
          total_amount: Number(row.total_amount || 0),
          status: (row.status as SaleStatus) || "paid",
          entity_name: String(row.entity_name || "Cliente Avulso"),
          ...parsed,
        };
      });

      setSales(mapped);
    } catch (e) {
      console.error(e);
      toast.error("Erro ao carregar histórico de vendas.");
    } finally {
      setLoading(false);
    }
  };

  const filteredSales = useMemo(() => {
    const s = debouncedSearch;

    return sales.filter((sale) => {
      const matchesSearch =
        !s ||
        sale.id.toLowerCase().includes(s) ||
        (sale.entity_name || "").toLowerCase().includes(s) ||
        (sale.description || "").toLowerCase().includes(s) ||
        (sale.seller_name || "").toLowerCase().includes(s) ||
        (sale.payment_method || "").toLowerCase().includes(s);

      const matchesStatus = statusFilter === "all" ? true : sale.status === statusFilter;

      let matchesDate = true;
      if (dateRange?.from) {
        const saleDate = safeParseDate(sale.created_at);
        if (!saleDate) return false;
        const from = startOfDay(dateRange.from);
        const to = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from);
        matchesDate = isWithinInterval(saleDate, { start: from, end: to });
      }

      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [sales, debouncedSearch, statusFilter, dateRange]);

  const paidSales = useMemo(
    () => filteredSales.filter((s) => s.status === "paid"),
    [filteredSales]
  );

  const totalRevenue = useMemo(
    () => paidSales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0),
    [paidSales]
  );

  const cancelledCount = useMemo(
    () => filteredSales.filter((s) => s.status === "cancelled").length,
    [filteredSales]
  );

  const pendingCount = useMemo(
    () => filteredSales.filter((s) => s.status === "pending").length,
    [filteredSales]
  );

  const ticketAvg = paidSales.length > 0 ? totalRevenue / paidSales.length : 0;

  const hasActiveFilters = !!debouncedSearch || statusFilter !== "all" || !!dateRange;

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setDateRange(undefined);
  };

  const openSaleDetails = (sale: Sale) => {
    setSelectedSale(sale);
    setIsSheetOpen(true);
  };

  const openCancelDialog = () => {
    if (!selectedSale) return;
    if (selectedSale.status === "cancelled") return toast.info("Essa venda já está cancelada.");
    setCancelReason("");
    setCancelOperator(profile?.name || "");
    setIsCancelDialogOpen(true);
  };

  const handleCancelSale = async () => {
    if (!selectedSale) return;

    if (!cancelReason.trim() || !cancelOperator.trim()) {
      toast.error("Preencha o motivo e o operador.");
      return;
    }

    setCancelling(true);
    try {
      const appended = `\n[CANCELADO por ${cancelOperator.trim()}: ${cancelReason.trim()}]`;

      const { error } = await supabase
        .from("financial_entries")
        .update({
          status: "cancelled",
          description: `${selectedSale.description}${appended}`,
        })
        .eq("id", selectedSale.id);

      if (error) throw error;

      toast.success("Venda cancelada!");
      setIsCancelDialogOpen(false);
      setIsSheetOpen(false);
      setSelectedSale(null);
      await fetchSales();
    } catch (e: any) {
      console.error(e);
      toast.error("Erro ao cancelar", { description: e?.message || "" });
    } finally {
      setCancelling(false);
    }
  };

  const handleSendWhatsApp = async (sale: Sale) => {
    try {
      const customerName = (sale.entity_name || "").trim();
      if (!customerName) return toast.error("Cliente inválido.");

      const { data, error } = await supabase
        .from("customers")
        .select("phone")
        .eq("name", customerName)
        .maybeSingle();

      if (error) throw error;

      const phone = onlyDigits(data?.phone || "");
      if (!phone || phone.length < 10) {
        toast.info("Cliente sem WhatsApp cadastrado.");
        return;
      }

      const msg = encodeURIComponent(
        `Olá ${customerName}! Segue o resumo da sua compra:\n\n${sale.description}\n\nTotal: ${formatCurrency(
          sale.total_amount
        )}`
      );

      window.open(`https://wa.me/55${phone}?text=${msg}`, "_blank");
    } catch (e: any) {
      console.error(e);
      toast.error("Não foi possível abrir WhatsApp", { description: e?.message || "" });
    }
  };

  const buildExportRows = () => {
    return filteredSales.map((s) => ({
      id: s.id,
      data: formatDate(s.created_at),
      hora: formatTime(s.created_at),
      cliente: s.entity_name,
      vendedor: s.seller_name || "",
      pagamento: s.payment_method || "",
      status: s.status,
      total: s.total_amount,
      descricao: s.description,
    }));
  };

  const handleExportCSV = () => {
    const rows = buildExportRows();
    if (!rows.length) return toast.info("Nada para exportar.");
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const filename = `historico_vendas_${Date.now()}.csv`;
    downloadBlob(blob, filename);
    toast.success("CSV gerado!");
  };

  const handleExportXLSX = async () => {
    const rows = buildExportRows();
    if (!rows.length) return toast.info("Nada para exportar.");

    try {
      const XLSX = await import("xlsx");

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Historico");

      const ab = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([ab], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const filename = `historico_vendas_${Date.now()}.xlsx`;
      downloadBlob(blob, filename);
      toast.success("XLSX gerado!");
    } catch (e) {
      toast.error("Para exportar XLSX, instale: npm i xlsx (CSV funciona sem instalar).");
    }
  };

  const itemsFromSelected = useMemo(() => {
    if (!selectedSale?.description) return [];
    return parseItemsFromDescription(selectedSale.description);
  }, [selectedSale]);

  const canRestock = useMemo(() => {
    if (!itemsFromSelected.length) return false;
    return itemsFromSelected.some((i) => i.sku && Number.isFinite(i.qty) && i.qty > 0);
  }, [itemsFromSelected]);

  const handleRestock = async () => {
    if (!selectedSale) return;

    if (!isAdmin) {
      toast.error("Apenas admin pode estornar estoque.");
      return;
    }

    if (!canRestock) {
      toast.error("Não dá pra estornar: itens sem SKU/QTD na descrição.");
      return;
    }

    setRestocking(true);
    try {
      if (selectedSale.status !== "cancelled") {
        toast.error("Primeiro cancele a venda para estornar o estoque.");
        return;
      }

      const lines = itemsFromSelected.filter((i) => i.sku && i.qty > 0);

      for (const line of lines) {
        const sku = String(line.sku);
        const qty = Number(line.qty);

        const { data: prod, error: e1 } = await supabase
          .from("products")
          .select("id, stock")
          .eq("sku", sku)
          .maybeSingle();

        if (e1) throw e1;

        if (!prod?.id) {
          toast.warning(`SKU não encontrado: ${sku}. Pulei esse item.`);
          continue;
        }

        const current = Number(prod.stock || 0);
        const newStock = current + qty;

        const { error: e2 } = await supabase
          .from("products")
          .update({ stock: newStock })
          .eq("id", prod.id);

        if (e2) throw e2;
      }

      toast.success("Estorno de estoque concluído!");
    } catch (e: any) {
      console.error(e);
      toast.error("Erro ao estornar estoque", { description: e?.message || "" });
    } finally {
      setRestocking(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <History className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Histórico de Vendas</h1>
            <p className="text-sm text-muted-foreground">
              Registro de vendas do PDV (filtros, export e ações)
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={fetchSales}
            className="w-full sm:w-auto"
            disabled={loading}
            title="Atualizar"
          >
            <RefreshCcw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button className="w-full sm:w-auto" variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Exportar
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 space-y-2">
              <Button variant="outline" className="w-full justify-start" onClick={handleExportCSV}>
                <FileText className="h-4 w-4 mr-2" />
                Exportar CSV
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={handleExportXLSX}>
                <FileText className="h-4 w-4 mr-2" />
                Exportar XLSX
              </Button>
              <p className="text-xs text-muted-foreground">
                XLSX precisa de <span className="font-mono">npm i xlsx</span>. CSV funciona sempre.
              </p>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Vendas Exibidas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{filteredSales.length}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Pagas: <span className="font-semibold">{paidSales.length}</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Faturamento (Pagas)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">{formatCurrency(totalRevenue)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Ticket Médio (Pagas)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(ticketAvg)}</p>
          </CardContent>
        </Card>

        <Card className={cancelledCount > 0 ? "border-destructive/30 bg-destructive/5" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-destructive">Canceladas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-2xl font-bold text-destructive">{cancelledCount}</p>
            {pendingCount > 0 && (
              <p className="text-xs text-muted-foreground">
                Pendentes: <span className="font-semibold">{pendingCount}</span>
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="rounded-xl border border-border bg-card shadow-sm p-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="relative flex-1 min-w-[220px]">
            <Label className="mb-1 block text-xs">Busca</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="ID, cliente, vendedor, pagamento..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-xs">Período</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[240px] justify-start text-left font-normal",
                    !dateRange && "text-muted-foreground"
                  )}
                >
                  <Calendar className="mr-2 h-4 w-4" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, "dd/MM", { locale: ptBR })} -{" "}
                        {format(dateRange.to, "dd/MM", { locale: ptBR })}
                      </>
                    ) : (
                      format(dateRange.from, "dd/MM/yyyy", { locale: ptBR })
                    )
                  ) : (
                    "Filtrar por data"
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="range"
                  selected={dateRange}
                  onSelect={setDateRange}
                  numberOfMonths={2}
                  initialFocus
                  className="p-3"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-xs">Status</Label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger className="w-[170px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="paid">Concluídas</SelectItem>
                <SelectItem value="pending">Pendentes</SelectItem>
                <SelectItem value="cancelled">Canceladas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {hasActiveFilters && (
            <Button variant="ghost" onClick={clearFilters} className="mb-0.5">
              Limpar
            </Button>
          )}
        </div>
      </div>

      {/* Tabela */}
      <div className="rounded-md border overflow-hidden">
        {loading ? (
          <div className="flex justify-center items-center h-40">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredSales.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            Nenhuma venda encontrada com esses filtros.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Data</TableHead>
                <TableHead>Hora</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-center">Ações</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {filteredSales.map((sale) => (
                <TableRow
                  key={sale.id}
                  className="hover:bg-muted/30 cursor-pointer"
                  onClick={() => openSaleDetails(sale)}
                >
                  <TableCell>{formatDate(sale.created_at)}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {formatTime(sale.created_at)}
                  </TableCell>
                  <TableCell className="font-medium">{sale.entity_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {sale.seller_name || "-"}
                  </TableCell>
                  <TableCell className="text-center">{statusBadge(sale.status)}</TableCell>
                  <TableCell className="text-right font-bold">
                    {formatCurrency(sale.total_amount)}
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        openSaleDetails(sale);
                      }}
                      title="Ver detalhes"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Sheet Detalhes */}
      <Sheet
        open={isSheetOpen}
        onOpenChange={(open) => {
          setIsSheetOpen(open);
          if (!open) setSelectedSale(null);
        }}
      >
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selectedSale && (
            <>
              <SheetHeader>
                <SheetTitle>Detalhes da Venda</SheetTitle>
                <SheetDescription>
                  {formatDate(selectedSale.created_at)} às {formatTime(selectedSale.created_at)} •{" "}
                  <span className="font-semibold">{statusLabel(selectedSale.status)}</span>
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                <div className="p-4 bg-muted/30 rounded-lg border space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-sm">Status</span>
                    {statusBadge(selectedSale.status)}
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-sm flex items-center gap-2">
                      <User className="h-4 w-4" /> Cliente
                    </span>
                    <span className="font-medium text-right">{selectedSale.entity_name}</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-sm flex items-center gap-2">
                      <Hash className="h-4 w-4" /> ID
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs">{selectedSale.id}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => copyToClipboard(selectedSale.id, "ID copiado!")}
                        title="Copiar ID"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-sm flex items-center gap-2">
                      <Package className="h-4 w-4" /> Itens (qtd)
                    </span>

                    {/* ✅ CORRIGIDO: parênteses ao misturar ?? e || */}
                    <span className="font-medium">
                      {((selectedSale.items_count ?? itemsFromSelected.length) || "-")}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-sm flex items-center gap-2">
                      <User className="h-4 w-4" /> Vendedor
                    </span>
                    <span className="font-medium">{selectedSale.seller_name ?? "-"}</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-sm flex items-center gap-2">
                      <CreditCard className="h-4 w-4" /> Pagamento
                    </span>
                    <span className="font-medium">{selectedSale.payment_method ?? "-"}</span>
                  </div>

                  <Separator />

                  <div className="flex justify-between items-center">
                    <span className="text-lg font-bold">Total</span>
                    <span className="text-xl font-bold text-emerald-600">
                      {formatCurrency(selectedSale.total_amount)}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <Boxes className="h-4 w-4" /> Itens (lidos da descrição)
                  </h3>

                  {itemsFromSelected.length === 0 ? (
                    <div className="p-3 border rounded bg-card text-sm text-muted-foreground">
                      Não consegui identificar os itens na <strong>description</strong>.
                      <br />
                      Se você quiser, me manda um exemplo real da string da venda que eu ajusto o parser pra ficar 100%.
                    </div>
                  ) : (
                    <div className="rounded-md border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead>SKU</TableHead>
                            <TableHead>Produto</TableHead>
                            <TableHead className="text-right">Qtd</TableHead>
                            <TableHead className="text-right">Preço</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {itemsFromSelected.slice(0, 30).map((it, idx) => {
                            const lineTotal =
                              it.total ??
                              (it.price && Number.isFinite(it.qty) ? it.price * it.qty : undefined);

                            return (
                              <TableRow key={idx}>
                                <TableCell className="font-mono text-xs">{it.sku || "-"}</TableCell>
                                <TableCell className="font-medium">{it.name}</TableCell>
                                <TableCell className="text-right">
                                  {it.qty} {it.unit || ""}
                                </TableCell>
                                <TableCell className="text-right">
                                  {it.price != null ? formatCurrency(it.price) : "-"}
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                  {lineTotal != null ? formatCurrency(lineTotal) : "-"}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>

                      {itemsFromSelected.length > 30 && (
                        <div className="p-2 text-xs text-muted-foreground">
                          Mostrando 30 de {itemsFromSelected.length}.
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4" /> Descrição / Resumo
                  </h3>
                  <div className="p-3 bg-card border rounded text-sm text-muted-foreground whitespace-pre-wrap">
                    {selectedSale.description}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(selectedSale.description, "Resumo copiado!")}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Copiar resumo
                    </Button>

                    <Button variant="outline" size="sm" onClick={() => handleSendWhatsApp(selectedSale)}>
                      <MessageCircle className="h-4 w-4 mr-2" />
                      Enviar WhatsApp
                    </Button>
                  </div>
                </div>

                {isAdmin && (
                  <div className="space-y-3">
                    <Separator />
                    <div className="space-y-2">
                      <h3 className="font-semibold text-sm flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" /> Ações de Admin
                      </h3>

                      {selectedSale.status !== "cancelled" ? (
                        <Button variant="destructive" onClick={openCancelDialog} className="w-full">
                          <XCircle className="h-4 w-4 mr-2" /> Cancelar Venda
                        </Button>
                      ) : (
                        <div className="p-3 border rounded bg-destructive/5 text-sm text-muted-foreground">
                          Venda já está <strong>cancelada</strong>.
                        </div>
                      )}

                      <Button
                        variant="outline"
                        className="w-full"
                        disabled={!canRestock || restocking || selectedSale.status !== "cancelled"}
                        onClick={handleRestock}
                        title={
                          selectedSale.status !== "cancelled"
                            ? "Cancele a venda antes de estornar"
                            : !canRestock
                            ? "Precisa SKU + QTD na descrição"
                            : "Estornar estoque"
                        }
                      >
                        {restocking ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Estornando...
                          </>
                        ) : (
                          <>
                            <Boxes className="h-4 w-4 mr-2" />
                            Estornar estoque
                          </>
                        )}
                      </Button>

                      <p className="text-xs text-muted-foreground flex gap-2">
                        <AlertTriangle className="h-4 w-4" />
                        Estorno só funciona se os itens tiverem <strong>SKU</strong> e <strong>Qtd</strong> na descrição.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar Venda?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso muda o status no financeiro para <strong>cancelled</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Operador Responsável</Label>
              <Input value={cancelOperator} onChange={(e) => setCancelOperator(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Motivo</Label>
              <Textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Ex: Cliente desistiu, erro de lançamento..."
              />
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelSale}
              disabled={cancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelling ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Cancelando...
                </>
              ) : (
                "Confirmar Cancelamento"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
