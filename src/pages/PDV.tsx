import { useState } from "react";
import { ShoppingCart, Plus, Minus, Trash2, Search, CheckCircle, MessageCircle } from "lucide-react";
import { useStore, customers, sellers, Sale } from "@/store/useStore";
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

const paymentMethods = ["Pix", "Cartão", "Boleto", "Dinheiro"];

const formatCurrency = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const generateWhatsAppReceipt = (sale: Sale): string => {
  const date = new Date(sale.date);
  const formattedDate = date.toLocaleDateString("pt-BR");
  const formattedTime = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  let message = `🧾 *COMPROVANTE DE VENDA*\n`;
  message += `━━━━━━━━━━━━━━━━━━\n`;
  message += `📅 ${formattedDate} às ${formattedTime}\n`;
  message += `🆔 Pedido: #${sale.id.slice(-6)}\n`;
  if (sale.customer && sale.customer.name !== "Cliente Avulso") {
    message += `👤 Cliente: ${sale.customer.name}\n`;
  }
  if (sale.seller) {
    message += `🧑‍💼 Vendedor: ${sale.seller.name}\n`;
  }
  message += `━━━━━━━━━━━━━━━━━━\n\n`;
  message += `📦 *ITENS*\n`;

  sale.items.forEach((item) => {
    message += `• ${item.product.name}\n`;
    message += `  ${item.quantity}x ${formatCurrency(item.product.salePrice)} = ${formatCurrency(item.product.salePrice * item.quantity)}\n`;
  });

  message += `\n━━━━━━━━━━━━━━━━━━\n`;
  message += `💳 Pagamento: *${sale.paymentMethod}*\n`;
  message += `💰 *TOTAL: ${formatCurrency(sale.total)}*\n`;
  message += `━━━━━━━━━━━━━━━━━━\n\n`;
  message += `Obrigado pela preferência! 🙏`;

  return encodeURIComponent(message);
};

export default function PDV() {
  const { products, cart, addToCart, removeFromCart, updateCartQuantity, clearCart, processSale } = useStore();
  const [search, setSearch] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [sellerId, setSellerId] = useState("");
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastSale, setLastSale] = useState<Sale | null>(null);

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase())
  );

  const cartTotal = cart.reduce((sum, item) => sum + item.product.salePrice * item.quantity, 0);

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

  const handleFinalizeSale = () => {
    if (cart.length === 0) {
      toast.error("Carrinho vazio!");
      return;
    }
    if (!paymentMethod) {
      toast.error("Selecione a forma de pagamento!");
      return;
    }

    const customer = customers.find((c) => c.id === customerId) || null;
    const seller = sellers.find((s) => s.id === sellerId) || null;

    const sale = processSale(paymentMethod, customer, seller);
    if (sale) {
      setLastSale(sale);
      setShowSuccessModal(true);
      setPaymentMethod("");
      setCustomerId("");
      setSellerId("");
    }
  };

  const handleSendWhatsApp = () => {
    if (lastSale) {
      const phone = lastSale.customer?.phone || "";
      const message = generateWhatsAppReceipt(lastSale);
      window.open(`https://wa.me/${phone}?text=${message}`, "_blank");
    }
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
              <div className="space-y-3 max-h-[300px] overflow-auto">
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

              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue placeholder="Forma de pagamento" />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods.map((method) => (
                    <SelectItem key={method} value={method}>
                      {method}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex justify-between items-center pt-2">
                <span className="text-muted-foreground">Total</span>
                <span className="text-2xl font-bold text-primary">{formatCurrency(cartTotal)}</span>
              </div>

              <Button
                className="w-full"
                size="lg"
                onClick={handleFinalizeSale}
                disabled={cart.length === 0 || !paymentMethod}
              >
                Finalizar Venda
              </Button>

              {cart.length > 0 && (
                <Button variant="outline" className="w-full" onClick={clearCart}>
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
                  <p><strong>Pagamento:</strong> {lastSale.paymentMethod}</p>
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
