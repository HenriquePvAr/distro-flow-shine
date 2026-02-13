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

export default function Despesas() {
  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [dateFilter, setDateFilter] = useState("this-month");
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

    if (start && end) {
      result = result.filter((e) =>
        isWithinInterval(parseISO(e.due_date), { start, end })
      );
    }

    const s = searchTerm.trim().toLowerCase();
    if (s) {
      result = result.filter(
        (e) =>
          e.description.toLowerCase().includes(s) ||
          (e.entity_name && e.entity_name.toLowerCase().includes(s))
      );
    }

    return result;
  }, [entries, dateFilter, searchTerm]);

  // --- ACTIONS ---
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    const amount = parseFloat(totalAmount);
    if (!description || isNaN(amount) || amount <= 0) {
      toast.error("Dados inválidos.");
      return;
    }

    const entriesToCreate: Array<Partial<FinancialEntry>> = [];
    const loopCount = isRecurring ? 12 : 1;

    for (let i = 0; i < loopCount; i++) {
      const entryDate = new Date(dueDate);
      entryDate.setMonth(entryDate.getMonth() + i);

      // SALVA DATE-ONLY (evita bug de fuso no mobile)
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

    const amount = parseFloat(payAmount);
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

    // Vencido = data menor que hoje (sem considerar horas)
    const isOverdue =
      !isPaid && isBefore(parseISO(entry.due_date), startOfDay(new Date()));

    return (
      <div
        className={[
          "w-full min-w-0 flex items-center justify-between gap-3 p-3 bg-white border rounded-xl mb-2 shadow-sm relative overflow-hidden",
          isPaid ? "opacity-70" : "",
        ].join(" ")}
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

          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm truncate text-gray-900">
              {entry.description}
            </p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
              <span className="shrink-0">
                {format(parseISO(entry.due_date), "dd/MM")}
              </span>
              {entry.entity_name && (
                <>
                  <span className="shrink-0">•</span>
                  <span className="truncate max-w-[140px] sm:max-w-[220px]">
                    {entry.entity_name}
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

          {isPaid ? (
            <Badge
              variant="outline"
              className="text-[10px] bg-gray-50 text-gray-600 border-gray-200 px-1.5 h-5"
            >
              Pago
            </Badge>
          ) : (
            <div className="flex items-center gap-2">
              {isOverdue && <AlertCircle className="h-3 w-3 text-red-500" />}
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[10px] bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800"
                onClick={() => openPayDialog(entry)}
              >
                Baixar
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full h-full overflow-x-hidden bg-slate-50/50 pb-20">
      {/* HEADER */}
      <div className="sticky top-0 z-10 w-full bg-white/90 backdrop-blur-md border-b px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between mb-3 min-w-0 gap-3">
          <h1 className="text-lg font-bold flex items-center gap-2 text-slate-800 min-w-0">
            <Wallet className="h-5 w-5 text-primary shrink-0" />
            <span className="truncate">Financeiro</span>
          </h1>

          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="h-8 w-[130px] text-xs bg-slate-100 border-none shrink-0">
              <CalendarIcon className="mr-2 h-3 w-3 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="this-month">Este Mês</SelectItem>
              <SelectItem value="last-month">Mês Passado</SelectItem>
              <SelectItem value="this-year">Este Ano</SelectItem>
              <SelectItem value="all">Tudo</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* BUSCA */}
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar lançamentos..."
            className="pl-9 h-10 bg-slate-50 border-slate-200 w-full"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* CONTEÚDO (limita largura no celular) */}
      <div className="w-full max-w-screen-sm mx-auto px-4 py-4 space-y-4">
        {/* RESUMO (scroll horizontal só aqui) */}
        <div className="w-full overflow-x-auto -mx-4 px-4">
          <div className="flex gap-3 w-max min-w-full pb-2">
            <Card className="w-[160px] shrink-0 border-none shadow-sm bg-white">
              <CardContent className="p-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase">
                  Saldo Real
                </p>
                <p
                  className={[
                    "text-lg font-bold",
                    summary.balance >= 0 ? "text-primary" : "text-destructive",
                  ].join(" ")}
                >
                  {formatCurrency(summary.balance)}
                </p>
              </CardContent>
            </Card>

            <Card className="w-[160px] shrink-0 border-none shadow-sm bg-red-50/50">
              <CardContent className="p-3">
                <p className="text-[10px] font-semibold text-red-600/70 uppercase">
                  A Pagar
                </p>
                <p className="text-lg font-bold text-red-700">
                  {formatCurrency(summary.totalPayable - summary.paidPayable)}
                </p>
              </CardContent>
            </Card>

            <Card className="w-[160px] shrink-0 border-none shadow-sm bg-emerald-50/50">
              <CardContent className="p-3">
                <p className="text-[10px] font-semibold text-emerald-600/70 uppercase">
                  A Receber
                </p>
                <p className="text-lg font-bold text-emerald-700">
                  {formatCurrency(summary.totalReceivable - summary.paidReceivable)}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* PROGRESSO */}
        <Card className="border-none shadow-sm bg-gradient-to-r from-blue-50 to-indigo-50">
          <CardContent className="p-3">
            <div className="flex justify-between text-xs font-medium mb-2">
              <span className="text-blue-700">Cobertura de Despesas</span>
              <span className={isProfitable ? "text-emerald-600" : "text-amber-600"}>
                {Number.isFinite(progress) ? progress.toFixed(0) : "0"}%
              </span>
            </div>
            <Progress
              value={Number.isFinite(progress) ? progress : 0}
              className="h-2 bg-blue-200"
            />
            <p className="text-[10px] text-muted-foreground mt-2 text-center">
              {isProfitable
                ? "Receitas cobrem as despesas! 🎉"
                : "Atenção: Despesas maiores que receitas."}
            </p>
          </CardContent>
        </Card>

        {/* LISTA */}
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-9 mb-2 bg-slate-100 p-1">
            <TabsTrigger value="all" className="text-xs">
              Tudo
            </TabsTrigger>
            <TabsTrigger value="payable" className="text-xs">
              Saídas
            </TabsTrigger>
            <TabsTrigger value="receivable" className="text-xs">
              Entradas
            </TabsTrigger>
          </TabsList>

          <div className="space-y-2 pb-20 w-full min-w-0">
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

                    {filteredEntries.filter((e) => tab === "all" || e.type === tab)
                      .length === 0 && (
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

      {/* FAB */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button
            size="icon"
            className="fixed bottom-24 right-4 h-14 w-14 rounded-full shadow-lg bg-primary hover:bg-primary/90 z-20"
          >
            <Plus className="h-6 w-6" />
          </Button>
        </DialogTrigger>

        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-md top-[20%] translate-y-0">
          <DialogHeader>
            <DialogTitle>Novo Lançamento</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Tipo</Label>
                <Select value={formType} onValueChange={(v: any) => setFormType(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
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
                  className="font-bold w-full"
                  inputMode="decimal"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Descrição</Label>
              <Input
                placeholder="Ex: Aluguel, Venda..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Entidade (Opcional)</Label>
                <Input
                  placeholder="Nome..."
                  value={entityName}
                  onChange={(e) => setEntityName(e.target.value)}
                  className="w-full"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Vencimento</Label>
                <Input
                  type="date"
                  value={format(dueDate, "yyyy-MM-dd")}
                  onChange={(e) => setDueDate(new Date(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>

            <div className="flex items-center justify-between border p-3 rounded-lg bg-muted/20">
              <div className="space-y-0.5">
                <Label className="text-sm">Recorrente?</Label>
                <p className="text-[10px] text-muted-foreground">Repetir por 12 meses</p>
              </div>
              <Switch checked={isRecurring} onCheckedChange={setIsRecurring} />
            </div>

            <Button type="submit" className="w-full">
              Salvar
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* DIALOG BAIXA */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-xs top-[30%] translate-y-0">
          <DialogHeader>
            <DialogTitle>Baixar Lançamento</DialogTitle>
            <DialogDescription>Confirme o valor pago.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="bg-slate-50 p-3 rounded-lg border text-sm min-w-0">
              <p className="font-medium truncate">{selectedEntry?.description}</p>
              <div className="flex justify-between mt-1 text-xs text-muted-foreground gap-2">
                <span className="truncate">
                  Total: {formatCurrency(selectedEntry?.total_amount || 0)}
                </span>
                <span className="font-bold text-primary shrink-0">
                  Restante:{" "}
                  {formatCurrency(
                    (selectedEntry?.total_amount || 0) -
                      (selectedEntry?.paid_amount || 0)
                  )}
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Valor do Pagamento</Label>
              <Input
                type="number"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="text-lg font-bold w-full"
                inputMode="decimal"
              />
            </div>

            <Button onClick={handlePay} className="w-full">
              Confirmar Baixa
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
