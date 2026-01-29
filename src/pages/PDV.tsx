import { useState } from "react";
import { ShoppingCart, Plus, Minus, Trash2, Search, AlertCircle, CheckCircle } from "lucide-react";
import { useStore } from "@/store/useStore";
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

const paymentMethods = ["Pix", "Cartão", "Boleto", "Dinheiro"];

export default function PDV() {
  const { products, cart, addToCart, removeFromCart, updateCartQuantity, clearCart, processSale } = useStore();
  const [search, setSearch] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase())
  );

  const cartTotal = cart.reduce((sum, item) => sum + item.product.salePrice * item.quantity, 0);

  const formatCurrency = (value: number) =>
    value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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

    const sale = processSale(paymentMethod);
    if (sale) {
      toast.success("Venda finalizada!", {
        description: `Total: ${formatCurrency(sale.total)} | ${paymentMethod}`,
        icon: <CheckCircle className="h-5 w-5 text-emerald-500" />,
      });
      setPaymentMethod("");
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

            <div className="border-t border-border pt-4 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Total</span>
                <span className="text-2xl font-bold text-primary">{formatCurrency(cartTotal)}</span>
              </div>

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
    </div>
  );
}
