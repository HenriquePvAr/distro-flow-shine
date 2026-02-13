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
  company_id: string | null;
  actor_user_id: string | null;
  actor_name: string | null;

  event_type: string; // sale_created, sale_cancelled, stock_adjust...
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
  user_id: string | null;
  total_amount: number | null;
  status: string | null;
  created_at: string | null;
  company_id: string | null;
};

type Customer = { id: string; name: string };
type Profile = { id: string; name: string | null };

type ChipFilter = "all" | "sales" | "cancelled" | "stock";
type DateFilter = "7d" | "30d" | "this-month" | "this-year" | "all";

function formatCurrency(v: number) {
  return (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR");
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
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
    return <Badge variant="destructive" className="text-[10px] px-2 py-0.5">Cancelada</Badge>;
  }
  if (eventType === "sale_created") {
    return <Badge className="text-[10px] px-2 py-0.5">Venda</Badge>;
  }
  if (eventType.startsWith("stock")) {
    return <Badge variant="secondary" className="text-[10px] px-2 py-0.5">Estoque</Badge>;
  }
  return <Badge variant="outline" className="text-[10px] px-2 py-0.5">Evento</Badge>;
}

export default function Historico() {
  const [loading, setLoading] = useState(true);

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [salesById, setSalesById] = useState<Record<string, Sale>>({});
  const [customersById, setCustomersById] = useState<Record<string, Customer>>({});
  const [profilesById, setProfilesById] = useState<Record<string, Profile>>({});

  const [search, setSearch] = useState("");
  const [chip, setChip] = useState<ChipFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("30d");

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMode, setConfirmMode] = useState<"cancel" | "delete">("cancel");
  const [selected, setSelected] = useState<AuditLog | null>(null);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsLog, setDetailsLog] = useState<AuditLog | null>(null);

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

    // 2) sales ids
    const saleIds = Array.from(
      new Set(
        L.filter((l) => l.entity_type === "sale" && l.entity_id).map((l) => l.entity_id as string)
      )
    );

    // 3) fetch sales
    let sales: Sale[] = [];
    if (saleIds.length) {
      const { data: salesData, error: salesErr } = await supabase
        .from("sales")
        .select("id, customer_id, user_id, total_amount, status, created_at, company_id")
        .in("id", saleIds);

      if (salesErr) {
        toast.error("Erro ao carregar vendas relacionadas.");
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
      new Set(sales.map((s) => s.customer_id).filter((id): id is string => Boolean(id)))
    );

    // 5) users ids (de sales)
    const userIds = Array.from(
      new Set(sales.map((s) => s.user_id).filter((id): id is string => Boolean(id)))
    );

    // 6) fetch customers
    if (customerIds.length) {
      const { data: custData } = await supabase
        .from("customers")
        .select("id, name")
        .in("id", customerIds);

      const cMap: Record<string, Customer> = {};
      for (const c of (custData || []) as Customer[]) cMap[c.id] = c;
      setCustomersById(cMap);
    } else {
      setCustomersById({});
    }

    // 7) fetch profiles (operador)
    if (userIds.length) {
      const { data: profData } = await supabase
        .from("profiles")
        .select("id, name")
        .in("id", userIds);

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

      const sale = l.entity_id ? salesById[l.entity_id] : undefined;
      const customerName =
        sale?.customer_id ? customersById[sale.customer_id]?.name : undefined;
      const operatorName =
        sale?.user_id ? profilesById[sale.user_id]?.name : undefined;

      const hay = [
        l.title,
        l.description ?? "",
        l.event_type,
        l.entity_type,
        l.actor_name ?? "",
        customerName ?? "",
        operatorName ?? "",
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
        const saleId = selected.entity_id || selected.metadata?.sale_id;
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
      fetchData();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao executar ação.");
    }
  };

  const openDetails = (log: AuditLog) => {
    setDetailsLog(log);
    setDetailsOpen(true);
  };

  // helpers pra render
  const getSaleInfo = (log: AuditLog) => {
    const saleId = log.entity_id || log.metadata?.sale_id;
    const sale = saleId ? salesById[saleId] : undefined;

    const customerName =
      sale?.customer_id ? customersById[sale.customer_id]?.name : null;

    const operatorName =
      sale?.user_id ? profilesById[sale.user_id]?.name : null;

    return { saleId, sale, customerName, operatorName };
  };

  return (
    <div className="w-full max-w-md mx-auto px-3 sm:px-6 py-4 overflow-x-hidden">
      {/* TOP BAR */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <h1 className="text-base font-semibold flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" />
          Histórico
        </h1>

        <Button variant="outline" size="sm" className="h-9 rounded-full" onClick={fetchData}>
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
          placeholder="Buscar (cliente, operador, valor...)"
          className="pl-9 h-10 rounded-full"
        />
      </div>

      {/* FILTERS ROW */}
      <div className="flex gap-2 mb-2">
        <Select value={dateFilter} onValueChange={(v: any) => setDateFilter(v)}>
          <SelectTrigger className="h-10 rounded-full flex-1">
            <CalendarIcon className="h-4 w-4 mr-2 text-muted-foreground" />
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

      {/* CHIPS (mobile friendly) */}
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
        <div className="text-center py-10 text-muted-foreground text-sm">Carregando...</div>
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
              saleId &&
              (sale?.status ?? "") !== "cancelled";

            const isCancelled = log.event_type === "sale_cancelled" || sale?.status === "cancelled";

            return (
              <Card key={log.id} className="border-none shadow-sm rounded-2xl overflow-hidden">
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    {/* LEFT */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-700 shrink-0">{getIcon(log.event_type)}</span>
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
                            {operatorName}
                          </span>
                        )}
                      </div>

                      {log.amount != null && (
                        <p className="mt-1 font-bold text-sm text-slate-900">
                          {formatCurrency(Number(log.amount))}
                        </p>
                      )}

                      <div className="mt-2 flex items-center gap-2">
                        {badgeFor(log.event_type)}
                        {isCancelled && (
                          <Badge variant="destructive" className="text-[10px] px-2 py-0.5">
                            Cancelada
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
              Informações completas do evento.
            </DialogDescription>
          </DialogHeader>

          {detailsLog ? (
            <div className="space-y-3 pt-2 text-sm">
              {(() => {
                const { saleId, sale, customerName, operatorName } = getSaleInfo(detailsLog);

                return (
                  <>
                    <div className="rounded-xl border bg-slate-50 p-3">
                      <div className="flex items-center gap-2 text-slate-700">
                        {getIcon(detailsLog.event_type)}
                        <span className="font-semibold">{detailsLog.title}</span>
                      </div>

                      <div className="mt-2 text-[12px] text-muted-foreground space-y-1">
                        <div><strong>Data:</strong> {formatDateTime(detailsLog.created_at)}</div>
                        <div><strong>Tipo:</strong> {detailsLog.event_type}</div>
                        <div><strong>Entidade:</strong> {detailsLog.entity_type}</div>
                        {detailsLog.amount != null && (
                          <div><strong>Valor:</strong> {formatCurrency(Number(detailsLog.amount))}</div>
                        )}
                      </div>
                    </div>

                    {saleId && (
                      <div className="rounded-xl border p-3">
                        <p className="font-semibold mb-2">Venda</p>
                        <div className="text-[12px] text-muted-foreground space-y-1">
                          <div><strong>ID:</strong> {saleId}</div>
                          <div><strong>Status:</strong> {sale?.status || "—"}</div>
                          <div><strong>Cliente:</strong> {customerName || "—"}</div>
                          <div><strong>Operador:</strong> {operatorName || "—"}</div>
                        </div>
                      </div>
                    )}

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
            <div className="text-center text-muted-foreground text-sm py-6">Sem dados.</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
