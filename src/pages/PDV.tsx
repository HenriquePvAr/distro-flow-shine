"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Search,
  CheckCircle,
  X,
  Calculator,
  Send,
  RefreshCw,
  ChevronUp,
  Banknote,
  CreditCard,
  QrCode,
  Calendar,
  User,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// --- TIPAGEM ---
interface Product {
  id: string;
  name: string;
  sku: string;
  salePrice: number;
  stock: number;
  sellsByBox: boolean;
  qtyPerBox: number | null;
  sellsByKg: boolean;
}

interface CartItem extends Product {
  quantity: number;
  saleMode: "unidade" | "caixa" | "kg";
}

interface PaymentEntry {
  id: string;
  method: string;
  amount: number;
}

interface Person {
  id: string;
  name: string;
  phone?: string;
}

const formatCurrency = (value: number) =>
  Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const safeNumber = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const parseBRNumber = (v: string) => {
  if (!v) return 0;
  return safeNumber(String(v).replace(",", "."));
};

const mapPayMethod = (method: string) => {
  const m = String(method || "").toLowerCase();
  if (m.includes("pix")) return "pix";
  if (m.includes("crédito") || m.includes("credito")) return "credit";
  if (m.includes("débito") || m.includes("debito")) return "debit";
  return "cash";
};

const OFFLINE_QUEUE_KEY = "offline_queue_v2_rpc";

type OfflineQueueEntry =
  | {
      type: "create_sale";
      payload: {
        p_customer_id: string | null;
        p_seller_name: string | null;
        p_items: Array<{
          product_id: string; // ✅ certo pro banco
          quantity: number;
          unit_price: number; // ✅ certo pro banco
          total_price: number; // ✅ NOT NULL no banco
          sale_mode: "unidade" | "caixa" | "kg";
        }>;
        p_payment_method: string;
        p_discount: number;
        p_surcharge: number;
        p_created_by: string | null;
        p_sale_type: "vista" | "prazo";
        p_due_date: string | null;
        p_commission_rate: number;
      };
    }
  | any;

export default function PDV() {
  const { user } = useAuth();

  // --- ESTADOS DE DADOS ---
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Person[]>([]);
  const [sellers, setSellers] = useState<Person[]>([]);

  // --- ESTADOS DA VENDA ---
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("padrao");
  const [selectedSellerId, setSelectedSellerId] = useState<string>("padrao");

  const [saleType, setSaleType] = useState<"vista" | "prazo">("vista");
  const [dueDate, setDueDate] = useState<string>("");
  const [commissionRate, setCommissionRate] = useState<number>(0);

  const [globalDiscount, setGlobalDiscount] = useState<string>("");
  const [globalSurcharge, setGlobalSurcharge] = useState<string>("");

  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [currentPayMethod, setCurrentPayMethod] = useState("Dinheiro");
  const [currentPayAmount, setCurrentPayAmount] = useState("");

  // --- ESTADOS DE UI ---
  const [search, setSearch] = useState("");
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastSaleData, setLastSaleData] = useState<any>(null);

  // Offline
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [offlineSalesCount, setOfflineSalesCount] = useState(0);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // trava anti “loading eterno”
  const loadIdRef = useRef(0);

  // --------------------------
  // CÁLCULOS
  // --------------------------
  const subTotal = useMemo(() => {
    return cart.reduce((acc, item) => {
      let unit = item.salePrice;
      if (item.saleMode === "caixa" && item.qtyPerBox)
        unit = item.salePrice * item.qtyPerBox;
      return acc + unit * item.quantity;
    }, 0);
  }, [cart]);

  const totalPayable = useMemo(() => {
    const discount = parseBRNumber(globalDiscount);
    const surcharge = parseBRNumber(globalSurcharge);
    const total = subTotal - discount + surcharge;
    return total > 0 ? total : 0;
  }, [subTotal, globalDiscount, globalSurcharge]);

  const totalPaid = useMemo(
    () => payments.reduce((acc, p) => acc + p.amount, 0),
    [payments]
  );

  const remaining = totalPayable - totalPaid;
  const isPaid = remaining <= 0.01;
  const change = remaining < 0 ? Math.abs(remaining) : 0;

  const commissionValue = useMemo(() => {
    return totalPayable * (Number(commissionRate || 0) / 100);
  }, [totalPayable, commissionRate]);

  const filteredProducts = useMemo(() => {
    const s = search.toLowerCase();
    return products.filter(
      (p) => p.name.toLowerCase().includes(s) || p.sku?.toLowerCase().includes(s)
    );
  }, [products, search]);

  const canFinish = useMemo(() => {
    if (cart.length === 0) return false;
    if (saleType === "vista") return isPaid;
    return !!dueDate;
  }, [cart.length, saleType, isPaid, dueDate]);

  // --------------------------
  // OFFLINE QUEUE
  // --------------------------
  const readQueue = (): OfflineQueueEntry[] => {
    try {
      const q = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]");
      return Array.isArray(q) ? q : [];
    } catch {
      return [];
    }
  };

  const writeQueue = (q: OfflineQueueEntry[]) => {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(q));
    setOfflineSalesCount(q.length);
  };

  const checkOfflineQueue = useCallback(() => {
    const q = readQueue();
    setOfflineSalesCount(q.length);
  }, []);

  // --------------------------
  // LOAD DATA (com timeout e anti-trava)
  // --------------------------
  const loadFromCache = useCallback(() => {
    const p = localStorage.getItem("pdv_products_cache");
    const c = localStorage.getItem("pdv_customers_cache");
    const s = localStorage.getItem("pdv_sellers_cache");
    if (p) setProducts(JSON.parse(p));
    if (c) setCustomers(JSON.parse(c));
    if (s) setSellers(JSON.parse(s));
  }, []);

  const loadData = useCallback(async () => {
    const myLoadId = ++loadIdRef.current;
    setLoading(true);

    const onlineNow = typeof navigator !== "undefined" ? navigator.onLine : true;
    setIsOnline(onlineNow);

    if (!onlineNow) {
      loadFromCache();
      setLoading(false);
      toast.info("Modo Offline ativado.");
      return;
    }

    const timeoutMs = 12000;
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), timeoutMs)
    );

    try {
      const task = Promise.all([
        supabase.from("products").select("*").order("name"),
        supabase.from("customers").select("*").order("name"),
        supabase.from("profiles").select("id, name").order("name"),
      ]);

      const [pRes, cRes, sRes] = await Promise.race([task, timeout]);

      if (myLoadId !== loadIdRef.current) return;

      if (pRes?.data) {
        const mapped: Product[] = pRes.data.map((p: any) => ({
          id: p.id,
          name: p.name,
          sku: p.sku || "",
          salePrice: Number(p.sale_price) || 0,
          stock: Number(p.stock) || 0,
          sellsByBox: !!p.sells_by_box,
          qtyPerBox: p.qty_per_box,
          sellsByKg: !!p.sells_by_kg,
        }));
        setProducts(mapped);
        localStorage.setItem("pdv_products_cache", JSON.stringify(mapped));
      }

      if (cRes?.data) {
        setCustomers(cRes.data);
        localStorage.setItem("pdv_customers_cache", JSON.stringify(cRes.data));
      }

      if (sRes?.data) {
        const mappedSellers = sRes.data.map((s: any) => ({
          id: s.id,
          name: s.name || "Sem Nome",
        }));
        setSellers(mappedSellers);
        localStorage.setItem("pdv_sellers_cache", JSON.stringify(mappedSellers));
      }
    } catch (e: any) {
      console.error(e);
      loadFromCache();
      toast.error(
        e?.message === "timeout"
          ? "Servidor demorou. Carregando dados do cache."
          : "Falha ao carregar. Usando cache."
      );
    } finally {
      if (myLoadId === loadIdRef.current) setLoading(false);
    }
  }, [loadFromCache]);

  // --------------------------
  // INIT + voltar do background
  // --------------------------
  useEffect(() => {
    loadData();
    checkOfflineQueue();

    const handleStatus = () => {
      setIsOnline(navigator.onLine);
      if (navigator.onLine) loadData();
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        setIsOnline(navigator.onLine);
        checkOfflineQueue();
        loadData();
      }
    };

    window.addEventListener("online", handleStatus);
    window.addEventListener("offline", handleStatus);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.removeEventListener("online", handleStatus);
      window.removeEventListener("offline", handleStatus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadData, checkOfflineQueue]);

  // --------------------------
  // CARRINHO
  // --------------------------
  const addItem = (product: Product) => {
    if (product.stock <= 0) return toast.error("Sem estoque!");

    setCart((prev) => {
      const defaultMode: CartItem["saleMode"] = product.sellsByKg ? "kg" : "unidade";
      const existing = prev.find((i) => i.id === product.id && i.saleMode === defaultMode);

      const step = defaultMode === "kg" ? 0.1 : 1;

      if (existing) {
        return prev.map((i) => (i === existing ? { ...i, quantity: i.quantity + step } : i));
      }

      return [
        ...prev,
        { ...product, quantity: defaultMode === "kg" ? 0.1 : 1, saleMode: defaultMode },
      ];
    });

    toast.success("Adicionado!");
  };

  const removeItem = (index: number) => setCart((prev) => prev.filter((_, i) => i !== index));

  const updateItemQty = (index: number, val: number) => {
    if (val <= 0) return removeItem(index);
    setCart((prev) => prev.map((item, i) => (i === index ? { ...item, quantity: val } : item)));
  };

  const toggleItemMode = (index: number) => {
    setCart((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;

        let newMode: CartItem["saleMode"] = "unidade";
        if (item.saleMode === "unidade") {
          if (item.sellsByBox) newMode = "caixa";
          else if (item.sellsByKg) newMode = "kg";
        } else if (item.saleMode === "caixa") {
          newMode = item.sellsByKg ? "kg" : "unidade";
        } else {
          newMode = "unidade";
        }

        return { ...item, saleMode: newMode, quantity: newMode === "kg" ? 0.1 : 1 };
      })
    );
  };

  // --------------------------
  // PAGAMENTO
  // --------------------------
  const addPayment = () => {
    const val = parseBRNumber(currentPayAmount);
    if (val <= 0) return;

    setPayments((prev) => [
      ...prev,
      { id: Math.random().toString(36).slice(2, 11), method: currentPayMethod, amount: val },
    ]);

    setCurrentPayAmount("");
  };

  const removePayment = (id: string) => setPayments((prev) => prev.filter((p) => p.id !== id));

  const autoFillRemaining = () => {
    if (remaining > 0) setCurrentPayAmount(remaining.toFixed(2));
  };

  // --------------------------
  // PREPARAR PAYLOAD (RPC) ✅ CORRIGIDO PRO SEU BANCO
  // --------------------------
  const buildRpcPayload = () => {
    const customerId = selectedCustomerId === "padrao" ? null : selectedCustomerId;

    const sellerObj = sellers.find((s) => s.id === selectedSellerId);
    const sellerName = sellerObj ? sellerObj.name : null;

    const items = cart.map((i) => {
      const unitPrice =
        i.saleMode === "caixa" && i.qtyPerBox ? i.salePrice * i.qtyPerBox : i.salePrice;

      return {
        product_id: i.id, // ✅ certo
        quantity: i.quantity,
        unit_price: unitPrice, // ✅ certo
        total_price: unitPrice * i.quantity, // ✅ nunca null
        sale_mode: i.saleMode,
      };
    });

    const discount = parseBRNumber(globalDiscount);
    const surcharge = parseBRNumber(globalSurcharge);

    const paymentMethod =
      saleType === "prazo"
        ? "credit_store"
        : payments.length <= 1
        ? mapPayMethod(payments[0]?.method || "Dinheiro")
        : "mixed";

    const dueISO =
      saleType === "prazo" && dueDate
        ? new Date(`${dueDate}T12:00:00.000Z`).toISOString()
        : null;

    return {
      p_customer_id: customerId,
      p_seller_name: sellerName,
      p_items: items,
      p_payment_method: paymentMethod,
      p_discount: discount,
      p_surcharge: surcharge,
      p_sale_type: saleType,
      p_due_date: dueISO,
      p_commission_rate: Number(commissionRate || 0),
      p_created_by: user?.id ?? null,
    };
  };

  // --------------------------
  // FINALIZAR VENDA
  // --------------------------
  const finishSuccess = (payload: any) => {
    const customer = customers.find((c) => c.id === selectedCustomerId) || null;
    const seller = sellers.find((s) => s.id === selectedSellerId) || null;

    setLastSaleData({
      total: totalPayable,
      change,
      customer,
      seller,
      commissionRate,
      commissionValue,
      saleType,
      dueDate,
      items: cart,
      payload,
    });

    setIsCheckoutOpen(false);
    setShowSuccessModal(true);
    resetSale();
  };

  const resetSale = () => {
    setCart([]);
    setPayments([]);
    setGlobalDiscount("");
    setGlobalSurcharge("");
    setCurrentPayAmount("");
    setSelectedCustomerId("padrao");
    setSelectedSellerId("padrao");
    setSaleType("vista");
    setDueDate("");
    setCommissionRate(0);
  };

  const saveOffline = (entry: OfflineQueueEntry) => {
    const q = readQueue();
    q.push(entry);
    writeQueue(q);

    setProducts((prev) =>
      prev.map((p) => {
        const it = cart.find((c) => c.id === p.id);
        if (!it) return p;
        const deduction =
          it.saleMode === "caixa" && it.qtyPerBox ? it.quantity * it.qtyPerBox : it.quantity;
        return { ...p, stock: p.stock - deduction };
      })
    );

    toast.info("Sem internet: venda salva para sincronizar depois.");
    finishSuccess(entry);
  };

  const handleFinish = async () => {
    if (cart.length === 0) return toast.error("Carrinho vazio");

    if (saleType === "vista" && !isPaid) {
      return toast.error("Pagamento incompleto para venda à vista!");
    }

    if (saleType === "prazo" && !dueDate) {
      return toast.error("Defina a data de vencimento (venda a prazo).");
    }

    setProcessing(true);

    try {
      const payload = buildRpcPayload();

      if (isOnline) {
        const { data: saleId, error } = await supabase.rpc("create_sale", payload);
        if (error) throw error;

        toast.success("Venda registrada! ✅");
        finishSuccess({ saleId, ...payload });
      } else {
        saveOffline({ type: "create_sale", payload });
      }
    } catch (err: any) {
      console.error(err);

      if (navigator.onLine) {
        toast.error(err?.message || "Erro ao salvar a venda no servidor.");
        return;
      }

      toast.error("Sem internet: salvando venda offline...");
      const payload = buildRpcPayload();
      saveOffline({ type: "create_sale", payload });
    } finally {
      setProcessing(false);
    }
  };

  const handleSync = async () => {
    if (!isOnline) return toast.error("Sem internet para sincronizar.");

    setProcessing(true);

    const q = readQueue();
    if (q.length === 0) {
      setProcessing(false);
      return toast.info("Nada para sincronizar");
    }

    try {
      for (const entry of q) {
        if (entry?.type === "create_sale") {
          const { error } = await supabase.rpc("create_sale", entry.payload);
          if (error) throw error;
        }
      }

      writeQueue([]);
      toast.success("Sincronizado!");
      loadData();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Erro na sincronização");
    } finally {
      setProcessing(false);
    }
  };

  // --- UI COMPONENTS ---
  const ProductCard = ({ product }: { product: Product }) => {
    const isOut = product.stock <= 0;

    return (
      <Card
        className={`overflow-hidden cursor-pointer transition-all hover:border-primary active:scale-95 ${
          isOut ? "opacity-50 grayscale" : ""
        }`}
        onClick={() => addItem(product)}
      >
        <CardContent className="p-3">
          <div className="flex justify-between items-start mb-1">
            <Badge
              variant={isOut ? "destructive" : "secondary"}
              className="text-[10px] px-1 h-5"
            >
              {Number(product.stock).toFixed(product.sellsByKg ? 2 : 0)}{" "}
              {product.sellsByKg ? "kg" : "un"}
            </Badge>

            {product.sellsByBox && (
              <Badge
                variant="outline"
                className="text-[10px] px-1 h-5 border-blue-200 text-blue-700 bg-blue-50"
              >
                Cx: {product.qtyPerBox}
              </Badge>
            )}
          </div>

          <div className="h-10 text-sm font-medium leading-tight line-clamp-2 mb-2">
            {product.name}
          </div>

          <div className="flex justify-between items-end">
            <span className="text-xs text-muted-foreground">{product.sku}</span>
            <span className="text-lg font-bold text-emerald-600">
              {formatCurrency(product.salePrice)}
            </span>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="flex flex-col h-[calc(100vh-60px)] bg-muted/10 relative">
      {/* HEADER */}
      <header className="bg-white border-b px-4 py-3 flex gap-3 items-center shadow-sm z-10 sticky top-0">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            placeholder="Buscar produto (Nome ou SKU)..."
            className="pl-9 bg-muted/30 border-muted-foreground/20"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {offlineSalesCount > 0 && (
            <Button
              size="sm"
              variant={isOnline ? "default" : "destructive"}
              onClick={handleSync}
              disabled={processing || !isOnline}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${processing ? "animate-spin" : ""}`} />
              {offlineSalesCount}
            </Button>
          )}
          <div className={`h-3 w-3 rounded-full ${isOnline ? "bg-emerald-500" : "bg-red-500"}`} />
        </div>
      </header>

      {/* LISTA */}
      <main className="flex-1 overflow-y-auto p-4 pb-24">
        {loading ? (
          <div className="flex justify-center items-center h-40">
            <RefreshCw className="animate-spin h-8 w-8 text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {filteredProducts.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
            {filteredProducts.length === 0 && (
              <div className="col-span-full text-center text-muted-foreground py-10">
                Nenhum produto encontrado.
              </div>
            )}
          </div>
        )}
      </main>

      {/* BARRA INFERIOR */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 shadow-[0_-5px_20px_-5px_rgba(0,0,0,0.1)] z-20 md:pl-64">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground font-medium">{cart.length} itens no carrinho</span>
            <span className="text-2xl font-bold text-gray-900">{formatCurrency(subTotal)}</span>
          </div>

          <Sheet open={isCheckoutOpen} onOpenChange={setIsCheckoutOpen}>
            <SheetTrigger asChild>
              <Button size="lg" className="h-12 px-8 text-lg shadow-lg font-bold bg-primary hover:bg-primary/90">
                Ver / Pagar
                <ChevronUp className="ml-2 h-5 w-5" />
              </Button>
            </SheetTrigger>

            <SheetContent side="bottom" className="h-[95vh] sm:h-[90vh] rounded-t-xl flex flex-col p-0 gap-0">
              <SheetHeader className="px-6 py-4 border-b bg-muted/5">
                <div className="flex justify-between items-center">
                  <SheetTitle className="text-xl">Checkout</SheetTitle>
                  <SheetClose asChild>
                    <Button variant="ghost" size="icon">
                      <X className="h-5 w-5" />
                    </Button>
                  </SheetClose>
                </div>
              </SheetHeader>

              <Tabs defaultValue="cart" className="flex-1 flex flex-col min-h-0">
                <div className="px-6 pt-2">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="cart">Itens ({cart.length})</TabsTrigger>
                    <TabsTrigger value="pay">Pagamento</TabsTrigger>
                  </TabsList>
                </div>

                {/* TAB CARRINHO */}
                <TabsContent value="cart" className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                  {cart.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground">
                      <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-20" />
                      Carrinho vazio
                    </div>
                  ) : (
                    cart.map((item, idx) => (
                      <div key={`${item.id}-${idx}`} className="flex gap-3 py-3 border-b last:border-0 items-center">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{item.name}</div>
                          <div className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                            <span
                              className="bg-muted px-2 py-0.5 rounded text-xs cursor-pointer border hover:bg-muted-foreground/20"
                              onClick={() => toggleItemMode(idx)}
                            >
                              {item.saleMode.toUpperCase()}
                            </span>
                            <span>
                              x{" "}
                              {formatCurrency(
                                item.saleMode === "caixa" && item.qtyPerBox ? item.salePrice * item.qtyPerBox : item.salePrice
                              )}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 bg-muted/30 rounded-lg p-1 border">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => updateItemQty(idx, item.quantity - (item.saleMode === "kg" ? 0.1 : 1))}
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                          <span className="w-12 text-center font-mono font-medium">
                            {item.quantity.toFixed(item.saleMode === "kg" ? 3 : 0)}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => updateItemQty(idx, item.quantity + (item.saleMode === "kg" ? 0.1 : 1))}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="text-right min-w-[70px]">
                          <div className="font-bold">
                            {formatCurrency(
                              (item.saleMode === "caixa" && item.qtyPerBox ? item.salePrice * item.qtyPerBox : item.salePrice) * item.quantity
                            )}
                          </div>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive -mr-2" onClick={() => removeItem(idx)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}

                  <div className="pt-4 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium mb-1 block">Cliente</label>
                        <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="padrao">Padrão</SelectItem>
                            {customers.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <label className="text-xs font-medium mb-1 block">Vendedor</label>
                        <Select value={selectedSellerId} onValueChange={setSelectedSellerId}>
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="padrao">Padrão</SelectItem>
                            {sellers.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="relative">
                        <label className="text-xs font-medium mb-1 block text-green-600">Desconto (R$)</label>
                        <Minus className="absolute left-2 top-8 h-3 w-3 text-green-600" />
                        <Input className="pl-6 h-9" placeholder="0,00" value={globalDiscount} onChange={(e) => setGlobalDiscount(e.target.value)} />
                      </div>

                      <div className="relative">
                        <label className="text-xs font-medium mb-1 block text-red-600">Acréscimo (R$)</label>
                        <Plus className="absolute left-2 top-8 h-3 w-3 text-red-600" />
                        <Input className="pl-6 h-9" placeholder="0,00" value={globalSurcharge} onChange={(e) => setGlobalSurcharge(e.target.value)} />
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* TAB PAGAMENTO */}
                <TabsContent value="pay" className="flex-1 overflow-y-auto px-6 py-4 flex flex-col">
                  <div className="bg-white p-3 rounded-xl border mb-4 space-y-3 shadow-sm">
                    <div className="flex gap-2">
                      <Button
                        variant={saleType === "vista" ? "default" : "outline"}
                        className="flex-1"
                        onClick={() => setSaleType("vista")}
                      >
                        À Vista
                      </Button>

                      {/* ✅ Tirado “Fiado” do texto, mas mantém a lógica a prazo */}
                      <Button
                        variant={saleType === "prazo" ? "default" : "outline"}
                        className="flex-1"
                        onClick={() => {
                          setSaleType("prazo");
                          setPayments([]);
                          setCurrentPayAmount("");
                        }}
                      >
                        A Prazo
                      </Button>
                    </div>

                    {saleType === "prazo" && (
                      <div className="space-y-1 animate-in slide-in-from-top-2">
                        <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" /> Data de Vencimento
                        </label>
                        <Input
                          type="date"
                          value={dueDate}
                          onChange={(e) => setDueDate(e.target.value)}
                          className="border-amber-400 bg-amber-50"
                        />
                      </div>
                    )}

                    <div className="pt-2 border-t space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                        <User className="h-3 w-3" /> Comissão do Vendedor
                      </label>
                      <div className="flex gap-2">
                        {[0, 5, 10].map((p) => (
                          <Button
                            key={p}
                            size="sm"
                            variant={commissionRate === p ? "default" : "secondary"}
                            className="flex-1"
                            onClick={() => setCommissionRate(p)}
                          >
                            {p}%
                          </Button>
                        ))}
                      </div>

                      <div className="text-xs text-right text-muted-foreground">
                        Valor da Comissão:{" "}
                        <span className="font-semibold text-green-600">
                          {formatCurrency(commissionValue)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mb-6">
                    <div className="bg-muted/30 p-3 rounded-lg border text-center">
                      <div className="text-[10px] uppercase text-muted-foreground font-bold">Total</div>
                      <div className="text-lg font-bold">{formatCurrency(totalPayable)}</div>
                    </div>

                    <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100 text-center">
                      <div className="text-[10px] uppercase text-emerald-700 font-bold">Pago</div>
                      <div className="text-lg font-bold text-emerald-700">{formatCurrency(totalPaid)}</div>
                    </div>

                    <div className={`p-3 rounded-lg border text-center ${remaining > 0 ? "bg-red-50 border-red-100" : "bg-blue-50 border-blue-100"}`}>
                      <div className={`text-[10px] uppercase font-bold ${remaining > 0 ? "text-red-700" : "text-blue-700"}`}>
                        {remaining > 0 ? "Falta" : "Troco"}
                      </div>
                      <div className={`text-lg font-bold ${remaining > 0 ? "text-red-700" : "text-blue-700"}`}>
                        {formatCurrency(remaining > 0 ? remaining : change)}
                      </div>
                    </div>
                  </div>

                  {saleType === "prazo" ? (
                    <div className="text-center py-6 text-muted-foreground bg-amber-50 rounded-lg border border-amber-200">
                      <p className="font-medium text-amber-900">Venda a Prazo Selecionada</p>
                      <p className="text-xs mt-1 text-amber-800/80">O pagamento ficará pendente até o vencimento.</p>
                    </div>
                  ) : (
                    <>
                      {payments.length > 0 && (
                        <div className="mb-6 space-y-2">
                          <label className="text-xs font-medium text-muted-foreground uppercase">Pagamentos Realizados</label>

                          {payments.map((p) => (
                            <div key={p.id} className="flex justify-between items-center bg-white border p-2 rounded-md shadow-sm">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">{p.method}</Badge>
                                <span className="font-bold">{formatCurrency(p.amount)}</span>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                onClick={() => removePayment(p.id)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}

                      {remaining > 0.01 && (
                        <div className="space-y-4 bg-muted/20 p-4 rounded-xl border">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {["Dinheiro", "Pix", "Cartão Crédito", "Cartão Débito"].map((method) => (
                              <Button
                                key={method}
                                variant={currentPayMethod === method ? "default" : "outline"}
                                className={`h-9 text-xs ${currentPayMethod === method ? "ring-2 ring-offset-1" : ""}`}
                                onClick={() => setCurrentPayMethod(method)}
                              >
                                {method === "Dinheiro" && <Banknote className="h-3 w-3 mr-1" />}
                                {method === "Pix" && <QrCode className="h-3 w-3 mr-1" />}
                                {method.includes("Cartão") && <CreditCard className="h-3 w-3 mr-1" />}
                                {method}
                              </Button>
                            ))}
                          </div>

                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">R$</span>
                              <Input
                                className="pl-10 h-12 text-xl font-bold bg-white"
                                placeholder="0,00"
                                inputMode="decimal"
                                value={currentPayAmount}
                                onChange={(e) => setCurrentPayAmount(e.target.value)}
                              />
                            </div>

                            {remaining > 0 && (
                              <Button variant="secondary" className="h-12 w-14 border" onClick={autoFillRemaining}>
                                <Calculator className="h-5 w-5" />
                              </Button>
                            )}

                            <Button className="h-12 w-14 bg-emerald-600 hover:bg-emerald-700" onClick={addPayment}>
                              <Plus className="h-6 w-6" />
                            </Button>
                          </div>

                          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                            {[10, 20, 50, 100].map((val) => (
                              <Button
                                key={val}
                                variant="outline"
                                size="sm"
                                className="text-xs whitespace-nowrap bg-white"
                                onClick={() => setCurrentPayAmount(val.toString())}
                              >
                                R$ {val}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </TabsContent>

                {/* FOOTER */}
                <div className="p-6 border-t mt-auto bg-white">
                  <Button
                    className={`w-full h-14 text-xl shadow-lg transition-all ${canFinish ? "bg-emerald-600 hover:bg-emerald-700" : "bg-gray-400"}`}
                    disabled={!canFinish || processing}
                    onClick={handleFinish}
                  >
                    {processing ? (
                      <>
                        <RefreshCw className="mr-2 h-6 w-6 animate-spin" /> Processando...
                      </>
                    ) : canFinish ? (
                      <>
                        <CheckCircle className="mr-2 h-6 w-6" /> CONCLUIR VENDA
                      </>
                    ) : saleType === "prazo" ? (
                      <>Defina o vencimento</>
                    ) : (
                      <>Falta {formatCurrency(remaining)}</>
                    )}
                  </Button>
                </div>
              </Tabs>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* MODAL SUCESSO */}
      <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
        <DialogContent className="sm:max-w-md text-center">
          <DialogHeader>
            <div className="mx-auto bg-emerald-100 p-3 rounded-full w-fit mb-3">
              <CheckCircle className="h-10 w-10 text-emerald-600" />
            </div>
            <DialogTitle className="text-2xl text-emerald-700">Venda Realizada!</DialogTitle>
            <DialogDescription>A venda foi registrada com sucesso.</DialogDescription>
          </DialogHeader>

          <div className="bg-muted/30 p-4 rounded-xl space-y-2 my-2 border">
            <div className="flex justify-between text-sm">
              <span>Total</span>
              <span className="font-bold">{formatCurrency(lastSaleData?.total)}</span>
            </div>

            <div className="flex justify-between text-sm">
              <span>Comissão ({lastSaleData?.commissionRate}%)</span>
              <span className="font-bold text-green-600">
                {formatCurrency(Number(lastSaleData?.commissionValue || 0))}
              </span>
            </div>

            {lastSaleData?.saleType === "prazo" && (
              <div className="flex justify-between text-sm text-amber-700 font-medium">
                <span>Vencimento</span>
                <span>
                  {lastSaleData?.dueDate
                    ? new Date(lastSaleData.dueDate).toLocaleDateString("pt-BR")
                    : "-"}
                </span>
              </div>
            )}

            {lastSaleData?.change > 0 && (
              <div className="flex justify-between text-lg text-blue-600 font-bold border-t pt-2">
                <span>Troco</span>
                <span>{formatCurrency(lastSaleData?.change)}</span>
              </div>
            )}
          </div>

          <div className="grid gap-3">
            {lastSaleData?.customer?.phone && (
              <Button
                className="w-full bg-green-600 hover:bg-green-700"
                onClick={() => {
                  const text = `Olá ${lastSaleData.customer.name}, sua compra de ${formatCurrency(
                    lastSaleData.total
                  )} foi confirmada!`;
                  window.open(
                    `https://wa.me/55${String(lastSaleData.customer.phone).replace(/\D/g, "")}?text=${encodeURIComponent(
                      text
                    )}`,
                    "_blank"
                  );
                }}
              >
                <Send className="mr-2 h-4 w-4" /> Enviar Comprovante (Zap)
              </Button>
            )}
            <Button variant="outline" onClick={() => setShowSuccessModal(false)}>
              Nova Venda
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
