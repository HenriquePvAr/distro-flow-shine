"use client";

import { useMemo, useEffect, useState } from "react";
import {
  Calculator,
  CreditCard,
  Smartphone,
  AlertTriangle,
  CheckCircle2,
  Banknote,
  Loader2,
  Calendar as CalendarIcon,
  Share2,
  PackageOpen,
  User,
  FileText,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  format,
  isToday,
  startOfDay,
  endOfDay,
  isFuture,
  getYear,
  setYear,
  getMonth,
  setMonth,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface FinancialEntry {
  id: string;
  type: "receivable" | "payable";
  total_amount: number;
  description: string;
  due_date: string;
  status: string;
  entity_name?: string;
}

// UI
interface StockLog {
  id: string;
  product_name: string;
  quantity: number;
  created_at: string;
  operator?: string | null;
}

// DB real (print)
interface StockLogRow {
  id: string;
  product_id: string;
  user_id: string | null;
  change_amount: number;
  new_stock: number | null;
  reason: string | null;
  created_at: string;
}

const formatCurrency = (value: number) =>
  Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const MONTHS_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export default function Fechamento() {
  const [date, setDate] = useState<Date>(new Date());

  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [stockLogs, setStockLogs] = useState<StockLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [physicalCash, setPhysicalCash] = useState<string>("");
  const [isReconciled, setIsReconciled] = useState(false);

  // === Navegação rápida do calendário (Ano/Mês) ===
  const [calYear, setCalYear] = useState<number>(getYear(new Date()));
  const [calMonth, setCalMonth] = useState<number>(getMonth(new Date()));

  useEffect(() => {
    setCalYear(getYear(date));
    setCalMonth(getMonth(date));
  }, [date]);

  useEffect(() => {
    fetchDataByDate(date);
    setPhysicalCash("");
    setIsReconciled(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  // Função auxiliar para buscar nomes de produtos em lote
  const fetchProductNamesByIds = async (productIds: string[]) => {
    const unique = Array.from(new Set(productIds)).filter(Boolean);
    if (unique.length === 0) return new Map<string, string>();

    const { data, error } = await supabase
      .from("products")
      .select("id,name")
      .in("id", unique);

    if (error) {
      console.error("Erro products (names):", error);
      return new Map<string, string>();
    }

    const map = new Map<string, string>();
    (data || []).forEach((p: any) => {
      // Força ID como string para evitar erro de tipo
      map.set(String(p.id), p.name || "Produto Sem Nome");
    });
    return map;
  };

  // Função auxiliar para buscar nomes de usuários (Profiles) em lote
  const fetchUserNamesByIds = async (userIds: string[]) => {
    const unique = Array.from(new Set(userIds)).filter(Boolean);
    if (unique.length === 0) return new Map<string, string>();

    // Tenta buscar da tabela profiles
    const { data, error } = await supabase
      .from("profiles")
      .select("id, name")
      .in("id", unique);

    if (error) {
      console.error("Erro profiles (names):", error);
      return new Map<string, string>();
    }

    const map = new Map<string, string>();
    (data || []).forEach((u: any) => {
      map.set(String(u.id), u.name || "Usuário");
    });
    return map;
  };

  const fetchDataByDate = async (selectedDate: Date) => {
    setLoading(true);
    const start = startOfDay(selectedDate).toISOString();
    const end = endOfDay(selectedDate).toISOString();

    try {
      // 1) Financeiro
      const { data: financialData, error: financialError } = await supabase
        .from("financial_entries")
        .select("*")
        .eq("status", "paid") // Apenas o que foi pago
        .gte("due_date", start) // Usa a data de vencimento/pagamento como referência
        .lte("due_date", end);

      if (financialError) throw financialError;

      // 2) Estoque
      const { data: stockData, error: stockError } = await supabase
        .from("stock_logs")
        .select("id,product_id,user_id,change_amount,new_stock,reason,created_at")
        .gte("created_at", start)
        .lte("created_at", end);

      if (stockError) {
        console.error("Erro stock_logs:", stockError);
        setStockLogs([]);
      } else {
        const rows = (stockData as unknown as StockLogRow[]) || [];
        // Filtra apenas entradas positivas
        const onlyEntries = rows.filter((r) => Number(r.change_amount || 0) > 0);

        // Busca nomes dos produtos
        const productIds = onlyEntries.map((r) => r.product_id);
        const productMap = await fetchProductNamesByIds(productIds);

        // Busca nomes dos operadores (usuários)
        const userIds = onlyEntries.map((r) => r.user_id).filter((id): id is string => !!id);
        const userMap = await fetchUserNamesByIds(userIds);

        const mapped: StockLog[] = onlyEntries.map((r) => {
          const pName = productMap.get(String(r.product_id)) || "Produto Desconhecido";
          const operatorName = r.user_id ? (userMap.get(String(r.user_id)) || "Sistema") : "Sistema";

          return {
            id: r.id,
            product_name: pName,
            quantity: Number(r.change_amount || 0),
            created_at: r.created_at,
            operator: operatorName,
          };
        });

        setStockLogs(mapped);
      }

      setEntries((financialData as FinancialEntry[]) || []);
    } catch (error: any) {
      console.error("Erro ao buscar dados:", error);
      toast.error("Erro ao carregar dados do dia.");
    } finally {
      setLoading(false);
    }
  };

  const todaySales = useMemo(
    () => entries.filter((e) => e.type === "receivable"),
    [entries]
  );
  const todayExpenses = useMemo(
    () => entries.filter((e) => e.type === "payable"),
    [entries]
  );

  const paymentTotals = useMemo(() => {
    const totals: Record<string, number> = { Dinheiro: 0, Pix: 0, Cartão: 0 };
    todaySales.forEach((sale) => {
      const desc = (sale.description || "").toLowerCase();
      // Lógica simples de detecção baseada na descrição (idealmente teria coluna payment_method)
      if (desc.includes("pix")) totals["Pix"] += Number(sale.total_amount);
      else if (desc.includes("dinheiro"))
        totals["Dinheiro"] += Number(sale.total_amount);
      else if (
        desc.includes("crédito") ||
        desc.includes("credito") ||
        desc.includes("débito") ||
        desc.includes("debito") ||
        desc.includes("cartão") ||
        desc.includes("cartao")
      )
        totals["Cartão"] += Number(sale.total_amount);
      else totals["Dinheiro"] += Number(sale.total_amount); // Fallback padrão
    });
    return totals;
  }, [todaySales]);

  const totalSalesValue = todaySales.reduce(
    (sum, s) => sum + Number(s.total_amount),
    0
  );
  const totalExpensesValue = todayExpenses.reduce(
    (sum, e) => sum + Number(e.total_amount),
    0
  );
  const netResult = totalSalesValue - totalExpensesValue;

  const physicalCashValue =
    parseFloat((physicalCash || "").toString().replace(",", ".")) || 0;
  const cashDifference = physicalCashValue - paymentTotals["Dinheiro"];
  const hasDifference = physicalCash !== "" && Math.abs(cashDifference) > 0.01;

  const handleSendWhatsApp = () => {
    const formattedDate = format(date, "dd/MM/yyyy");

    const clientes = Array.from(
      new Set(todaySales.map((s) => s.entity_name || "Consumidor Final"))
    ).join(", ");

    const mercadorias =
      stockLogs.length > 0
        ? stockLogs
            .map(
              (l) =>
                `- ${l.quantity}x ${l.product_name} (Rec: ${l.operator})`
            )
            .join("\n")
        : "Nenhuma entrada de estoque.";

    const contasPagas =
      todayExpenses.length > 0
        ? todayExpenses
            .map((e) => `- ${e.description}: ${formatCurrency(e.total_amount)}`)
            .join("\n")
        : "Nenhuma despesa paga.";

    const message = `
*FECHAMENTO DE CAIXA - ${formattedDate}*
--------------------------------
*💰 RESUMO FINANCEIRO*
✅ Total Vendido: ${formatCurrency(totalSalesValue)}
❌ Total Pago (Despesas): ${formatCurrency(totalExpensesValue)}
*RESULTADO:* ${formatCurrency(netResult)}

*💳 FORMAS DE PAGAMENTO*
💵 Dinheiro: ${formatCurrency(paymentTotals["Dinheiro"])}
💠 Pix: ${formatCurrency(paymentTotals["Pix"])}
💳 Cartão: ${formatCurrency(paymentTotals["Cartão"])}

*📦 CHEGADA DE MERCADORIA*
${mercadorias}

*👥 CLIENTES ATENDIDOS*
${clientes}

*🧾 CONTAS PAGAS*
${contasPagas}

--------------------------------
_Gerado automaticamente pelo Sistema_
`.trim();

    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encodedMessage}`, "_blank");
  };

  const isCurrentDay = isToday(date);

  const yearOptions = useMemo(() => {
    const arr: number[] = [];
    for (let y = 2006; y <= 2099; y++) arr.push(y);
    return arr;
  }, []);

  const applyYearMonth = (y: number, m: number) => {
    const base = startOfDay(new Date());
    const withYear = setYear(base, y);
    const withMonth = setMonth(withYear, m);
    setDate(startOfDay(withMonth));
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-primary/10 border border-primary/20">
            <Calculator className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Fechamento de Caixa
            </h1>
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              {isCurrentDay ? "Prévia em Tempo Real" : "Histórico de Fechamento"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={"outline"}
                className={cn(
                  "w-[240px] justify-start text-left font-normal",
                  !date && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {date ? (
                  format(date, "PPP", { locale: ptBR })
                ) : (
                  <span>Selecione uma data</span>
                )}
              </Button>
            </PopoverTrigger>

            <PopoverContent className="w-auto p-0" align="end">
              <div className="p-3 border-b bg-background">
                <div className="flex gap-2">
                  <select
                    className="h-9 w-[120px] rounded-md border bg-background px-2 text-sm"
                    value={calYear}
                    onChange={(e) => {
                      const y = Number(e.target.value);
                      setCalYear(y);
                      applyYearMonth(y, calMonth);
                    }}
                  >
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>

                  <select
                    className="h-9 w-[140px] rounded-md border bg-background px-2 text-sm"
                    value={calMonth}
                    onChange={(e) => {
                      const m = Number(e.target.value);
                      setCalMonth(m);
                      applyYearMonth(calYear, m);
                    }}
                  >
                    {MONTHS_PT.map((name, idx) => (
                      <option key={name} value={idx}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => d && setDate(d)}
                disabled={(d) => isFuture(d)}
                month={new Date(calYear, calMonth, 1)}
                onMonthChange={(m) => {
                  setCalYear(getYear(m));
                  setCalMonth(getMonth(m));
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          <Button
            onClick={handleSendWhatsApp}
            className="bg-green-600 hover:bg-green-700 text-white gap-2"
          >
            <Share2 className="h-4 w-4" /> WhatsApp
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="border-l-4 border-l-emerald-500 shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Smartphone className="h-4 w-4" /> Total em Pix
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-emerald-600">
                  {formatCurrency(paymentTotals["Pix"])}
                </p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-green-500 shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Banknote className="h-4 w-4" /> Total em Dinheiro
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(paymentTotals["Dinheiro"])}
                </p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-blue-500 shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <CreditCard className="h-4 w-4" /> Total em Cartão
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-blue-600">
                  {formatCurrency(paymentTotals["Cartão"])}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-6">
              <Card className="border-primary/10 shadow-md">
                <CardHeader className="bg-muted/30">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Banknote className="h-5 w-5 text-primary" />
                    Conferência de Gaveta
                  </CardTitle>
                  <CardDescription>
                    {isCurrentDay
                      ? "Conte o dinheiro físico e digite abaixo para bater o caixa."
                      : "Simulação de conferência para data passada."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
                  <div className="space-y-2">
                    <Label htmlFor="physical-cash">Valor Contado (Dinheiro)</Label>
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
                        className="pl-10 text-lg font-bold h-12"
                      />
                    </div>
                  </div>

                  {physicalCash !== "" && (
                    <div className="p-4 rounded-lg bg-background border animate-in slide-in-from-top-2">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm text-muted-foreground">
                          Sistema (Dinheiro):
                        </span>
                        <span className="font-mono font-medium">
                          {formatCurrency(paymentTotals["Dinheiro"])}
                        </span>
                      </div>
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-sm text-muted-foreground">
                          Gaveta (Informado):
                        </span>
                        <span className="font-mono font-medium">
                          {formatCurrency(physicalCashValue)}
                        </span>
                      </div>
                      <Separator className="mb-3" />

                      {hasDifference ? (
                        <Alert variant="destructive">
                          <AlertTriangle className="h-4 w-4" />
                          <AlertTitle>Quebra de Caixa!</AlertTitle>
                          <AlertDescription>
                            {cashDifference > 0
                              ? `Sobrando ${formatCurrency(cashDifference)}`
                              : `Faltando ${formatCurrency(
                                  Math.abs(cashDifference)
                                )}`}
                          </AlertDescription>
                        </Alert>
                      ) : (
                        <Alert className="border-emerald-500 bg-emerald-50 text-emerald-900">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          <AlertTitle>Caixa Batendo!</AlertTitle>
                          <AlertDescription>
                            Tudo correto com o dinheiro.
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  )}

                  <Button
                    className="w-full h-12 text-lg"
                    onClick={() => {
                      setIsReconciled(true);
                      toast.success("Caixa validado!");
                    }}
                    disabled={physicalCash === "" || isReconciled}
                  >
                    {isReconciled ? "Validado ✓" : "Validar Caixa"}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" /> Balanço Consolidado
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                    <span className="text-emerald-700 font-medium">
                      Entradas (Vendas)
                    </span>
                    <span className="font-mono font-bold text-lg text-emerald-700">
                      {formatCurrency(totalSalesValue)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-3 rounded-lg bg-red-50 border border-red-100">
                    <span className="text-red-700 font-medium">
                      Saídas (Despesas)
                    </span>
                    <span className="font-mono font-bold text-lg text-red-700">
                      -{formatCurrency(totalExpensesValue)}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center p-4 rounded-lg bg-slate-100 border border-slate-200">
                    <span className="font-bold text-slate-800">
                      Resultado Líquido
                    </span>
                    <span
                      className={`font-mono font-bold text-xl ${
                        netResult >= 0 ? "text-emerald-600" : "text-red-600"
                      }`}
                    >
                      {formatCurrency(netResult)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <PackageOpen className="h-5 w-5 text-blue-500" />
                    Entrada de Mercadorias
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {stockLogs.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Nenhuma mercadoria chegou nesta data.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {stockLogs.map((log) => (
                        <li
                          key={log.id}
                          className="flex justify-between items-center text-sm p-2 bg-muted/50 rounded-md"
                        >
                          <div>
                            <p className="font-medium">{log.product_name}</p>
                            <p className="text-xs text-muted-foreground">
                              Recebido por: {log.operator}
                            </p>
                          </div>
                          <Badge variant="secondary">+{log.quantity} un</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <AlertTriangle className="h-5 w-5 text-orange-500" />
                    Contas Pagas no Dia
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {todayExpenses.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Nenhuma despesa registrada.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {todayExpenses.map((expense) => (
                        <li
                          key={expense.id}
                          className="flex justify-between items-start text-sm border-b pb-2 last:border-0"
                        >
                          <div>
                            <p className="font-medium">{expense.description}</p>
                            <p className="text-xs text-muted-foreground">
                              {expense.entity_name || "Despesa Operacional"}
                            </p>
                          </div>
                          <span className="font-mono font-medium text-red-600">
                            -{formatCurrency(expense.total_amount)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <User className="h-5 w-5 text-purple-500" />
                    Principais Clientes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {Array.from(
                      new Set(todaySales.map((s) => s.entity_name || "Não Identificado"))
                    ).map((cliente, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {cliente}
                      </Badge>
                    ))}
                    {todaySales.length === 0 && (
                      <p className="text-sm text-muted-foreground w-full text-center">
                        Nenhuma venda registrada.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}