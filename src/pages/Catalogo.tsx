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

// Evita value={NaN} / undefined no type="number" (isso pode crashar em alguns WebViews)
const safeNumberInputValue = (v: any) => {
  if (v === null || v === undefined) return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  // ✅ você pediu: não mostrar "0" ao cadastrar
  if (n === 0) return "";
  // Mantém como string para input number
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
    const isHidden = localStorage.getItem("hide_catalogo_info");
    if (isHidden === "true") setShowInfo(false);

    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // garante sku sempre setado ao editar
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
    if (margin < 10) return "text-destructive";
    if (margin < 25) return "text-yellow-600";
    return "text-green-600";
  };

  const formatStock = (p: Product) => {
    if (p.sellsByKg) return `${safeNumber(p.stock).toFixed(3)} kg`;
    return `${safeNumber(p.stock).toFixed(0)} un`;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
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
            <Button onClick={openNewDialog} className="gap-2">
              <Plus className="h-4 w-4" /> Novo Produto
            </Button>
          </DialogTrigger>

          {/* ✅ Dialog responsivo no mobile */}
          <DialogContent className="w-[95vw] sm:w-full max-w-lg sm:max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle>{editingProduct ? "Editar Produto" : "Cadastrar Produto"}</DialogTitle>
              <DialogDescription>Preencha os dados do item.</DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 sm:space-y-6">
                {/* Dados Básicos */}
                <div className="space-y-3 sm:space-y-4">
                  <h3 className="font-semibold text-foreground flex items-center gap-2">
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

                    {/* SKU removido da interface (gera automático no submit) */}

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
                <div className="space-y-3 sm:space-y-4">
                  <h3 className="font-semibold text-foreground flex items-center gap-2">
                    <Percent className="h-4 w-4" /> Precificação
                  </h3>

                  {/* ✅ no mobile vira 2 colunas, no desktop 3 */}
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

                    {/* ✅ margem ocupa 2 colunas no mobile */}
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
                <div className="space-y-3 sm:space-y-4">
                  <h3 className="font-semibold text-foreground flex items-center gap-2">
                    <BoxIcon className="h-4 w-4" /> Estoque & Tipo
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

                  <div className="flex flex-wrap gap-6 pt-2 items-center">
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
                          <FormLabel className="!mt-0 cursor-pointer">Vende Caixa?</FormLabel>
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
                          <FormLabel className="!mt-0 cursor-pointer">Vende KG?</FormLabel>
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Configuração da Caixa */}
                  {sellsByBox && (
                    <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 bg-muted/30 p-3 rounded-lg border">
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

                <Button type="submit" className="w-full">
                  {editingProduct ? "Salvar Alterações" : "Cadastrar Produto"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Dica */}
      {showInfo && (
        <Alert className="bg-blue-50/50 border-blue-200 text-blue-800 relative pr-10 animate-in slide-in-from-top-2 fade-in shadow-sm">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertTitle className="text-blue-700 font-semibold">Dicas</AlertTitle>
          <AlertDescription className="text-blue-700/80 text-sm mt-1">
            <ul className="list-disc list-inside space-y-1">
              <li>
                <strong>SKU:</strong> O código é gerado automaticamente pelo sistema.
              </li>
              <li>
                <strong>Vende por KG?</strong> Marque para produtos fracionados (ex: 10.500).
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
      )}

      {/* Filtros + Tabela */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-4 justify-between">
            <div className="relative flex-1 sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
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

        <CardContent>
          {fatalError && (
            <Alert className="mb-4" variant="destructive">
              <AlertTitle>Erro ao carregar</AlertTitle>
              <AlertDescription className="flex items-center justify-between gap-3">
                <span className="text-sm">{fatalError}</span>
                <Button variant="outline" onClick={fetchProducts}>
                  Tentar de novo
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>

                    {/* ✅ some no mobile */}
                    <TableHead className="hidden sm:table-cell">Categoria</TableHead>

                    <TableHead className="text-right">Venda</TableHead>

                    {/* ✅ some no mobile */}
                    <TableHead className="hidden sm:table-cell text-right">Caixa</TableHead>

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
                              <Badge variant="outline" className="text-[10px]">
                                Caixa
                              </Badge>
                            )}
                            {product.sellsByKg && (
                              <Badge variant="outline" className="text-[10px]">
                                KG
                              </Badge>
                            )}
                          </div>

                          {/* ✅ resumo mobile para não precisar arrastar */}
                          <div className="sm:hidden text-xs text-muted-foreground mt-2 space-y-1">
                            <div>
                              <span className="font-medium">Categoria:</span> {product.category}
                            </div>
                            {product.sellsByBox && (
                              <div>
                                <span className="font-medium">Caixa:</span>{" "}
                                {formatCurrency(calculatedBoxPrice)}
                              </div>
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="hidden sm:table-cell">
                          <Badge variant="secondary">{product.category}</Badge>
                        </TableCell>

                        <TableCell className="text-right font-medium whitespace-nowrap">
                          {formatCurrency(product.salePrice)}
                          {product.sellsByKg && (
                            <span className="text-xs text-muted-foreground ml-1">/kg</span>
                          )}
                        </TableCell>

                        <TableCell className="hidden sm:table-cell text-right whitespace-nowrap">
                          {product.sellsByBox ? (
                            <span
                              className={
                                safeNumber(product.boxPrice || 0) <= 0
                                  ? "text-muted-foreground italic"
                                  : "font-medium"
                              }
                            >
                              {formatCurrency(calculatedBoxPrice)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/30">-</span>
                          )}
                        </TableCell>

                        <TableCell className="text-right whitespace-nowrap">
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
          )}
        </CardContent>
      </Card>

      {/* Confirmar delete */}
      <AlertDialog open={!!deleteProductId} onOpenChange={() => setDeleteProductId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Produto?</AlertDialogTitle>
            <AlertDialogDescription>Essa ação é irreversível.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
