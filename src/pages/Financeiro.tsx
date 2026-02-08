import { useState, useEffect, useMemo } from "react";
import {
  Landmark,
  Plus,
  ArrowDownCircle,
  ArrowUpCircle,
  CheckCircle,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

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

const formatCurrency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const statusLabel: Record<string, string> = {
  pending: "Pendente",
  partial: "Parcial",
  paid: "Pago",
  overdue: "Vencido",
};
const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  partial: "secondary",
  paid: "default",
  overdue: "destructive",
};

export default function Financeiro() {
  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<FinancialEntry | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [tab, setTab] = useState("receivable");

  // Form state
  const [formType, setFormType] = useState<"receivable" | "payable">("receivable");
  const [description, setDescription] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [dueDate, setDueDate] = useState<Date>(new Date());
  const [entityName, setEntityName] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const fetchEntries = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("financial_entries")
      .select("*")
      .order("due_date", { ascending: true });
    if (!error && data) {
      setEntries(data as FinancialEntry[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchEntries();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(totalAmount);
    if (!description || isNaN(amount) || amount <= 0) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    const { error } = await supabase.from("financial_entries").insert({
      type: formType,
      description,
      total_amount: amount,
      due_date: dueDate.toISOString(),
      entity_name: entityName || null,
      reference: reference || null,
      notes: notes || null,
    });

    if (error) {
      toast.error("Erro ao criar lançamento");
      return;
    }

    toast.success("Lançamento criado com sucesso!");
    resetForm();
    setDialogOpen(false);
    fetchEntries();
  };

  const handlePay = async () => {
    if (!selectedEntry) return;
    const amount = parseFloat(payAmount);
    const remaining = selectedEntry.total_amount - selectedEntry.paid_amount;

    if (isNaN(amount) || amount <= 0 || amount > remaining + 0.01) {
      toast.error("Valor inválido");
      return;
    }

    const newPaid = selectedEntry.paid_amount + amount;
    const newStatus = newPaid >= selectedEntry.total_amount ? "paid" : "partial";

    const { error } = await supabase
      .from("financial_entries")
      .update({ paid_amount: newPaid, status: newStatus })
      .eq("id", selectedEntry.id);

    if (error) {
      toast.error("Erro ao registrar baixa");
      return;
    }

    toast.success(newStatus === "paid" ? "Baixa total realizada!" : "Baixa parcial registrada!");
    setPayDialogOpen(false);
    setSelectedEntry(null);
    setPayAmount("");
    fetchEntries();
  };

  const resetForm = () => {
    setDescription("");
    setTotalAmount("");
    setDueDate(new Date());
    setEntityName("");
    setReference("");
    setNotes("");
  };

  const openPayDialog = (entry: FinancialEntry) => {
    setSelectedEntry(entry);
    setPayAmount("");
    setPayDialogOpen(true);
  };

  const filtered = useMemo(
    () => entries.filter((e) => e.type === tab),
    [entries, tab]
  );

  const totals = useMemo(() => {
    const receivable = entries.filter((e) => e.type === "receivable");
    const payable = entries.filter((e) => e.type === "payable");
    return {
      totalReceivable: receivable.reduce((s, e) => s + e.total_amount, 0),
      paidReceivable: receivable.reduce((s, e) => s + e.paid_amount, 0),
      totalPayable: payable.reduce((s, e) => s + e.total_amount, 0),
      paidPayable: payable.reduce((s, e) => s + e.paid_amount, 0),
    };
  }, [entries]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Landmark className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Financeiro</h1>
            <p className="text-sm text-muted-foreground">
              Contas a Receber e a Pagar
            </p>
          </div>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Novo Lançamento
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Novo Lançamento Financeiro</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select
                  value={formType}
                  onValueChange={(v) => setFormType(v as "receivable" | "payable")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="receivable">A Receber</SelectItem>
                    <SelectItem value="payable">A Pagar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex: Venda a prazo para João"
                />
              </div>
              <div className="space-y-2">
                <Label>{formType === "receivable" ? "Cliente" : "Fornecedor"}</Label>
                <Input
                  value={entityName}
                  onChange={(e) => setEntityName(e.target.value)}
                  placeholder="Nome"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Valor Total (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={totalAmount}
                    onChange={(e) => setTotalAmount(e.target.value)}
                    placeholder="0,00"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Vencimento</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn("w-full justify-start text-left font-normal")}
                      >
                        {format(dueDate, "dd/MM/yy", { locale: ptBR })}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={dueDate}
                        onSelect={(d) => d && setDueDate(d)}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Referência (opcional)</Label>
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Nº do boleto ou venda"
                />
              </div>
              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notas adicionais"
                  rows={2}
                />
              </div>
              <Button type="submit" className="w-full">
                Criar Lançamento
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ArrowDownCircle className="h-4 w-4 text-emerald-500" />
              Total a Receber
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">
              {formatCurrency(totals.totalReceivable - totals.paidReceivable)}
            </p>
            <p className="text-xs text-muted-foreground">
              Recebido: {formatCurrency(totals.paidReceivable)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ArrowUpCircle className="h-4 w-4 text-destructive" />
              Total a Pagar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">
              {formatCurrency(totals.totalPayable - totals.paidPayable)}
            </p>
            <p className="text-xs text-muted-foreground">
              Pago: {formatCurrency(totals.paidPayable)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-primary" />
              Saldo Projetado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">
              {formatCurrency(
                (totals.totalReceivable - totals.paidReceivable) -
                  (totals.totalPayable - totals.paidPayable)
              )}
            </p>
            <p className="text-xs text-muted-foreground">Receber - Pagar</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Vencidos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">
              {entries.filter((e) => e.status !== "paid" && new Date(e.due_date) < new Date()).length}
            </p>
            <p className="text-xs text-muted-foreground">Títulos em atraso</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="receivable" className="gap-2">
            <ArrowDownCircle className="h-4 w-4" />
            A Receber
          </TabsTrigger>
          <TabsTrigger value="payable" className="gap-2">
            <ArrowUpCircle className="h-4 w-4" />
            A Pagar
          </TabsTrigger>
        </TabsList>

        <TabsContent value={tab}>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>{tab === "receivable" ? "Cliente" : "Fornecedor"}</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-right">Pago</TableHead>
                    <TableHead className="text-right">Restante</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-24"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        Carregando...
                      </TableCell>
                    </TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        Nenhum lançamento cadastrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((entry) => {
                      const remaining = entry.total_amount - entry.paid_amount;
                      const isOverdue =
                        entry.status !== "paid" && new Date(entry.due_date) < new Date();
                      const displayStatus = isOverdue ? "overdue" : entry.status;

                      return (
                        <TableRow key={entry.id}>
                          <TableCell
                            className={cn(isOverdue && "text-destructive font-medium")}
                          >
                            {format(new Date(entry.due_date), "dd/MM/yyyy")}
                          </TableCell>
                          <TableCell className="font-medium">{entry.description}</TableCell>
                          <TableCell>{entry.entity_name || "—"}</TableCell>
                          <TableCell className="text-right font-mono">
                            {formatCurrency(entry.total_amount)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-emerald-600">
                            {formatCurrency(entry.paid_amount)}
                          </TableCell>
                          <TableCell className="text-right font-mono font-medium">
                            {formatCurrency(remaining)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusVariant[displayStatus]}>
                              {statusLabel[displayStatus]}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {entry.status !== "paid" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openPayDialog(entry)}
                              >
                                Baixa
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Pay Dialog */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Registrar Baixa</DialogTitle>
          </DialogHeader>
          {selectedEntry && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                <p className="font-medium text-sm">{selectedEntry.description}</p>
                <p className="text-xs text-muted-foreground">
                  Total: {formatCurrency(selectedEntry.total_amount)} · Pago:{" "}
                  {formatCurrency(selectedEntry.paid_amount)}
                </p>
                <p className="text-sm font-semibold">
                  Restante:{" "}
                  {formatCurrency(selectedEntry.total_amount - selectedEntry.paid_amount)}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Valor da Baixa (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max={selectedEntry.total_amount - selectedEntry.paid_amount}
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  placeholder="0,00"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() =>
                    setPayAmount(
                      (selectedEntry.total_amount - selectedEntry.paid_amount).toFixed(2)
                    )
                  }
                >
                  Baixa Total
                </Button>
              </div>
              <Button onClick={handlePay} className="w-full">
                <CheckCircle className="h-4 w-4 mr-2" />
                Confirmar Baixa
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
