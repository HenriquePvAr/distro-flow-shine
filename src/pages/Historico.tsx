"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Search,
  Trash2,
  XCircle,
  RefreshCcw,
  Receipt,
  Package,
  ShieldCheck,
  Calendar as CalendarIcon,
  User,
  Info,
  ShoppingBasket,
  BadgePercent,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type AuditLog = {
  id: string;
  actor_user_id: string | null;
  actor_name: string | null;

  event_type: string; // sale_created, sale_cancelled, stock_...
  entity_type: string; // sale, product...
  entity_id: string | null;

  title: string;
  description: string | null;
  amount: number | null;

  metadata: any;
  created_at: string;

  is_deleted: boolean;
};

type Sale = {
  id: string;
  customer_id: string | null;

  // operador do sistema (quem clicou e registrou)
  user_id: string | null;

  // vendedor da venda (quem recebe comissão)
  seller_id: string | null;

  total_amount: number | null;

  // comissão (por venda)
  commission_rate: number | null; // ex: 5 (%)
  commission_value: number | null; // ex: 12.50

  status: string | null;
  payment_method: string | null;
  created_at: string | null;
};

type Customer = { id: string; name: string };
type Profile = { id: string; name: string | null };

type SaleItem = {
  id: string;
  sale_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
};

type Product = { id: string; name: string };

type SaleItemView = {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
};

type ChipFilter = "all" | "sales" | "cancelled" | "stock";
type DateFilter = "7d" | "30d" | "this-month" | "this-year" | "all";

function formatCurrency(v: number) {
  return (v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR");
}

function isWithinDays(iso: string, days: number) {
  const now = new Date();
  const min = new Date(now);
  min.setDate(min.getDate() - days);
  return new Date(iso) >= min;
}

function getMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end };
}

function getYearRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const end = new Date(now.getFullYear() + 1, 0, 1);
  return { start, end };
}

function getIcon(eventType: string) {
  if (eventType.startsWith("sale")) return <Receipt className="h-4 w-4" />;
  if (eventType.startsWith("stock")) return <Package className="h-4 w-4" />;
  return <ShieldCheck className="h-4 w-4" />;
}

function badgeFor(eventType: string) {
  if (eventType === "sale_cancelled") {
    return (
      <Badge variant="destructive" className="text-[10px] px-2 py-0.5">
        Cancelada
      </Badge>
    );
  }
  if (eventType === "sale_created") {
    return <Badge className="text-[10px] px-2 py-0.5">Venda</Badge>;
  }
  if (eventType.startsWith("stock")) {
    return (
      <Badge variant="secondary" className="text-[10px] px-2 py-0.5">
        Estoque
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] px-2 py-0.5">
      Evento
    </Badge>
  );
}

export default function Historico() {
  const [loading, setLoading] = useState(true);

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [salesById, setSalesById] = useState<Record<string, Sale>>({});
  const [customersById, setCustomersById] = useState<Record<string, Customer>>(
    {}
  );
  const [profilesById, setProfilesById] = useState<Record<string, Profile>>({});

  const [search, setSearch] = useState("");
  const [chip, setChip] = useState<ChipFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("30d");

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMode, setConfirmMode] = useState<"cancel" | "delete">("cancel");
  const [selected, setSelected] = useState<AuditLog | null>(null);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsLog, setDetailsLog] = useState<AuditLog | null>(null);

  // itens da venda no modal
  const [detailsItemsLoading, setDetailsItemsLoading] = useState(false);
  const [detailsItems, setDetailsItems] = useState<SaleItemView[]>([]);

  const fetchData = async () => {
    setLoading(true);

    // 1) logs
    const { data: logsData, error: logsErr } = await supabase
      .from("audit_logs")
      .select("*")
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(500);

    if (logsErr) {
      toast.error("Erro ao carregar histórico.");
      setLoading(false);
      return;
    }

    const L = (logsData || []) as AuditLog[];
    setLogs(L);

    // 2) sales ids (pega entity_id e também metadata.sale_id)
    const saleIds = Array.from(
      new Set(
        L.filter((l) => l.entity_type === "sale")
          .map((l) => (l.entity_id || l.metadata?.sale_id) as string)
          .filter(Boolean)
      )
    );

    // 3) fetch sales
    let sales: Sale[] = [];
    if (saleIds.length) {
      const { data: salesData, error: salesErr } = await supabase
        .from("sales")
        .select(
          "id, customer_id, user_id, seller_id, total_amount, commission_rate, commission_value, status, payment_method, created_at"
        )
        .in("id", saleIds);

      if (salesErr) {
        toast.error(
          "Erro ao carregar vendas relacionadas. (confere se sales tem seller_id/commission_*)"
        );
        setLoading(false);
        return;
      }

      sales = (salesData || []) as Sale[];
    }

    const sMap: Record<string, Sale> = {};
    for (const s of sales) sMap[s.id] = s;
    setSalesById(sMap);

    // 4) customers ids (de sales)
    const customerIds = Array.from(
      new Set(
        sales.map((s) => s.customer_id).filter((id): id is string => Boolean(id))
      )
    );

    // 5) users ids (de sales) -> operador + vendedor
    const userIds = Array.from(
      new Set(
        sales
          .flatMap((s) => [s.user_id, s.seller_id])
          .filter((id): id is string => Boolean(id))
      )
    );

    // 6) fetch customers
    if (customerIds.length) {
      const { data: custData, error: custErr } = await supabase
        .from("customers")
        .select("id, name")
        .in("id", customerIds);

      if (custErr) {
        toast.error("Erro ao carregar clientes.");
        setLoading(false);
        return;
      }

      const cMap: Record<string, Customer> = {};
      for (const c of (custData || []) as Customer[]) cMap[c.id] = c;
      setCustomersById(cMap);
    } else {
      setCustomersById({});
    }

    // 7) fetch profiles (operador + vendedor)
    if (userIds.length) {
      const { data: profData, error: profErr } = await supabase
        .from("profiles")
        .select("id, name")
        .in("id", userIds);

      if (profErr) {
        toast.error("Erro ao carregar operadores/vendedores.");
        setLoading(false);
        return;
      }

      const pMap: Record<string, Profile> = {};
      for (const p of (profData || []) as Profile[]) pMap[p.id] = p;
      setProfilesById(pMap);
    } else {
      setProfilesById({});
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();

    const byChip = (l: AuditLog) => {
      if (chip === "all") return true;
      if (chip === "sales") return l.event_type.startsWith("sale");
      if (chip === "cancelled") return l.event_type === "sale_cancelled";
      if (chip === "stock") return l.event_type.startsWith("stock");
      return true;
    };

    const byDate = (l: AuditLog) => {
      if (dateFilter === "all") return true;
      if (dateFilter === "7d") return isWithinDays(l.created_at, 7);
      if (dateFilter === "30d") return isWithinDays(l.created_at, 30);

      const d = new Date(l.created_at);
      if (dateFilter === "this-month") {
        const { start, end } = getMonthRange();
        return d >= start && d < end;
      }
      if (dateFilter === "this-year") {
        const { start, end } = getYearRange();
        return d >= start && d < end;
      }
      return true;
    };

    const bySearch = (l: AuditLog) => {
      if (!s) return true;

      const saleId = (l.entity_id || l.metadata?.sale_id) as string | undefined;
      const sale = saleId ? salesById[saleId] : undefined;

      const customerName =
        sale?.customer_id ? customersById[sale.customer_id]?.name : undefined;

      const operatorName =
        sale?.user_id ? profilesById[sale.user_id]?.name : undefined;

      const sellerName =
        sale?.seller_id ? profilesById[sale.seller_id]?.name : undefined;

      const commissionValue = sale?.commission_value ?? undefined;

      const hay = [
        l.title,
        l.description ?? "",
        l.event_type,
        l.entity_type,
        l.actor_name ?? "",
        customerName ?? "",
        operatorName ?? "",
        sellerName ?? "",
        sale?.payment_method ?? "",
        String(l.amount ?? ""),
        String(commissionValue ?? ""),
        JSON.stringify(l.metadata ?? {}),
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(s);
    };

    return logs.filter((l) => byChip(l) && byDate(l) && bySearch(l));
  }, [logs, chip, dateFilter, search, salesById, customersById, profilesById]);

  const openCancel = (log: AuditLog) => {
    setSelected(log);
    setConfirmMode("cancel");
    setConfirmOpen(true);
  };

  const openDelete = (log: AuditLog) => {
    setSelected(log);
    setConfirmMode("delete");
    setConfirmOpen(true);
  };

  const runConfirm = async () => {
    if (!selected) return;

    try {
      if (confirmMode === "cancel") {
        const saleId = (selected.entity_id ||
          selected.metadata?.sale_id) as string | undefined;
        if (!saleId) throw new Error("Não achei o ID da venda para cancelar.");

        const { error } = await supabase.rpc("cancel_sale", { p_sale_id: saleId });
        if (error) throw new Error(error.message);

        toast.success("Venda cancelada e estoque reposto!");
      } else {
        const { data: userRes } = await supabase.auth.getUser();
        const uid = userRes?.user?.id ?? null;

        const { error } = await supabase
          .from("audit_logs")
          .update({
            is_deleted: true,
            deleted_at: new Date().toISOString(),
            deleted_by: uid,
          })
          .eq("id", selected.id);

        if (error) throw new Error(error.message);

        toast.success("Removido do histórico!");
      }

      setConfirmOpen(false);
      setSelected(null);
      await fetchData();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao executar ação.");
    }
  };

  // helpers
  const getSaleInfo = (log: AuditLog) => {
    const saleId = (log.entity_id || log.metadata?.sale_id) as string | undefined;
    const sale = saleId ? salesById[saleId] : undefined;

    const customerName =
      sale?.customer_id ? customersById[sale.customer_id]?.name : null;

    const operatorName =
      sale?.user_id ? profilesById[sale.user_id]?.name : null;

    const sellerName =
      sale?.seller_id ? profilesById[sale.seller_id]?.name : null;

    const commissionValue = Number(sale?.commission_value || 0);
    const commissionRate =
      sale?.commission_rate != null ? Number(sale.commission_rate) : null;

    return {
      saleId,
      sale,
      customerName,
      operatorName,
      sellerName,
      commissionValue,
      commissionRate,
    };
  };

  const loadSaleItemsForDetails = async (saleId: string) => {
    setDetailsItemsLoading(true);
    setDetailsItems([]);

    try {
      const { data: itemsData, error: itemsErr } = await supabase
        .from("sale_items")
        .select("id, sale_id, product_id, quantity, unit_price, total_price")
        .eq("sale_id", saleId);

      if (itemsErr) throw new Error(itemsErr.message);

      const items = (itemsData || []) as SaleItem[];

      const productIds = Array.from(
        new Set(items.map((i) => i.product_id).filter(Boolean))
      );

      let productsMap: Record<string, string> = {};
      if (productIds.length) {
        const { data: prodData, error: prodErr } = await supabase
          .from("products")
          .select("id, name")
          .in("id", productIds);

        if (prodErr) throw new Error(prodErr.message);

        for (const p of (prodData || []) as Product[]) {
          productsMap[p.id] = p.name;
        }
      }

      const view: SaleItemView[] = items.map((i) => ({
        id: i.id,
        product_id: i.product_id,
        product_name: productsMap[i.product_id] || "Produto",
        quantity: Number(i.quantity || 0),
        unit_price: Number(i.unit_price || 0),
        total_price: Number(i.total_price || 0),
      }));

      view.sort((a, b) => a.product_name.localeCompare(b.product_name));

      setDetailsItems(view);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao carregar itens da venda.");
    } finally {
      setDetailsItemsLoading(false);
    }
  };

  const openDetails = async (log: AuditLog) => {
    setDetailsLog(log);
    setDetailsOpen(true);

    const saleId = (log.entity_id || log.metadata?.sale_id) as string | undefined;
    if (saleId) {
      await loadSaleItemsForDetails(saleId);
    } else {
      setDetailsItems([]);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto px-3 sm:px-6 py-4 overflow-x-hidden">
      {/* TOP BAR */}
      <div className="flex items-center justify-between gap-2 mb-3 min-w-0">
        <h1 className="text-base font-semibold flex items-center gap-2 min-w-0">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <span className="truncate">Histórico</span>
        </h1>

        <Button
          variant="outline"
          size="sm"
          className="h-9 rounded-full shrink-0"
          onClick={fetchData}
        >
          <RefreshCcw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* BUSCA */}
      <div className="relative w-full mb-2">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar (cliente, vendedor, operador, comissão, valor...)"
          className="pl-9 h-10 rounded-full w-full"
        />
      </div>

      {/* FILTERS */}
      <div className="flex gap-2 mb-2">
        <Select value={dateFilter} onValueChange={(v: any) => setDateFilter(v)}>
          <SelectTrigger className="h-10 rounded-full flex-1 min-w-0">
            <CalendarIcon className="h-4 w-4 mr-2 text-muted-foreground shrink-0" />
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent align="start">
            <SelectItem value="7d">Últimos 7 dias</SelectItem>
            <SelectItem value="30d">Últimos 30 dias</SelectItem>
            <SelectItem value="this-month">Este mês</SelectItem>
            <SelectItem value="this-year">Este ano</SelectItem>
            <SelectItem value="all">Tudo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* CHIPS */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar mb-3">
        {[
          { v: "all", label: "Tudo" },
          { v: "sales", label: "Vendas" },
          { v: "cancelled", label: "Canceladas" },
          { v: "stock", label: "Estoque" },
        ].map((c) => (
          <button
            key={c.v}
            type="button"
            onClick={() => setChip(c.v as ChipFilter)}
            className={[
              "px-3 py-1.5 rounded-full text-[11px] border whitespace-nowrap",
              "active:scale-[0.97] transition-transform",
              chip === c.v
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-200",
            ].join(" ")}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* LIST */}
      {loading ? (
        <div className="text-center py-10 text-muted-foreground text-sm">
          Carregando...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm">
          Nenhum registro encontrado.
        </div>
      ) : (
        <div className="space-y-2 pb-24">
          {filtered.map((log) => {
            const { saleId, sale, customerName, operatorName } = getSaleInfo(log);

            const canCancel =
              log.event_type === "sale_created" &&
              !!saleId &&
              (sale?.status ?? "") !== "cancelled";

            const isCancelled =
              log.event_type === "sale_cancelled" ||
              (sale?.status ?? "") === "cancelled";

            return (
              <Card
                key={log.id}
                className="border-none shadow-sm rounded-2xl overflow-hidden"
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-3 min-w-0">
                    {/* LEFT */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-slate-700 shrink-0">
                          {getIcon(log.event_type)}
                        </span>
                        <p className="font-medium text-sm truncate">
                          {log.title || "Registro"}
                        </p>
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <CalendarIcon className="h-3.5 w-3.5" />
                          {formatDateTime(log.created_at)}
                        </span>

                        {customerName && (
                          <span className="flex items-center gap-1 truncate max-w-[240px]">
                            <Receipt className="h-3.5 w-3.5" />
                            {customerName}
                          </span>
                        )}

                        {operatorName && (
                          <span className="flex items-center gap-1 truncate max-w-[240px]">
                            <User className="h-3.5 w-3.5" />
                            Operador: {operatorName}
                          </span>
                        )}
                      </div>

                      {log.amount != null && (
                        <p className="mt-1 font-bold text-sm text-slate-900">
                          {formatCurrency(Number(log.amount))}
                        </p>
                      )}

                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        {badgeFor(log.event_type)}
                        {isCancelled && (
                          <Badge
                            variant="destructive"
                            className="text-[10px] px-2 py-0.5"
                          >
                            Cancelada
                          </Badge>
                        )}
                        {sale?.payment_method && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-2 py-0.5"
                          >
                            {sale.payment_method.toUpperCase()}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* RIGHT actions */}
                    <div className="flex flex-col gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 rounded-full px-3"
                        onClick={() => openDetails(log)}
                      >
                        <Info className="h-4 w-4 mr-2" />
                        Ver
                      </Button>

                      {canCancel && (
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-9 rounded-full px-3"
                          onClick={() => openCancel(log)}
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Cancelar
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 rounded-full px-3"
                        onClick={() => openDelete(log)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Apagar
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* CONFIRM DIALOG */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm w-[92vw] rounded-2xl p-4">
          <DialogHeader>
            <DialogTitle className="text-base">
              {confirmMode === "cancel" ? "Cancelar venda?" : "Apagar do histórico?"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {confirmMode === "cancel"
                ? "Isso vai marcar a venda como cancelada e repor o estoque automaticamente."
                : "Isso remove o registro apenas do histórico (soft delete)."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2 mt-3">
            <Button
              variant="outline"
              className="flex-1 h-10 rounded-full"
              onClick={() => setConfirmOpen(false)}
            >
              Voltar
            </Button>
            <Button
              variant={confirmMode === "cancel" ? "destructive" : "default"}
              className="flex-1 h-10 rounded-full"
              onClick={runConfirm}
            >
              Confirmar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* DETAILS DIALOG */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-sm w-[92vw] rounded-2xl p-4">
          <DialogHeader>
            <DialogTitle className="text-base">Detalhes</DialogTitle>
            <DialogDescription className="text-xs">
              Venda completa + itens.
            </DialogDescription>
          </DialogHeader>

          {detailsLog ? (
            <div className="space-y-3 pt-2 text-sm">
              {(() => {
                const {
                  saleId,
                  sale,
                  customerName,
                  operatorName,
                  sellerName,
                  commissionValue,
                  commissionRate,
                } = getSaleInfo(detailsLog);

                const showCommission = commissionValue > 0;

                return (
                  <>
                    <div className="rounded-xl border bg-slate-50 p-3">
                      <div className="flex items-center gap-2 text-slate-700">
                        {getIcon(detailsLog.event_type)}
                        <span className="font-semibold">{detailsLog.title}</span>
                      </div>

                      <div className="mt-2 text-[12px] text-muted-foreground space-y-1">
                        <div>
                          <strong>Data:</strong> {formatDateTime(detailsLog.created_at)}
                        </div>
                        <div>
                          <strong>Tipo:</strong> {detailsLog.event_type}
                        </div>
                        {detailsLog.amount != null && (
                          <div>
                            <strong>Valor:</strong>{" "}
                            {formatCurrency(Number(detailsLog.amount))}
                          </div>
                        )}
                      </div>
                    </div>

                    {saleId && (
                      <div className="rounded-xl border p-3">
                        <p className="font-semibold mb-2">Venda</p>

                        <div className="text-[12px] text-muted-foreground space-y-1">
                          <div className="break-all">
                            <strong>ID:</strong> {saleId}
                          </div>
                          <div>
                            <strong>Status:</strong> {sale?.status || "—"}
                          </div>
                          <div>
                            <strong>Pagamento:</strong> {sale?.payment_method || "—"}
                          </div>
                          <div>
                            <strong>Cliente:</strong> {customerName || "—"}
                          </div>
                          <div>
                            <strong>Vendedor:</strong> {sellerName || "—"}
                          </div>
                          <div>
                            <strong>Operador:</strong> {operatorName || "—"}
                          </div>

                          <div className="pt-2">
                            <strong>Comissão:</strong>{" "}
                            {showCommission
                              ? `${formatCurrency(commissionValue)}${
                                  commissionRate != null ? ` (${commissionRate}%)` : ""
                                }`
                              : "—"}
                          </div>

                          {showCommission && (
                            <div className="mt-2">
                              <Badge
                                variant="outline"
                                className="text-[10px] px-2 py-0.5"
                              >
                                <BadgePercent className="h-3 w-3 mr-1" />
                                Comissão: {formatCurrency(commissionValue)}
                                {commissionRate != null ? ` (${commissionRate}%)` : ""}
                              </Badge>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* ITENS */}
                    {saleId && (
                      <div className="rounded-xl border p-3">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <p className="font-semibold flex items-center gap-2">
                            <ShoppingBasket className="h-4 w-4" />
                            Itens
                          </p>
                          {detailsItemsLoading && (
                            <span className="text-[11px] text-muted-foreground">
                              carregando...
                            </span>
                          )}
                        </div>

                        {detailsItemsLoading ? (
                          <div className="text-xs text-muted-foreground py-2">
                            Carregando itens...
                          </div>
                        ) : detailsItems.length === 0 ? (
                          <div className="text-xs text-muted-foreground py-2">
                            Nenhum item encontrado.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {detailsItems.map((it) => (
                              <div
                                key={it.id}
                                className="flex items-start justify-between gap-3 bg-slate-50 border rounded-xl p-2"
                              >
                                <div className="min-w-0">
                                  <p className="text-xs font-medium truncate">
                                    {it.product_name}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground">
                                    Qtd: <strong>{it.quantity}</strong> • Unit:{" "}
                                    <strong>{formatCurrency(it.unit_price)}</strong>
                                  </p>
                                </div>

                                <div className="shrink-0 text-right">
                                  <p className="text-xs font-bold">
                                    {formatCurrency(it.total_price)}
                                  </p>
                                </div>
                              </div>
                            ))}

                            <div className="pt-2 border-t flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">Total (venda)</span>
                              <span className="font-bold">
                                {formatCurrency(
                                  Number(sale?.total_amount || detailsLog.amount || 0)
                                )}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* METADATA (opcional) */}
                    <div className="rounded-xl border p-3">
                      <p className="font-semibold mb-2">Metadata</p>
                      <pre className="text-[11px] bg-slate-50 border rounded-lg p-2 overflow-x-auto">
{JSON.stringify(detailsLog.metadata ?? {}, null, 2)}
                      </pre>
                    </div>
                  </>
                );
              })()}
            </div>
          ) : (
            <div className="text-center text-muted-foreground text-sm py-6">
              Sem dados.
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
