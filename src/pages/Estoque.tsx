import { useState, useMemo, useEffect } from "react";
import { 
  Package, 
  AlertTriangle, 
  Plus, 
  Edit, 
  History, 
  ArrowDownCircle, 
  ArrowUpCircle, 
  RefreshCw, 
  ShoppingCart, 
  Search, 
  Loader2 
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logStockMovement, fetchStockLogs, type StockLogRow } from "@/lib/stockLogger";

// --- TIPAGEM ---
interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  stock: number;
  minStock: number;
  costPrice: number;
  salePrice: number;
}

// --- CONFIGURAÇÕES ---
const adjustmentReasons = [
  { value: "erro_contagem", label: "Erro de Contagem" },
  { value: "avaria", label: "Avaria" },
  { value: "bonificacao", label: "Bonificação" },
  { value: "perda", label: "Perda" },
  { value: "outros", label: "Outros" },
];

const movementTypeLabels: Record<string, { label: string; color: string; icon: any }> = {
  entrada: { label: "Entrada", color: "bg-emerald-500", icon: ArrowDownCircle },
  saida: { label: "Saída", color: "bg-red-500", icon: ArrowUpCircle },
  ajuste: { label: "Ajuste", color: "bg-amber-500", icon: Edit },
  venda: { label: "Venda", color: "bg-blue-500", icon: ShoppingCart },
};

export default function Estoque() {
  // Estados de Dados
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Estados dos Modais
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [kardexDialogOpen, setKardexDialogOpen] = useState(false);
  
  // Estado de Seleção
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Formulário Entrada
  const [entryProductId, setEntryProductId] = useState("");
  const [entryQuantity, setEntryQuantity] = useState("");
  const [entryNotes, setEntryNotes] = useState("");
  const [entryOperator, setEntryOperator] = useState("");
  const [entryCostPrice, setEntryCostPrice] = useState("");

  // Formulário Ajuste
  const [adjustProductId, setAdjustProductId] = useState("");
  const [adjustQuantity, setAdjustQuantity] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustNotes, setAdjustNotes] = useState("");
  const [adjustOperator, setAdjustOperator] = useState("");

  // Logs
  const [supabaseLogs, setSupabaseLogs] = useState<StockLogRow[]>([]);
  const [logsSearch, setLogsSearch] = useState("");
  const [loadingLogs, setLoadingLogs] = useState(false);

  // --- CARREGAMENTO INICIAL ---
  useEffect(() => {
    fetchProducts();
    loadLogs();
  }, []);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order('name');

      if (error) throw error;

      if (data) {
        const mappedProducts: Product[] = data.map((item: any) => ({
          id: item.id,
          name: item.name,
          sku: item.sku || "N/A",
          category: item.category || "Geral",
          stock: Number(item.stock ?? 0),
          minStock: Number(item.min_stock ?? 5),
          costPrice: Number(item.cost_price ?? 0),
          salePrice: Number(item.sale_price ?? 0),
        }));
        setProducts(mappedProducts);
      }
    } catch (error) {
      console.error("Erro ao buscar produtos:", error);
      toast.error("Erro ao carregar estoque.");
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async () => {
    setLoadingLogs(true);
    try {
      const logs = await fetchStockLogs(200);
      setSupabaseLogs(logs);
    } catch (error) {
      console.error("Erro ao buscar logs:", error);
    } finally {
      setLoadingLogs(false);
    }
  };

  // --- HELPERS ---
  const formatCurrency = (value: number) =>
    value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const getMargin = (cost: number, sale: number) => {
    if (cost === 0) return "100";
    return (((sale - cost) / cost) * 100).toFixed(1);
  };

  // --- AÇÕES ---

  const handleEntry = async () => {
    if (!entryProductId || !entryQuantity || !entryOperator) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    const qty = parseFloat(entryQuantity);
    if (isNaN(qty) || qty <= 0) {
      toast.error("Quantidade inválida");
      return;
    }
    
    const costPrice = entryCostPrice ? parseFloat(entryCostPrice) : undefined;
    const product = products.find((p) => p.id === entryProductId);
    if (!product) return;

    try {
      // 1. Atualiza Banco de Dados
      const newStock = product.stock + qty;
      
      // Se informou custo novo, atualiza o custo também
      const updateData: any = { stock: newStock };
      if (costPrice) updateData.cost_price = costPrice;

      const { error } = await supabase
        .from("products")
        .update(updateData)
        .eq("id", product.id);

      if (error) throw error;

      // 2. Registra Log
      await logStockMovement({
        product_id: entryProductId,
        product_name: product.name,
        movement_type: "entrada",
        quantity: qty,
        previous_stock: product.stock,
        new_stock: newStock,
        reason: "Entrada Fornecedor",
        notes: entryNotes,
        operator: entryOperator,
        cost_price: costPrice,
      });

      toast.success("Entrada registrada com sucesso!");
      setEntryDialogOpen(false);
      
      // Limpa e Recarrega
      setEntryProductId("");
      setEntryQuantity("");
      setEntryNotes("");
      setEntryOperator("");
      setEntryCostPrice("");
      
      fetchProducts(); // Atualiza a tabela
      loadLogs();      // Atualiza o kardex

    } catch (error: any) {
      toast.error("Erro ao registrar entrada", { description: error.message });
    }
  };

  const handleAdjustment = async () => {
    if (!adjustProductId || !adjustQuantity || !adjustReason || !adjustOperator) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    const qty = parseFloat(adjustQuantity);
    if (isNaN(qty)) {
      toast.error("Quantidade inválida");
      return;
    }
    
    const product = products.find((p) => p.id === adjustProductId);
    if (!product) return;

    try {
      // 1. Atualiza Banco
      const newStock = product.stock + qty; // qty pode ser negativo
      if (newStock < 0) {
        toast.error("O estoque não pode ficar negativo.");
        return;
      }

      const { error } = await supabase
        .from("products")
        .update({ stock: newStock })
        .eq("id", product.id);

      if (error) throw error;

      // 2. Registra Log
      await logStockMovement({
        product_id: adjustProductId,
        product_name: product.name,
        movement_type: "ajuste",
        quantity: qty,
        previous_stock: product.stock,
        new_stock: newStock,
        reason: adjustReason,
        notes: adjustNotes,
        operator: adjustOperator,
      });

      toast.success("Ajuste realizado!");
      setAdjustDialogOpen(false);
      
      setAdjustProductId("");
      setAdjustQuantity("");
      setAdjustReason("");
      setAdjustNotes("");
      setAdjustOperator("");

      fetchProducts();
      loadLogs();

    } catch (error: any) {
      toast.error("Erro ao ajustar estoque", { description: error.message });
    }
  };

  // Abre Kardex Individual
  const openKardex = (product: Product) => {
    setSelectedProduct(product);
    setKardexDialogOpen(true);
  };

  // Filtra logs para o produto selecionado no modal
  const productSpecificLogs = useMemo(() => {
    if (!selectedProduct) return [];
    return supabaseLogs.filter(log => log.product_name === selectedProduct.name);
  }, [selectedProduct, supabaseLogs]);

  const lowStockProducts = products.filter((p) => p.stock < p.minStock);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Package className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Gestão de Estoque</h1>
            <p className="text-sm text-muted-foreground">
              {products.length} produtos cadastrados
            </p>
          </div>
        </div>
        
        <div className="flex gap-2 w-full sm:w-auto">
          {/* BOTÃO NOVA ENTRADA */}
          <Dialog open={entryDialogOpen} onOpenChange={setEntryDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 w-full sm:w-auto">
                <Plus className="h-4 w-4" /> Entrada
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Registrar Entrada de Mercadoria</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Produto *</Label>
                  <Select value={entryProductId} onValueChange={setEntryProductId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o produto" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((product) => (
                        <SelectItem key={product.id} value={product.id}>
                          {product.name} (Atual: {product.stock})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                    <Label>Quantidade *</Label>
                    <Input
                        type="number"
                        min="0.001"
                        step="0.001"
                        value={entryQuantity}
                        onChange={(e) => setEntryQuantity(e.target.value)}
                        placeholder="Ex: 10"
                    />
                    </div>
                    <div className="space-y-2">
                    <Label>Custo Unit. (R$)</Label>
                    <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={entryCostPrice}
                        onChange={(e) => setEntryCostPrice(e.target.value)}
                        placeholder="0,00"
                    />
                    </div>
                </div>
                <div className="space-y-2">
                  <Label>Operador *</Label>
                  <Input
                    value={entryOperator}
                    onChange={(e) => setEntryOperator(e.target.value)}
                    placeholder="Seu nome"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Observações</Label>
                  <Textarea
                    value={entryNotes}
                    onChange={(e) => setEntryNotes(e.target.value)}
                    placeholder="Nota fiscal, fornecedor, etc."
                  />
                </div>
                <Button onClick={handleEntry} className="w-full">Registrar Entrada</Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* BOTÃO AJUSTE */}
          <Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2 w-full sm:w-auto">
                <Edit className="h-4 w-4" /> Ajuste
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Ajuste Manual de Estoque</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Produto *</Label>
                  <Select value={adjustProductId} onValueChange={setAdjustProductId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o produto" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((product) => (
                        <SelectItem key={product.id} value={product.id}>
                          {product.name} (Atual: {product.stock})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Qtd (+ adiciona, - remove) *</Label>
                  <Input
                    type="number"
                    step="0.001"
                    value={adjustQuantity}
                    onChange={(e) => setAdjustQuantity(e.target.value)}
                    placeholder="Ex: +5 ou -3.5"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Motivo *</Label>
                  <Select value={adjustReason} onValueChange={setAdjustReason}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {adjustmentReasons.map((reason) => (
                        <SelectItem key={reason.value} value={reason.value}>
                          {reason.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Operador *</Label>
                  <Input
                    value={adjustOperator}
                    onChange={(e) => setAdjustOperator(e.target.value)}
                    placeholder="Seu nome"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Justificativa</Label>
                  <Textarea
                    value={adjustNotes}
                    onChange={(e) => setAdjustNotes(e.target.value)}
                    placeholder="Por que está ajustando?"
                  />
                </div>
                <Button onClick={handleAdjustment} className="w-full">Confirmar Ajuste</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* ALERTAS DE ESTOQUE BAIXO */}
      {lowStockProducts.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-destructive flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5" />
              Alerta de Estoque Baixo ({lowStockProducts.length} itens)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {lowStockProducts.map((p) => (
                <Badge key={p.id} variant="destructive" className="text-sm px-3 py-1">
                  {p.name}: {p.stock} un
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ABAS PRINCIPAIS */}
      <Tabs defaultValue="produtos" className="space-y-4">
        <TabsList>
          <TabsTrigger value="produtos">Produtos</TabsTrigger>
          <TabsTrigger value="movimentacoes">Histórico Geral (Kardex)</TabsTrigger>
        </TabsList>

        {/* TAB 1: LISTA DE PRODUTOS */}
        <TabsContent value="produtos">
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Produto</TableHead>
                  <TableHead className="font-semibold hidden md:table-cell">SKU</TableHead>
                  <TableHead className="font-semibold hidden md:table-cell">Categoria</TableHead>
                  <TableHead className="font-semibold text-right">Custo</TableHead>
                  <TableHead className="font-semibold text-right">Venda</TableHead>
                  <TableHead className="font-semibold text-right hidden md:table-cell">Margem</TableHead>
                  <TableHead className="font-semibold text-center">Estoque</TableHead>
                  <TableHead className="font-semibold text-center">Histórico</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                    <TableRow>
                        <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                            <div className="flex justify-center items-center gap-2">
                                <Loader2 className="h-6 w-6 animate-spin" /> Carregando produtos...
                            </div>
                        </TableCell>
                    </TableRow>
                ) : products.length === 0 ? (
                    <TableRow>
                        <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                            Nenhum produto cadastrado. Vá em Catálogo para adicionar.
                        </TableCell>
                    </TableRow>
                ) : (
                    products.map((product) => (
                    <TableRow key={product.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="font-medium">{product.name}</TableCell>
                        <TableCell className="text-muted-foreground font-mono text-xs hidden md:table-cell">
                        {product.sku}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                        <Badge variant="secondary" className="font-normal">{product.category}</Badge>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground text-xs">
                        {formatCurrency(product.costPrice)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                        {formatCurrency(product.salePrice)}
                        </TableCell>
                        <TableCell className="text-right hidden md:table-cell">
                        <span className="text-emerald-600 font-medium text-xs bg-emerald-50 px-2 py-1 rounded-full">
                            {getMargin(product.costPrice, product.salePrice)}%
                        </span>
                        </TableCell>
                        <TableCell className="text-center">
                        {product.stock < product.minStock ? (
                            <div className="flex items-center justify-center gap-1 text-destructive font-bold">
                            <AlertTriangle className="h-4 w-4" />
                            {product.stock}
                            </div>
                        ) : (
                            <span className="font-medium">{product.stock}</span>
                        )}
                        </TableCell>
                        <TableCell className="text-center">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openKardex(product)}
                            title="Ver Histórico"
                        >
                            <History className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        </TableCell>
                    </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* TAB 2: HISTÓRICO GERAL (SUPABASE LOGS) */}
        <TabsContent value="movimentacoes">
          <div className="space-y-4">
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar por produto, operador ou motivo..."
                        value={logsSearch}
                        onChange={(e) => setLogsSearch(e.target.value)}
                        className="pl-10"
                    />
                </div>
                <Button variant="outline" onClick={loadLogs} disabled={loadingLogs}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${loadingLogs ? 'animate-spin' : ''}`} />
                    Atualizar
                </Button>
            </div>
            
            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">Data</TableHead>
                    <TableHead className="font-semibold">Produto</TableHead>
                    <TableHead className="font-semibold">Tipo</TableHead>
                    <TableHead className="font-semibold text-center">Qtd</TableHead>
                    <TableHead className="font-semibold text-center hidden md:table-cell">Saldo</TableHead>
                    <TableHead className="font-semibold hidden md:table-cell">Motivo</TableHead>
                    <TableHead className="font-semibold hidden md:table-cell">Operador</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingLogs ? (
                      <TableRow>
                          <TableCell colSpan={7} className="h-24 text-center">
                              <div className="flex justify-center items-center gap-2 text-muted-foreground">
                                  <Loader2 className="h-5 w-5 animate-spin" /> Carregando registros...
                              </div>
                          </TableCell>
                      </TableRow>
                  ) : supabaseLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        Nenhuma movimentação registrada.
                      </TableCell>
                    </TableRow>
                  ) : (
                    supabaseLogs
                      .filter((log) => {
                        if (!logsSearch) return true;
                        const s = logsSearch.toLowerCase();
                        return (
                          log.product_name.toLowerCase().includes(s) ||
                          log.operator.toLowerCase().includes(s) ||
                          (log.reason || "").toLowerCase().includes(s)
                        );
                      })
                      .map((log) => {
                        const typeInfo = movementTypeLabels[log.movement_type] || { label: log.movement_type, color: "bg-gray-500", icon: History };
                        const Icon = typeInfo.icon;
                        return (
                          <TableRow key={log.id} className="hover:bg-muted/30 transition-colors">
                            <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                              {format(new Date(log.created_at), "dd/MM HH:mm", { locale: ptBR })}
                            </TableCell>
                            <TableCell className="font-medium text-sm">{log.product_name}</TableCell>
                            <TableCell>
                              <Badge className={`${typeInfo.color} text-white hover:${typeInfo.color} gap-1 px-2`}>
                                <Icon className="h-3 w-3" />
                                {typeInfo.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <span className={log.quantity > 0 ? "text-emerald-600 font-bold" : "text-red-600 font-bold"}>
                                {log.quantity > 0 ? `+${log.quantity}` : log.quantity}
                              </span>
                            </TableCell>
                            <TableCell className="text-center text-xs text-muted-foreground hidden md:table-cell">
                                {log.previous_stock} → <strong>{log.new_stock}</strong>
                            </TableCell>
                            <TableCell className="text-xs hidden md:table-cell">{log.reason || "-"}</TableCell>
                            <TableCell className="text-xs hidden md:table-cell">{log.operator}</TableCell>
                          </TableRow>
                        );
                      })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* DIALOG KARDEX INDIVIDUAL */}
      <Dialog open={kardexDialogOpen} onOpenChange={setKardexDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Kardex - {selectedProduct?.name}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6 pt-2">
            {/* Resumo do Produto */}
            {selectedProduct && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/20 rounded-lg border">
                <div>
                    <span className="text-xs text-muted-foreground block">SKU</span>
                    <span className="font-mono font-medium">{selectedProduct.sku}</span>
                </div>
                <div>
                    <span className="text-xs text-muted-foreground block">Estoque Atual</span>
                    <span className="text-xl font-bold">{selectedProduct.stock}</span>
                </div>
                <div>
                    <span className="text-xs text-muted-foreground block">Preço Custo</span>
                    <span className="font-medium">{formatCurrency(selectedProduct.costPrice)}</span>
                </div>
                <div>
                    <span className="text-xs text-muted-foreground block">Preço Venda</span>
                    <span className="font-medium">{formatCurrency(selectedProduct.salePrice)}</span>
                </div>
              </div>
            )}

            {/* Tabela de Movimentações Específicas */}
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-center">Qtd</TableHead>
                    <TableHead className="text-center">Saldo</TableHead>
                    <TableHead>Operador</TableHead>
                    <TableHead>Obs</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productSpecificLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        Nenhuma movimentação encontrada para este produto.
                      </TableCell>
                    </TableRow>
                  ) : (
                    productSpecificLogs.map((movement) => {
                      const typeInfo = movementTypeLabels[movement.movement_type] || { label: movement.movement_type, color: "bg-gray-500", icon: History };
                      return (
                        <TableRow key={movement.id} className="hover:bg-muted/30">
                          <TableCell className="text-xs text-muted-foreground">
                            {format(new Date(movement.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </TableCell>
                          <TableCell>
                            <Badge className={`${typeInfo.color} text-white h-5 text-[10px]`}>
                                {typeInfo.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center font-bold">
                            <span className={movement.quantity > 0 ? "text-emerald-600" : "text-red-600"}>
                                {movement.quantity > 0 ? `+${movement.quantity}` : movement.quantity}
                            </span>
                          </TableCell>
                          <TableCell className="text-center text-xs">
                            {movement.new_stock}
                          </TableCell>
                          <TableCell className="text-xs">{movement.operator}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">
                            {movement.notes || "-"}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}