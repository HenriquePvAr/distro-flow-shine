"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Wallet,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Search,
  Calendar as CalendarIcon,
  Info,
  X,
  Repeat,
  AlertCircle,
  MoreHorizontal
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
  DialogDescription
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

export default function Despesas() {
  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInfo, setShowInfo] = useState(true);

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
    const isHidden = localStorage.getItem("hide_financial_info");
    if (isHidden === "true") setShowInfo(false);
    fetchEntries();
  }, []);

  const handleCloseInfo = () => {
    setShowInfo(false);
    localStorage.setItem("hide_financial_info", "true");
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
    }

    let result = entries;
    if (start && end) {
      result = result.filter((e) => isWithinInterval(parseISO(e.due_date), { start, end }));
    }

    const s = searchTerm.trim().toLowerCase();
    if (s) {
      result = result.filter(e => 
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
    if (!description || isNaN(amount) || amount <= 0) return toast.error("Dados inválidos.");

    const entriesToCreate: any[] = [];
    const loopCount = isRecurring ? 12 : 1;

    for (let i = 0; i < loopCount; i++) {
      const entryDate = new Date(dueDate);
      entryDate.setMonth(entryDate.getMonth() + i);
      entriesToCreate.push({
        type: formType,
        description: isRecurring ? `${description} (${i + 1}/12)` : description,
        total_amount: amount,
        paid_amount: 0,
        due_date: entryDate.toISOString(),
        entity_name: entityName.trim() || null,
        status: "pending",
      });
    }

    const { error } = await supabase.from("financial_entries").insert(entriesToCreate);
    if (error) return toast.error("Erro ao salvar.");

    toast.success("Salvo com sucesso!");
    resetForm();
    setDialogOpen(false);
    fetchEntries();
  };

  const handlePay = async () => {
    if (!selectedEntry) return;
    const amount = parseFloat(payAmount);
    if (isNaN(amount) || amount <= 0) return toast.error("Valor inválido.");

    const newPaid = (selectedEntry.paid_amount || 0) + amount;
    const newStatus = newPaid >= selectedEntry.total_amount ? "paid" : "partial";

    const { error } = await supabase
      .from("financial_entries")
      .update({ paid_amount: newPaid, status: newStatus })
      .eq("id", selectedEntry.id);

    if (error) return toast.error("Erro ao baixar.");

    toast.success("Baixa realizada!");
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
    const receivable = filteredEntries.filter(e => e.type === "receivable");
    const payable = filteredEntries.filter(e => e.type === "payable");

    const totalRec = receivable.reduce((acc, e) => acc + e.total_amount, 0);
    const totalPay = payable.reduce((acc, e) => acc + e.total_amount, 0);
    
    const paidRec = receivable.reduce((acc, e) => acc + (e.paid_amount || 0), 0);
    const paidPay = payable.reduce((acc, e) => acc + (e.paid_amount || 0), 0);

    return { totalRec, totalPay, paidRec, paidPay, balance: paidRec - paidPay };
  }, [filteredEntries]);

  const progress = summary.totalPay > 0 ? (summary.totalRec / summary.totalPay) * 100 : 100;
  const isProfitable = summary.totalRec >= summary.totalPay;

  // --- UI COMPONENTS ---
  const EntryItem = ({ entry }: { entry: FinancialEntry }) => {
    const isPaid = entry.status === 'paid';
    const isReceivable = entry.type === 'receivable';
    const isOverdue = !isPaid && new Date(entry.due_date) < new Date();
    
    return (
      <div className={`flex items-center justify-between p-3 bg-white border rounded-xl mb-2 shadow-sm relative overflow-hidden ${isPaid ? 'opacity-70' : ''}`}>
        {isOverdue && <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500" />}
        
        <div className="flex items-center gap-3 overflow-hidden">
          <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${isReceivable ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
            {isReceivable ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm truncate text-gray-900">{entry.description}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{format(parseISO(entry.due_date), "dd/MM")}</span>
              {entry.entity_name && (
                <>
                  <span>•</span>
                  <span className="truncate max-w-[100px]">{entry.entity_name}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          <span className={`font-bold text-sm ${isReceivable ? 'text-emerald-700' : 'text-red-700'}`}>
            {isReceivable ? '+' : '-'}{formatCurrency(entry.total_amount)}
          </span>
          
          {isPaid ? (
            <Badge variant="outline" className="text-[10px] bg-gray-50 text-gray-600 border-gray-200 px-1.5 h-5">
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
    <div className="flex flex-col h-full bg-slate-50/50 pb-20">
      
      {/* HEADER COMPACTO */}
      <div className="sticky top-0 bg-white/90 backdrop-blur-md border-b z-10 px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold flex items-center gap-2 text-slate-800">
            <Wallet className="h-5 w-5 text-primary" /> Financeiro
          </h1>
          
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="h-8 w-[130px] text-xs bg-slate-100 border-none">
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

        {/* BARRA DE PESQUISA */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar lançamentos..." 
            className="pl-9 h-10 bg-slate-50 border-slate-200"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* CARDS DE RESUMO - SCROLL HORIZONTAL NO MOBILE */}
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-3 sm:overflow-visible">
          
          <Card className="min-w-[140px] flex-1 border-none shadow-sm bg-white">
            <CardContent className="p-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase">Saldo Real</p>
              <p className={`text-lg font-bold ${summary.balance >= 0 ? "text-primary" : "text-destructive"}`}>
                {formatCurrency(summary.balance)}
              </p>
            </CardContent>
          </Card>

          <Card className="min-w-[140px] flex-1 border-none shadow-sm bg-red-50/50">
             <CardContent className="p-3">
               <p className="text-[10px] font-semibold text-red-600/70 uppercase">A Pagar</p>
               <p className="text-lg font-bold text-red-700">
                 {formatCurrency(summary.totalPayable - summary.paidPayable)}
               </p>
             </CardContent>
          </Card>

          <Card className="min-w-[140px] flex-1 border-none shadow-sm bg-emerald-50/50">
             <CardContent className="p-3">
               <p className="text-[10px] font-semibold text-emerald-600/70 uppercase">A Receber</p>
               <p className="text-lg font-bold text-emerald-700">
                 {formatCurrency(summary.totalReceivable - summary.paidReceivable)}
               </p>
             </CardContent>
          </Card>

        </div>

        {/* PROGRESSO DE META */}
        <Card className="border-none shadow-sm bg-gradient-to-r from-blue-50 to-indigo-50">
          <CardContent className="p-3">
            <div className="flex justify-between text-xs font-medium mb-2">
              <span className="text-blue-700">Cobertura de Despesas</span>
              <span className={isProfitable ? "text-emerald-600" : "text-amber-600"}>
                {progress.toFixed(0)}%
              </span>
            </div>
            <Progress value={progress} className="h-2 bg-blue-200" />
            <p className="text-[10px] text-muted-foreground mt-2 text-center">
              {isProfitable ? "Receitas cobrem as despesas! 🎉" : "Atenção: Despesas maiores que receitas."}
            </p>
          </CardContent>
        </Card>

        {/* LISTA DE LANÇAMENTOS COM ABAS */}
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-9 mb-2 bg-slate-100 p-1">
            <TabsTrigger value="all" className="text-xs">Tudo</TabsTrigger>
            <TabsTrigger value="payable" className="text-xs">Saídas</TabsTrigger>
            <TabsTrigger value="receivable" className="text-xs">Entradas</TabsTrigger>
          </TabsList>

          <div className="space-y-2 pb-20">
            {["all", "payable", "receivable"].map(tab => (
              <TabsContent key={tab} value={tab} className="m-0 space-y-0">
                {filteredEntries
                  .filter(e => tab === "all" || e.type === tab)
                  .map(entry => (
                    <EntryItem key={entry.id} entry={entry} />
                  ))}
                 
                 {filteredEntries.filter(e => tab === "all" || e.type === tab).length === 0 && (
                   <div className="text-center py-10 text-muted-foreground text-sm">
                     Nenhum lançamento encontrado.
                   </div>
                 )}
              </TabsContent>
            ))}
          </div>
        </Tabs>
      </div>

      {/* FAB - BOTÃO FLUTUANTE DE ADICIONAR */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button 
            size="icon" 
            className="fixed bottom-24 right-4 h-14 w-14 rounded-full shadow-lg bg-primary hover:bg-primary/90 z-20"
          >
            <Plus className="h-6 w-6" />
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md top-[20%] translate-y-0">
           <DialogHeader>
             <DialogTitle>Novo Lançamento</DialogTitle>
           </DialogHeader>
           <form onSubmit={handleCreate} className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                 <div className="space-y-1">
                    <Label className="text-xs">Tipo</Label>
                    <Select value={formType} onValueChange={(v: any) => setFormType(v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
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
                      onChange={e => setTotalAmount(e.target.value)}
                      className="font-bold"
                    />
                 </div>
              </div>
              
              <div className="space-y-1">
                 <Label className="text-xs">Descrição</Label>
                 <Input 
                   placeholder="Ex: Aluguel, Venda..." 
                   value={description}
                   onChange={e => setDescription(e.target.value)}
                 />
              </div>

              <div className="grid grid-cols-2 gap-3">
                 <div className="space-y-1">
                   <Label className="text-xs">Entidade (Opcional)</Label>
                   <Input 
                     placeholder="Nome..." 
                     value={entityName}
                     onChange={e => setEntityName(e.target.value)}
                   />
                 </div>
                 <div className="space-y-1">
                   <Label className="text-xs">Vencimento</Label>
                   <Input 
                     type="date" 
                     value={format(dueDate, "yyyy-MM-dd")}
                     onChange={e => setDueDate(new Date(e.target.value))}
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

              <Button type="submit" className="w-full">Salvar</Button>
           </form>
        </DialogContent>
      </Dialog>

      {/* DIALOG DE BAIXA */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent className="max-w-xs top-[30%] translate-y-0">
          <DialogHeader>
            <DialogTitle>Baixar Lançamento</DialogTitle>
            <DialogDescription>Confirme o valor pago.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
             <div className="bg-slate-50 p-3 rounded-lg border text-sm">
                <p className="font-medium truncate">{selectedEntry?.description}</p>
                <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                   <span>Total: {formatCurrency(selectedEntry?.total_amount || 0)}</span>
                   <span className="font-bold text-primary">
                     Restante: {formatCurrency((selectedEntry?.total_amount || 0) - (selectedEntry?.paid_amount || 0))}
                   </span>
                </div>
             </div>
             <div className="space-y-1">
               <Label>Valor do Pagamento</Label>
               <Input 
                 type="number" 
                 value={payAmount} 
                 onChange={e => setPayAmount(e.target.value)}
                 className="text-lg font-bold"
               />
             </div>
             <Button onClick={handlePay} className="w-full">Confirmar Baixa</Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}