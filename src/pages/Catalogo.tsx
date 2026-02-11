import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Package, Plus, Search, Percent, AlertTriangle, Edit, Trash2, BoxIcon, Loader2, Info, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const formatCurrency = (val: number) => val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Schema de Validação
const productSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(100),
  description: z.string().max(500).optional(),
  sku: z.string().min(1, "SKU é obrigatório").max(20),
  category: z.string().min(1, "Categoria é obrigatória"), 
  supplier: z.string().optional(),
  costPrice: z.coerce.number().min(0.01, "Inválido"),
  salePrice: z.coerce.number().min(0.01, "Inválido"),
  minStock: z.coerce.number().min(0, "Inválido"),
  stock: z.coerce.number().min(0, "Inválido"),
  
  sellsByBox: z.boolean().optional(),
  qtyPerBox: z.coerce.number().optional(),
  boxPrice: z.coerce.number().optional(),
  sellsByKg: z.boolean().optional(),
});

type ProductFormData = z.infer<typeof productSchema>;

interface Product extends ProductFormData {
  id: string;
}

export default function Catalogo() {
  const { toast } = useToast();
  
  // Estados
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteProductId, setDeleteProductId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [showInfo, setShowInfo] = useState(true);

  const [existingCategories, setExistingCategories] = useState<string[]>([]);
  const [existingSuppliers, setExistingSuppliers] = useState<string[]>([]);

  const form = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: "", description: "", sku: "", category: "", supplier: "",
      costPrice: 0, salePrice: 0, minStock: 5, stock: 0,
      sellsByBox: false, qtyPerBox: 1, boxPrice: 0, sellsByKg: false
    },
  });

  // Controle da Dica (Alert)
  useEffect(() => {
    const isHidden = localStorage.getItem("hide_catalogo_info");
    if (isHidden === "true") setShowInfo(false);
    fetchProducts();
  }, []);

  const handleCloseInfo = () => {
    setShowInfo(false);
    localStorage.setItem("hide_catalogo_info", "true");
  };

  const handleShowInfo = () => {
    setShowInfo(true);
    localStorage.removeItem("hide_catalogo_info");
  };

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from("products").select("*").order('name');
      
      if (error) throw error;

      if (data) {
        const mappedProducts: Product[] = data.map((item: any) => ({
          id: item.id,
          name: item.name,
          description: item.description || "",
          sku: item.sku || "", 
          category: item.category || "Geral",
          supplier: item.supplier || "",
          
          costPrice: Number(item.cost_price ?? 0),
          salePrice: Number(item.sale_price ?? 0),
          minStock: Number(item.min_stock ?? 0),
          stock: Number(item.stock ?? 0),
          
          sellsByBox: item.sells_by_box ?? false,
          qtyPerBox: item.qty_per_box ?? 1,
          boxPrice: Number(item.box_price ?? 0),
          sellsByKg: item.sells_by_kg ?? false,
        }));
        
        setProducts(mappedProducts);

        const cats = Array.from(new Set(mappedProducts.map(p => p.category).filter(Boolean)));
        const sups = Array.from(new Set(mappedProducts.map(p => p.supplier).filter(Boolean) as string[]));
        setExistingCategories(cats);
        setExistingSuppliers(sups);
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro", description: "Falha ao carregar catálogo." });
    } finally {
      setLoading(false);
    }
  };

  const costPrice = form.watch("costPrice");
  const salePrice = form.watch("salePrice");
  const profitMargin = useMemo(() => {
    if (costPrice > 0 && salePrice > 0) return ((salePrice - costPrice) / costPrice) * 100;
    return 0;
  }, [costPrice, salePrice]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch = (product.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
                            (product.sku || "").toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = categoryFilter === "all" || product.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchTerm, categoryFilter]);

  const openEditDialog = (product: Product) => {
    setEditingProduct(product);
    form.reset(product);
    setIsDialogOpen(true);
  };

  const openNewDialog = () => {
    setEditingProduct(null);
    form.reset({
      name: "", description: "", sku: "", category: "", supplier: "",
      costPrice: 0, salePrice: 0, minStock: 5, stock: 0,
      sellsByBox: false, qtyPerBox: 1, boxPrice: 0, sellsByKg: false
    });
    setIsDialogOpen(true);
  };

  const onSubmit = async (data: ProductFormData) => {
    try {
      const productData = {
        name: data.name,
        description: data.description,
        sku: data.sku,
        category: data.category,
        supplier: data.supplier,
        cost_price: data.costPrice,   
        sale_price: data.salePrice,   
        min_stock: data.minStock,     
        stock: data.stock,
        sells_by_box: data.sellsByBox,
        qty_per_box: data.qtyPerBox,  
        box_price: data.boxPrice,     
        sells_by_kg: data.sellsByKg,  
      };

      if (editingProduct) {
        const { error } = await supabase.from("products").update(productData).eq("id", editingProduct.id);
        if (error) throw error;
        toast({ title: "Sucesso!", description: "Produto atualizado." });
      } else {
        const { error } = await supabase.from("products").insert([productData]);
        if (error) throw error;
        toast({ title: "Sucesso!", description: "Produto cadastrado." });
      }

      setIsDialogOpen(false);
      fetchProducts();
    } catch (error: any) {
      console.error(error); 
      toast({ variant: "destructive", title: "Erro ao salvar", description: error.message });
    }
  };

  const handleDelete = async () => {
    if (!deleteProductId) return;
    try {
      const { error } = await supabase.from("products").delete().eq("id", deleteProductId);
      if (error) throw error;
      toast({ title: "Excluído", description: "Produto removido." });
      setDeleteProductId(null);
      fetchProducts();
    } catch (error) {
      toast({ variant: "destructive", title: "Erro", description: "Erro ao excluir." });
    }
  };

  const getMarginColor = (margin: number) => {
    if (margin < 10) return "text-destructive";
    if (margin < 25) return "text-yellow-600";
    return "text-green-600";
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            Catálogo
            {!showInfo && (
              <Button variant="ghost" size="icon" className="h-6 w-6 ml-2 text-muted-foreground" onClick={handleShowInfo} title="Ajuda">
                <Info className="h-4 w-4" />
              </Button>
            )}
          </h1>
          <p className="text-muted-foreground">Gerencie seus produtos</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNewDialog} className="gap-2">
              <Plus className="h-4 w-4" /> Novo Produto
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingProduct ? "Editar Produto" : "Cadastrar Produto"}</DialogTitle>
              <DialogDescription>Preencha os dados do item.</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                
                {/* Dados Básicos */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-foreground flex items-center gap-2">
                    <Package className="h-4 w-4" /> Dados Básicos
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField control={form.control} name="name" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome *</FormLabel>
                        <FormControl><Input placeholder="Ex: Coca-Cola 2L" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="sku" render={({ field }) => (
                      <FormItem>
                        <FormLabel>SKU / Código *</FormLabel>
                        <FormControl><Input placeholder="Ex: BEB001" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  
                  <FormField control={form.control} name="description" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Descrição</FormLabel>
                      <FormControl><Textarea placeholder="Detalhes..." className="resize-none h-20" {...field} /></FormControl>
                    </FormItem>
                  )} />

                  <div className="grid gap-4 sm:grid-cols-2">
                    {/* Categoria com Datalist */}
                    <FormField control={form.control} name="category" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Categoria *</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input list="category-options" placeholder="Digite ou selecione" {...field} />
                            <datalist id="category-options">
                              {existingCategories.map((cat, i) => <option key={i} value={cat} />)}
                            </datalist>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    {/* Fornecedor com Datalist */}
                    <FormField control={form.control} name="supplier" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fornecedor (Opcional)</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input list="supplier-options" placeholder="Digite ou selecione" {...field} />
                            <datalist id="supplier-options">
                              {existingSuppliers.map((sup, i) => <option key={i} value={sup} />)}
                            </datalist>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                </div>

                {/* Precificação */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-foreground flex items-center gap-2">
                    <Percent className="h-4 w-4" /> Precificação
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <FormField control={form.control} name="costPrice" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Custo (R$)</FormLabel>
                        <FormControl><Input type="number" step="0.01" min="0" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="salePrice" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Venda (R$)</FormLabel>
                        <FormControl><Input type="number" step="0.01" min="0" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <div className="space-y-2">
                      <Label>Margem</Label>
                      <div className={`h-10 flex items-center px-3 rounded-md border bg-muted font-semibold ${getMarginColor(profitMargin)}`}>
                        {profitMargin.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                </div>

                {/* Estoque e Detalhes */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-foreground flex items-center gap-2">
                    <BoxIcon className="h-4 w-4" /> Estoque & Tipo
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField control={form.control} name="stock" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Qtd Atual</FormLabel>
                        {/* Passo 0.001 permite gramas */}
                        <FormControl><Input type="number" step="0.001" min="0" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="minStock" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Qtd Mínima</FormLabel>
                        <FormControl><Input type="number" step="0.001" min="0" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  <div className="flex flex-wrap gap-6 pt-2 items-center">
                    <FormField control={form.control} name="sellsByBox" render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl>
                          <input type="checkbox" checked={field.value} onChange={e => {
                            field.onChange(e.target.checked);
                            if(e.target.checked) form.setValue("sellsByKg", false);
                          }} className="h-4 w-4 accent-primary" />
                        </FormControl>
                        <FormLabel className="!mt-0 cursor-pointer">Vende Caixa?</FormLabel>
                      </FormItem>
                    )} />
                    
                    <FormField control={form.control} name="sellsByKg" render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl>
                          <input type="checkbox" checked={field.value} onChange={e => {
                            field.onChange(e.target.checked);
                            if(e.target.checked) form.setValue("sellsByBox", false);
                          }} className="h-4 w-4 accent-primary" />
                        </FormControl>
                        <FormLabel className="!mt-0 cursor-pointer">Vende KG?</FormLabel>
                      </FormItem>
                    )} />
                  </div>

                  {/* Configuração da Caixa */}
                  {form.watch("sellsByBox") && (
                    <div className="grid gap-4 sm:grid-cols-2 bg-muted/30 p-3 rounded-lg border">
                      <FormField control={form.control} name="qtyPerBox" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Qtd na Caixa</FormLabel>
                          <FormControl><Input type="number" min="1" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="boxPrice" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Preço da Caixa (R$)</FormLabel>
                          <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                          <FormDescription className="text-xs">
                            Se não preencher, o sistema usará (Preço Un. x Qtd).
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                  )}
                </div>

                <Button type="submit" className="w-full">
                  {editingProduct ? "Salvar Alterações" : "Cadastrar Produto"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* --- EXPLICAÇÃO DIDÁTICA --- */}
      {showInfo && (
        <Alert className="bg-blue-50/50 border-blue-200 text-blue-800 relative pr-10 animate-in slide-in-from-top-2 fade-in shadow-sm">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertTitle className="text-blue-700 font-semibold">Guia de Cadastro</AlertTitle>
          <AlertDescription className="text-blue-700/80 text-sm mt-1">
            <ul className="list-disc list-inside space-y-1">
              <li><strong>Vende por KG?</strong> Marque a opção "Vende KG" para produtos fracionados (sorvete, carne). O estoque aceitará valores como 10.500.</li>
              <li><strong>Vende por Caixa?</strong> Marque se você vende o fardo fechado. Você pode definir um preço especial para a caixa diferente do preço unitário.</li>
              <li><strong>Categorias:</strong> Você pode selecionar uma existente ou digitar uma nova para criar automaticamente.</li>
            </ul>
          </AlertDescription>
          <Button variant="ghost" size="icon" className="absolute top-2 right-2 text-blue-400 hover:text-blue-700" onClick={handleCloseInfo}>
            <X className="h-4 w-4" />
          </Button>
        </Alert>
      )}

      {/* Filtros e Tabela */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-4 justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {existingCategories.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-right">Venda (Un)</TableHead>
                    <TableHead className="text-right">Caixa</TableHead>
                    <TableHead className="text-right">Estoque</TableHead>
                    <TableHead className="w-20">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((product) => {
                    const isLowStock = product.stock <= (product.minStock || 5);
                    const calculatedBoxPrice = product.boxPrice || (product.qtyPerBox ? product.qtyPerBox * product.salePrice : 0);

                    return (
                      <TableRow key={product.id}>
                        <TableCell>
                          <div className="font-medium">{product.name}</div>
                          <div className="flex gap-1 mt-1">
                            {product.sellsByBox && <Badge variant="outline" className="text-[10px]">Vende Caixa</Badge>}
                            {product.sellsByKg && <Badge variant="outline" className="text-[10px]">KG</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{product.sku}</TableCell>
                        <TableCell><Badge variant="secondary">{product.category}</Badge></TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(product.salePrice)}
                          {product.sellsByKg && <span className="text-xs text-muted-foreground ml-1">/kg</span>}
                        </TableCell>
                        
                        <TableCell className="text-right">
                          {product.sellsByBox ? (
                            <span className={!product.boxPrice ? "text-muted-foreground italic" : "font-medium"}>
                              {formatCurrency(calculatedBoxPrice)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/30">-</span>
                          )}
                        </TableCell>

                        <TableCell className="text-right">
                          <span className={isLowStock ? "text-destructive font-bold" : ""}>
                            {product.stock} {product.sellsByKg ? "kg" : "un"}
                          </span>
                        </TableCell>

                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEditDialog(product)}><Edit className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setDeleteProductId(product.id)}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredProducts.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum produto encontrado.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteProductId} onOpenChange={() => setDeleteProductId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Produto?</AlertDialogTitle>
            <AlertDialogDescription>Essa ação é irreversível.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}