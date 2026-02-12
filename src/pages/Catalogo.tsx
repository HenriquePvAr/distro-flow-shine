"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Package,
  Plus,
  Search,
  Percent,
  Edit,
  Trash2,
  BoxIcon,
  Loader2,
  Info,
  X,
  MoreVertical,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

// --- Utilitários ---
const formatCurrency = (val: number) =>
  Number(val || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const safeNumber = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const normalizeText = (s: string | undefined | null) => {
  const v = (s ?? "").trim();
  return v.length ? v : "";
};

const generateSku = () => `PROD-${Date.now().toString(36).toUpperCase()}`;

// --- Schema ---
const productSchema = z
  .object({
    name: z.string().min(2, "Nome curto demais").max(100),
    description: z.string().max(500).optional(),
    sku: z.string().optional(),
    category: z.string().min(1, "Categoria obrigatória").transform((v) => v.trim()),
    supplier: z.string().optional().transform((v) => normalizeText(v)),
    costPrice: z.coerce.number().min(0.01, "Informe o custo"),
    salePrice: z.coerce.number().min(0.01, "Informe a venda"),
    minStock: z.coerce.number().min(0, "Inválido"),
    stock: z.coerce.number().min(0, "Inválido"),
    sellsByBox: z.coerce.boolean().optional().default(false),
    qtyPerBox: z.coerce.number().optional(),
    boxPrice: z.coerce.number().optional(),
    sellsByKg: z.coerce.boolean().optional().default(false),
  })
  .superRefine((data, ctx) => {
    if (data.sellsByBox) {
      if (!data.qtyPerBox || data.qtyPerBox < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["qtyPerBox"],
          message: "Qtd/Caixa inválida",
        });
      }
    }
  });

type ProductFormData = z.infer<typeof productSchema>;

interface Product extends ProductFormData {
  id: string;
}

export default function Catalogo() {
  const { toast } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteProductId, setDeleteProductId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [showInfo, setShowInfo] = useState(true);

  const [existingCategories, setExistingCategories] = useState<string[]>([]);

  const form = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: "",
      description: "",
      sku: "",
      category: "",
      supplier: "",
      // Valores vazios para não aparecer "0"
      costPrice: "" as unknown as number,
      salePrice: "" as unknown as number,
      minStock: "" as unknown as number,
      stock: "" as unknown as number,
      sellsByBox: false,
      qtyPerBox: 1,
      boxPrice: "" as unknown as number,
      sellsByKg: false,
    },
  });

  // Debounce da busca
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Carregar dados com proteção try/catch (evita tela branca)
  useEffect(() => {
    try {
      const isHidden = localStorage.getItem("hide_catalogo_info");
      if (isHidden === "true") setShowInfo(false);
    } catch (e) {
      console.warn("Erro localStorage:", e);
    }
    fetchProducts();
  }, []);

  const handleCloseInfo = () => {
    setShowInfo(false);
    try {
      localStorage.setItem("hide_catalogo_info", "true");
    } catch {}
  };

  const handleShowInfo = () => {
    setShowInfo(true);
    try {
      localStorage.removeItem("hide_catalogo_info");
    } catch {}
  };

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from("products").select("*").order("name");
      if (error) throw error;

      const mapped: Product[] = (data || []).map((item: any) => ({
        id: item.id,
        name: item.name,
        description: item.description || "",
        sku: (item.sku || "").toUpperCase(),
        category: item.category || "Geral",
        supplier: item.supplier || "",
        costPrice: safeNumber(item.cost_price),
        salePrice: safeNumber(item.sale_price),
        minStock: safeNumber(item.min_stock),
        stock: safeNumber(item.stock),
        sellsByBox: Boolean(item.sells_by_box),
        qtyPerBox: item.qty_per_box ?? 1,
        boxPrice: safeNumber(item.box_price),
        sellsByKg: Boolean(item.sells_by_kg),
      }));

      setProducts(mapped);

      const cats = Array.from(new Set(mapped.map((p) => p.category).filter(Boolean)));
      setExistingCategories(cats);
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Erro", description: "Falha ao carregar catálogo." });
    } finally {
      setLoading(false);
    }
  };

  // Margem em tempo real
  const costPrice = form.watch("costPrice");
  const salePrice = form.watch("salePrice");
  const profitMargin = useMemo(() => {
    const cp = Number(costPrice);
    const sp = Number(salePrice);
    if (cp > 0 && sp > 0) return ((sp - cp) / cp) * 100;
    return 0;
  }, [costPrice, salePrice]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const s = debouncedSearch;
      const matchesSearch =
        !s ||
        (product.name || "").toLowerCase().includes(s) ||
        (product.sku || "").toLowerCase().includes(s);
      const matchesCategory = categoryFilter === "all" || product.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [products, debouncedSearch, categoryFilter]);

  const openNewDialog = () => {
    setEditingProduct(null);
    form.reset({
      name: "",
      description: "",
      sku: "",
      category: "",
      supplier: "",
      costPrice: "" as unknown as number,
      salePrice: "" as unknown as number,
      minStock: "" as unknown as number,
      stock: "" as unknown as number,
      sellsByBox: false,
      qtyPerBox: 1,
      boxPrice: "" as unknown as number,
      sellsByKg: false,
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (product: Product) => {
    setEditingProduct(product);
    form.reset(product);
    setIsDialogOpen(true);
  };

  const onSubmit = async (data: ProductFormData) => {
    try {
      let finalSku = data.sku;
      if (!finalSku || finalSku.trim() === "") {
        finalSku = generateSku();
      } else {
        finalSku = finalSku.trim().toUpperCase();
      }

      if (!editingProduct || editingProduct.sku !== finalSku) {
        const conflict = products.find((p) => p.sku === finalSku);
        if (conflict) finalSku = generateSku();
      }

      const payload: any = {
        name: data.name.trim(),
        description: normalizeText(data.description),
        sku: finalSku,
        category: data.category.trim(),
        supplier: normalizeText(data.supplier),
        cost_price: Number(data.costPrice),
        sale_price: Number(data.salePrice),
        min_stock: Number(data.minStock),
        stock: Number(data.stock),
        sells_by_box: Boolean(data.sellsByBox),
        qty_per_box: data.sellsByBox ? data.qtyPerBox : null,
        box_price: data.sellsByBox && Number(data.boxPrice) > 0 ? Number(data.boxPrice) : null,
        sells_by_kg: Boolean(data.sellsByKg),
      };

      if (editingProduct) {
        const { error } = await supabase.from("products").update(payload).eq("id", editingProduct.id);
        if (error) throw error;
        toast({ title: "Atualizado", description: "Produto salvo." });
      } else {
        const { error } = await supabase.from("products").insert([payload]);
        if (error) throw error;
        toast({ title: "Criado", description: "Produto cadastrado." });
      }

      setIsDialogOpen(false);
      setEditingProduct(null);
      await fetchProducts();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro", description: error.message });
    }
  };

  const handleDelete = async () => {
    if (!deleteProductId) return;
    try {
      const { error } = await supabase.from("products").delete().eq("id", deleteProductId);
      if (error) throw error;
      toast({ title: "Excluído", description: "Produto removido." });
      setDeleteProductId(null);
      await fetchProducts();
    } catch {
      toast({ variant: "destructive", title: "Erro", description: "Não foi possível excluir." });
    }
  };

  const getMarginColor = (margin: number) => {
    if (margin < 10) return "text-destructive border-destructive/30 bg-destructive/10";
    if (margin < 25) return "text-yellow-600 border-yellow-200 bg-yellow-50";
    return "text-green-600 border-green-200 bg-green-50";
  };

  const formatStock = (p: Product) => {
    const val = safeNumber(p.stock);
    if (p.sellsByKg) return `${val.toFixed(3)} kg`;
    return `${val.toFixed(0)} un`;
  };

  return (
    // Padding ajustado para mobile e desktop
    <div className="space-y-4 p-4 md:p-8 animate-in fade-in duration-500 pb-20">
      
      {/* --- Header --- */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
            Catálogo
            {!showInfo && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground"
                onClick={handleShowInfo}
              >
                <Info className="h-4 w-4" />
              </Button>
            )}
          </h1>
          <p className="text-sm text-muted-foreground">Gerencie seus produtos</p>
        </div>

        <Dialog
          open={isDialogOpen}
          onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) setEditingProduct(null);
          }}
        >
          <DialogTrigger asChild>
            <Button onClick={openNewDialog} className="w-full md:w-auto gap-2">
              <Plus className="h-4 w-4" /> Novo Produto
            </Button>
          </DialogTrigger>

          {/* Dialog Responsivo (Tela cheia ou quase no mobile) */}
          <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg p-4 md:p-6">
            <DialogHeader>
              <DialogTitle>{editingProduct ? "Editar" : "Novo"} Produto</DialogTitle>
              <DialogDescription>Preencha os dados abaixo.</DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 mt-2">
                {/* 1. Dados Básicos */}
                <div className="space-y-3 border p-3 rounded-md bg-muted/20">
                  <h3 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
                    <Package className="h-4 w-4" /> Dados
                  </h3>
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome do Produto</FormLabel>
                        <FormControl>
                          <Input placeholder="Ex: Coca-Cola" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Categoria</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input list="cats" placeholder="Selecionar ou digitar..." {...field} />
                            <datalist id="cats">
                              {existingCategories.map((c) => (
                                <option key={c} value={c} />
                              ))}
                            </datalist>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* 2. Preços */}
                <div className="space-y-3 border p-3 rounded-md bg-muted/20">
                  <h3 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
                    <Percent className="h-4 w-4" /> Valores
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="costPrice"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Custo (R$)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="0,00"
                              {...field}
                              value={field.value || ""}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="salePrice"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Venda (R$)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="0,00"
                              {...field}
                              value={field.value || ""}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className={`text-xs font-semibold px-2 py-1 rounded w-fit ${getMarginColor(profitMargin)}`}>
                    Margem: {profitMargin.toFixed(1)}%
                  </div>
                </div>

                {/* 3. Estoque */}
                <div className="space-y-3 border p-3 rounded-md bg-muted/20">
                  <h3 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
                    <BoxIcon className="h-4 w-4" /> Estoque
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="stock"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Atual</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.001" placeholder="0" {...field} value={field.value || ""} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="minStock"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Mínimo</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.001" placeholder="5" {...field} value={field.value || ""} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="flex gap-4 pt-2">
                    <FormField
                      control={form.control}
                      name="sellsByBox"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-2 space-y-0">
                          <FormControl>
                            <input
                              type="checkbox"
                              className="h-4 w-4"
                              checked={field.value}
                              onChange={(e) => field.onChange(e.target.checked)}
                            />
                          </FormControl>
                          <FormLabel className="font-normal cursor-pointer">Vende Caixa</FormLabel>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="sellsByKg"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-2 space-y-0">
                          <FormControl>
                            <input
                              type="checkbox"
                              className="h-4 w-4"
                              checked={field.value}
                              onChange={(e) => field.onChange(e.target.checked)}
                            />
                          </FormControl>
                          <FormLabel className="font-normal cursor-pointer">Vende KG</FormLabel>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <Button type="submit" className="w-full h-12 text-base">
                    Salvar Produto
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* --- Dica Mobile --- */}
      {showInfo && (
        <Alert className="bg-blue-50 border-blue-100 text-blue-900 shadow-sm relative pr-8">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertTitle className="text-sm font-bold">Dicas Rápidas</AlertTitle>
          <AlertDescription className="text-xs mt-1 leading-relaxed">
            - O <strong>SKU</strong> é gerado automaticamente.<br/>
            - Marque <strong>KG</strong> para produtos fracionados.<br/>
          </AlertDescription>
          <button onClick={handleCloseInfo} className="absolute top-2 right-2 p-1 text-blue-400">
            <X className="h-4 w-4" />
          </button>
        </Alert>
      )}

      {/* --- Filtros --- */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar nome..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 bg-background"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full md:w-[180px] bg-background">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {existingCategories.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* --- Loading e Conteúdo --- */}
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* === VISÃO DESKTOP (TABELA) === */}
          <div className="hidden md:block rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Venda</TableHead>
                  <TableHead className="text-right">Estoque</TableHead>
                  <TableHead className="w-[100px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-normal">{product.category}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(product.salePrice)}</TableCell>
                    <TableCell className="text-right">
                      <span className={product.stock <= product.minStock ? "text-red-600 font-bold" : ""}>
                        {formatStock(product)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(product)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setDeleteProductId(product.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredProducts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Nenhum produto encontrado.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* === VISÃO MOBILE (CARDS) - Resolve o problema da tela grande demais === */}
          <div className="grid gap-3 md:hidden">
            {filteredProducts.map((product) => (
              <Card key={product.id} className="shadow-sm border-l-4 border-l-primary/20">
                <CardContent className="p-4 flex justify-between items-start">
                  <div className="space-y-1">
                    <div className="font-bold text-base">{product.name}</div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wide">
                      {product.category}
                    </div>
                    <div className="flex gap-3 pt-2 text-sm">
                      <div className="font-semibold text-green-700">
                        {formatCurrency(product.salePrice)}
                      </div>
                      <div className={product.stock <= product.minStock ? "text-red-600 font-bold" : "text-muted-foreground"}>
                        Est: {formatStock(product)}
                      </div>
                    </div>
                  </div>

                  {/* Menu para Editar/Excluir no Mobile */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEditDialog(product)}>
                        <Edit className="h-4 w-4 mr-2" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        className="text-destructive focus:text-destructive"
                        onClick={() => setDeleteProductId(product.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardContent>
              </Card>
            ))}
            
            {filteredProducts.length === 0 && (
              <div className="text-center py-10 text-muted-foreground text-sm">
                Nenhum produto encontrado.
              </div>
            )}
          </div>
        </>
      )}

      {/* Confirmação de Exclusão */}
      <AlertDialog open={!!deleteProductId} onOpenChange={() => setDeleteProductId(null)}>
        <AlertDialogContent className="w-[95vw] rounded-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-2 justify-end">
            <AlertDialogCancel className="mt-0">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}