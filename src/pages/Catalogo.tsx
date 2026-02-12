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
  Box,
  Loader2,
  Info,
  X,
  MoreVertical,
} from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

// =======================
// HELPERS
// =======================
const formatCurrency = (val: number) =>
  Number(val || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const safeNumber = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const normalizeText = (s: string | undefined | null) => {
  const v = (s ?? "").trim();
  return v.length ? v : "";
};

const generateSku = () => `PROD-${Date.now().toString(36).toUpperCase()}`;

// Evita value={NaN} / undefined no type="number"
const safeNumberInputValue = (v: any) => {
  if (v === null || v === undefined) return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  if (n === 0) return "";
  return String(v);
};

// =======================
// SCHEMA
// =======================
const productSchema = z
  .object({
    name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(100),
    description: z.string().max(500).optional(),
    sku: z.string().optional(),
    category: z.string().min(1, "Categoria é obrigatória").transform((v) => v.trim()),
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
          message: "Informe a quantidade por caixa (mínimo 1).",
        });
      }
      if (data.boxPrice !== undefined && data.boxPrice !== null && data.boxPrice !== 0) {
        if (data.boxPrice < 0.01) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["boxPrice"],
            message: "Preço da caixa inválido.",
          });
        }
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
  const [fatalError, setFatalError] = useState<string | null>(null);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const [deleteProductId, setDeleteProductId] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const [showInfo, setShowInfo] = useState(true);

  const [existingCategories, setExistingCategories] = useState<string[]>([]);
  const [existingSuppliers, setExistingSuppliers] = useState<string[]>([]);

  const form = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: {
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
    },
  });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim().toLowerCase()), 200);
    return () => clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => {
    try {
      const isHidden = localStorage.getItem("hide_catalogo_info");
      if (isHidden === "true") setShowInfo(false);
    } catch (e) {
      console.warn("LocalStorage indisponível", e);
    }
    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setFatalError(null);
    try {
      const { data, error } = await supabase.from("products").select("*").order("name");
      if (error) throw error;

      const mappedProducts: Product[] =
        (data || []).map((item: any) => ({
          id: item.id,
          name: item.name,
          description: item.description || "",
          sku: (item.sku || "").toUpperCase(),
          category: item.category || "Geral",
          supplier: item.supplier || "",
          costPrice: safeNumber(item.cost_price ?? 0),
          salePrice: safeNumber(item.sale_price ?? 0),
          minStock: safeNumber(item.min_stock ?? 0),
          stock: safeNumber(item.stock ?? 0),
          sellsByBox: Boolean(item.sells_by_box ?? false),
          qtyPerBox: item.qty_per_box ?? 1,
          boxPrice: safeNumber(item.box_price ?? 0),
          sellsByKg: Boolean(item.sells_by_kg ?? false),
        })) || [];

      setProducts(mappedProducts);

      const cats = Array.from(new Set(mappedProducts.map((p) => p.category).filter(Boolean)));
      const sups = Array.from(
        new Set(mappedProducts.map((p) => p.supplier).filter(Boolean) as string[])
      );
      setExistingCategories(cats);
      setExistingSuppliers(sups);
    } catch (error: any) {
      console.error(error);
      setFatalError(error?.message || "Falha ao carregar catálogo.");
      toast({ variant: "destructive", title: "Erro", description: "Falha ao carregar catálogo." });
    } finally {
      setLoading(false);
    }
  };

  const costPrice = form.watch("costPrice");
  const salePrice = form.watch("salePrice");

  const profitMargin = useMemo(() => {
    const cp = Number(costPrice);
    const sp = Number(salePrice);
    if (Number.isFinite(cp) && Number.isFinite(sp) && cp > 0 && sp > 0) return ((sp - cp) / cp) * 100;
    return 0;
  }, [costPrice, salePrice]);

  const sellsByBox = form.watch("sellsByBox");
  const qtyPerBox = form.watch("qtyPerBox");
  const boxPrice = form.watch("boxPrice");

  const boxPricePreview = useMemo(() => {
    if (!sellsByBox) return 0;
    const qty = safeNumber(qtyPerBox || 0);
    const unit = safeNumber(salePrice || 0);
    const typed = safeNumber(boxPrice || 0);
    return typed > 0 ? typed : qty > 0 ? qty * unit : 0;
  }, [sellsByBox, qtyPerBox, salePrice, boxPrice]);

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

  const openEditDialog = (product: Product) => {
    setEditingProduct(product);
    form.reset({ ...product, sku: product.sku || "" });
    setIsDialogOpen(true);
  };

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

      const productData: any = {
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
        qty_per_box: data.sellsByBox ? Number(data.qtyPerBox) : null,
        box_price:
          data.sellsByBox && data.boxPrice && Number(data.boxPrice) > 0 ? Number(data.boxPrice) : null,

        sells_by_kg: Boolean(data.sellsByKg),
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
      setEditingProduct(null);
      await fetchProducts();
    } catch (error: any) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: error?.message || "Falha ao salvar.",
      });
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
    } catch (err: any) {
      console.error(err);
      toast({ variant: "destructive", title: "Erro", description: "Erro ao excluir." });
    }
  };

  const getMarginColor = (margin: number) => {
    if (margin < 10) return "text-destructive border-destructive/30 bg-destructive/10";
    if (margin < 25) return "text-yellow-600 border-yellow-200 bg-yellow-50";
    return "text-green-600 border-green-200 bg-green-50";
  };

  const formatStock = (p: Product) => {
    if (p.sellsByKg) return `${safeNumber(p.stock).toFixed(3)} kg`;
    return `${safeNumber(p.stock).toFixed(0)} un`;
  };

  return (
    // Padding responsivo para evitar que o conteúdo fique colado nas bordas
    <div className="space-y-6 animate-in fade-in duration-500 p-4 md:p-6 pb-24">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
            Catálogo
            {!showInfo && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 ml-2 text-muted-foreground"
                onClick={handleShowInfo}
                title="Ajuda"
              >
                <Info className="h-4 w-4" />
              </Button>
            )}
          </h1>
          <p className="text-muted-foreground">Gerencie seus produtos</p>
        </div>

        <Dialog
          open={isDialogOpen}
          onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) setEditingProduct(null);
          }}
        >
          <DialogTrigger asChild>
            <Button onClick={openNewDialog} className="gap-2 w-full sm:w-auto">
              <Plus className="h-4 w-4" /> Novo Produto
            </Button>
          </DialogTrigger>

          {/* Dialog Responsivo (Ocupa 95% da tela no mobile para não cortar) */}
          <DialogContent className="w-[95vw] sm:w-full max-w-lg sm:max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6 rounded-lg">
            <DialogHeader>
              <DialogTitle>{editingProduct ? "Editar Produto" : "Cadastrar Produto"}</DialogTitle>
              <DialogDescription>Preencha os dados do item.</DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 sm:space-y-6 pt-2">
                {/* Dados Básicos */}
                <div className="space-y-3 sm:space-y-4 border p-3 rounded-md bg-muted/10">
                  <h3 className="font-semibold text-foreground flex items-center gap-2 text-sm sm:text-base">
                    <Package className="h-4 w-4" /> Dados Básicos
                  </h3>

                  <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nome *</FormLabel>
                          <FormControl>
                            <Input placeholder="Ex: Coca-Cola 2L" {...field} />
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
                          <FormLabel>Categoria *</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input list="category-options" placeholder="Digite ou selecione" {...field} />
                              <datalist id="category-options">
                                {existingCategories.map((cat, i) => (
                                  <option key={i} value={cat} />
                                ))}
                              </datalist>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Descrição</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Detalhes..." className="resize-none h-20" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="supplier"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fornecedor (Opcional)</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input list="supplier-options" placeholder="Digite ou selecione" {...field} />
                            <datalist id="supplier-options">
                              {existingSuppliers.map((sup, i) => (
                                <option key={i} value={sup} />
                              ))}
                            </datalist>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Precificação */}
                <div className="space-y-3 sm:space-y-4 border p-3 rounded-md bg-muted/10">
                  <h3 className="font-semibold text-foreground flex items-center gap-2 text-sm sm:text-base">
                    <Percent className="h-4 w-4" /> Precificação
                  </h3>

                  <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-3">
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
                              min="0"
                              inputMode="decimal"
                              {...field}
                              value={safeNumberInputValue(field.value)}
                              onChange={(e) => field.onChange(e.target.value)}
                            />
                          </FormControl>
                          <FormMessage />
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
                              min="0"
                              inputMode="decimal"
                              {...field}
                              value={safeNumberInputValue(field.value)}
                              onChange={(e) => field.onChange(e.target.value)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="space-y-2 col-span-2 sm:col-span-1">
                      <Label>Margem</Label>
                      <div
                        className={`h-10 flex items-center px-3 rounded-md border bg-muted font-semibold ${getMarginColor(
                          profitMargin
                        )}`}
                      >
                        {profitMargin.toFixed(1)}%
                      </div>
                    </div>
                  </div>

                  {sellsByBox && (
                    <div className="text-xs text-muted-foreground">
                      <strong>Prévia Caixa:</strong> {formatCurrency(boxPricePreview)}{" "}
                      <span className="italic">(calculado auto se vazio)</span>
                    </div>
                  )}
                </div>

                {/* Estoque e Tipo */}
                <div className="space-y-3 sm:space-y-4 border p-3 rounded-md bg-muted/10">
                  <h3 className="font-semibold text-foreground flex items-center gap-2 text-sm sm:text-base">
                    <Box className="h-4 w-4" /> Estoque & Tipo
                  </h3>

                  <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="stock"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Qtd Atual</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.001"
                              min="0"
                              inputMode="decimal"
                              {...field}
                              value={safeNumberInputValue(field.value)}
                              onChange={(e) => field.onChange(e.target.value)}
                            />
                          </FormControl>
                          <FormDescription className="text-xs">
                            Aceita decimais (ex: 10.500)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="minStock"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Qtd Mínima</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.001"
                              min="0"
                              inputMode="decimal"
                              {...field}
                              value={safeNumberInputValue(field.value)}
                              onChange={(e) => field.onChange(e.target.value)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="flex flex-wrap gap-4 pt-2 items-center">
                    <FormField
                      control={form.control}
                      name="sellsByBox"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-2 space-y-0">
                          <FormControl>
                            <input
                              type="checkbox"
                              checked={Boolean(field.value)}
                              onChange={(e) => field.onChange(e.target.checked)}
                              className="h-4 w-4 accent-primary"
                            />
                          </FormControl>
                          <FormLabel className="!mt-0 cursor-pointer font-normal">Vende Caixa?</FormLabel>
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
                              checked={Boolean(field.value)}
                              onChange={(e) => field.onChange(e.target.checked)}
                              className="h-4 w-4 accent-primary"
                            />
                          </FormControl>
                          <FormLabel className="!mt-0 cursor-pointer font-normal">Vende KG?</FormLabel>
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Configuração da Caixa */}
                  {sellsByBox && (
                    <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 bg-background p-3 rounded-lg border">
                      <FormField
                        control={form.control}
                        name="qtyPerBox"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Qtd na Caixa</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="1"
                                step="1"
                                inputMode="numeric"
                                {...field}
                                value={
                                  field.value === null || field.value === undefined
                                    ? ""
                                    : String(field.value)
                                }
                                onChange={(e) => field.onChange(safeNumber(e.target.value))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="boxPrice"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Preço Caixa (Opcional)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                inputMode="decimal"
                                {...field}
                                value={safeNumberInputValue(field.value)}
                                onChange={(e) => field.onChange(e.target.value)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}
                </div>

                <div className="pt-2">
                  <Button type="submit" className="w-full h-12 text-lg font-medium">
                    {editingProduct ? "Salvar Alterações" : "Cadastrar Produto"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Dica (Mobile Friendly) */}
      {showInfo && (
        <Alert className="bg-blue-50/50 border-blue-200 text-blue-800 relative pr-10 shadow-sm">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertTitle className="text-blue-700 font-bold text-sm">Dicas Rápidas</AlertTitle>
          <AlertDescription className="text-blue-700/90 text-xs mt-1 leading-relaxed">
            - O <strong>SKU</strong> é gerado automaticamente.<br/>
            - Marque <strong>KG</strong> para vender por peso (ex: 0.500 kg).
          </AlertDescription>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-1 right-1 text-blue-400 hover:text-blue-700"
            onClick={handleCloseInfo}
          >
            <X className="h-4 w-4" />
          </Button>
        </Alert>
      )}

      {/* Filtros + Tabela */}
      <Card>
        <CardHeader className="pb-3 px-4 pt-4">
          <div className="flex flex-col sm:flex-row gap-3 justify-between">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar produto..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-10"
              />
            </div>

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-[180px] h-10">
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
        </CardHeader>

        <CardContent className="p-0 sm:p-6">
          {fatalError && (
            <div className="p-4">
              <Alert variant="destructive">
                <AlertTitle>Erro</AlertTitle>
                <AlertDescription>{fatalError}</AlertDescription>
              </Alert>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {/* VERSÃO DESKTOP (Tabela) */}
              <div className="hidden md:block rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-right">Venda</TableHead>
                      <TableHead className="text-right">Caixa</TableHead>
                      <TableHead className="text-right">Estoque</TableHead>
                      <TableHead className="w-20">Ações</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {filteredProducts.map((product) => {
                      const min = safeNumber(product.minStock || 0);
                      const stock = safeNumber(product.stock || 0);
                      const isLowStock = stock <= (min || 5);

                      const qty = safeNumber(product.qtyPerBox || 0);
                      const calculatedBoxPrice =
                        safeNumber(product.boxPrice || 0) > 0
                          ? safeNumber(product.boxPrice)
                          : qty > 0
                          ? qty * safeNumber(product.salePrice)
                          : 0;

                      return (
                        <TableRow key={product.id}>
                          <TableCell>
                            <div className="font-medium">{product.name}</div>
                            <div className="flex gap-1 mt-1">
                              {product.sellsByBox && (
                                <Badge variant="outline" className="text-[10px]">Cx</Badge>
                              )}
                              {product.sellsByKg && (
                                <Badge variant="outline" className="text-[10px]">Kg</Badge>
                              )}
                            </div>
                          </TableCell>

                          <TableCell>
                            <Badge variant="secondary" className="font-normal">{product.category}</Badge>
                          </TableCell>

                          <TableCell className="text-right font-medium">
                            {formatCurrency(product.salePrice)}
                          </TableCell>

                          <TableCell className="text-right">
                            {product.sellsByBox ? (
                              <span className="text-sm">{formatCurrency(calculatedBoxPrice)}</span>
                            ) : (
                              <span className="text-muted-foreground/30">-</span>
                            )}
                          </TableCell>

                          <TableCell className="text-right">
                            <span className={isLowStock ? "text-destructive font-bold" : ""}>
                              {formatStock(product)}
                            </span>
                          </TableCell>

                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEditDialog(product)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive"
                                onClick={() => setDeleteProductId(product.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {filteredProducts.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          Nenhum produto encontrado.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* VERSÃO MOBILE (Cards) - Substitui a tabela no celular */}
              <div className="md:hidden flex flex-col gap-2 p-2 bg-muted/5">
                {filteredProducts.map((product) => {
                  const stock = safeNumber(product.stock || 0);
                  const min = safeNumber(product.minStock || 0);
                  const isLowStock = stock <= (min || 5);

                  return (
                    <Card key={product.id} className="shadow-sm border-l-4 border-l-primary/40">
                      <CardContent className="p-3 flex justify-between items-start">
                        <div className="space-y-1 w-full">
                          <div className="flex justify-between items-start">
                            <span className="font-bold text-base line-clamp-1">{product.name}</span>
                            {/* Menu de ações (3 pontinhos) */}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6 -mr-2 -mt-1">
                                  <MoreVertical className="h-4 w-4 text-muted-foreground" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openEditDialog(product)}>
                                  <Edit className="h-4 w-4 mr-2" /> Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteProductId(product.id)}>
                                  <Trash2 className="h-4 w-4 mr-2" /> Excluir
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                          
                          <div className="text-xs text-muted-foreground uppercase font-semibold">
                            {product.category}
                          </div>

                          <div className="flex items-center gap-4 pt-2">
                            <div className="flex flex-col">
                              <span className="text-[10px] text-muted-foreground">Venda</span>
                              <span className="font-bold text-green-700 text-sm">
                                {formatCurrency(product.salePrice)}
                              </span>
                            </div>
                            
                            <div className="flex flex-col">
                              <span className="text-[10px] text-muted-foreground">Estoque</span>
                              <span className={`text-sm ${isLowStock ? "text-red-600 font-bold" : ""}`}>
                                {formatStock(product)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
                
                {filteredProducts.length === 0 && (
                  <div className="text-center py-10 text-muted-foreground">
                    Nenhum produto encontrado.
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Confirmar delete */}
      <AlertDialog open={!!deleteProductId} onOpenChange={() => setDeleteProductId(null)}>
        <AlertDialogContent className="w-[90vw] rounded-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Produto?</AlertDialogTitle>
            <AlertDialogDescription>Essa ação é irreversível.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-2 justify-end">
            <AlertDialogCancel className="mt-0">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90 text-white">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}