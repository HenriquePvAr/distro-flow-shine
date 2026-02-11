import { useState, useEffect } from "react";
import { 
  ShoppingCart, 
  Plus, 
  Minus, 
  Trash2, 
  Search, 
  CheckCircle, 
  MessageCircle, 
  X, 
  Box, 
  Info, 
  Calculator, 
  User, 
  UserCheck, 
  Send, 
  Wifi, 
  WifiOff, 
  RefreshCw 
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";

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
  saleMode: 'unidade' | 'caixa' | 'kg';
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
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function PDV() {
  // Estados de Dados
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Person[]>([]);
  const [sellers, setSellers] = useState<Person[]>([]);
  
  // Estados de Operação
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [showInfo, setShowInfo] = useState(true);
  
  // Status Conexão
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineSalesCount, setOfflineSalesCount] = useState(0);

  // Seleção
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("padrao");
  const [selectedSellerId, setSelectedSellerId] = useState<string>("padrao");

  // Pagamento
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [currentMethod, setCurrentMethod] = useState("Dinheiro");
  const [currentAmount, setCurrentAmount] = useState("");
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  
  // Totais Finais
  const [lastSaleData, setLastSaleData] = useState<{
    total: number;
    change: number;
    customer?: Person;
    items: CartItem[];
  } | null>(null);

  // Inicialização e Listeners de Rede
  useEffect(() => {
    loadData();
    checkOfflineSales();

    const handleOnline = () => { 
        setIsOnline(true); 
        toast.success("Conexão restabelecida! Você pode sincronizar agora."); 
    };
    const handleOffline = () => { 
        setIsOnline(false); 
        toast.warning("Você está offline. O sistema usará dados salvos."); 
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const isHidden = localStorage.getItem("hide_pdv_info");
    if (isHidden === "true") setShowInfo(false);

    return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
    };
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
    const saved = localStorage.getItem('offline_queue');
    if (saved) {
      setOfflineSalesCount(JSON.parse(saved).length);
    }
  };

  // --- CARREGAMENTO DE DADOS (COM CACHE) ---
  const loadData = async () => {
    setLoading(true);

    const loadFromCache = () => {
        const cachedProducts = localStorage.getItem('pdv_products_cache');
        const cachedCustomers = localStorage.getItem('pdv_customers_cache');
        const cachedSellers = localStorage.getItem('pdv_sellers_cache');

        if (cachedProducts) setProducts(JSON.parse(cachedProducts));
        if (cachedCustomers) setCustomers(JSON.parse(cachedCustomers));
        if (cachedSellers) setSellers(JSON.parse(cachedSellers));
        
        if (cachedProducts) {
            toast.info("Dados carregados da memória local (Modo Offline).");
        }
    };

    if (!navigator.onLine) {
        loadFromCache();
        setLoading(false);
        return;
    }

    try {
        const { data: productsData } = await supabase.from("products").select("*").order('name');
        const { data: customersData } = await supabase.from("customers").select("*").order('name');
        const { data: sellersData } = await supabase.from("sellers").select("*").order('name');

        if (productsData) {
            const mappedProducts = productsData.map((p: any) => ({
                id: p.id,
                name: p.name,
                sku: p.sku || "",
                salePrice: Number(p.sale_price ?? 0),
                stock: Number(p.stock ?? 0),
                sellsByBox: p.sells_by_box ?? false,
                qtyPerBox: p.qty_per_box,
                sellsByKg: p.sells_by_kg ?? false
            }));
            setProducts(mappedProducts);
            localStorage.setItem('pdv_products_cache', JSON.stringify(mappedProducts));
        }

        if (customersData) {
            setCustomers(customersData);
            localStorage.setItem('pdv_customers_cache', JSON.stringify(customersData));
        }

        if (sellersData) {
            setSellers(sellersData);
            localStorage.setItem('pdv_sellers_cache', JSON.stringify(sellersData));
        }

    } catch (error) {
        console.error("Erro ao buscar dados online:", error);
        loadFromCache();
    } finally {
        setLoading(false);
    }
  };

  // --- SINCRONIZAÇÃO ---
  const handleSyncOfflineSales = async () => {
    setProcessing(true);
    try {
        const saved = localStorage.getItem('offline_queue');
        if (!saved) {
            setProcessing(false);
            return;
        }

        const queue = JSON.parse(saved);
        
        for (const sale of queue) {
            const { error: finError } = await supabase.from("financial_entries").insert({
                ...sale.financial,
                id: undefined 
            });
            
            if (finError) throw finError;

            for (const item of sale.items) {
                const { data: currentProd } = await supabase.from("products").select("stock").eq("id", item.id).single();
                if (currentProd) {
                    let qty = item.quantity;
                    if (item.saleMode === 'caixa' && item.qtyPerBox) qty *= item.qtyPerBox;
                    await supabase.from("products").update({ stock: currentProd.stock - qty }).eq("id", item.id);
                }
            }
        }

        localStorage.removeItem('offline_queue');
        setOfflineSalesCount(0);
        toast.success("Vendas sincronizadas com sucesso!");
        loadData(); 

    } catch (error) {
        console.error(error);
        toast.error("Erro ao sincronizar. Verifique sua conexão.");
    } finally {
        setProcessing(false);
    }
  };

  // --- LÓGICA DE CARRINHO ---
  const getItemEffectivePrice = (item: CartItem) => {
    if (item.saleMode === 'caixa' && item.sellsByBox && item.qtyPerBox) {
      return item.salePrice * item.qtyPerBox; 
    }
    return item.salePrice;
  };

  const handleAddToCart = (product: Product) => {
    if (product.stock <= 0) {
      toast.error("Produto sem estoque disponível!");
      return;
    }

    setCart((prev) => {
      const existingIndex = prev.findIndex((item) => item.id === product.id && item.saleMode === (product.sellsByKg ? 'kg' : 'unidade'));
      
      if (existingIndex >= 0) {
        const currentQty = prev[existingIndex].quantity;
        if (currentQty + 1 > product.stock) {
          toast.error(`Estoque insuficiente! Disponível: ${product.stock}`);
          return prev;
        }
        const updatedCart = [...prev];
        updatedCart[existingIndex].quantity += 1;
        return updatedCart;
      }
      
      const initialMode = product.sellsByKg ? 'kg' : 'unidade';
      return [...prev, { ...product, quantity: 1, saleMode: initialMode }];
    });
  };

  const removeFromCart = (id: string, saleMode: string) => {
    setCart((prev) => prev.filter((item) => !(item.id === id && item.saleMode === saleMode)));
  };

  const updateQuantity = (id: string, saleMode: string, newQty: number) => {
    setCart((prev) => prev.map((item) => {
      if (item.id === id && item.saleMode === saleMode) {
        let stockNeeded = newQty;
        if (saleMode === 'caixa' && item.qtyPerBox) stockNeeded = newQty * item.qtyPerBox;
        
        if (stockNeeded > item.stock) {
          toast.error(`Estoque insuficiente! Máx: ${item.stock}`);
          return item; 
        }
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const updateSaleMode = (id: string, oldMode: string, newMode: 'unidade' | 'caixa' | 'kg') => {
    setCart((prev) => prev.map((item) => {
      if (item.id === id && item.saleMode === oldMode) {
        if (newMode === 'caixa' && item.qtyPerBox && item.qtyPerBox > item.stock) {
           toast.error("Não há estoque suficiente para uma caixa.");
           return item;
        }
        return { ...item, saleMode: newMode, quantity: 1 };
      }
      return item;
    }));
  };

  // --- CÁLCULOS E PAGAMENTO ---
  const cartTotal = cart.reduce((sum, item) => sum + getItemEffectivePrice(item) * item.quantity, 0);
  const paymentsTotal = payments.reduce((sum, p) => sum + p.amount, 0);
  const balance = cartTotal - paymentsTotal;
  const remainingAmount = balance > 0 ? balance : 0;
  const changeAmount = balance < 0 ? Math.abs(balance) : 0;

  const handleAddPayment = () => {
    if (!currentMethod) return toast.error("Selecione o método.");
    const amount = parseFloat(currentAmount.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) return toast.error("Valor inválido.");
    setPayments([...payments, { method: currentMethod, amount }]);
    setCurrentMethod("Dinheiro"); 
    setCurrentAmount("");
  };

  const handleFillRemaining = () => {
    if (remainingAmount > 0) setCurrentAmount(remainingAmount.toFixed(2));
  };

  const removePayment = (index: number) => {
    setPayments(payments.filter((_, i) => i !== index));
  };

  // --- FINALIZAÇÃO ---
  const handleFinalizeSale = async () => {
    if (cart.length === 0) return toast.error("Carrinho vazio.");
    if (balance > 0.05) return toast.error(`Falta receber ${formatCurrency(balance)}`);

    setProcessing(true);

    const customer = customers.find(c => c.id === selectedCustomerId);
    const seller = sellers.find(s => s.id === selectedSellerId);
    
    const customerName = customer ? customer.name : "Cliente Balcão";
    const sellerName = seller ? seller.name : "Venda Balcão";

    const paymentDesc = payments.map(p => `${p.method}: ${formatCurrency(p.amount)}`).join(", ");
    const changeDesc = changeAmount > 0 ? ` (Troco: ${formatCurrency(changeAmount)})` : "";
    const fullDescription = `Venda: ${cart.map(i => `${i.quantity}${i.saleMode === 'kg' ? 'kg' : 'un'} ${i.name}`).join(', ')} | Pag: ${paymentDesc}${changeDesc} | Vend: ${sellerName}`;

    // MODO OFFLINE
    if (!isOnline) {
        const offlineSale = {
            financial: {
                type: "receivable",
                description: fullDescription,
                total_amount: cartTotal, 
                paid_amount: cartTotal,
                due_date: new Date().toISOString(),
                status: "paid",
                entity_name: customerName,
                reference: `PDV-OFF-${Date.now()}`
            },
            items: [...cart]
        };

        const currentQueue = JSON.parse(localStorage.getItem('offline_queue') || '[]');
        currentQueue.push(offlineSale);
        localStorage.setItem('offline_queue', JSON.stringify(currentQueue));
        
        setOfflineSalesCount(currentQueue.length);
        toast.info("Venda salva localmente. Sincronize quando a internet voltar.");
        
        setProducts(prev => prev.map(p => {
            const cartItem = cart.find(c => c.id === p.id);
            if (cartItem) {
                let qty = cartItem.quantity;
                if(cartItem.saleMode === 'caixa' && cartItem.qtyPerBox) qty *= cartItem.qtyPerBox;
                return { ...p, stock: p.stock - qty };
            }
            return p;
        }));

        finalizeUI(customer);
        return;
    }

    // MODO ONLINE
    try {
      for (const item of cart) {
        let quantityToDeduct = item.quantity;
        if (item.saleMode === 'caixa' && item.qtyPerBox) quantityToDeduct *= item.qtyPerBox;
        
        if (quantityToDeduct > item.stock) {
            throw new Error(`Estoque insuficiente para ${item.name}.`);
        }

        const newStock = item.stock - quantityToDeduct;
        await supabase.from("products").update({ stock: newStock }).eq("id", item.id);
      }

      const { error: financialError } = await supabase
        .from("financial_entries")
        .insert({
          type: "receivable",
          description: fullDescription,
          total_amount: cartTotal, 
          paid_amount: cartTotal,
          due_date: new Date().toISOString(),
          status: "paid",
          entity_name: customerName, 
          reference: `PDV-${Date.now()}`
        });

      if (financialError) throw financialError;

      finalizeUI(customer);
      loadData(); 

    } catch (error: any) {
      console.error(error);
      toast.error("Erro na venda online. Tentando salvar offline...", { description: error.message });
      setIsOnline(false); 
    } finally {
      setProcessing(false);
    }
  };

  const finalizeUI = (customer: Person | undefined) => {
    setLastSaleData({
        total: cartTotal,
        change: changeAmount,
        customer: customer,
        items: [...cart]
      });
      setShowSuccessModal(true);
      setCart([]);
      setPayments([]);
      setCurrentAmount("");
      setProcessing(false);
  };

  // --- WHATSAPP ---
  const handleSendWhatsApp = () => {
    if (lastSaleData && lastSaleData.customer?.phone) {
        const cleanPhone = lastSaleData.customer.phone.replace(/\D/g, '');
        
        const date = new Date().toLocaleString('pt-BR');
        let text = `*COMPROVANTE DE VENDA - DISTRIBUIDORA 2G*\n`;
        text += `📅 ${date}\n`;
        text += `👤 Cliente: ${lastSaleData.customer.name}\n\n`;
        text += `*ITENS:*\n`;
        
        lastSaleData.items.forEach(item => {
            const totalItem = getItemEffectivePrice(item) * item.quantity;
            const unit = item.saleMode === 'kg' ? 'kg' : (item.saleMode === 'caixa' ? 'cx' : 'un');
            text += `▪ ${item.quantity}${unit} x ${item.name} - ${formatCurrency(totalItem)}\n`;
        });
        
        text += `\n*TOTAL: ${formatCurrency(lastSaleData.total)}*\n`;
        
        if (lastSaleData.change > 0) {
            text += `Troco: ${formatCurrency(lastSaleData.change)}\n`;
        }
        
        text += `\nObrigado pela preferência!`;
        const message = encodeURIComponent(text);

        window.open(`https://wa.me/55${cleanPhone}?text=${message}`, '_blank');
    } else {
        toast.error("Cliente sem telefone.");
    }
  };

  const filteredProducts = products.filter(
    (p) => p.name.toLowerCase().includes(search.toLowerCase()) || 
           p.sku.toLowerCase().includes(search.toLowerCase())
  );

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
                <Button variant="ghost" size="icon" onClick={handleShowInfo}><Info className="h-4 w-4" /></Button>
                )}
            </h1>
            <div className="flex items-center gap-2">
                {isOnline ? (
                    <Badge variant="outline" className="text-emerald-600 bg-emerald-50 border-emerald-200"><Wifi className="h-3 w-3 mr-1" /> Online</Badge>
                ) : (
                    <Badge variant="destructive"><WifiOff className="h-3 w-3 mr-1" /> Offline</Badge>
                )}
                {offlineSalesCount > 0 && isOnline && (
                    <Button size="sm" onClick={handleSyncOfflineSales} disabled={processing} className="h-6 text-xs bg-blue-600 hover:bg-blue-700 animate-pulse">
                        <RefreshCw className={`h-3 w-3 mr-1 ${processing ? 'animate-spin' : ''}`} /> 
                        Sincronizar ({offlineSalesCount})
                    </Button>
                )}
                {offlineSalesCount > 0 && !isOnline && (
                    <Badge variant="secondary" className="text-xs">{offlineSalesCount} pendentes</Badge>
                )}
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
              <li><strong>Modo Offline:</strong> O sistema salva as vendas no seu navegador se a internet cair. Sincronize quando voltar.</li>
              <li><strong>Pagamento Múltiplo:</strong> Você pode adicionar várias formas de pagamento para a mesma venda.</li>
              <li><strong>Troco Automático:</strong> Se o valor recebido for maior que o total, o troco é calculado e exibido.</li>
              <li><strong>Produtos KG:</strong> Digite o peso exato (ex: 0.500) no campo de quantidade.</li>
            </ul>
          </AlertDescription>
          <Button variant="ghost" size="icon" className="absolute top-2 right-2 text-blue-400 hover:text-blue-700" onClick={handleCloseInfo}>
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
            {filteredProducts.map((product) => (
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
                      <Badge variant={product.stock <= 5 ? "destructive" : "secondary"} className="text-[10px] h-5">
                        {product.stock.toFixed(product.sellsByKg ? 3 : 0)} {product.sellsByKg ? 'kg' : 'un'}
                      </Badge>
                      {product.sellsByBox && <Badge variant="outline" className="text-[10px] h-5">Cx</Badge>}
                    </div>
                    <h3 className="font-medium text-sm line-clamp-2 mb-1 group-hover:text-primary transition-colors">
                      {product.name}
                    </h3>
                  </div>
                  <div className="mt-3">
                    <p className="text-lg font-bold text-emerald-600">
                      {formatCurrency(product.salePrice)}
                      {product.sellsByKg && <span className="text-xs font-normal text-muted-foreground">/kg</span>}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
            
            {filteredProducts.length === 0 && !loading && (
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
              <span className="flex items-center gap-2"><ShoppingCart className="h-5 w-5" /> Carrinho</span>
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
                  return (
                    <div key={`${item.id}-${item.saleMode}`} className="p-3 hover:bg-muted/50">
                      <div className="flex justify-between gap-2 mb-2">
                        <span className="font-medium text-sm line-clamp-1">{item.name}</span>
                        <span className="font-bold text-sm">{formatCurrency(effectivePrice * item.quantity)}</span>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => item.quantity > (item.saleMode==='kg'?0.1:1) ? updateQuantity(item.id, item.saleMode, item.quantity - (item.saleMode==='kg'?0.1:1)) : removeFromCart(item.id, item.saleMode)}>
                                <Minus className="h-4 w-4" />
                            </Button>
                            <Input 
                                type="number" 
                                className="h-8 w-16 text-center p-0 text-xs font-bold bg-white border-none shadow-sm focus-visible:ring-0" 
                                value={item.quantity}
                                step={item.saleMode === 'kg' ? "0.001" : "1"}
                                onChange={(e) => updateQuantity(item.id, item.saleMode, parseFloat(e.target.value) || 0)}
                            />
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => updateQuantity(item.id, item.saleMode, item.quantity + (item.saleMode==='kg'?0.1:1))}>
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>

                        <div className="flex gap-1 items-center">
                            {item.sellsByKg && <Badge variant={item.saleMode === 'kg' ? 'default' : 'outline'} className="cursor-pointer h-6 px-2" onClick={() => updateSaleMode(item.id, item.saleMode, 'kg')}>KG</Badge>}
                            {item.sellsByBox && <Badge variant={item.saleMode === 'caixa' ? 'default' : 'outline'} className="cursor-pointer h-6 px-2" onClick={() => updateSaleMode(item.id, item.saleMode, 'caixa')}>Cx</Badge>}
                             <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive ml-1" onClick={() => removeFromCart(item.id, item.saleMode)}>
                                <Trash2 className="h-4 w-4" />
                             </Button>
                        </div>
                      </div>
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
                        {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
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
                        {sellers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>

            {payments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2 p-2 bg-emerald-50/50 border border-emerald-100 rounded-lg">
                {payments.map((p, i) => (
                  <Badge key={i} variant="secondary" className="pr-1 gap-1 border-emerald-200 bg-white shadow-sm text-xs py-1">
                    {p.method}: <span className="font-mono text-emerald-700">{formatCurrency(p.amount)}</span>
                    <X className="h-3 w-3 cursor-pointer hover:text-destructive ml-1" onClick={() => removePayment(i)} />
                  </Badge>
                ))}
              </div>
            )}

            <div className="space-y-3 p-3 bg-muted/20 rounded-lg border">
                <div className="flex flex-col space-y-1">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold">Forma de Pagamento</span>
                    <Select value={currentMethod} onValueChange={setCurrentMethod}>
                        <SelectTrigger className="h-10 bg-background">
                            <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                            {paymentMethods.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex gap-2 items-end">
                    <div className="relative flex-1">
                        <span className="text-[10px] text-muted-foreground uppercase font-bold mb-1 block">Valor Recebido</span>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 text-lg font-bold">R$</span>
                            <Input 
                                type="number" 
                                className="pl-14 h-14 text-2xl font-bold text-black bg-white border-slate-300 shadow-sm" 
                                placeholder="0,00" 
                                value={currentAmount}
                                onChange={e => setCurrentAmount(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleAddPayment(); }}
                            />
                        </div>
                    </div>

                    <div className="flex gap-1 h-14 items-end">
                        {remainingAmount > 0 && (
                            <Button size="icon" variant="outline" className="h-14 w-14 border-slate-300" onClick={handleFillRemaining}>
                                <Calculator className="h-6 w-6 text-slate-600" />
                            </Button>
                        )}
                        <Button size="icon" onClick={handleAddPayment} disabled={!currentMethod || !currentAmount} className="bg-primary h-14 w-14 shadow-sm">
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
              className={`w-full h-14 text-xl font-bold shadow-md ${balance <= 0.01 ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`}
              size="lg"
              disabled={cart.length === 0 || balance > 0.01 || processing}
              onClick={handleFinalizeSale}
            >
              {processing ? "Processando..." : (balance <= 0.01 ? "FINALIZAR VENDA" : "AGUARDANDO PAGAMENTO")}
            </Button>
          </div>
        </Card>
      </div>

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
                <p className="text-sm text-muted-foreground italic">Cliente sem telefone cadastrado para WhatsApp.</p>
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