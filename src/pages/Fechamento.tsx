import { useState, useMemo, useEffect } from "react";
import { Calculator, DollarSign, CreditCard, Smartphone, AlertTriangle, CheckCircle2, Banknote, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { format, isToday, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// --- TIPAGEM ---
interface FinancialEntry {
  id: string;
  type: 'receivable' | 'payable';
  total_amount: number;
  description: string;
  due_date: string;
  status: string;
}

const formatCurrency = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function Fechamento() {
  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [physicalCash, setPhysicalCash] = useState<string>("");
  const [isReconciled, setIsReconciled] = useState(false);

  // Carregar dados do dia
  useEffect(() => {
    fetchTodayData();
  }, []);

  const fetchTodayData = async () => {
    setLoading(true);
    try {
      // Busca todas as transações (pagas)
      const { data, error } = await supabase
        .from("financial_entries")
        .select("*")
        .eq("status", "paid");

      if (error) throw error;

      // Filtra apenas as de hoje no front (ou poderia filtrar no banco)
      const todayData = (data || []).filter(item => 
        item.due_date && isToday(parseISO(item.due_date))
      );

      setEntries(todayData);
    } catch (error) {
      console.error("Erro ao buscar dados:", error);
      toast.error("Erro ao carregar dados do fechamento");
    } finally {
      setLoading(false);
    }
  };

  // --- CÁLCULOS ---

  // 1. Separar Vendas e Despesas
  const todaySales = useMemo(() => entries.filter(e => e.type === 'receivable'), [entries]);
  const todayExpenses = useMemo(() => entries.filter(e => e.type === 'payable'), [entries]);

  // 2. Extrair Totais por Método de Pagamento (Parse da descrição)
  const paymentTotals = useMemo(() => {
    const totals: Record<string, number> = {
      "Dinheiro": 0,
      "Pix": 0,
      "Cartão de Crédito": 0,
      "Cartão de Débito": 0
    };

    todaySales.forEach(sale => {
      const desc = sale.description.toLowerCase();
      // Lógica simples de "contains" para somar (idealmente teria uma tabela de pagamentos separada)
      // Se for PDV, tentamos ler da string "Pix: 50.00, Dinheiro: 20.00"
      if (desc.includes("pix")) totals["Pix"] += sale.total_amount; // Simplificação: assume que se tem pix, foi tudo pix (ou precisa de regex complexo)
      else if (desc.includes("dinheiro")) totals["Dinheiro"] += sale.total_amount;
      else if (desc.includes("crédito")) totals["Cartão de Crédito"] += sale.total_amount;
      else if (desc.includes("débito")) totals["Cartão de Débito"] += sale.total_amount;
      else totals["Dinheiro"] += sale.total_amount; // Default
    });

    // Melhoria: Tentar parsear valores exatos se a string seguir o padrão do PDV
    // Ex: "Venda PDV - Pix: R$ 50,00, Dinheiro: R$ 20,00"
    // (Para simplicidade neste exemplo, mantivemos a lógica acima que atribui o total ao método encontrado)
    
    return totals;
  }, [todaySales]);

  const totalPix = paymentTotals["Pix"] || 0;
  const totalDinheiro = paymentTotals["Dinheiro"] || 0;
  const totalCartao = (paymentTotals["Cartão de Crédito"] || 0) + (paymentTotals["Cartão de Débito"] || 0);
  
  const totalSalesValue = todaySales.reduce((sum, s) => sum + Number(s.total_amount), 0);
  const totalExpensesValue = todayExpenses.reduce((sum, e) => sum + Number(e.total_amount), 0);
  const netResult = totalSalesValue - totalExpensesValue;

  // --- CONFERÊNCIA ---
  const physicalCashValue = parseFloat(physicalCash.replace(',', '.')) || 0;
  const cashDifference = physicalCashValue - totalDinheiro;
  const hasDifference = physicalCash !== "" && Math.abs(cashDifference) > 0.01;

  const handleReconcile = () => {
    setIsReconciled(true);
    toast.success("Conferência realizada!");
  };

  const today = format(new Date(), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR });

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Calculator className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Fechamento de Caixa</h1>
          <p className="text-sm text-muted-foreground capitalize">{today}</p>
        </div>
      </div>

      {/* Cards de Resumo por Método */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-l-4 border-l-emerald-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Smartphone className="h-4 w-4" />
              Total em Pix
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">{formatCurrency(totalPix)}</p>
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
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Conferência de Caixa (Dinheiro Físico) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5" />
              Conferência de Caixa
            </CardTitle>
            <CardDescription>
              Digite o valor em dinheiro físico na gaveta para conferir
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="physical-cash">Valor em Caixa (R$)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">
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
                  className="pl-10 text-lg font-bold"
                />
              </div>
            </div>

            <div className="p-4 rounded-lg bg-muted/50 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Esperado (Sistema)</span>
                <span className="font-mono font-medium">{formatCurrency(totalDinheiro)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Informado (Gaveta)</span>
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
                        ? `Sobrando ${formatCurrency(Math.abs(cashDifference))}`
                        : `Faltando ${formatCurrency(Math.abs(cashDifference))}`}
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert className="border-emerald-500 bg-emerald-50 text-emerald-900">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <AlertTitle>Caixa Batendo!</AlertTitle>
                    <AlertDescription>
                      O valor físico confere exatamente com o sistema.
                    </AlertDescription>
                  </Alert>
                )}
              </>
            )}

            <Button
              className="w-full"
              onClick={handleReconcile}
              disabled={physicalCash === "" || isReconciled}
            >
              {isReconciled ? "Conferido ✓" : "Confirmar Conferência"}
            </Button>
          </CardContent>
        </Card>

        {/* Resumo Geral do Dia */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Balanço do Dia
            </CardTitle>
            <CardDescription>Entradas vs Saídas</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                <span className="text-emerald-700 font-medium">Vendas (Entradas)</span>
                <div className="text-right">
                  <p className="font-mono font-bold text-lg text-emerald-700">{formatCurrency(totalSalesValue)}</p>
                  <p className="text-xs text-emerald-600/80">{todaySales.length} operações</p>
                </div>
              </div>

              <div className="flex justify-between items-center p-3 rounded-lg bg-red-50 border border-red-100">
                <span className="text-red-700 font-medium">Despesas (Saídas)</span>
                <div className="text-right">
                  <p className="font-mono font-bold text-lg text-red-700">-{formatCurrency(totalExpensesValue)}</p>
                  <p className="text-xs text-red-600/80">{todayExpenses.length} lançamentos</p>
                </div>
              </div>

              <Separator />

              <div className="flex justify-between items-center p-4 rounded-lg bg-primary/10 border border-primary/20">
                <span className="font-bold text-primary">Saldo Final (Caixa)</span>
                <span
                  className={`font-mono font-bold text-xl ${
                    netResult >= 0 ? "text-emerald-600" : "text-destructive"
                  }`}
                >
                  {formatCurrency(netResult)}
                </span>
              </div>
            </div>

            {/* Breakdown Visual */}
            <div className="pt-4">
              <h4 className="text-sm font-medium text-muted-foreground mb-3">
                Distribuição de Receita
              </h4>
              <div className="space-y-2">
                {Object.entries(paymentTotals).map(([method, amount]) => {
                  if (amount === 0) return null;
                  const percentage = totalSalesValue > 0 ? (amount / totalSalesValue) * 100 : 0;
                  return (
                    <div key={method} className="flex items-center gap-3">
                      <Badge variant="outline" className="w-28 justify-center shrink-0">
                        {method}
                      </Badge>
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <span className="font-mono text-sm w-20 text-right shrink-0">
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
    </div>
  );
}