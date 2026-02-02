import { useState, useMemo } from "react";
import { History, Search, Filter, MessageCircle, Calendar, Eye, XCircle, Package, User, CreditCard, AlertTriangle } from "lucide-react";
import { useStore, Sale, sellers } from "@/store/useStore";
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
import { format, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { DateRange } from "react-day-picker";
import { generateWhatsAppReceipt, openWhatsApp } from "@/lib/whatsappReceipt";
import { toast } from "sonner";

const formatCurrency = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString("pt-BR");
};

const formatDateTime = (dateString: string) => {
  const date = new Date(dateString);
  return format(date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
};

const formatTime = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};

export default function Historico() {
  const { sales, cancelSale } = useStore();
  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [sellerFilter, setSellerFilter] = useState("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  
  // Detail sheet state
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  
  // Cancel dialog state
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelOperator, setCancelOperator] = useState("");

  const filteredSales = sales
    .filter((sale) => {
      const matchesSearch =
        sale.id.includes(search) ||
        sale.customer?.name.toLowerCase().includes(search.toLowerCase()) ||
        sale.seller?.name.toLowerCase().includes(search.toLowerCase());
      const matchesPayment = paymentFilter === "all" || sale.paymentMethod === paymentFilter;
      const matchesSeller = sellerFilter === "all" || sale.seller?.id === sellerFilter;
      
      let matchesDate = true;
      if (dateRange?.from) {
        const saleDate = new Date(sale.date);
        const from = startOfDay(dateRange.from);
        const to = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from);
        matchesDate = isWithinInterval(saleDate, { start: from, end: to });
      }

      return matchesSearch && matchesPayment && matchesSeller && matchesDate;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Only count active sales for totals
  const activeSales = useMemo(() => 
    filteredSales.filter((sale) => sale.status !== 'cancelled'), 
    [filteredSales]
  );

  const totalRevenue = activeSales.reduce((sum, sale) => sum + sale.total, 0);
  const totalProfit = activeSales.reduce((sum, sale) => sum + sale.profit, 0);
  const totalSales = activeSales.length;
  const cancelledCount = filteredSales.filter((s) => s.status === 'cancelled').length;

  // Payment method breakdown for day closing (only active sales)
  const paymentBreakdown = activeSales.reduce((acc, sale) => {
    acc[sale.paymentMethod] = (acc[sale.paymentMethod] || 0) + sale.total;
    return acc;
  }, {} as Record<string, number>);

  const handleSendWhatsApp = (sale: Sale) => {
    const phone = sale.customer?.phone || "";
    const message = generateWhatsAppReceipt(sale);
    openWhatsApp(phone, message);
  };

  const openSaleDetails = (sale: Sale) => {
    setSelectedSale(sale);
    setIsSheetOpen(true);
  };

  const openCancelDialog = () => {
    setCancelReason("");
    setCancelOperator("");
    setIsCancelDialogOpen(true);
  };

  const handleCancelSale = () => {
    if (!selectedSale) return;
    if (!cancelReason.trim() || !cancelOperator.trim()) {
      toast.error("Preencha o motivo e o operador");
      return;
    }
    
    cancelSale(selectedSale.id, cancelReason, cancelOperator);
    toast.success("Venda cancelada com sucesso! Estoque atualizado.");
    setIsCancelDialogOpen(false);
    setIsSheetOpen(false);
    setSelectedSale(null);
  };

  const clearFilters = () => {
    setSearch("");
    setPaymentFilter("all");
    setSellerFilter("all");
    setDateRange(undefined);
  };

  const hasActiveFilters = search || paymentFilter !== "all" || sellerFilter !== "all" || dateRange;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <History className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Histórico de Vendas</h1>
          <p className="text-sm text-muted-foreground">Relatórios e movimentações</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Vendas Ativas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalSales}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Faturamento</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-primary">{formatCurrency(totalRevenue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Lucro Bruto</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">{formatCurrency(totalProfit)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Margem Média</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : 0}%
            </p>
          </CardContent>
        </Card>
        {cancelledCount > 0 && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-destructive">Canceladas</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-destructive">{cancelledCount}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Payment Breakdown - Day Closing Report */}
      {Object.keys(paymentBreakdown).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Fechamento por Forma de Pagamento</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              {Object.entries(paymentBreakdown).map(([method, amount]) => (
                <div key={method} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50">
                  <Badge variant="outline">{method}</Badge>
                  <span className="font-mono font-medium">{formatCurrency(amount)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="p-4 border-b border-border">
          <div className="flex flex-wrap gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por ID, cliente ou vendedor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Date Range Filter */}
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
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>

            {/* Seller Filter */}
            <Select value={sellerFilter} onValueChange={setSellerFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Vendedor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos vendedores</SelectItem>
                {sellers.map((seller) => (
                  <SelectItem key={seller.id} value={seller.id}>
                    {seller.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Payment Filter */}
            <Select value={paymentFilter} onValueChange={setPaymentFilter}>
              <SelectTrigger className="w-[160px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Pagamento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="Pix">Pix</SelectItem>
                <SelectItem value="Cartão">Cartão</SelectItem>
                <SelectItem value="Boleto">Boleto</SelectItem>
                <SelectItem value="Dinheiro">Dinheiro</SelectItem>
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button variant="ghost" onClick={clearFilters} className="text-muted-foreground">
                Limpar filtros
              </Button>
            )}
          </div>
        </div>

        {/* Sales Table */}
        <div className="overflow-x-auto">
          {filteredSales.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              {sales.length === 0
                ? "Nenhuma venda registrada ainda. Faça sua primeira venda no PDV!"
                : "Nenhuma venda encontrada com os filtros aplicados."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Itens</TableHead>
                  <TableHead>Pagamento</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Lucro</TableHead>
                  <TableHead className="text-center">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSales.map((sale) => {
                  const isCancelled = sale.status === 'cancelled';
                  return (
                    <TableRow 
                      key={sale.id} 
                      className={cn(
                        "cursor-pointer hover:bg-muted/50 transition-colors",
                        isCancelled && "bg-destructive/10 hover:bg-destructive/15"
                      )}
                      onClick={() => openSaleDetails(sale)}
                    >
                      <TableCell>
                        {isCancelled ? (
                          <Badge variant="destructive">Cancelada</Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                            Concluída
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm">#{sale.id.slice(-6)}</TableCell>
                      <TableCell>
                        <div className="text-sm">{formatDate(sale.date)}</div>
                        <div className="text-xs text-muted-foreground">{formatTime(sale.date)}</div>
                      </TableCell>
                      <TableCell>{sale.customer?.name || "—"}</TableCell>
                      <TableCell>{sale.seller?.name || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {sale.items.reduce((sum, item) => sum + item.quantity, 0)} itens
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{sale.paymentMethod}</Badge>
                      </TableCell>
                      <TableCell className={cn("text-right font-medium", isCancelled && "line-through text-muted-foreground")}>
                        {formatCurrency(sale.total)}
                      </TableCell>
                      <TableCell className={cn("text-right font-medium", isCancelled ? "line-through text-muted-foreground" : "text-emerald-600")}>
                        {formatCurrency(sale.profit)}
                      </TableCell>
                      <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openSaleDetails(sale)}
                            title="Ver detalhes"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {!isCancelled && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleSendWhatsApp(sale)}
                              title="Enviar comprovante via WhatsApp"
                            >
                              <MessageCircle className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* Sale Details Sheet */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selectedSale && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  Venda #{selectedSale.id.slice(-6)}
                  {selectedSale.status === 'cancelled' && (
                    <Badge variant="destructive">Cancelada</Badge>
                  )}
                </SheetTitle>
                <SheetDescription>
                  {formatDateTime(selectedSale.date)}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {/* Cancellation Info */}
                {selectedSale.status === 'cancelled' && (
                  <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 space-y-2">
                    <div className="flex items-center gap-2 text-destructive font-medium">
                      <AlertTriangle className="h-4 w-4" />
                      Venda Cancelada
                    </div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p><strong>Data:</strong> {selectedSale.cancelledAt ? formatDateTime(selectedSale.cancelledAt) : "—"}</p>
                      <p><strong>Por:</strong> {selectedSale.cancelledBy || "—"}</p>
                      <p><strong>Motivo:</strong> {selectedSale.cancelReason || "—"}</p>
                    </div>
                  </div>
                )}

                {/* Customer & Seller Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <User className="h-4 w-4" />
                      Cliente
                    </div>
                    <p className="font-medium">{selectedSale.customer?.name || "Cliente Avulso"}</p>
                    {selectedSale.customer?.phone && (
                      <p className="text-sm text-muted-foreground">{selectedSale.customer.phone}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <User className="h-4 w-4" />
                      Vendedor
                    </div>
                    <p className="font-medium">{selectedSale.seller?.name || "—"}</p>
                  </div>
                </div>

                <Separator />

                {/* Payment Info */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CreditCard className="h-4 w-4" />
                    Forma de Pagamento
                  </div>
                  <Badge variant="outline" className="text-base">{selectedSale.paymentMethod}</Badge>
                </div>

                <Separator />

                {/* Items List */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Package className="h-4 w-4" />
                    Itens da Venda
                  </div>
                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Produto</TableHead>
                          <TableHead className="text-center">Qtd</TableHead>
                          <TableHead className="text-right">Unit.</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedSale.items.map((item, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">{item.product.name}</TableCell>
                            <TableCell className="text-center">{item.quantity}</TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {formatCurrency(item.product.salePrice)}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(item.product.salePrice * item.quantity)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <Separator />

                {/* Totals */}
                <div className="space-y-2">
                  <div className="flex justify-between text-lg">
                    <span>Total da Venda</span>
                    <span className={cn("font-bold", selectedSale.status === 'cancelled' && "line-through text-muted-foreground")}>
                      {formatCurrency(selectedSale.total)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Lucro Bruto</span>
                    <span className={cn("font-medium", selectedSale.status === 'cancelled' ? "line-through" : "text-emerald-600")}>
                      {formatCurrency(selectedSale.profit)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Margem</span>
                    <span className="font-medium">
                      {((selectedSale.profit / selectedSale.total) * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>

                {/* Actions */}
                {selectedSale.status !== 'cancelled' && (
                  <>
                    <Separator />
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => handleSendWhatsApp(selectedSale)}
                      >
                        <MessageCircle className="h-4 w-4 mr-2" />
                        Enviar WhatsApp
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={openCancelDialog}
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Cancelar Venda
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Cancelar Venda
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação irá cancelar a venda e devolver os produtos ao estoque automaticamente.
              A venda permanecerá no histórico para auditoria, mas não será contabilizada nos totais.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="cancelOperator">Responsável pelo cancelamento *</Label>
              <Input
                id="cancelOperator"
                value={cancelOperator}
                onChange={(e) => setCancelOperator(e.target.value)}
                placeholder="Nome do operador"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cancelReason">Motivo do cancelamento *</Label>
              <Textarea
                id="cancelReason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Descreva o motivo do cancelamento..."
                rows={3}
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelSale}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Confirmar Cancelamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
