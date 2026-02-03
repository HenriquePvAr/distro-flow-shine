import { useState } from "react";
import { ShoppingCart, Plus, Minus, Trash2, Search, CheckCircle, MessageCircle, X } from "lucide-react";
import { useStore, customers, sellers, Sale, PaymentEntry } from "@/store/useStore";
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
import { generateWhatsAppReceipt, openWhatsApp } from "@/lib/whatsappReceipt";
import { Separator } from "@/components/ui/separator";

const paymentMethods = ["Pix", "Cartão", "Boleto", "Dinheiro"];

const formatCurrency = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function PDV() {
  const { products, cart, addToCart, removeFromCart, updateCartQuantity, clearCart, processSale } = useStore();
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [sellerId, setSellerId] = useState("");
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastSale, setLastSale] = useState<Sale | null>(null);

  // Split payment state
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [currentMethod, setCurrentMethod] = useState("");
  const [currentAmount, setCurrentAmount] = useState("");

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase())
  );

  const cartTotal = cart.reduce((sum, item) => sum + item.product.salePrice * item.quantity, 0);
  const paymentsTotal = payments.reduce((sum, p) => sum + p.amount, 0);
  const remainingAmount = cartTotal - paymentsTotal;

  const handleAddToCart = (product: typeof products[0]) => {
    if (product.stock === 0) {
      toast.error("Produto sem estoque!", { description: product.name });
      return;
    }
    const inCart = cart.find((item) => item.product.id === product.id);
    if (inCart && inCart.quantity >= product.stock) {
      toast.error("Estoque insuficiente!", { description: `Apenas ${product.stock} unidades disponíveis` });
      return;
    }
    addToCart(product, 1);
    toast.success("Adicionado ao carrinho", { description: product.name });
  };

  const handleAddPayment = () => {
    if (!currentMethod) {
      toast.error("Selecione uma forma de pagamento");
      return;
    }
    const amount = parseFloat(currentAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Digite um valor válido");
      return;
    }
    if (amount > remainingAmount + 0.01) {
      toast.error("Valor excede o restante da venda");
      return;
    }

    setPayments([...payments, { method: currentMethod, amount }]);
    setCurrentMethod("");
    setCurrentAmount("");
  };

  const handleRemovePayment = (index: number) => {
    setPayments(payments.filter((_, i) => i !== index));
  };

  const handleFillRemaining = () => {
    if (remainingAmount > 0 && currentMethod) {
      setCurrentAmount(remainingAmount.toFixed(2));
    }
  };

  const handleFinalizeSale = () => {
    if (cart.length === 0) {
      toast.error("Carrinho vazio!");
      return;
    }
    if (payments.length === 0) {
      toast.error("Adicione pelo menos uma forma de pagamento!");
      return;
    }
    if (Math.abs(remainingAmount) > 0.01) {
      toast.error("A soma dos pagamentos deve ser igual ao total da venda!");
      return;
    }

    const customer = customers.find((c) => c.id === customerId) || null;
    const seller = sellers.find((s) => s.id === sellerId) || null;

    const sale = processSale(payments, customer, seller);
    if (sale) {
      setLastSale(sale);
      setShowSuccessModal(true);
      setPayments([]);
      setCurrentMethod("");
      setCurrentAmount("");
      setCustomerId("");
      setSellerId("");
    }
  };

  const handleSendWhatsApp = () => {
    if (lastSale) {
      const phone = lastSale.customer?.phone || "";
      const message = generateWhatsAppReceipt(lastSale);
      openWhatsApp(phone, message);
    }
  };

  const resetPayments = () => {
    setPayments([]);
    setCurrentMethod("");
    setCurrentAmount("");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <ShoppingCart className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Terminal de Vendas</h1>
          <p className="text-sm text-muted-foreground">PDV - Ponto de Venda</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Products List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar produto por nome ou SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {filteredProducts.map((product) => (
              <Card
                key={product.id}
                className={`cursor-pointer transition-all hover:shadow-md hover:border-primary/50 ${
                  product.stock === 0 ? "opacity-50" : ""
                }`}
                onClick={() => handleAddToCart(product)}
              >
                <CardContent className="p-4">
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium truncate">{product.name}</h3>
                      <p className="text-xs text-muted-foreground font-mono">{product.sku}</p>
                    </div>
                    <Badge variant={product.stock < 5 ? "destructive" : "secondary"}>
                      {product.stock} un
                    </Badge>
                  </div>
                  <p className="text-lg font-bold text-primary mt-2">
                    {formatCurrency(product.salePrice)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Cart */}
        <Card className="h-fit sticky top-6">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Carrinho
              {cart.length > 0 && (
                <Badge variant="secondary" className="ml-auto">
                  {cart.reduce((sum, item) => sum + item.quantity, 0)} itens
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {cart.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Carrinho vazio</p>
            ) : (
              <div className="space-y-3 max-h-[200px] overflow-auto">
                {cart.map((item) => (
                  <div key={item.product.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{item.product.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(item.product.salePrice)} × {item.quantity}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() =>
                          item.quantity > 1
                            ? updateCartQuantity(item.product.id, item.quantity - 1)
                            : removeFromCart(item.product.id)
                        }
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-6 text-center text-sm font-medium">{item.quantity}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => {
                          if (item.quantity < item.product.stock) {
                            updateCartQuantity(item.product.id, item.quantity + 1);
                          }
                        }}
                        disabled={item.quantity >= item.product.stock}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => removeFromCart(item.product.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-border pt-4 space-y-3">
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar cliente" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={sellerId} onValueChange={setSellerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar vendedor" />
                </SelectTrigger>
                <SelectContent>
                  {sellers.map((seller) => (
                    <SelectItem key={seller.id} value={seller.id}>
                      {seller.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Separator />

              {/* Split Payment Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Formas de Pagamento</span>
                  {payments.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={resetPayments} className="h-7 text-xs">
                      Limpar
                    </Button>
                  )}
                </div>

                {/* Added Payments List */}
                {payments.length > 0 && (
                  <div className="space-y-2 max-h-[120px] overflow-auto">
                    {payments.map((payment, index) => (
                      <div key={index} className="flex items-center justify-between p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{payment.method}</Badge>
                          <span className="font-mono text-sm font-medium text-emerald-700 dark:text-emerald-400">
                            {formatCurrency(payment.amount)}
                          </span>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-destructive hover:text-destructive"
                          onClick={() => handleRemovePayment(index)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add Payment Form */}
                {cart.length > 0 && remainingAmount > 0.01 && (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Select value={currentMethod} onValueChange={setCurrentMethod}>
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Pagamento" />
                        </SelectTrigger>
                        <SelectContent>
                          {paymentMethods.map((method) => (
                            <SelectItem key={method} value={method}>
                              {method}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="relative flex-1">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                          R$
                        </span>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0,00"
                          value={currentAmount}
                          onChange={(e) => setCurrentAmount(e.target.value)}
                          className="pl-7 text-sm"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs"
                        onClick={handleFillRemaining}
                        disabled={!currentMethod}
                      >
                        Preencher Restante ({formatCurrency(remainingAmount)})
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={handleAddPayment}
                        disabled={!currentMethod || !currentAmount}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Adicionar
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              {/* Totals */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-mono">{formatCurrency(cartTotal)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Pago</span>
                  <span className="font-mono text-emerald-600">{formatCurrency(paymentsTotal)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Restante</span>
                  <span className={`text-xl font-bold ${remainingAmount > 0.01 ? "text-destructive" : "text-emerald-600"}`}>
                    {formatCurrency(Math.max(0, remainingAmount))}
                  </span>
                </div>
              </div>

              <Button
                className="w-full"
                size="lg"
                onClick={handleFinalizeSale}
                disabled={cart.length === 0 || payments.length === 0 || Math.abs(remainingAmount) > 0.01}
              >
                Finalizar Venda
              </Button>

              {cart.length > 0 && (
                <Button variant="outline" className="w-full" onClick={() => { clearCart(); resetPayments(); }}>
                  Limpar Carrinho
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Success Modal */}
      <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600">
              <CheckCircle className="h-6 w-6" />
              Venda Finalizada!
            </DialogTitle>
            <DialogDescription>
              {lastSale && (
                <div className="space-y-2 mt-4 text-left">
                  <p><strong>Pedido:</strong> #{lastSale.id.slice(-6)}</p>
                  {lastSale.customer && <p><strong>Cliente:</strong> {lastSale.customer.name}</p>}
                  {lastSale.seller && <p><strong>Vendedor:</strong> {lastSale.seller.name}</p>}
                  <div>
                    <strong>Pagamento:</strong>
                    <div className="mt-1 space-y-1">
                      {lastSale.payments.map((p, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <Badge variant="outline" className="text-xs">{p.method}</Badge>
                          <span className="font-mono">{formatCurrency(p.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <p className="text-lg font-bold text-primary">
                    Total: {formatCurrency(lastSale.total)}
                  </p>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col gap-2 sm:flex-col">
            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700"
              onClick={handleSendWhatsApp}
            >
              <MessageCircle className="h-4 w-4 mr-2" />
              Enviar Comprovante via WhatsApp
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setShowSuccessModal(false)}
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
