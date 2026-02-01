import { useState, useMemo } from "react";
import { Package, AlertTriangle, Plus, Edit, History, ArrowDownCircle, ArrowUpCircle, RefreshCw, ShoppingCart } from "lucide-react";
import { useStore, AdjustmentReason, StockMovement, Product } from "@/store/useStore";
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

const adjustmentReasons: { value: AdjustmentReason; label: string }[] = [
  { value: "erro_contagem", label: "Erro de Contagem" },
  { value: "avaria", label: "Avaria" },
  { value: "bonificacao", label: "Bonificação" },
  { value: "perda", label: "Perda" },
  { value: "outros", label: "Outros" },
];

const movementTypeLabels: Record<string, { label: string; color: string }> = {
  entrada: { label: "Entrada", color: "bg-emerald-500" },
  saida: { label: "Saída", color: "bg-red-500" },
  ajuste: { label: "Ajuste", color: "bg-amber-500" },
  venda: { label: "Venda", color: "bg-blue-500" },
};

const reasonLabels: Record<AdjustmentReason, string> = {
  erro_contagem: "Erro de Contagem",
  avaria: "Avaria",
  bonificacao: "Bonificação",
  perda: "Perda",
  entrada_fornecedor: "Entrada Fornecedor",
  outros: "Outros",
};

export default function Estoque() {
  const { products, stockMovements, addStockEntry, adjustStock } = useStore();
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [kardexDialogOpen, setKardexDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Entry form state
  const [entryProductId, setEntryProductId] = useState("");
  const [entryQuantity, setEntryQuantity] = useState("");
  const [entryNotes, setEntryNotes] = useState("");
  const [entryOperator, setEntryOperator] = useState("");

  // Adjustment form state
  const [adjustProductId, setAdjustProductId] = useState("");
  const [adjustQuantity, setAdjustQuantity] = useState("");
  const [adjustReason, setAdjustReason] = useState<AdjustmentReason | "">("");
  const [adjustNotes, setAdjustNotes] = useState("");
  const [adjustOperator, setAdjustOperator] = useState("");

  const formatCurrency = (value: number) =>
    value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const getMargin = (cost: number, sale: number) =>
    (((sale - cost) / cost) * 100).toFixed(1);

  const handleEntry = () => {
    if (!entryProductId || !entryQuantity || !entryOperator) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    const qty = parseInt(entryQuantity);
    if (isNaN(qty) || qty <= 0) {
      toast.error("Quantidade inválida");
      return;
    }
    addStockEntry(entryProductId, qty, entryNotes, entryOperator);
    toast.success("Entrada registrada com sucesso!");
    setEntryDialogOpen(false);
    setEntryProductId("");
    setEntryQuantity("");
    setEntryNotes("");
    setEntryOperator("");
  };

  const handleAdjustment = () => {
    if (!adjustProductId || !adjustQuantity || !adjustReason || !adjustOperator) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    const qty = parseInt(adjustQuantity);
    if (isNaN(qty)) {
      toast.error("Quantidade inválida");
      return;
    }
    adjustStock(adjustProductId, qty, adjustReason as AdjustmentReason, adjustNotes, adjustOperator);
    toast.success("Ajuste registrado com sucesso!");
    setAdjustDialogOpen(false);
    setAdjustProductId("");
    setAdjustQuantity("");
    setAdjustReason("");
    setAdjustNotes("");
    setAdjustOperator("");
  };

  const openKardex = (product: Product) => {
    setSelectedProduct(product);
    setKardexDialogOpen(true);
  };

  const productMovements = useMemo(() => {
    if (!selectedProduct) return [];
    return stockMovements
      .filter((m) => m.productId === selectedProduct.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [selectedProduct, stockMovements]);

  const lowStockProducts = products.filter((p) => p.stock < 5);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
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
        <div className="flex gap-2">
          <Dialog open={entryDialogOpen} onOpenChange={setEntryDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Entrada de Mercadoria
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
                          {product.name} (Estoque: {product.stock})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Quantidade *</Label>
                  <Input
                    type="number"
                    min="1"
                    value={entryQuantity}
                    onChange={(e) => setEntryQuantity(e.target.value)}
                    placeholder="Digite a quantidade"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Operador *</Label>
                  <Input
                    value={entryOperator}
                    onChange={(e) => setEntryOperator(e.target.value)}
                    placeholder="Nome do responsável"
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
                <Button onClick={handleEntry} className="w-full">
                  Registrar Entrada
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Edit className="h-4 w-4" />
                Ajustar Estoque
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
                          {product.name} (Estoque: {product.stock})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Quantidade (+ para adicionar, - para remover) *</Label>
                  <Input
                    type="number"
                    value={adjustQuantity}
                    onChange={(e) => setAdjustQuantity(e.target.value)}
                    placeholder="Ex: +5 ou -3"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Motivo *</Label>
                  <Select value={adjustReason} onValueChange={(v) => setAdjustReason(v as AdjustmentReason)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o motivo" />
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
                    placeholder="Nome do responsável"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Justificativa</Label>
                  <Textarea
                    value={adjustNotes}
                    onChange={(e) => setAdjustNotes(e.target.value)}
                    placeholder="Descreva o motivo do ajuste"
                  />
                </div>
                <Button onClick={handleAdjustment} className="w-full">
                  Confirmar Ajuste
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {lowStockProducts.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Alerta de Estoque Baixo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {lowStockProducts.map((p) => (
                <Badge key={p.id} variant="destructive" className="text-sm">
                  {p.name}: {p.stock} un
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="produtos" className="space-y-4">
        <TabsList>
          <TabsTrigger value="produtos">Produtos</TabsTrigger>
          <TabsTrigger value="movimentacoes">Movimentações Recentes</TabsTrigger>
        </TabsList>

        <TabsContent value="produtos">
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Produto</TableHead>
                  <TableHead className="font-semibold">SKU</TableHead>
                  <TableHead className="font-semibold">Categoria</TableHead>
                  <TableHead className="font-semibold text-right">Custo</TableHead>
                  <TableHead className="font-semibold text-right">Venda</TableHead>
                  <TableHead className="font-semibold text-right">Margem</TableHead>
                  <TableHead className="font-semibold text-center">Estoque</TableHead>
                  <TableHead className="font-semibold text-center">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                  <TableRow key={product.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell className="text-muted-foreground font-mono text-sm">
                      {product.sku}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{product.category}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatCurrency(product.costPrice)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(product.salePrice)}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-emerald-600 font-medium">
                        +{getMargin(product.costPrice, product.salePrice)}%
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {product.stock < 5 ? (
                        <div className="flex items-center justify-center gap-1">
                          <AlertTriangle className="h-4 w-4 text-destructive" />
                          <span className="text-destructive font-bold">{product.stock}</span>
                        </div>
                      ) : (
                        <span className="font-medium">{product.stock}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openKardex(product)}
                        className="gap-1"
                      >
                        <History className="h-4 w-4" />
                        Kardex
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="movimentacoes">
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Data/Hora</TableHead>
                  <TableHead className="font-semibold">Produto</TableHead>
                  <TableHead className="font-semibold">Tipo</TableHead>
                  <TableHead className="font-semibold text-center">Qtd</TableHead>
                  <TableHead className="font-semibold">Motivo</TableHead>
                  <TableHead className="font-semibold">Operador</TableHead>
                  <TableHead className="font-semibold">Observações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stockMovements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Nenhuma movimentação registrada
                    </TableCell>
                  </TableRow>
                ) : (
                  [...stockMovements]
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .slice(0, 50)
                    .map((movement) => {
                      const product = products.find((p) => p.id === movement.productId);
                      const typeInfo = movementTypeLabels[movement.type];
                      return (
                        <TableRow key={movement.id} className="hover:bg-muted/30 transition-colors">
                          <TableCell className="text-muted-foreground text-sm">
                            {format(new Date(movement.date), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </TableCell>
                          <TableCell className="font-medium">{product?.name || "—"}</TableCell>
                          <TableCell>
                            <Badge className={`${typeInfo.color} text-white`}>
                              {typeInfo.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={movement.quantity > 0 ? "text-emerald-600 font-bold" : "text-red-600 font-bold"}>
                              {movement.quantity > 0 ? `+${movement.quantity}` : movement.quantity}
                            </span>
                            <span className="text-muted-foreground text-xs ml-1">
                              ({movement.previousStock} → {movement.newStock})
                            </span>
                          </TableCell>
                          <TableCell>
                            {movement.reason ? reasonLabels[movement.reason] : "—"}
                          </TableCell>
                          <TableCell>{movement.operator}</TableCell>
                          <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                            {movement.notes || "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Kardex Dialog */}
      <Dialog open={kardexDialogOpen} onOpenChange={setKardexDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Kardex - {selectedProduct?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            {selectedProduct && (
              <div className="grid grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-sm text-muted-foreground">SKU</div>
                    <div className="font-mono font-medium">{selectedProduct.sku}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-sm text-muted-foreground">Estoque Atual</div>
                    <div className="text-2xl font-bold">{selectedProduct.stock}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-sm text-muted-foreground">Preço de Custo</div>
                    <div className="font-medium">{formatCurrency(selectedProduct.costPrice)}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-sm text-muted-foreground">Preço de Venda</div>
                    <div className="font-medium">{formatCurrency(selectedProduct.salePrice)}</div>
                  </CardContent>
                </Card>
              </div>
            )}

            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">Data/Hora</TableHead>
                    <TableHead className="font-semibold">Tipo</TableHead>
                    <TableHead className="font-semibold text-center">Quantidade</TableHead>
                    <TableHead className="font-semibold text-center">Saldo</TableHead>
                    <TableHead className="font-semibold">Motivo</TableHead>
                    <TableHead className="font-semibold">Operador</TableHead>
                    <TableHead className="font-semibold">Observações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productMovements.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        Nenhuma movimentação encontrada para este produto
                      </TableCell>
                    </TableRow>
                  ) : (
                    productMovements.map((movement) => {
                      const typeInfo = movementTypeLabels[movement.type];
                      const Icon = movement.type === 'entrada' ? ArrowDownCircle : 
                                   movement.type === 'venda' ? ShoppingCart :
                                   movement.type === 'saida' ? ArrowUpCircle : RefreshCw;
                      return (
                        <TableRow key={movement.id} className="hover:bg-muted/30 transition-colors">
                          <TableCell className="text-sm">
                            {format(new Date(movement.date), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Icon className={`h-4 w-4 ${movement.quantity > 0 ? 'text-emerald-600' : 'text-red-600'}`} />
                              <Badge className={`${typeInfo.color} text-white`}>
                                {typeInfo.label}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={movement.quantity > 0 ? "text-emerald-600 font-bold" : "text-red-600 font-bold"}>
                              {movement.quantity > 0 ? `+${movement.quantity}` : movement.quantity}
                            </span>
                          </TableCell>
                          <TableCell className="text-center font-medium">
                            {movement.newStock}
                          </TableCell>
                          <TableCell>
                            {movement.reason ? reasonLabels[movement.reason] : "—"}
                          </TableCell>
                          <TableCell>{movement.operator}</TableCell>
                          <TableCell className="text-muted-foreground text-sm max-w-[150px] truncate">
                            {movement.notes || "—"}
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
