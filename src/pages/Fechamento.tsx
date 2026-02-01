import { useState, useMemo } from "react";
import { Calculator, DollarSign, CreditCard, Smartphone, AlertTriangle, CheckCircle2, Banknote } from "lucide-react";
import { useStore } from "@/store/useStore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { format, isToday, startOfDay, endOfDay, isWithinInterval } from "date-fns";
import { ptBR } from "date-fns/locale";

const formatCurrency = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function Fechamento() {
  const { sales, expenses } = useStore();
  const [physicalCash, setPhysicalCash] = useState<string>("");
  const [isReconciled, setIsReconciled] = useState(false);

  // Filter today's sales
  const todaySales = useMemo(() => {
    return sales.filter((sale) => isToday(new Date(sale.date)));
  }, [sales]);

  // Filter today's expenses
  const todayExpenses = useMemo(() => {
    return expenses.filter((expense) => isToday(new Date(expense.date)));
  }, [expenses]);

  // Calculate totals by payment method
  const paymentTotals = useMemo(() => {
    return todaySales.reduce(
      (acc, sale) => {
        const method = sale.paymentMethod;
        acc[method] = (acc[method] || 0) + sale.total;
        return acc;
      },
      {} as Record<string, number>
    );
  }, [todaySales]);

  const totalPix = paymentTotals["Pix"] || 0;
  const totalDinheiro = paymentTotals["Dinheiro"] || 0;
  const totalCartao = paymentTotals["Cartão"] || 0;
  const totalBoleto = paymentTotals["Boleto"] || 0;

  const totalSales = todaySales.reduce((sum, sale) => sum + sale.total, 0);
  const totalProfit = todaySales.reduce((sum, sale) => sum + sale.profit, 0);
  const totalExpensesValue = todayExpenses.reduce((sum, exp) => sum + exp.value, 0);
  const netProfit = totalProfit - totalExpensesValue;

  // Cash drawer reconciliation
  const physicalCashValue = parseFloat(physicalCash) || 0;
  const cashDifference = physicalCashValue - totalDinheiro;
  const hasDifference = physicalCash !== "" && Math.abs(cashDifference) > 0.01;

  const handleReconcile = () => {
    setIsReconciled(true);
  };

  const today = format(new Date(), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Calculator className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Fechamento de Caixa</h1>
          <p className="text-sm text-muted-foreground capitalize">{today}</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-emerald-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Smartphone className="h-4 w-4" />
              Total em Pix
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">{formatCurrency(totalPix)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {todaySales.filter((s) => s.paymentMethod === "Pix").length} transações
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Banknote className="h-4 w-4" />
              Total em Dinheiro
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(totalDinheiro)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {todaySales.filter((s) => s.paymentMethod === "Dinheiro").length} transações
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Total em Cartão
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">{formatCurrency(totalCartao)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {todaySales.filter((s) => s.paymentMethod === "Cartão").length} transações
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-orange-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Total em Boleto
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-orange-600">{formatCurrency(totalBoleto)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {todaySales.filter((s) => s.paymentMethod === "Boleto").length} transações
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Cash Drawer Reconciliation */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5" />
              Conferência de Caixa
            </CardTitle>
            <CardDescription>
              Digite o valor em dinheiro físico para conferir com o sistema
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="physical-cash">Valor em Caixa (Dinheiro Físico)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  R$
                </span>
                <Input
                  id="physical-cash"
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  value={physicalCash}
                  onChange={(e) => {
                    setPhysicalCash(e.target.value);
                    setIsReconciled(false);
                  }}
                  className="pl-10 text-lg"
                />
              </div>
            </div>

            <div className="p-4 rounded-lg bg-muted/50 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Valor esperado (sistema)</span>
                <span className="font-mono font-medium">{formatCurrency(totalDinheiro)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Valor informado</span>
                <span className="font-mono font-medium">{formatCurrency(physicalCashValue)}</span>
              </div>
              <Separator />
              <div className="flex justify-between items-center">
                <span className="font-medium">Diferença</span>
                <span
                  className={`font-mono font-bold ${
                    hasDifference
                      ? cashDifference > 0
                        ? "text-emerald-600"
                        : "text-destructive"
                      : "text-muted-foreground"
                  }`}
                >
                  {cashDifference > 0 ? "+" : ""}
                  {formatCurrency(cashDifference)}
                </span>
              </div>
            </div>

            {physicalCash !== "" && (
              <>
                {hasDifference ? (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Diferença Detectada</AlertTitle>
                    <AlertDescription>
                      {cashDifference > 0
                        ? `Há ${formatCurrency(Math.abs(cashDifference))} a mais no caixa.`
                        : `Faltam ${formatCurrency(Math.abs(cashDifference))} no caixa.`}
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert className="border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <AlertTitle className="text-emerald-600">Caixa Conferido</AlertTitle>
                    <AlertDescription className="text-emerald-700 dark:text-emerald-400">
                      O valor em caixa está correto!
                    </AlertDescription>
                  </Alert>
                )}
              </>
            )}

            <Button
              className="w-full"
              onClick={handleReconcile}
              disabled={physicalCash === ""}
            >
              Confirmar Conferência
            </Button>
          </CardContent>
        </Card>

        {/* Daily Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Resumo do Dia
            </CardTitle>
            <CardDescription>Visão geral das movimentações de hoje</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                <span className="text-muted-foreground">Total de Vendas</span>
                <div className="text-right">
                  <p className="font-mono font-bold text-lg">{formatCurrency(totalSales)}</p>
                  <p className="text-xs text-muted-foreground">{todaySales.length} vendas</p>
                </div>
              </div>

              <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                <span className="text-muted-foreground">Lucro Bruto</span>
                <span className="font-mono font-bold text-emerald-600">
                  {formatCurrency(totalProfit)}
                </span>
              </div>

              <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                <span className="text-muted-foreground">Despesas do Dia</span>
                <span className="font-mono font-bold text-destructive">
                  -{formatCurrency(totalExpensesValue)}
                </span>
              </div>

              <Separator />

              <div className="flex justify-between items-center p-4 rounded-lg bg-primary/10">
                <span className="font-semibold">Lucro Líquido</span>
                <span
                  className={`font-mono font-bold text-xl ${
                    netProfit >= 0 ? "text-emerald-600" : "text-destructive"
                  }`}
                >
                  {formatCurrency(netProfit)}
                </span>
              </div>
            </div>

            {/* Payment Breakdown */}
            <div className="pt-4">
              <h4 className="text-sm font-medium text-muted-foreground mb-3">
                Distribuição por Forma de Pagamento
              </h4>
              <div className="space-y-2">
                {Object.entries(paymentTotals).map(([method, amount]) => {
                  const percentage = totalSales > 0 ? (amount / totalSales) * 100 : 0;
                  return (
                    <div key={method} className="flex items-center gap-3">
                      <Badge variant="outline" className="w-24 justify-center">
                        {method}
                      </Badge>
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <span className="font-mono text-sm w-24 text-right">
                        {formatCurrency(amount)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status Badge */}
      {isReconciled && (
        <Card className="border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20">
          <CardContent className="py-4">
            <div className="flex items-center justify-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <span className="font-medium text-emerald-700 dark:text-emerald-400">
                Fechamento conferido em {format(new Date(), "HH:mm", { locale: ptBR })}
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
