import { useState } from "react";
import { History, Search, Filter, MessageCircle } from "lucide-react";
import { useStore, Sale } from "@/store/useStore";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const formatCurrency = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString("pt-BR");
};

const formatTime = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};

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

export default function Historico() {
  const { sales } = useStore();
  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");

  const filteredSales = sales
    .filter((sale) => {
      const matchesSearch =
        sale.id.includes(search) ||
        sale.customer?.name.toLowerCase().includes(search.toLowerCase()) ||
        sale.seller?.name.toLowerCase().includes(search.toLowerCase());
      const matchesPayment = paymentFilter === "all" || sale.paymentMethod === paymentFilter;
      return matchesSearch && matchesPayment;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalRevenue = filteredSales.reduce((sum, sale) => sum + sale.total, 0);
  const totalProfit = filteredSales.reduce((sum, sale) => sum + sale.profit, 0);
  const totalSales = filteredSales.length;

  const handleSendWhatsApp = (sale: Sale) => {
    const phone = sale.customer?.phone || "";
    const message = generateWhatsAppReceipt(sale);
    window.open(`https://wa.me/${phone}?text=${message}`, "_blank");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <History className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Histórico de Vendas</h1>
          <p className="text-sm text-muted-foreground">Relatórios e movimentações</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de Vendas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalSales}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Faturamento</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-primary">{formatCurrency(totalRevenue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Lucro Bruto</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">{formatCurrency(totalProfit)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Margem Média</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : 0}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="p-4 border-b border-border">
          <div className="flex flex-wrap gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por ID, cliente ou vendedor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={paymentFilter} onValueChange={setPaymentFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Pagamento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="Pix">Pix</SelectItem>
                <SelectItem value="Cartão">Cartão</SelectItem>
                <SelectItem value="Boleto">Boleto</SelectItem>
                <SelectItem value="Dinheiro">Dinheiro</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Sales Table */}
        <div className="overflow-x-auto">
          {filteredSales.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              {sales.length === 0
                ? "Nenhuma venda registrada ainda. Faça sua primeira venda no PDV!"
                : "Nenhuma venda encontrada com os filtros aplicados."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Itens</TableHead>
                  <TableHead>Pagamento</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Lucro</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSales.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell className="font-mono text-sm">#{sale.id.slice(-6)}</TableCell>
                    <TableCell>
                      <div className="text-sm">{formatDate(sale.date)}</div>
                      <div className="text-xs text-muted-foreground">{formatTime(sale.date)}</div>
                    </TableCell>
                    <TableCell>{sale.customer?.name || "—"}</TableCell>
                    <TableCell>{sale.seller?.name || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {sale.items.reduce((sum, item) => sum + item.quantity, 0)} itens
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{sale.paymentMethod}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(sale.total)}
                    </TableCell>
                    <TableCell className="text-right text-emerald-600 font-medium">
                      {formatCurrency(sale.profit)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleSendWhatsApp(sale)}
                        title="Enviar comprovante via WhatsApp"
                      >
                        <MessageCircle className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}
