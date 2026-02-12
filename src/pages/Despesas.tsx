import { useState, useEffect, useMemo } from "react";
import {
  Landmark,
  Plus,
  ArrowDownCircle,
  ArrowUpCircle,
  CheckCircle,
  Search,
  TrendingUp,
  Calendar as CalendarIcon,
  Info,
  X,
  Repeat,
  Wallet,
  FileText,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
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
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";

// --- TIPAGEM ---
interface FinancialEntry {
  id: string;
  type: "receivable" | "payable";
  description: string;
  total_amount: number;
  paid_amount: number;
  due_date: string;
  status: string;
  entity_name: string | null;
  reference: string | null;
  notes: string | null;
  created_at: string;
}

// --- UTILS ---
const formatCurrency = (v: number) =>
  (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const statusLabel: Record<string, string> = {
  pending: "Pendente",
  partial: "Parcial",
  paid: "Pago",
  overdue: "Vencido",
};

const statusVariant: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "outline",
  partial: "secondary",
  paid: "default",
  overdue: "destructive",
};

export default function Despesas() {
  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInfo, setShowInfo] = useState(true);

  // Filtros de Data
  const [dateFilter, setDateFilter] = useState("this-month");

  // Dialogs e Inputs
  const [dialogOpen, setDialogOpen] = useState(false);
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<FinancialEntry | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  // Form
  const [formType, setFormType] = useState<"receivable" | "payable">("payable");
  const [description, setDescription] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [dueDate, setDueDate] = useState<Date>(new Date());
  const [entityName, setEntityName] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);

  useEffect(() => {
    const isHidden = localStorage.getItem("hide_financial_info");
    if (isHidden === "true") setShowInfo(false);
    fetchEntries();
  }, []);

  const handleCloseInfo = () => {
    setShowInfo(false);
    localStorage.setItem("hide_financial_info", "true");
  };

  const handleShowInfo = () => {
    setShowInfo(true);
    localStorage.removeItem("hide_financial_info");
  };

  const fetchEntries = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("financial_entries")
      .select("*")
      .order("due_date", { ascending: true });

    if (!error && data) setEntries(data as FinancialEntry[]);
    setLoading(false);
  };

  // --- FILTRO POR DATA ---
  const getFilteredEntriesByDate = () => {
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
        return entries;
    }

    if (start && end) {
      return entries.filter((e) => {
        const d = parseISO(e.due_date);
        return isWithinInterval(d, { start, end });
      });
    }
    return entries;
  };

  const dateFilteredEntries = useMemo(
    () => getFilteredEntriesByDate(),
    [entries, dateFilter]
  );

  // --- FILTRO DE TEXTO ---
  const finalFilteredEntries = useMemo(() => {
    const s = searchTerm.trim().toLowerCase();
    if (!s) return dateFilteredEntries;
    return dateFilteredEntries.filter((e) => {
      return (
        e.description.toLowerCase().includes(s) ||
        (e.entity_name && e.entity_name.toLowerCase().includes(s))
      );
    });
  }, [dateFilteredEntries, searchTerm]);

  // --- ACTIONS ---
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(totalAmount);

    if (!description || isNaN(amount) || amount <= 0) {
      toast.error("Preencha a descrição e um valor válido.");
      return;
    }

    const entriesToCreate: any[] = [];
    const loopCount = isRecurring ? 12 : 1;

    for (let i = 0; i < loopCount; i++) {
      const entryDate = new Date(dueDate);
      entryDate.setMonth(entryDate.getMonth() + i);

      const entryDesc = isRecurring ? `${description} (${i + 1}/12)` : description;

      entriesToCreate.push({
        type: formType,
        description: entryDesc,
        total_amount: amount,
        paid_amount: 0,
        due_date: entryDate.toISOString(),
        entity_name: entityName.trim() === "" ? null : entityName.trim(),
        status: "pending",
      });
    }

    const { error } = await supabase.from("financial_entries").insert(entriesToCreate);
    if (error) {
      toast.error("Erro ao salvar.");
      return;
    }

    toast.success("Lançamento salvo com sucesso!");
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
      toast.error("Erro ao dar baixa.");
      return;
    }

    toast.success("Baixa realizada com sucesso!");
    setPayDialogOpen(false);
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
    setPayAmount((entry.total_amount - (entry.paid_amount || 0)).toFixed(2));
    setPayDialogOpen(true);
  };

  // --- SUMMARY ---
  const summary = useMemo(() => {
    const receivable = finalFilteredEntries.filter((e) => e.type === "receivable");
    const payable = finalFilteredEntries.filter((e) => e.type === "payable");

    const paidReceivable = receivable.reduce((acc, e) => acc + (e.paid_amount || 0), 0);
    const paidPayable = payable.reduce((acc, e) => acc + (e.paid_amount || 0), 0);

    return {
      totalReceivable: receivable.reduce((acc, e) => acc + e.total_amount, 0),
      totalPayable: payable.reduce((acc, e) => acc + e.total_amount, 0),
      paidReceivable,
      paidPayable,
      balance: paidReceivable - paidPayable,
    };
  }, [finalFilteredEntries]);

  const breakEven = useMemo(() => {
    const revenue = summary.totalReceivable;
    const costs = summary.totalPayable;
    const progress = costs > 0 ? (revenue / costs) * 100 : 100;

    return {
      costs,
      revenue,
      progress: Math.min(progress, 100),
      isProfitable: revenue > costs,
      gap: costs - revenue,
    };
  }, [summary]);

  const chartData = useMemo(() => {
    const data: Record<
      string,
      { name: string; receitas: number; despesas: number }
    > = {};

    dateFilteredEntries.forEach((entry) => {
      const date = parseISO(entry.due_date);
      const key = format(date, "MMM yyyy", { locale: ptBR });

      if (!data[key]) data[key] = { name: key, receitas: 0, despesas: 0 };

      if (entry.type === "receivable") data[key].receitas += entry.total_amount;
      else data[key].despesas += entry.total_amount;
    });

    return Object.values(data);
  }, [dateFilteredEntries]);

  const isOverdue = (entry: FinancialEntry) =>
    entry.status !== "paid" && new Date(entry.due_date) < new Date();

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* CABEÇALHO (RESPONSIVO) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Wallet className="h-7 w-7 sm:h-8 sm:w-8 text-primary" />
            Central Financeira
          </h1>
          <p className="text-muted-foreground">
            Visão geral de fluxo de caixa, metas e lançamentos.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full md:w-auto">
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="w-full sm:w-[180px] bg-background h-12">
              <CalendarIcon className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="this-month">Este Mês</SelectItem>
              <SelectItem value="last-month">Mês Passado</SelectItem>
              <SelectItem value="last-3">Últimos 3 Meses</SelectItem>
              <SelectItem value="this-year">Este Ano</SelectItem>
              <SelectItem value="all">Todo o Período</SelectItem>
            </SelectContent>
          </Select>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto shadow-md bg-primary hover:bg-primary/90 h-12">
                <Plus className="h-4 w-4 mr-2" />
                Novo
              </Button>
            </DialogTrigger>

            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Novo Lançamento Financeiro</DialogTitle>
              </DialogHeader>

              <form onSubmit={handleCreate} className="space-y-4 pt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tipo</Label>
                    <Select value={formType} onValueChange={(v: any) => setFormType(v)}>
                      <SelectTrigger className="h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="payable">Saída (Despesa)</SelectItem>
                        <SelectItem value="receivable">Entrada (Receita)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Valor (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0,00"
                      value={totalAmount}
                      onChange={(e) => setTotalAmount(e.target.value)}
                      className="font-mono font-medium h-11"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Input
                    placeholder="Ex: Aluguel, Venda Balcão..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    required
                    className="h-11"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{formType === "receivable" ? "Cliente" : "Fornecedor"} (Opcional)</Label>
                    <Input
                      placeholder="Nome..."
                      value={entityName}
                      onChange={(e) => setEntityName(e.target.value)}
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Vencimento</Label>
                    <Input
                      type="date"
                      value={format(dueDate, "yyyy-MM-dd")}
                      onChange={(e) => setDueDate(new Date(e.target.value))}
                      className="h-11"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between border p-3 rounded-md bg-muted/20">
                  <div className="space-y-0.5">
                    <Label className="text-base flex items-center gap-2">
                      <Repeat className="h-4 w-4 text-primary" />
                      {formType === "payable" ? "Despesa Fixa?" : "Receita Recorrente?"}
                    </Label>
                    <p className="text-xs text-muted-foreground">Repetir por 12 meses.</p>
                  </div>
                  <Switch checked={isRecurring} onCheckedChange={setIsRecurring} />
                </div>

                <Button type="submit" className="w-full mt-2 font-bold h-11">
                  Salvar
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* ALERTA DE AJUDA */}
      {showInfo ? (
        <Alert className="bg-blue-50/50 border-blue-200 text-blue-800 relative pr-10 animate-in slide-in-from-top-2 fade-in shadow-sm">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertTitle className="text-blue-700 font-semibold">
            Como funciona a Meta de Sobrevivência?
          </AlertTitle>
          <AlertDescription className="text-blue-700/80 text-sm mt-1">
            <p className="mb-1">
              Mostra quanto da sua <strong>Receita</strong> cobre as suas{" "}
              <strong>Despesas</strong> no período.
            </p>
            <ul className="list-disc list-inside space-y-1 ml-1">
              <li>
                <strong>Cálculo:</strong> (Total a Receber) ÷ (Total a Pagar) x 100.
              </li>
              <li>
                <strong>Objetivo:</strong> 100% para pagar todas as contas.
              </li>
              <li>
                <strong>Importante:</strong> lance contas e confirme vendas do PDV no financeiro.
              </li>
            </ul>
          </AlertDescription>

          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 text-blue-400 hover:text-blue-700"
            onClick={handleCloseInfo}
          >
            <X className="h-4 w-4" />
          </Button>
        </Alert>
      ) : (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={handleShowInfo}>
            Mostrar dica
          </Button>
        </div>
      )}

      {/* BREAK-EVEN */}
      <Card className="border-2 border-primary/10 shadow-md bg-gradient-to-br from-background to-muted/20 overflow-hidden relative">
        <div
          className={cn(
            "absolute top-0 left-0 w-1 h-full",
            breakEven.isProfitable ? "bg-emerald-500" : "bg-amber-500"
          )}
        />
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <TrendingUp className="h-5 w-5 text-primary" />
                Resultado do Período
              </CardTitle>
              <CardDescription>Balanço entre Receitas e Despesas.</CardDescription>
            </div>

            {breakEven.isProfitable ? (
              <Badge className="bg-emerald-500 text-sm sm:text-base px-3 py-1">
                Lucro! 🚀
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="text-sm sm:text-base px-3 py-1 border-amber-500 text-amber-600 bg-amber-50"
              >
                Déficit: {formatCurrency(breakEven.gap)} ⚠️
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent>
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:justify-between gap-1 text-sm font-medium">
              <span className="flex items-center gap-1 text-emerald-600">
                <ArrowUpCircle className="h-4 w-4" /> Receitas: {formatCurrency(breakEven.revenue)}
              </span>
              <span className="flex items-center gap-1 text-destructive">
                <ArrowDownCircle className="h-4 w-4" /> Despesas: {formatCurrency(breakEven.costs)}
              </span>
            </div>

            <Progress value={breakEven.progress} className="h-4 w-full" />

            <p className="text-sm text-center text-muted-foreground">
              {breakEven.progress < 100
                ? `As receitas cobrem ${breakEven.progress.toFixed(1)}% das despesas neste período.`
                : "Receitas superaram as despesas!"}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Caixa Líquido (Realizado)</CardTitle>
            <Landmark className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div
              className={cn(
                "text-2xl font-bold",
                summary.balance >= 0 ? "text-primary" : "text-destructive"
              )}
            >
              {formatCurrency(summary.balance)}
            </div>
            <p className="text-xs text-muted-foreground">Total Recebido - Total Pago</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">A Pagar (Pendente)</CardTitle>
            <ArrowDownCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {formatCurrency(summary.totalPayable - summary.paidPayable)}
            </div>
            <p className="text-xs text-muted-foreground">Contas futuras ou atrasadas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">A Receber (Pendente)</CardTitle>
            <ArrowUpCircle className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {formatCurrency(summary.totalReceivable - summary.paidReceivable)}
            </div>
            <p className="text-xs text-muted-foreground">Vendas a prazo / Boletos</p>
          </CardContent>
        </Card>
      </div>

      {/* GRÁFICO + LANÇAMENTOS */}
      <div className="grid gap-4 md:grid-cols-7">
        <Card className="md:col-span-4 shadow-sm">
          <CardHeader>
            <CardTitle>Histórico Visual</CardTitle>
            <CardDescription>Evolução financeira no período</CardDescription>
          </CardHeader>
          <CardContent className="pl-0">
            <div className="h-[260px] sm:h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="name"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `R$${value}`}
                  />
                  <Tooltip
                    cursor={{ fill: "transparent" }}
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{
                      borderRadius: "8px",
                      border: "none",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                    }}
                  />
                  <Legend />
                  <Bar dataKey="receitas" name="Entradas" fill="#10b981" radius={[4, 4, 0, 0]} barSize={18} />
                  <Bar dataKey="despesas" name="Saídas" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Desktop: tabela / Mobile: cards */}
        <Card className="md:col-span-3 shadow-sm flex flex-col">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Lançamentos</CardTitle>
              <div className="relative w-40">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar..."
                  className="pl-8 h-9"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>

          <CardContent className="flex-1 overflow-hidden p-0">
            {/* MOBILE CARDS */}
            <div className="sm:hidden p-4 space-y-3">
              {finalFilteredEntries.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  Nada encontrado no período.
                </div>
              ) : (
                finalFilteredEntries.slice(0, 30).map((entry) => {
                  const falta = entry.total_amount - (entry.paid_amount || 0);
                  return (
                    <Card key={entry.id} className="border shadow-sm">
                      <CardContent className="p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold truncate">{entry.description}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {format(parseISO(entry.due_date), "dd/MM/yyyy")} •{" "}
                              {entry.type === "receivable" ? "Entrada" : "Saída"}
                              {entry.entity_name ? ` • ${entry.entity_name}` : ""}
                            </p>
                          </div>

                          <div className="text-right shrink-0">
                            <p
                              className={cn(
                                "font-bold",
                                entry.type === "receivable"
                                  ? "text-emerald-600"
                                  : "text-destructive"
                              )}
                            >
                              {entry.type === "receivable" ? "+" : "-"}{" "}
                              {formatCurrency(entry.total_amount)}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              Falta: {formatCurrency(falta)}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <Badge
                            variant={isOverdue(entry) ? "destructive" : statusVariant[entry.status]}
                          >
                            {isOverdue(entry) ? "Atrasado" : statusLabel[entry.status] || entry.status}
                          </Badge>

                          {entry.status !== "paid" ? (
                            <Button
                              size="sm"
                              onClick={() => openPayDialog(entry)}
                              className="h-10"
                            >
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Baixar
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">OK</span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
              {finalFilteredEntries.length > 30 && (
                <div className="text-xs text-muted-foreground text-center">
                  Mostrando 30 de {finalFilteredEntries.length}.
                </div>
              )}
            </div>

            {/* DESKTOP TABLE */}
            <div className="hidden sm:block h-[300px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Desc.</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="w-[40px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {finalFilteredEntries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        Nada encontrado no período.
                      </TableCell>
                    </TableRow>
                  ) : (
                    finalFilteredEntries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(parseISO(entry.due_date), "dd/MM")}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium truncate max-w-[140px]" title={entry.description}>
                            {entry.description}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div
                            className={cn(
                              "font-medium",
                              entry.type === "receivable"
                                ? "text-emerald-600"
                                : "text-destructive"
                            )}
                          >
                            {entry.type === "receivable" ? "+" : "-"}{" "}
                            {formatCurrency(entry.total_amount)}
                          </div>
                        </TableCell>
                        <TableCell>
                          {entry.status !== "paid" && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => openPayDialog(entry)}
                            >
                              <CheckCircle className="h-4 w-4 text-primary" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ABAS */}
      <Tabs defaultValue="payable" className="w-full">
        <div className="flex items-center justify-between mb-4">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="payable" className="flex-1 sm:w-[160px]">
              Contas a Pagar
            </TabsTrigger>
            <TabsTrigger value="receivable" className="flex-1 sm:w-[160px]">
              Contas a Receber
            </TabsTrigger>
          </TabsList>
        </div>

        {(["payable", "receivable"] as const).map((tabValue) => {
          const list = finalFilteredEntries.filter((e) => e.type === tabValue);

          return (
            <TabsContent key={tabValue} value={tabValue} className="mt-0">
              <Card className="overflow-hidden">
                {/* MOBILE CARDS */}
                <div className="sm:hidden p-4 space-y-3">
                  {list.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground">
                      Nenhum lançamento encontrado.
                    </div>
                  ) : (
                    list.map((entry) => {
                      const falta = entry.total_amount - (entry.paid_amount || 0);
                      return (
                        <Card key={entry.id} className="border shadow-sm">
                          <CardContent className="p-4 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-semibold truncate">{entry.description}</p>
                                <p
                                  className={cn(
                                    "text-xs mt-1",
                                    isOverdue(entry) ? "text-destructive font-semibold" : "text-muted-foreground"
                                  )}
                                >
                                  Venc: {format(parseISO(entry.due_date), "dd/MM/yyyy")}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {tabValue === "receivable" ? "Cliente" : "Fornecedor"}:{" "}
                                  {entry.entity_name || "-"}
                                </p>
                              </div>

                              <div className="text-right shrink-0">
                                <p className="font-bold">{formatCurrency(entry.total_amount)}</p>
                                <p className="text-[11px] text-muted-foreground">
                                  Falta: {formatCurrency(falta)}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center justify-between">
                              <Badge
                                variant={isOverdue(entry) ? "destructive" : statusVariant[entry.status]}
                              >
                                {isOverdue(entry) ? "Atrasado" : statusLabel[entry.status] || entry.status}
                              </Badge>

                              {entry.status !== "paid" ? (
                                <Button size="sm" variant="outline" onClick={() => openPayDialog(entry)} className="h-10">
                                  <CheckCircle className="h-4 w-4 mr-2" />
                                  Baixar
                                </Button>
                              ) : (
                                <Badge className="bg-emerald-100 text-emerald-800">Pago</Badge>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })
                  )}
                </div>

                {/* DESKTOP TABLE */}
                <div className="hidden sm:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vencimento</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>{tabValue === "receivable" ? "Cliente" : "Fornecedor"}</TableHead>
                        <TableHead className="text-right">Valor Total</TableHead>
                        <TableHead className="text-right">Falta</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ação</TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {list.map((entry) => {
                        const overdue = isOverdue(entry);
                        return (
                          <TableRow key={entry.id}>
                            <TableCell className={cn(overdue && "text-destructive font-bold")}>
                              {format(parseISO(entry.due_date), "dd/MM/yyyy")}
                            </TableCell>
                            <TableCell className="font-medium">{entry.description}</TableCell>
                            <TableCell>{entry.entity_name || "-"}</TableCell>
                            <TableCell className="text-right">{formatCurrency(entry.total_amount)}</TableCell>
                            <TableCell className="text-right font-mono font-medium">
                              {formatCurrency(entry.total_amount - (entry.paid_amount || 0))}
                            </TableCell>
                            <TableCell>
                              <Badge variant={overdue ? "destructive" : statusVariant[entry.status]}>
                                {overdue ? "Atrasado" : statusLabel[entry.status] || entry.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {entry.status !== "paid" && (
                                <Button variant="outline" size="sm" onClick={() => openPayDialog(entry)}>
                                  Baixar
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}

                      {list.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                            Nenhum lançamento encontrado.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </TabsContent>
          );
        })}
      </Tabs>

      {/* DIALOG BAIXA */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Registrar Pagamento/Baixa</DialogTitle>
            <CardDescription>Confirme o valor.</CardDescription>
          </DialogHeader>

          {selectedEntry && (
            <div className="space-y-4 pt-2">
              <div className="p-3 bg-muted rounded-md text-sm border">
                <p className="font-semibold">{selectedEntry.description}</p>
                <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                  <span>Total: {formatCurrency(selectedEntry.total_amount)}</span>
                  <span className="text-primary font-bold">
                    Falta: {formatCurrency(selectedEntry.total_amount - (selectedEntry.paid_amount || 0))}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Valor a Baixar (R$)</Label>
                <Input
                  type="number"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  placeholder="0,00"
                  className="h-11"
                />
              </div>

              <Button onClick={handlePay} className="w-full h-11">
                Confirmar
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
