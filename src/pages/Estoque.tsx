import { Package, AlertTriangle } from "lucide-react";
import { useStore } from "@/store/useStore";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default function Estoque() {
  const { products } = useStore();

  const formatCurrency = (value: number) =>
    value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const getMargin = (cost: number, sale: number) =>
    (((sale - cost) / cost) * 100).toFixed(1);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Package className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Gestão de Estoque</h1>
          <p className="text-sm text-muted-foreground">
            {products.length} produtos cadastrados
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="font-semibold">Produto</TableHead>
              <TableHead className="font-semibold">SKU</TableHead>
              <TableHead className="font-semibold">Categoria</TableHead>
              <TableHead className="font-semibold text-right">Custo</TableHead>
              <TableHead className="font-semibold text-right">Venda</TableHead>
              <TableHead className="font-semibold text-right">Margem</TableHead>
              <TableHead className="font-semibold text-center">Estoque</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product) => (
              <TableRow key={product.id} className="hover:bg-muted/30 transition-colors">
                <TableCell className="font-medium">{product.name}</TableCell>
                <TableCell className="text-muted-foreground font-mono text-sm">
                  {product.sku}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{product.category}</Badge>
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {formatCurrency(product.costPrice)}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrency(product.salePrice)}
                </TableCell>
                <TableCell className="text-right">
                  <span className="text-emerald-600 font-medium">
                    +{getMargin(product.costPrice, product.salePrice)}%
                  </span>
                </TableCell>
                <TableCell className="text-center">
                  {product.stock < 5 ? (
                    <div className="flex items-center justify-center gap-1">
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                      <span className="text-destructive font-bold">{product.stock}</span>
                    </div>
                  ) : (
                    <span className="font-medium">{product.stock}</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
