"use client";

import { useState, useEffect, useMemo } from "react";
import {
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Search,
  CheckCircle,
  X,
  Info,
  Calculator,
  User,
  UserCheck,
  Send,
  Wifi,
  WifiOff,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";

// --- TIPAGEM ---
interface Product {
  id: string;
  name: string;
  sku: string;
  salePrice: number;
  stock: number; // un OU kg (dependendo do produto)
  sellsByBox: boolean;
  qtyPerBox: number | null;
  sellsByKg: boolean;
}

interface CartItem extends Product {
  quantity: number;
  saleMode: "unidade" | "caixa" | "kg";
}

interface PaymentEntry {
  method: string;
  amount: number;
}

interface Person {
  id: string;
  name: string;
  phone?: string;
}

const paymentMethods = ["Dinheiro", "Pix", "Cartão de Crédito", "Cartão de Débito"];

const formatCurrency = (value: number) =>
  Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const safeNumber = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const parseBRNumber = (v: string) => {
  if (!v) return 0;
  // mantém compatível com input number (mas trata se vier com vírgula)
  return safeNumber(String(v).replace(",", "."));
};

function clampMin(n: number, min: number) {
  if (!Number.isFinite(n)) return min;
  return n < min ? min : n;
}

export default function PDV() {
  // Dados
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Person[]>([]);
  const [sellers, setSellers] = useState<Person[]>([]);

  // Operação
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [showInfo, setShowInfo] = useState(true);

  // Conexão
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [offlineSalesCount, setOfflineSalesCount] = useState(0);

  // Seleção
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("padrao");
  const [selectedSellerId, setSelectedSellerId] = useState<string>("padrao");

  // Pagamento
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [currentMethod, setCurrentMethod] = useState("Dinheiro");
  const [currentAmount, setCurrentAmount] = useState("");
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const [lastSaleData, setLastSaleData] = useState<{
    total: number;
    change: number;
    customer?: Person;
    items: CartItem[];
  } | null>(null);

  // --------------------------
  // Debounce da busca (melhora performance)
  // --------------------------
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 200);
    return () => clearTimeout(t);
  }, [search]);

  // --------------------------
  // Inicialização + listeners
  // --------------------------
  useEffect(() => {
    loadData();
    checkOfflineSales();

    const handleOnline = () => {
      setIsOnline(true);
      toast.success("Conexão restabelecida! Você pode sincronizar agora.");
      checkOfflineSales();
    };
    const handleOffline = () => {
      setIsOnline(false);
      toast.warning("Você está offline. O sistema usará dados salvos.");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const isHidden = localStorage.getItem("hide_pdv_info");
    if (isHidden === "true") setShowInfo(false);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCloseInfo = () => {
    setShowInfo(false);
    localStorage.setItem("hide_pdv_info", "true");
  };

  const handleShowInfo = () => {
    setShowInfo(true);
    localStorage.removeItem("hide_pdv_info");
  };

  const checkOfflineSales = () => {
    const saved = localStorage.getItem("offline_queue");
    try {
      const arr = saved ? JSON.parse(saved) : [];
      setOfflineSalesCount(Array.isArray(arr) ? arr.length : 0);
    } catch {
      setOfflineSalesCount(0);
    }
  };

  // --------------------------
  // Cache helpers
  // --------------------------
  const loadFromCache = () => {
    const cachedProducts = localStorage.getItem("pdv_products_cache");
    const cachedCustomers = localStorage.getItem("pdv_customers_cache");
    const cachedSellers = localStorage.getItem("pdv_sellers_cache");

    if (cachedProducts) setProducts(JSON.parse(cachedProducts));
    if (cachedCustomers) setCustomers(JSON.parse(cachedCustomers));
    if (cachedSellers) setSellers(JSON.parse(cachedSellers));

    if (cachedProducts) toast.info("Dados carregados da memória local (Modo Offline).");
  };

  // --------------------------
  // Carregar dados (online ou cache)
  // --------------------------
  const loadData = async () => {
    setLoading(true);

    if (!navigator.onLine) {
      loadFromCache();
      setLoading(false);
      return;
    }

    try {
      const [prodRes, custRes, sellRes] = await Promise.all([
        supabase.from("products").select("*").order("name"),
        supabase.from("customers").select("*").order("name"),
        supabase.from("sellers").select("*").order("name"),
      ]);

      if (prodRes.error) throw prodRes.error;
      if (custRes.error) throw custRes.error;
      if (sellRes.error) throw sellRes.error;

      const productsData = prodRes.data || [];
      const mappedProducts: Product[] = productsData.map((p: any) => ({
        id: p.id,
        name: p.name,
        sku: p.sku || "",
        salePrice: safeNumber(p.sale_price ?? 0),
        stock: safeNumber(p.stock ?? 0),
        sellsByBox: Boolean(p.sells_by_box ?? false),
        qtyPerBox: p.qty_per_box ?? null,
        sellsByKg: Boolean(p.sells_by_kg ?? false),
      }));

      setProducts(mappedProducts);
      setCustomers((custRes.data as Person[]) || []);
      setSellers((sellRes.data as Person[]) || []);

      localStorage.setItem("pdv_products_cache", JSON.stringify(mappedProducts));
      localStorage.setItem("pdv_customers_cache", JSON.stringify(custRes.data || []));
      localStorage.setItem("pdv_sellers_cache", JSON.stringify(sellRes.data || []));
    } catch (error) {
      console.error("Erro ao buscar dados online:", error);
      loadFromCache();
    } finally {
      setLoading(false);
    }
  };

  // --------------------------
  // Estoque necessário para um item (considera caixa)
  // --------------------------
  const getStockNeeded = (item: Pick<CartItem, "quantity" | "saleMode" | "qtyPerBox">) => {
    if (item.saleMode === "caixa" && item.qtyPerBox) return item.quantity * item.qtyPerBox;
    return item.quantity;
  };

  // --------------------------
  // Preço efetivo (caixa = un * qtyPerBox)
  // --------------------------
  const getItemEffectivePrice = (item: CartItem) => {
    if (item.saleMode === "caixa" && item.sellsByBox && item.qtyPerBox) {
      return item.salePrice * item.qtyPerBox;
    }
    return item.salePrice;
  };

  // --------------------------
  // Carrinho
  // --------------------------
  const getDefaultMode = (p: Product): CartItem["saleMode"] => {
    if (p.sellsByKg) return "kg";
    return "unidade";
  };

  const handleAddToCart = (product: Product) => {
    if (product.stock <= 0) {
      toast.error("Produto sem estoque disponível!");
      return;
    }

    const initialMode = getDefaultMode(product);

    setCart((prev) => {
      const idx = prev.findIndex((i) => i.id === product.id && i.saleMode === initialMode);

      if (idx >= 0) {
        const current = prev[idx];
        const nextQty = current.quantity + (initialMode === "kg" ? 0.1 : 1);
        const stockNeeded = getStockNeeded({ quantity: nextQty, saleMode: initialMode, qtyPerBox: current.qtyPerBox });

        if (stockNeeded > product.stock) {
          toast.error(`Estoque insuficiente! Disponível: ${product.stock}`);
          return prev;
        }

        const updated = [...prev];
        updated[idx] = { ...current, quantity: nextQty };
        return updated;
      }

      // valida caixa se default fosse caixa (não é), mas mantém coerência geral
      const stockNeeded = getStockNeeded({ quantity: 1, saleMode: initialMode, qtyPerBox: product.qtyPerBox });
      if (stockNeeded > product.stock) {
        toast.error(`Estoque insuficiente! Disponível: ${product.stock}`);
        return prev;
      }

      return [...prev, { ...product, quantity: initialMode === "kg" ? 0.1 : 1, saleMode: initialMode }];
    });
  };

  const removeFromCart = (id: string, saleMode: CartItem["saleMode"]) => {
    setCart((prev) => prev.filter((item) => !(item.id === id && item.saleMode === saleMode)));
  };

  const updateQuantity = (id: string, saleMode: CartItem["saleMode"], newQtyRaw: number) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.id !== id || item.saleMode !== saleMode) return item;

        const min = saleMode === "kg" ? 0.001 : 1;
        const newQty = clampMin(Number(newQtyRaw), min);

        const stockNeeded = getStockNeeded({ quantity: newQty, saleMode, qtyPerBox: item.qtyPerBox });
        if (stockNeeded > item.stock) {
          toast.error(`Estoque insuficiente! Máx: ${item.stock}`);
          return item;
        }

        return { ...item, quantity: newQty };
      })
    );
  };

  // Troca modo e MESCLA itens se já existir o mesmo produto no novo modo
  const updateSaleMode = (id: string, oldMode: CartItem["saleMode"], newMode: CartItem["saleMode"]) => {
    setCart((prev) => {
      const currentIndex = prev.findIndex((i) => i.id === id && i.saleMode === oldMode);
      if (currentIndex < 0) return prev;

      const current = prev[currentIndex];

      // valida caixa
      if (newMode === "caixa" && (!current.sellsByBox || !current.qtyPerBox)) {
        toast.error("Este produto não está configurado para venda por caixa.");
        return prev;
      }

      // quantidade inicial por modo
      const baseQty = newMode === "kg" ? 0.1 : 1;

      // valida estoque mínimo (1 caixa pode exigir mais unidades)
      const stockNeeded = getStockNeeded({ quantity: baseQty, saleMode: newMode, qtyPerBox: current.qtyPerBox });
      if (stockNeeded > current.stock) {
        toast.error("Não há estoque suficiente para esse modo.");
        return prev;
      }

      // se já existe item com novo modo, mescla
      const otherIndex = prev.findIndex((i) => i.id === id && i.saleMode === newMode);
      const updated = [...prev];

      // remove o atual
      updated.splice(currentIndex, 1);

      if (otherIndex >= 0) {
        const other = updated.find((i) => i.id === id && i.saleMode === newMode);
        if (!other) return prev;

        // soma quantidades (com validação de estoque)
        const sumQty = other.quantity + baseQty;
        const need = getStockNeeded({ quantity: sumQty, saleMode: newMode, qtyPerBox: other.qtyPerBox });
        if (need > other.stock) {
          toast.error("Ao mesclar, excede o estoque.");
          return prev;
        }

        return updated.map((i) => {
          if (i.id === id && i.saleMode === newMode) return { ...i, quantity: sumQty };
          return i;
        });
      }

      // adiciona item no novo modo
      return [...updated, { ...current, saleMode: newMode, quantity: baseQty }];
    });
  };

  // --------------------------
  // Totais
  // --------------------------
  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + getItemEffectivePrice(item) * item.quantity, 0);
  }, [cart]);

  const paymentsTotal = useMemo(() => payments.reduce((sum, p) => sum + p.amount, 0), [payments]);

  const balance = cartTotal - paymentsTotal;
  const remainingAmount = balance > 0 ? balance : 0;
  const changeAmount = balance < 0 ? Math.abs(balance) : 0;

  // --------------------------
  // Pagamentos
  // --------------------------
  const handleAddPayment = () => {
    if (!currentMethod) return toast.error("Selecione o método.");
    const amount = parseBRNumber(currentAmount);

    if (!Number.isFinite(amount) || amount <= 0) return toast.error("Valor inválido.");

    setPayments((prev) => [...prev, { method: currentMethod, amount }]);
    setCurrentMethod("Dinheiro");
    setCurrentAmount("");
  };

  const handleFillRemaining = () => {
    if (remainingAmount > 0) setCurrentAmount(remainingAmount.toFixed(2));
  };

  const removePayment = (index: number) => {
    setPayments((prev) => prev.filter((_, i) => i !== index));
  };

  // --------------------------
  // Offline queue helpers
  // --------------------------
  const pushOfflineSale = (payload: any) => {
    const currentQueue = JSON.parse(localStorage.getItem("offline_queue") || "[]");
    currentQueue.push(payload);
    localStorage.setItem("offline_queue", JSON.stringify(currentQueue));
    setOfflineSalesCount(currentQueue.length);
  };

  // --------------------------
  // Sincronizar offline
  // --------------------------
  const handleSyncOfflineSales = async () => {
    setProcessing(true);
    try {
      const saved = localStorage.getItem("offline_queue");
      if (!saved) {
        setProcessing(false);
        return;
      }

      const queue = JSON.parse(saved);
      if (!Array.isArray(queue) || queue.length === 0) {
        localStorage.removeItem("offline_queue");
        setOfflineSalesCount(0);
        setProcessing(false);
        return;
      }

      for (const sale of queue) {
        const { error: finError } = await supabase.from("financial_entries").insert({
          ...sale.financial,
          id: undefined,
        });
        if (finError) throw finError;

        // baixa de estoque
        for (const item of sale.items as CartItem[]) {
          const { data: currentProd, error: pErr } = await supabase
            .from("products")
            .select("stock")
            .eq("id", item.id)
            .single();

          if (pErr) throw pErr;

          const qtyToDeduct = getStockNeeded(item);
          const newStock = safeNumber(currentProd?.stock) - qtyToDeduct;

          const { error: upErr } = await supabase
            .from("products")
            .update({ stock: newStock })
            .eq("id", item.id);

          if (upErr) throw upErr;
        }
      }

      localStorage.removeItem("offline_queue");
      setOfflineSalesCount(0);
      toast.success("Vendas sincronizadas com sucesso!");
      await loadData();
    } catch (error) {
      console.error(error);
      toast.error("Erro ao sincronizar. Verifique sua conexão.");
    } finally {
      setProcessing(false);
    }
  };

  // --------------------------
  // Finalizar UI
  // --------------------------
  const finalizeUI = (customer: Person | undefined, total: number, change: number, items: CartItem[]) => {
    setLastSaleData({
      total,
      change,
      customer,
      items: [...items],
    });
    setShowSuccessModal(true);

    setCart([]);
    setPayments([]);
    setCurrentAmount("");
  };

  // --------------------------
  // Finalizar venda
  // --------------------------
  const handleFinalizeSale = async () => {
    if (cart.length === 0) return toast.error("Carrinho vazio.");
    if (balance > 0.05) return toast.error(`Falta receber ${formatCurrency(balance)}`);

    setProcessing(true);

    const customer = customers.find((c) => c.id === selectedCustomerId);
    const seller = sellers.find((s) => s.id === selectedSellerId);

    const customerName = customer ? customer.name : "Cliente Balcão";
    const sellerName = seller ? seller.name : "Venda Balcão";

    const paymentDesc =
      payments.length > 0
        ? payments.map((p) => `${p.method}: ${formatCurrency(p.amount)}`).join(", ")
        : `Dinheiro: ${formatCurrency(cartTotal)}`;

    const changeDesc = changeAmount > 0 ? ` (Troco: ${formatCurrency(changeAmount)})` : "";

    const itemsDesc = cart
      .map((i) => {
        const unit = i.saleMode === "kg" ? "kg" : i.saleMode === "caixa" ? "cx" : "un";
        return `${i.quantity}${unit} ${i.name}`;
      })
      .join(", ");

    const fullDescription = `Venda: ${itemsDesc} | Pag: ${paymentDesc}${changeDesc} | Vend: ${sellerName}`;

    // prepara payload offline (usado também como fallback)
    const offlinePayload = {
      financial: {
        type: "receivable",
        description: fullDescription,
        total_amount: cartTotal,
        paid_amount: cartTotal,
        due_date: new Date().toISOString(),
        status: "paid",
        entity_name: customerName,
        reference: `PDV-${isOnline ? "ON" : "OFF"}-${Date.now()}`,
      },
      items: [...cart],
    };

    // OFFLINE direto
    if (!isOnline) {
      pushOfflineSale(offlinePayload);

      // baixa estoque local (pra UI bater com o que vendeu)
      setProducts((prev) =>
        prev.map((p) => {
          const sold = cart.filter((c) => c.id === p.id);
          if (sold.length === 0) return p;

          const totalDeduct = sold.reduce((acc, it) => acc + getStockNeeded(it), 0);
          return { ...p, stock: p.stock - totalDeduct };
        })
      );

      toast.info("Venda salva localmente. Sincronize quando a internet voltar.");
      finalizeUI(customer, cartTotal, changeAmount, cart);
      setProcessing(false);
      return;
    }

    // ONLINE
    try {
      // valida e baixa estoque no banco (com validação por item)
      for (const item of cart) {
        const qtyToDeduct = getStockNeeded(item);
        if (qtyToDeduct > item.stock) {
          throw new Error(`Estoque insuficiente para ${item.name}.`);
        }

        const newStock = item.stock - qtyToDeduct;
        const { error: stockError } = await supabase
          .from("products")
          .update({ stock: newStock })
          .eq("id", item.id);

        if (stockError) throw stockError;
      }

      // lança financeiro
      const { error: financialError } = await supabase.from("financial_entries").insert({
        type: "receivable",
        description: fullDescription,
        total_amount: cartTotal,
        paid_amount: cartTotal,
        due_date: new Date().toISOString(),
        status: "paid",
        entity_name: customerName,
        reference: `PDV-${Date.now()}`,
      });

      if (financialError) throw financialError;

      // baixa estoque local também (evita “voltar” no grid até reload)
      setProducts((prev) =>
        prev.map((p) => {
          const sold = cart.filter((c) => c.id === p.id);
          if (sold.length === 0) return p;
          const totalDeduct = sold.reduce((acc, it) => acc + getStockNeeded(it), 0);
          return { ...p, stock: p.stock - totalDeduct };
        })
      );

      finalizeUI(customer, cartTotal, changeAmount, cart);
      await loadData();
    } catch (error: any) {
      console.error(error);

      // FALLBACK: salva offline e finaliza (não perde venda)
      toast.error("Erro na venda online. Salvando offline...", { description: error?.message });

      setIsOnline(false);
      pushOfflineSale(offlinePayload);

      // baixa estoque local
      setProducts((prev) =>
        prev.map((p) => {
          const sold = cart.filter((c) => c.id === p.id);
          if (sold.length === 0) return p;
          const totalDeduct = sold.reduce((acc, it) => acc + getStockNeeded(it), 0);
          return { ...p, stock: p.stock - totalDeduct };
        })
      );

      finalizeUI(customer, cartTotal, changeAmount, cart);
    } finally {
      setProcessing(false);
    }
  };

  // --------------------------
  // WhatsApp
  // --------------------------
  const handleSendWhatsApp = () => {
    if (lastSaleData && lastSaleData.customer?.phone) {
      const cleanPhone = lastSaleData.customer.phone.replace(/\D/g, "");
      const date = new Date().toLocaleString("pt-BR");

      let text = `*COMPROVANTE DE VENDA - DISTRIBUIDORA 2G*\n`;
      text += `📅 ${date}\n`;
      text += `👤 Cliente: ${lastSaleData.customer.name}\n\n`;
      text += `*ITENS:*\n`;

      lastSaleData.items.forEach((item) => {
        const totalItem = getItemEffectivePrice(item) * item.quantity;
        const unit = item.saleMode === "kg" ? "kg" : item.saleMode === "caixa" ? "cx" : "un";
        text += `▪ ${item.quantity}${unit} x ${item.name} - ${formatCurrency(totalItem)}\n`;
      });

      text += `\n*TOTAL: ${formatCurrency(lastSaleData.total)}*\n`;

      if (lastSaleData.change > 0) text += `Troco: ${formatCurrency(lastSaleData.change)}\n`;

      text += `\nObrigado pela preferência!`;

      const message = encodeURIComponent(text);
      window.open(`https://wa.me/55${cleanPhone}?text=${message}`, "_blank");
    } else {
      toast.error("Cliente sem telefone.");
    }
  };

  // --------------------------
  // Produtos filtrados
  // --------------------------
  const filteredProducts = useMemo(() => {
    if (!debouncedSearch) return products;

    return products.filter((p) => {
      const name = (p.name || "").toLowerCase();
      const sku = (p.sku || "").toLowerCase();
      return name.includes(debouncedSearch) || sku.includes(debouncedSearch);
    });
  }, [products, debouncedSearch]);

  // --------------------------
  // Render
  // --------------------------
  return (
    <div className="space-y-6 h-[calc(100vh-100px)] flex flex-col overflow-y-auto pb-10">
      {/* Header com Status Offline/Online */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <ShoppingCart className="h-6 w-6 text-primary" />
          </div>

          <div>
            <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
              PDV
              {!showInfo && (
                <Button variant="ghost" size="icon" onClick={handleShowInfo}>
                  <Info className="h-4 w-4" />
                </Button>
              )}
            </h1>

            <div className="flex items-center gap-2">
              {isOnline ? (
                <Badge
                  variant="outline"
                  className="text-emerald-600 bg-emerald-50 border-emerald-200"
                >
                  <Wifi className="h-3 w-3 mr-1" /> Online
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <WifiOff className="h-3 w-3 mr-1" /> Offline
                </Badge>
              )}

              {offlineSalesCount > 0 && isOnline && (
                <Button
                  size="sm"
                  onClick={handleSyncOfflineSales}
                  disabled={processing}
                  className="h-6 text-xs bg-blue-600 hover:bg-blue-700 animate-pulse"
                >
                  <RefreshCw className={`h-3 w-3 mr-1 ${processing ? "animate-spin" : ""}`} />
                  Sincronizar ({offlineSalesCount})
                </Button>
              )}

              {offlineSalesCount > 0 && !isOnline && (
                <Badge variant="secondary" className="text-xs">
                  {offlineSalesCount} pendentes
                </Badge>
              )}

              <Button variant="outline" size="sm" className="h-6 text-xs" onClick={loadData} disabled={processing}>
                <RefreshCw className={`h-3 w-3 mr-1 ${loading ? "animate-spin" : ""}`} />
                Recarregar
              </Button>
            </div>
          </div>
        </div>
      </div>

      {showInfo && (
        <Alert className="bg-blue-50/50 border-blue-200 text-blue-800 relative pr-10 shadow-sm mb-2 mx-1 animate-in fade-in slide-in-from-top-2">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertTitle className="text-blue-700 font-semibold">Guia do PDV</AlertTitle>
          <AlertDescription className="text-blue-700/80 text-sm mt-1">
            <ul className="list-disc list-inside space-y-1">
              <li>
                <strong>Modo Offline:</strong> salva vendas no navegador se a internet cair.
              </li>
              <li>
                <strong>Pagamento Múltiplo:</strong> adicione várias formas de pagamento.
              </li>
              <li>
                <strong>Troco Automático:</strong> se pagar a mais, mostra o troco.
              </li>
              <li>
                <strong>Produtos KG:</strong> use valores como 0.350 (350g).
              </li>
              <li>
                <strong>Venda por Caixa:</strong> valida estoque usando (qtd × itens/caixa).
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

      <div className="grid gap-6 lg:grid-cols-3 flex-1 min-h-0">
        {/* PRODUTOS */}
        <div className="lg:col-span-2 flex flex-col gap-4 h-full min-h-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar produto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-12 text-lg"
              autoFocus
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 overflow-y-auto pr-2 pb-20 content-start">
            {loading ? (
              <div className="col-span-full text-center py-10 text-muted-foreground">
                Carregando produtos...
              </div>
            ) : (
              filteredProducts.map((product) => (
                <Card
                  key={product.id}
                  className={`cursor-pointer transition-all hover:shadow-md hover:border-primary/50 group ${
                    product.stock <= 0 ? "opacity-60 grayscale bg-muted" : ""
                  }`}
                  onClick={() => handleAddToCart(product)}
                >
                  <CardContent className="p-4 flex flex-col justify-between h-full">
                    <div>
                      <div className="flex justify-between items-start gap-2 mb-2">
                        <Badge
                          variant={product.stock <= 5 ? "destructive" : "secondary"}
                          className="text-[10px] h-5"
                        >
                          {product.stock.toFixed(product.sellsByKg ? 3 : 0)}{" "}
                          {product.sellsByKg ? "kg" : "un"}
                        </Badge>
                        {product.sellsByBox && (
                          <Badge variant="outline" className="text-[10px] h-5">
                            Cx
                          </Badge>
                        )}
                      </div>

                      <h3 className="font-medium text-sm line-clamp-2 mb-1 group-hover:text-primary transition-colors">
                        {product.name}
                      </h3>
                    </div>

                    <div className="mt-3">
                      <p className="text-lg font-bold text-emerald-600">
                        {formatCurrency(product.salePrice)}
                        {product.sellsByKg && (
                          <span className="text-xs font-normal text-muted-foreground">/kg</span>
                        )}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}

            {!loading && filteredProducts.length === 0 && (
              <div className="col-span-full text-center py-10 text-muted-foreground">
                {products.length === 0 ? "Nenhum produto carregado." : "Nenhum produto encontrado na busca."}
              </div>
            )}
          </div>
        </div>

        {/* CARRINHO */}
        <Card className="flex flex-col h-full border-l shadow-xl lg:rounded-none lg:border-y-0 lg:border-r-0 min-h-0">
          <CardHeader className="pb-3 border-b bg-muted/30">
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" /> Carrinho
              </span>
              {cart.length > 0 && <Badge variant="secondary">{cart.length}</Badge>}
            </CardTitle>
          </CardHeader>

          <CardContent className="flex-1 overflow-y-auto p-0 bg-background/50 min-h-[150px]">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground/50 gap-2">
                <ShoppingCart className="h-12 w-12" />
                <p>Vazio</p>
              </div>
            ) : (
              <div className="divide-y">
                {cart.map((item) => {
                  const effectivePrice = getItemEffectivePrice(item);
                  const step = item.saleMode === "kg" ? 0.001 : 1;
                  const dec = item.saleMode === "kg" ? 3 : 0;

                  return (
                    <div key={`${item.id}-${item.saleMode}`} className="p-3 hover:bg-muted/50">
                      <div className="flex justify-between gap-2 mb-2">
                        <span className="font-medium text-sm line-clamp-1">{item.name}</span>
                        <span className="font-bold text-sm">
                          {formatCurrency(effectivePrice * item.quantity)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => {
                              const min = item.saleMode === "kg" ? 0.001 : 1;
                              const next = Number((item.quantity - (item.saleMode === "kg" ? 0.1 : 1)).toFixed(3));
                              if (next < min) removeFromCart(item.id, item.saleMode);
                              else updateQuantity(item.id, item.saleMode, next);
                            }}
                          >
                            <Minus className="h-4 w-4" />
                          </Button>

                          <Input
                            type="number"
                            className="h-8 w-20 text-center p-0 text-xs font-bold bg-white border-none shadow-sm focus-visible:ring-0"
                            value={Number(item.quantity.toFixed(dec))}
                            step={step}
                            min={item.saleMode === "kg" ? "0.001" : "1"}
                            onChange={(e) => updateQuantity(item.id, item.saleMode, parseBRNumber(e.target.value))}
                          />

                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => {
                              const next = Number((item.quantity + (item.saleMode === "kg" ? 0.1 : 1)).toFixed(3));
                              updateQuantity(item.id, item.saleMode, next);
                            }}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="flex gap-1 items-center">
                          {item.sellsByKg && (
                            <Badge
                              variant={item.saleMode === "kg" ? "default" : "outline"}
                              className="cursor-pointer h-6 px-2"
                              onClick={() => updateSaleMode(item.id, item.saleMode, "kg")}
                            >
                              KG
                            </Badge>
                          )}

                          {item.sellsByBox && (
                            <Badge
                              variant={item.saleMode === "caixa" ? "default" : "outline"}
                              className="cursor-pointer h-6 px-2"
                              onClick={() => updateSaleMode(item.id, item.saleMode, "caixa")}
                            >
                              Cx
                            </Badge>
                          )}

                          <Badge
                            variant={item.saleMode === "unidade" ? "default" : "outline"}
                            className="cursor-pointer h-6 px-2"
                            onClick={() => updateSaleMode(item.id, item.saleMode, "unidade")}
                          >
                            Un
                          </Badge>

                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive ml-1"
                            onClick={() => removeFromCart(item.id, item.saleMode)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {item.saleMode === "caixa" && item.qtyPerBox && (
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Caixa com <strong>{item.qtyPerBox}</strong> unidades (desconta do estoque:{" "}
                          <strong>{(item.quantity * item.qtyPerBox).toFixed(0)}</strong>)
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>

          {/* PAGAMENTO */}
          <div className="p-4 bg-background border-t space-y-4 shadow-inner">
            <div className="grid grid-cols-2 gap-2">
              <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                <SelectTrigger className="h-9 text-xs">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <User className="h-3 w-3" />
                    <SelectValue placeholder="Cliente" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="padrao">Cliente Padrão</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedSellerId} onValueChange={setSelectedSellerId}>
                <SelectTrigger className="h-9 text-xs">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <UserCheck className="h-3 w-3" />
                    <SelectValue placeholder="Vendedor" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="padrao">Vendedor Padrão</SelectItem>
                  {sellers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {payments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2 p-2 bg-emerald-50/50 border border-emerald-100 rounded-lg">
                {payments.map((p, i) => (
                  <Badge
                    key={i}
                    variant="secondary"
                    className="pr-1 gap-1 border-emerald-200 bg-white shadow-sm text-xs py-1"
                  >
                    {p.method}:{" "}
                    <span className="font-mono text-emerald-700">{formatCurrency(p.amount)}</span>
                    <X
                      className="h-3 w-3 cursor-pointer hover:text-destructive ml-1"
                      onClick={() => removePayment(i)}
                    />
                  </Badge>
                ))}
              </div>
            )}

            <div className="space-y-3 p-3 bg-muted/20 rounded-lg border">
              <div className="flex flex-col space-y-1">
                <span className="text-[10px] text-muted-foreground uppercase font-bold">
                  Forma de Pagamento
                </span>
                <Select value={currentMethod} onValueChange={setCurrentMethod}>
                  <SelectTrigger className="h-10 bg-background">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentMethods.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2 items-end">
                <div className="relative flex-1">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold mb-1 block">
                    Valor Recebido
                  </span>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 text-lg font-bold">
                      R$
                    </span>
                    <Input
                      type="number"
                      className="pl-14 h-14 text-2xl font-bold text-black bg-white border-slate-300 shadow-sm"
                      placeholder="0,00"
                      value={currentAmount}
                      onChange={(e) => setCurrentAmount(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddPayment();
                      }}
                    />
                  </div>
                </div>

                <div className="flex gap-1 h-14 items-end">
                  {remainingAmount > 0 && (
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-14 w-14 border-slate-300"
                      onClick={handleFillRemaining}
                    >
                      <Calculator className="h-6 w-6 text-slate-600" />
                    </Button>
                  )}
                  <Button
                    size="icon"
                    onClick={handleAddPayment}
                    disabled={!currentMethod || !currentAmount}
                    className="bg-primary h-14 w-14 shadow-sm"
                  >
                    <Plus className="h-8 w-8" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-1 px-1">
              <div className="flex justify-between text-xl font-bold">
                <span>Total</span>
                <span>{formatCurrency(cartTotal)}</span>
              </div>

              {balance > 0.01 ? (
                <div className="flex justify-between text-lg text-destructive font-bold pt-1 border-t mt-1">
                  <span>Falta</span>
                  <span>{formatCurrency(balance)}</span>
                </div>
              ) : balance < -0.01 ? (
                <div className="flex justify-between text-2xl text-blue-600 font-bold pt-1 border-t mt-1 animate-pulse">
                  <span>TROCO</span>
                  <span>{formatCurrency(changeAmount)}</span>
                </div>
              ) : (
                <div className="flex justify-between text-base text-muted-foreground pt-1 border-t mt-1">
                  <span>Quitado</span>
                  <CheckCircle className="h-5 w-5 text-emerald-500" />
                </div>
              )}
            </div>

            <Button
              className={`w-full h-14 text-xl font-bold shadow-md ${
                balance <= 0.01 ? "bg-emerald-600 hover:bg-emerald-700" : ""
              }`}
              size="lg"
              disabled={cart.length === 0 || balance > 0.01 || processing}
              onClick={handleFinalizeSale}
            >
              {processing
                ? "Processando..."
                : balance <= 0.01
                ? "FINALIZAR VENDA"
                : "AGUARDANDO PAGAMENTO"}
            </Button>
          </div>
        </Card>
      </div>

      {/* MODAL SUCESSO */}
      <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
        <DialogContent className="sm:max-w-sm text-center">
          <DialogHeader>
            <DialogTitle className="flex flex-col items-center gap-2 text-emerald-600">
              <CheckCircle className="h-12 w-12" />
              Venda Realizada!
            </DialogTitle>
            <DialogDescription className="text-lg font-medium text-foreground pt-2">
              Venda: {formatCurrency(lastSaleData?.total || 0)}
            </DialogDescription>

            {(lastSaleData?.change || 0) > 0 && (
              <div className="text-xl font-bold text-blue-600 mt-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
                Troco: {formatCurrency(lastSaleData?.change || 0)}
              </div>
            )}
          </DialogHeader>

          <div className="flex flex-col gap-3 mt-4">
            {lastSaleData?.customer?.phone ? (
              <Button className="w-full bg-green-600 hover:bg-green-700" onClick={handleSendWhatsApp}>
                <Send className="h-4 w-4 mr-2" /> Enviar no WhatsApp
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                Cliente sem telefone cadastrado para WhatsApp.
              </p>
            )}

            <Button variant="outline" className="w-full" onClick={() => setShowSuccessModal(false)}>
              Nova Venda
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
