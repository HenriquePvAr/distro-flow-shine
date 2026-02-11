import { useState, useEffect, useMemo } from "react";
import { History, Search, Filter, MessageCircle, Calendar, Eye, XCircle, Package, User, CreditCard, AlertTriangle, Lock, Loader2 } from "lucide-react";
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
import { format, isWithinInterval, startOfDay, endOfDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { DateRange } from "react-day-picker";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// --- TIPAGEM ---
interface Sale {
  id: string;
  created_at: string;
  description: string;
  total_amount: number;
  status: 'paid' | 'cancelled' | 'pending';
  entity_name: string; // Cliente
  // Campos virtuais (extraídos da descrição ou lógica)
  seller_name?: string;
  payment_method?: string;
  items_count?: number;
}

// --- HELPERS ---
const formatCurrency = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatDate = (dateString: string) => {
  if (!dateString) return "-";
  return format(parseISO(dateString), "dd/MM/yyyy");
};

const formatTime = (dateString: string) => {
  if (!dateString) return "-";
  return format(parseISO(dateString), "HH:mm");
};

export default function Historico() {
  const { isAdmin, profile } = useAuth();
  
  // Dados
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  
  // Sheet Detalhes
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  
  // Dialog Cancelamento
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelOperator, setCancelOperator] = useState(profile?.name || "");

  // Carregar Vendas
  useEffect(() => {
    fetchSales();
  }, []);

  const fetchSales = async () => {
    setLoading(true);
    try {
      // Busca apenas entradas do tipo 'receivable' (vendas) que venham do PDV (reference começa com PDV)
      const { data, error } = await supabase
        .from("financial_entries")
        .select("*")
        .eq("type", "receivable")
        .ilike("reference", "PDV%")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setSales(data || []);
    } catch (error) {
      console.error("Erro ao buscar histórico:", error);
      toast.error("Erro ao carregar histórico de vendas.");
    } finally {
      setLoading(false);
    }
  };

  // Filtragem local
  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      // Texto (ID, Cliente, Descrição)
      const searchLower = search.toLowerCase();
      const matchesSearch =
        sale.id.toLowerCase().includes(searchLower) ||
        (sale.entity_name || "").toLowerCase().includes(searchLower) ||
        (sale.description || "").toLowerCase().includes(searchLower);
      
      // Status
      const matchesStatus = statusFilter === "all" || 
        (statusFilter === "cancelled" ? sale.status === "cancelled" : sale.status === "paid");
      
      // Data
      let matchesDate = true;
      if (dateRange?.from) {
        const saleDate = parseISO(sale.created_at);
        const from = startOfDay(dateRange.from);
        const to = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from);
        matchesDate = isWithinInterval(saleDate, { start: from, end: to });
      }

      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [sales, search, statusFilter, dateRange]);

  // Totais
  const activeSales = filteredSales.filter(s => s.status === 'paid');
  const totalRevenue = activeSales.reduce((sum, s) => sum + Number(s.total_amount), 0);
  const cancelledCount = filteredSales.filter(s => s.status === 'cancelled').length;

  // Ações
  const openSaleDetails = (sale: Sale) => {
    setSelectedSale(sale);
    setIsSheetOpen(true);
  };

  const openCancelDialog = () => {
    setCancelReason("");
    setCancelOperator(profile?.name || "");
    setIsCancelDialogOpen(true);
  };

  const handleCancelSale = async () => {
    if (!selectedSale) return;
    if (!cancelReason.trim() || !cancelOperator.trim()) {
      toast.error("Preencha o motivo e o operador");
      return;
    }

    try {
      // 1. Atualizar status no financeiro
      const { error } = await supabase
        .from("financial_entries")
        .update({ 
            status: "cancelled",
            description: `${selectedSale.description} [CANCELADO por ${cancelOperator}: ${cancelReason}]`
        })
        .eq("id", selectedSale.id);

      if (error) throw error;

      // TODO: Implementar estorno de estoque se possível (exige parsing complexo da string de descrição ou tabela relacional)
      // Por enquanto, apenas marca como cancelado financeiramente.
      
      toast.success("Venda cancelada com sucesso!");
      setIsCancelDialogOpen(false);
      setIsSheetOpen(false);
      fetchSales(); // Recarrega lista

    } catch (error: any) {
        toast.error("Erro ao cancelar venda", { description: error.message });
    }
  };

  const handleSendWhatsApp = (sale: Sale) => {
    // Tenta extrair telefone do cliente se não tivermos no objeto (aqui simplificado)
    // O ideal é buscar o cliente na tabela customers pelo nome
    toast.info("Funcionalidade de reenvio em desenvolvimento.");
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setDateRange(undefined);
  };

  const hasActiveFilters = search || statusFilter !== "all" || dateRange;

  // Renderização
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <History className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Histórico de Vendas</h1>
          <p className="text-sm text-muted-foreground">Registro de todas as vendas do PDV</p>
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Vendas Exibidas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{filteredSales.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Faturamento (Período)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">{formatCurrency(totalRevenue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ticket Médio</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {activeSales.length > 0 ? formatCurrency(totalRevenue / activeSales.length) : "R$ 0,00"}
            </p>
          </CardContent>
        </Card>
        <Card className={cancelledCount > 0 ? "border-destructive/30 bg-destructive/5" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-destructive">Canceladas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">{cancelledCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="rounded-xl border border-border bg-card shadow-sm p-4">
        <div className="flex flex-wrap gap-4 items-end">
            <div className="relative flex-1 min-w-[200px]">
                <Label className="mb-1 block text-xs">Busca</Label>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="ID, Cliente ou Produto..."
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
                    <Button variant="outline" className={cn("w-[240px] justify-start text-left font-normal", !dateRange && "text-muted-foreground")}>
                        <Calendar className="mr-2 h-4 w-4" />
                        {dateRange?.from ? (
                        dateRange.to ? (
                            <>{format(dateRange.from, "dd/MM", { locale: ptBR })} - {format(dateRange.to, "dd/MM", { locale: ptBR })}</>
                        ) : format(dateRange.from, "dd/MM/yyyy", { locale: ptBR })
                        ) : "Filtrar por data"}
                    </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent mode="range" selected={dateRange} onSelect={setDateRange} numberOfMonths={2} initialFocus className="p-3" />
                    </PopoverContent>
                </Popover>
            </div>

            <div className="flex flex-col gap-1">
                <Label className="text-xs">Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[150px]">
                        <Filter className="h-4 w-4 mr-2" />
                        <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="paid">Concluídas</SelectItem>
                        <SelectItem value="cancelled">Canceladas</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {hasActiveFilters && (
                <Button variant="ghost" onClick={clearFilters} className="mb-0.5">Limpar</Button>
            )}
        </div>
      </div>

      {/* Tabela de Vendas */}
      <div className="rounded-md border overflow-hidden">
        {loading ? (
            <div className="flex justify-center items-center h-40">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        ) : filteredSales.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Nenhuma venda encontrada.</div>
        ) : (
            <Table>
                <TableHeader>
                    <TableRow className="bg-muted/50">
                        <TableHead>Data</TableHead>
                        <TableHead>Hora</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Resumo / Pagamento</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                        <TableHead className="text-right">Valor Total</TableHead>
                        <TableHead className="text-center">Ações</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {filteredSales.map((sale) => (
                        <TableRow key={sale.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => openSaleDetails(sale)}>
                            <TableCell>{formatDate(sale.created_at)}</TableCell>
                            <TableCell className="text-muted-foreground text-xs">{formatTime(sale.created_at)}</TableCell>
                            <TableCell className="font-medium">{sale.entity_name}</TableCell>
                            <TableCell className="max-w-[300px] truncate text-xs text-muted-foreground" title={sale.description}>
                                {sale.description.replace('Venda PDV - ', '')}
                            </TableCell>
                            <TableCell className="text-center">
                                {sale.status === 'cancelled' ? (
                                    <Badge variant="destructive">Cancelada</Badge>
                                ) : (
                                    <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 hover:bg-emerald-200">Concluída</Badge>
                                )}
                            </TableCell>
                            <TableCell className="text-right font-bold text-emerald-700">
                                {formatCurrency(sale.total_amount)}
                            </TableCell>
                            <TableCell className="text-center">
                                <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openSaleDetails(sale); }}>
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
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
            {selectedSale && (
                <>
                    <SheetHeader>
                        <SheetTitle>Detalhes da Venda</SheetTitle>
                        <SheetDescription>
                            Realizada em {format(parseISO(selectedSale.created_at), "dd/MM/yyyy 'às' HH:mm")}
                        </SheetDescription>
                    </SheetHeader>

                    <div className="mt-6 space-y-6">
                        <div className="p-4 bg-muted/30 rounded-lg border space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="text-muted-foreground text-sm">Status</span>
                                {selectedSale.status === 'cancelled' ? (
                                    <Badge variant="destructive">Cancelada</Badge>
                                ) : (
                                    <Badge className="bg-emerald-600">Concluída</Badge>
                                )}
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-muted-foreground text-sm">Cliente</span>
                                <span className="font-medium">{selectedSale.entity_name}</span>
                            </div>
                            <Separator />
                            <div className="flex justify-between items-center">
                                <span className="text-lg font-bold">Total</span>
                                <span className="text-xl font-bold text-emerald-600">{formatCurrency(selectedSale.total_amount)}</span>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <h3 className="font-semibold text-sm flex items-center gap-2"><Package className="h-4 w-4" /> Resumo da Operação</h3>
                            <div className="p-3 bg-card border rounded text-sm text-muted-foreground whitespace-pre-wrap">
                                {selectedSale.description}
                            </div>
                        </div>

                        {/* Botões de Ação */}
                        {selectedSale.status !== 'cancelled' && (
                            <div className="flex flex-col gap-2 pt-4">
                                {isAdmin && (
                                    <Button variant="destructive" onClick={openCancelDialog} className="w-full">
                                        <XCircle className="h-4 w-4 mr-2" /> Cancelar Venda
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>
                </>
            )}
        </SheetContent>
      </Sheet>

      {/* Dialog Confirmar Cancelamento */}
      <AlertDialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Cancelar Venda?</AlertDialogTitle>
                <AlertDialogDescription>
                    Essa ação é irreversível no financeiro. O valor será removido do caixa.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-4 py-2">
                <div className="space-y-2">
                    <Label>Operador Responsável</Label>
                    <Input value={cancelOperator} onChange={e => setCancelOperator(e.target.value)} />
                </div>
                <div className="space-y-2">
                    <Label>Motivo</Label>
                    <Textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="Ex: Cliente desistiu, Erro de lançamento..." />
                </div>
            </div>
            <AlertDialogFooter>
                <AlertDialogCancel>Voltar</AlertDialogCancel>
                <AlertDialogAction onClick={handleCancelSale} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Confirmar Cancelamento
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}