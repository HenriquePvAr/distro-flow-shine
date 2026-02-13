"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Wallet,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  Calendar as CalendarIcon,
  AlertCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  format,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  isWithinInterval,
  parseISO,
  isBefore,
  startOfDay,
} from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";

// --- TIPAGEM ---
interface FinancialEntry {
  id: string;
  type: "receivable" | "payable";
  description: string;
  total_amount: number;
  paid_amount: number;
  due_date: string; // "YYYY-MM-DD"
  status: string;
  entity_name: string | null;
  reference: string | null;
  notes: string | null;
  created_at: string;
}

// --- UTILS ---
const formatCurrency = (v: number) =>
  (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type StatusFilter = "all" | "open" | "overdue" | "paid";

export default function Despesas() {
  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [dateFilter, setDateFilter] = useState("this-month");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Dialogs
  const [dialogOpen, setDialogOpen] = useState(false);
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<FinancialEntry | null>(null);
  const [payAmount, setPayAmount] = useState("");

  // Form
  const [formType, setFormType] = useState<"receivable" | "payable">("payable");
  const [description, setDescription] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [dueDate, setDueDate] = useState<Date>(new Date());
  const [entityName, setEntityName] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);

  useEffect(() => {
    fetchEntries();
  }, []);

  const fetchEntries = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("financial_entries")
      .select("*")
      .order("due_date", { ascending: true });

    if (error) {
      toast.error("Erro ao carregar lançamentos.");
      setLoading(false);
      return;
    }

    setEntries((data || []) as FinancialEntry[]);
    setLoading(false);
  };

  // --- FILTROS ---
  const filteredEntries = useMemo(() => {
    const now = new Date();
    let start: Date | null = null;
    let end: Date | null = null;

    switch (dateFilter) {
      case "this-month":
        start = startOfMonth(now);
        end = endOfMonth(now);
        break;
      case "last-month": {
        const lastMonth = subMonths(now, 1);
        start = startOfMonth(lastMonth);
        end = endOfMonth(lastMonth);
        break;
      }
      case "last-3":
        start = subMonths(now, 3);
        end = now;
        break;
      case "this-year":
        start = startOfYear(now);
        end = endOfYear(now);
        break;
      case "all":
      default:
        start = null;
        end = null;
        break;
    }

    let result = entries;

    // Filtro por período
    if (start && end) {
      result = result.filter((e) =>
        isWithinInterval(parseISO(e.due_date), { start, end })
      );
    }

    // Filtro por busca
    const s = searchTerm.trim().toLowerCase();
    if (s) {
      result = result.filter(
        (e) =>
          e.description.toLowerCase().includes(s) ||
          (e.entity_name && e.entity_name.toLowerCase().includes(s))
      );
    }

    // Filtro por status
    if (statusFilter !== "all") {
      const today = startOfDay(new Date());

      result = result.filter((e) => {
        const due = startOfDay(parseISO(e.due_date));
        const isPaid = e.status === "paid";
        const isOpen = !isPaid && (e.status === "pending" || e.status === "partial");
        const isOverdue = isOpen && isBefore(due, today);

        if (statusFilter === "paid") return isPaid;
        if (statusFilter === "open") return isOpen && !isOverdue;
        if (statusFilter === "overdue") return isOverdue;
        return true;
      });
    }

    return result;
  }, [entries, dateFilter, searchTerm, statusFilter]);

  // --- ACTIONS ---
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    const amount = parseFloat(totalAmount.replace(",", "."));
    if (!description || isNaN(amount) || amount <= 0) {
      toast.error("Dados inválidos.");
      return;
    }

    const entriesToCreate: Array<Partial<FinancialEntry>> = [];
    const loopCount = isRecurring ? 12 : 1;

    for (let i = 0; i < loopCount; i++) {
      const entryDate = new Date(dueDate);
      entryDate.setMonth(entryDate.getMonth() + i);

      // Data só (evita bug de fuso no mobile)
      const due_date = format(entryDate, "yyyy-MM-dd");

      entriesToCreate.push({
        type: formType,
        description: isRecurring ? `${description} (${i + 1}/12)` : description,
        total_amount: amount,
        paid_amount: 0,
        due_date,
        entity_name: entityName.trim() || null,
        status: "pending",
      });
    }

    const { error } = await supabase.from("financial_entries").insert(entriesToCreate);

    if (error) {
      toast.error("Erro ao salvar.");
      return;
    }

    toast.success("Salvo com sucesso!");
    resetForm();
    setDialogOpen(false);
    fetchEntries();
  };

  const handlePay = async () => {
    if (!selectedEntry) return;

    const amount = parseFloat(payAmount.replace(",", "."));
    if (isNaN(amount) || amount <= 0) {
      toast.error("Valor inválido.");
      return;
    }

    const newPaid = (selectedEntry.paid_amount || 0) + amount;
    const newStatus = newPaid >= selectedEntry.total_amount ? "paid" : "partial";

    const { error } = await supabase
      .from("financial_entries")
      .update({ paid_amount: newPaid, status: newStatus })
      .eq("id", selectedEntry.id);

    if (error) {
      toast.error("Erro ao baixar.");
      return;
    }

    toast.success("Baixa realizada!");
    setPayDialogOpen(false);
    setSelectedEntry(null);
    fetchEntries();
  };

  const resetForm = () => {
    setDescription("");
    setTotalAmount("");
    setDueDate(new Date());
    setEntityName("");
    setIsRecurring(false);
    setFormType("payable");
  };

  const openPayDialog = (entry: FinancialEntry) => {
    setSelectedEntry(entry);
    const restante = (entry.total_amount || 0) - (entry.paid_amount || 0);
    setPayAmount(restante > 0 ? restante.toFixed(2) : "0.00");
    setPayDialogOpen(true);
  };

  // --- SUMMARY ---
  const summary = useMemo(() => {
    const receivable = filteredEntries.filter((e) => e.type === "receivable");
    const payable = filteredEntries.filter((e) => e.type === "payable");

    const totalReceivable = receivable.reduce(
      (acc, e) => acc + (e.total_amount || 0),
      0
    );
    const totalPayable = payable.reduce(
      (acc, e) => acc + (e.total_amount || 0),
      0
    );

    const paidReceivable = receivable.reduce(
      (acc, e) => acc + (e.paid_amount || 0),
      0
    );
    const paidPayable = payable.reduce(
      (acc, e) => acc + (e.paid_amount || 0),
      0
    );

    return {
      totalReceivable,
      totalPayable,
      paidReceivable,
      paidPayable,
      balance: paidReceivable - paidPayable,
    };
  }, [filteredEntries]);

  const progress =
    summary.totalPayable > 0
      ? (summary.totalReceivable / summary.totalPayable) * 100
      : 100;

  const isProfitable = summary.totalReceivable >= summary.totalPayable;

  // --- UI COMPONENTS ---
  const EntryItem = ({ entry }: { entry: FinancialEntry }) => {
    const isPaid = entry.status === "paid";
    const isReceivable = entry.type === "receivable";

    const today = startOfDay(new Date());
    const due = startOfDay(parseISO(entry.due_date));
    const isOverdue = !isPaid && isBefore(due, today);
    const remaining = (entry.total_amount || 0) - (entry.paid_amount || 0);

    return (
      <button
        type="button"
        className={[
          "w-full min-w-0 flex items-center justify-between gap-3 p-3 rounded-xl mb-2 relative",
          "bg-white border shadow-sm active:scale-[0.99] transition-transform duration-75",
          isPaid ? "opacity-70" : "",
        ].join(" ")}
        onClick={() => openPayDialog(entry)}
      >
        {isOverdue && <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500" />}

        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div
            className={[
              "h-10 w-10 rounded-full flex items-center justify-center shrink-0",
              isReceivable
                ? "bg-emerald-100 text-emerald-600"
                : "bg-red-100 text-red-600",
            ].join(" ")}
          >
            {isReceivable ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />}
          </div>

          <div className="min-w-0 flex-1 text-left">
            <p className="font-medium text-sm truncate text-gray-900">
              {entry.description}
            </p>
            <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground min-w-0">
              <span className="shrink-0 font-medium">
                {format(parseISO(entry.due_date), "dd/MM")}
              </span>
              {entry.entity_name && (
                <>
                  <span className="shrink-0">•</span>
                  <span className="truncate max-w-[140px]">
                    {entry.entity_name}
                  </span>
                </>
              )}
              {isOverdue && (
                <>
                  <span className="shrink-0">•</span>
                  <span className="flex items-center gap-1 text-red-500">
                    <AlertCircle className="h-3 w-3" />
                    Vencido
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          <span
            className={[
              "font-bold text-sm whitespace-nowrap",
              isReceivable ? "text-emerald-700" : "text-red-700",
            ].join(" ")}
          >
            {isReceivable ? "+" : "-"}
            {formatCurrency(entry.total_amount)}
          </span>

          <div className="flex items-center gap-1">
            {isPaid ? (
              <Badge
                variant="outline"
                className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 px-2 py-0.5"
              >
                Pago
              </Badge>
            ) : remaining < entry.total_amount && remaining > 0 ? (
              <Badge
                variant="outline"
                className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 px-2 py-0.5"
              >
                Parcial · Restante {formatCurrency(remaining)}
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="text-[10px] bg-slate-50 text-slate-700 border-slate-200 px-2 py-0.5"
              >
                Restante {formatCurrency(remaining)}
              </Badge>
            )}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="flex flex-col h-full w-full max-w-full bg-slate-50/60 overflow-x-hidden">
      {/* HEADER */}
      <div className="sticky top-0 z-20 w-full bg-white/95 backdrop-blur-md border-b px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between mb-3 min-w-0 gap-3">
          <h1 className="text-lg font-bold flex items-center gap-2 text-slate-800 min-w-0">
            <Wallet className="h-5 w-5 text-primary shrink-0" />
            <span className="truncate">Financeiro</span>
          </h1>

          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="h-9 px-2 text-[11px] bg-slate-100 border-none rounded-full shrink-0">
              <CalendarIcon className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="this-month">Este mês</SelectItem>
              <SelectItem value="last-month">Mês passado</SelectItem>
              <SelectItem value="last-3">Últimos 3 meses</SelectItem>
              <SelectItem value="this-year">Este ano</SelectItem>
              <SelectItem value="all">Tudo</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* BUSCA */}
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, descrição..."
            className="pl-9 h-10 rounded-full bg-slate-50 border-slate-200 w-full text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* FILTRO DE STATUS (chips) */}
        <div className="mt-2 flex gap-2 overflow-x-auto no-scrollbar">
          {(
            [
              { value: "all", label: "Todos" },
              { value: "open", label: "A vencer" },
              { value: "overdue", label: "Vencidos" },
              { value: "paid", label: "Pagos" },
            ] as { value: StatusFilter; label: string }[]
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setStatusFilter(opt.value)}
              className={[
                "px-3 py-1.5 rounded-full text-[11px] border",
                "active:scale-[0.97] transition-transform",
                statusFilter === opt.value
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-700 border-slate-200",
              ].join(" ")}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* CONTEÚDO SCROLLÁVEL */}
      <div className="flex-1 overflow-y-auto">
        <div className="w-full max-w-md mx-auto px-4 py-4 space-y-4">
          {/* RESUMO EM GRID (sem scroll lateral) */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="col-span-2 border-none shadow-sm bg-white">
              <CardContent className="p-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase">
                  Saldo Real
                </p>
                <p
                  className={[
                    "text-2xl font-extrabold tracking-tight",
                    summary.balance >= 0 ? "text-emerald-600" : "text-red-600",
                  ].join(" ")}
                >
                  {formatCurrency(summary.balance)}
                </p>
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm bg-red-50">
              <CardContent className="p-3">
                <p className="text-[10px] font-semibold text-red-600/80 uppercase">
                  A pagar (restante)
                </p>
                <p className="text-lg font-bold text-red-700">
                  {formatCurrency(summary.totalPayable - summary.paidPayable)}
                </p>
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm bg-emerald-50">
              <CardContent className="p-3">
                <p className="text-[10px] font-semibold text-emerald-600/80 uppercase">
                  A receber (restante)
                </p>
                <p className="text-lg font-bold text-emerald-700">
                  {formatCurrency(summary.totalReceivable - summary.paidReceivable)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* PROGRESSO */}
          <Card className="border-none shadow-sm bg-gradient-to-r from-blue-50 to-indigo-50">
            <CardContent className="p-3">
              <div className="flex justify-between items-center text-xs font-medium mb-2">
                <span className="text-blue-700">Cobertura de despesas</span>
                <span className={isProfitable ? "text-emerald-600" : "text-amber-600"}>
                  {Number.isFinite(progress) ? progress.toFixed(0) : "0"}%
                </span>
              </div>
              <Progress
                value={Number.isFinite(progress) ? progress : 0}
                className="h-2 bg-blue-200"
              />
              <p className="text-[11px] text-muted-foreground mt-2 text-center">
                {isProfitable
                  ? "Receitas atuais cobrem as despesas. 🎉"
                  : "Atenção: despesas maiores que receitas no período."}
              </p>
            </CardContent>
          </Card>

          {/* LISTA */}
          <Tabs defaultValue="all" className="w-full">
            <TabsList className="grid w-full grid-cols-3 h-10 mb-2 bg-slate-100 rounded-full p-1">
              <TabsTrigger
                value="all"
                className="text-[11px] rounded-full data-[state=active]:bg-white"
              >
                Tudo
              </TabsTrigger>
              <TabsTrigger
                value="payable"
                className="text-[11px] rounded-full data-[state=active]:bg-white"
              >
                Saídas
              </TabsTrigger>
              <TabsTrigger
                value="receivable"
                className="text-[11px] rounded-full data-[state=active]:bg-white"
              >
                Entradas
              </TabsTrigger>
            </TabsList>

            <div className="space-y-2 pb-24 w-full min-w-0">
              {["all", "payable", "receivable"].map((tab) => (
                <TabsContent
                  key={tab}
                  value={tab}
                  className="m-0 space-y-0 w-full min-w-0"
                >
                  {loading ? (
                    <div className="text-center py-10 text-muted-foreground text-sm">
                      Carregando...
                    </div>
                  ) : (
                    <>
                      {filteredEntries
                        .filter((e) => tab === "all" || e.type === tab)
                        .map((entry) => (
                          <EntryItem key={entry.id} entry={entry} />
                        ))}

                      {filteredEntries.filter(
                        (e) => tab === "all" || e.type === tab
                      ).length === 0 && (
                        <div className="text-center py-10 text-muted-foreground text-sm">
                          Nenhum lançamento encontrado.
                        </div>
                      )}
                    </>
                  )}
                </TabsContent>
              ))}
            </div>
          </Tabs>
        </div>
      </div>

      {/* FAB (botão flutuante) */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button
            size="icon"
            className="fixed bottom-24 right-4 h-14 w-14 rounded-full shadow-lg bg-primary hover:bg-primary/90 z-30 active:scale-95"
          >
            <Plus className="h-6 w-6" />
          </Button>
        </DialogTrigger>

        <DialogContent className="max-w-sm w-[92vw] rounded-2xl p-4 top-[20%] translate-y-0">
          <DialogHeader>
            <DialogTitle className="text-base">Novo lançamento</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Tipo</Label>
                <Select value={formType} onValueChange={(v: any) => setFormType(v)}>
                  <SelectTrigger className="w-full h-9 text-sm">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="payable">Saída</SelectItem>
                    <SelectItem value="receivable">Entrada</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Valor</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  className="font-bold w-full h-9 text-sm"
                  inputMode="decimal"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Descrição</Label>
              <Input
                placeholder="Ex: Aluguel, venda, água..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full h-9 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Entidade (opcional)</Label>
                <Input
                  placeholder="Cliente, fornecedor..."
                  value={entityName}
                  onChange={(e) => setEntityName(e.target.value)}
                  className="w-full h-9 text-sm"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Vencimento</Label>
                <Input
                  type="date"
                  value={format(dueDate, "yyyy-MM-dd")}
                  onChange={(e) => setDueDate(new Date(e.target.value))}
                  className="w-full h-9 text-sm"
                />
              </div>
            </div>

            <div className="flex items-center justify-between border p-3 rounded-xl bg-muted/30">
              <div className="space-y-0.5">
                <Label className="text-sm">Recorrente?</Label>
                <p className="text-[10px] text-muted-foreground">
                  Lançar este valor por 12 meses.
                </p>
              </div>
              <Switch checked={isRecurring} onCheckedChange={setIsRecurring} />
            </div>

            <Button type="submit" className="w-full h-10 text-sm rounded-full">
              Salvar
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* DIALOG BAIXA */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent className="max-w-sm w-[92vw] rounded-2xl p-4 top-[25%] translate-y-0">
          <DialogHeader>
            <DialogTitle className="text-base">Baixar lançamento</DialogTitle>
            <DialogDescription className="text-xs">
              Confirme o valor que está sendo pago agora.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="bg-slate-50 p-3 rounded-xl border text-sm min-w-0">
              <p className="font-medium truncate">
                {selectedEntry?.description || "—"}
              </p>
              <div className="flex flex-col gap-1 mt-2 text-[11px] text-muted-foreground">
                <span>
                  Total:{" "}
                  <strong className="font-semibold">
                    {formatCurrency(selectedEntry?.total_amount || 0)}
                  </strong>
                </span>
                <span>
                  Já pago:{" "}
                  <strong className="font-semibold">
                    {formatCurrency(selectedEntry?.paid_amount || 0)}
                  </strong>
                </span>
                <span>
                  Restante:{" "}
                  <strong className="font-semibold text-primary">
                    {formatCurrency(
                      (selectedEntry?.total_amount || 0) -
                        (selectedEntry?.paid_amount || 0)
                    )}
                  </strong>
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Valor do pagamento</Label>
              <Input
                type="number"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="text-lg font-bold w-full h-10 text-right"
                inputMode="decimal"
              />
            </div>

            <Button onClick={handlePay} className="w-full h-10 text-sm rounded-full">
              Confirmar baixa
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
