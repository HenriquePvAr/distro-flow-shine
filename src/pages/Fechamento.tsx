"use client";

import { useMemo, useEffect, useState, useRef, useCallback, useDeferredValue } from "react";
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

interface StockLog {
  id: string;
  product_name: string;
  quantity: number;
  created_at: string;
  operator?: string | null;
}

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

  // ✅ perf: input controlado com deferred (não “engasga”)
  const [physicalCash, setPhysicalCash] = useState<string>("");
  const deferredPhysicalCash = useDeferredValue(physicalCash);

  const [isReconciled, setIsReconciled] = useState(false);

  // === Navegação rápida do calendário (Ano/Mês) ===
  const [calYear, setCalYear] = useState<number>(getYear(new Date()));
  const [calMonth, setCalMonth] = useState<number>(getMonth(new Date()));

  // ✅ evita setState de request antiga
  const requestIdRef = useRef(0);

  // ✅ caches (evita bater no banco toda vez)
  const productNameCacheRef = useRef<Map<string, string>>(new Map());
  const userNameCacheRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    setCalYear(getYear(date));
    setCalMonth(getMonth(date));
  }, [date]);

  // reset quando muda dia
  useEffect(() => {
    fetchDataByDate(date);
    setPhysicalCash("");
    setIsReconciled(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  // ---------- helpers cache ----------
  const fetchProductNamesByIds = useCallback(async (productIds: string[]) => {
    const unique = Array.from(new Set(productIds)).filter(Boolean);
    if (unique.length === 0) return new Map<string, string>();

    const missing = unique.filter((id) => !productNameCacheRef.current.has(String(id)));
    if (missing.length === 0) return new Map(productNameCacheRef.current);

    const { data, error } = await supabase
      .from("products")
      .select("id,name")
      .in("id", missing);

    if (error) {
      console.error("Erro products (names):", error);
      return new Map(productNameCacheRef.current);
    }

    (data || []).forEach((p: any) => {
      productNameCacheRef.current.set(String(p.id), p.name || "Produto Sem Nome");
    });

    return new Map(productNameCacheRef.current);
  }, []);

  const fetchUserNamesByIds = useCallback(async (userIds: string[]) => {
    const unique = Array.from(new Set(userIds)).filter(Boolean);
    if (unique.length === 0) return new Map<string, string>();

    const missing = unique.filter((id) => !userNameCacheRef.current.has(String(id)));
    if (missing.length === 0) return new Map(userNameCacheRef.current);

    const { data, error } = await supabase
      .from("profiles")
      .select("id, name")
      .in("id", missing);

    if (error) {
      console.error("Erro profiles (names):", error);
      return new Map(userNameCacheRef.current);
    }

    (data || []).forEach((u: any) => {
      userNameCacheRef.current.set(String(u.id), u.name || "Usuário");
    });

    return new Map(userNameCacheRef.current);
  }, []);

  // ✅ pagamento: tenta pegar de "payment_method" se existir no registro; se não, faz fallback na descrição.
  const detectPaymentMethod = (entry: FinancialEntry) => {
    const anyEntry = entry as any;
    const raw = String(anyEntry?.payment_method || "").trim().toLowerCase();
    if (raw) {
      if (raw.includes("pix")) return "Pix";
      if (raw.includes("dinheiro") || raw === "cash") return "Dinheiro";
      if (raw.includes("cart") || raw.includes("credit") || raw.includes("debit")) return "Cartão";
    }

    const desc = String(entry.description || "").toLowerCase();
    if (desc.includes("pix")) return "Pix";
    if (desc.includes("dinheiro")) return "Dinheiro";
    if (
      desc.includes("crédito") ||
      desc.includes("credito") ||
      desc.includes("débito") ||
      desc.includes("debito") ||
      desc.includes("cartão") ||
      desc.includes("cartao")
    ) return "Cartão";

    return "Dinheiro";
  };

  const fetchDataByDate = useCallback(
    async (selectedDate: Date) => {
      const rid = ++requestIdRef.current;
      setLoading(true);

      const start = startOfDay(selectedDate).toISOString();
      const end = endOfDay(selectedDate).toISOString();

      try {
        // 1) Financeiro (apenas pagos no dia)
        // obs: se teu schema tiver payment_method, pode trocar o select("*") por select com colunas específicas.
        const { data: financialData, error: financialError } = await supabase
          .from("financial_entries")
          .select("*")
          .eq("status", "paid")
          .gte("due_date", start)
          .lte("due_date", end);

        if (financialError) throw financialError;
        if (rid !== requestIdRef.current) return;

        // 2) Estoque (logs do dia)
        const { data: stockData, error: stockError } = await supabase
          .from("stock_logs")
          .select("id,product_id,user_id,change_amount,new_stock,reason,created_at")
          .gte("created_at", start)
          .lte("created_at", end);

        if (rid !== requestIdRef.current) return;

        if (stockError) {
          console.error("Erro stock_logs:", stockError);
          setStockLogs([]);
        } else {
          const rows = (stockData as unknown as StockLogRow[]) || [];

          // ✅ correção: mostrar movimentações relevantes (entrada e saída),
          // mas excluir as que vieram de venda/cancelamento (pra não poluir o fechamento)
          const filteredRows = rows.filter((r) => {
            const amt = Number(r.change_amount || 0);
            if (!Number.isFinite(amt) || amt === 0) return false;

            const reason = String(r.reason || "").toLowerCase();
            // Ajusta aqui se teus reasons forem diferentes:
            const isFromSale =
              reason.includes("sale") ||
              reason.includes("venda") ||
              reason.includes("pdv") ||
              reason.includes("cancel") ||
              reason.includes("cancelad") ||
              reason.includes("repor estoque");

            return !isFromSale;
          });

          const productIds = filteredRows.map((r) => String(r.product_id));
          const userIds = filteredRows.map((r) => r.user_id).filter((id): id is string => !!id);

          const productMap = await fetchProductNamesByIds(productIds);
          const userMap = await fetchUserNamesByIds(userIds);

          if (rid !== requestIdRef.current) return;

          const mapped: StockLog[] = filteredRows.map((r) => {
            const pName = productMap.get(String(r.product_id)) || "Produto Desconhecido";
            const operatorName = r.user_id
              ? userMap.get(String(r.user_id)) || "Sistema"
              : "Sistema";

            return {
              id: r.id,
              product_name: pName,
              // pode ser negativo (saída)
              quantity: Number(r.change_amount || 0),
              created_at: r.created_at,
              operator: operatorName,
            };
          });

          // Ordena por hora
          mapped.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          setStockLogs(mapped);
        }

        setEntries((financialData as FinancialEntry[]) || []);
      } catch (error: any) {
        console.error("Erro ao buscar dados:", error);
        toast.error("Erro ao carregar dados do dia.");
      } finally {
        if (rid === requestIdRef.current) setLoading(false);
      }
    },
    [fetchProductNamesByIds, fetchUserNamesByIds]
  );

  const todaySales = useMemo(
    () => entries.filter((e) => e.type === "receivable"),
    [entries]
  );
  const todayExpenses = useMemo(
    () => entries.filter((e) => e.type === "payable"),
    [entries]
  );

  // ✅ totals por forma de pagamento (com melhor fallback)
  const paymentTotals = useMemo(() => {
    const totals: Record<"Dinheiro" | "Pix" | "Cartão", number> = {
      Dinheiro: 0,
      Pix: 0,
      Cartão: 0,
    };

    for (let i = 0; i < todaySales.length; i++) {
      const sale = todaySales[i];
      const method = detectPaymentMethod(sale);
      totals[method as "Dinheiro" | "Pix" | "Cartão"] += Number(sale.total_amount || 0);
    }

    return totals;
  }, [todaySales]);

  const totalSalesValue = useMemo(
    () => todaySales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0),
    [todaySales]
  );

  const totalExpensesValue = useMemo(
    () => todayExpenses.reduce((sum, e) => sum + Number(e.total_amount || 0), 0),
    [todayExpenses]
  );

  const netResult = totalSalesValue - totalExpensesValue;

  // ✅ parse correto pt-BR (aceita "1.234,56" ou "1234.56")
  const parseMoneyPt = (s: string) => {
    const raw = String(s || "").trim();
    if (!raw) return 0;
    const normalized = raw.replace(/\./g, "").replace(",", ".");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
  };

  const physicalCashValue = useMemo(
    () => parseMoneyPt(deferredPhysicalCash),
    [deferredPhysicalCash]
  );

  const cashDifference = physicalCashValue - paymentTotals["Dinheiro"];
  const hasDifference =
    deferredPhysicalCash.trim() !== "" && Math.abs(cashDifference) > 0.01;

  // ✅ bloqueia validar se tem diferença (evita “validar” caixa quebrado)
  const canValidate =
    deferredPhysicalCash.trim() !== "" && !isReconciled && !hasDifference;

  const isCurrentDay = isToday(date);

  const handleSendWhatsApp = () => {
    const formattedDate = format(date, "dd/MM/yyyy");

    const clientes = Array.from(
      new Set(todaySales.map((s) => s.entity_name || "Consumidor Final"))
    ).join(", ");

    const mercadorias =
      stockLogs.length > 0
        ? stockLogs
            .map((l) => {
              const sign = l.quantity >= 0 ? "+" : "-";
              return `- ${sign}${Math.abs(l.quantity)}x ${l.product_name} (Resp: ${l.operator || "Sistema"})`;
            })
            .join("\n")
        : "Nenhuma movimentação de estoque (manual) nesta data.";

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

*🧾 CONFERÊNCIA DE GAVETA*
Sistema (Dinheiro): ${formatCurrency(paymentTotals["Dinheiro"])}
Gaveta (Contado): ${formatCurrency(physicalCashValue)}
Diferença: ${formatCurrency(cashDifference)}

*📦 MOVIMENTAÇÕES DE ESTOQUE (manual)*
${mercadorias}

*👥 CLIENTES ATENDIDOS*
${clientes || "—"}

*🧾 CONTAS PAGAS*
${contasPagas}

--------------------------------
_Gerado automaticamente pelo Sistema_
`.trim();

    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encodedMessage}`, "_blank");
  };

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
            <h1 className="text-2xl font-bold text-foreground">Fechamento de Caixa</h1>
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
                {date ? format(date, "PPP", { locale: ptBR }) : <span>Selecione uma data</span>}
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

          <Button onClick={handleSendWhatsApp} className="bg-green-600 hover:bg-green-700 text-white gap-2">
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
                        type="text"
                        inputMode="decimal"
                        placeholder="0,00"
                        value={physicalCash}
                        onChange={(e) => {
                          setPhysicalCash(e.target.value);
                          setIsReconciled(false);
                        }}
                        className="pl-10 text-lg font-bold h-12"
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Pode digitar assim: <b>1234,56</b> ou <b>1.234,56</b>
                    </p>
                  </div>

                  {deferredPhysicalCash.trim() !== "" && (
                    <div className="p-4 rounded-lg bg-background border animate-in slide-in-from-top-2">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm text-muted-foreground">Sistema (Dinheiro):</span>
                        <span className="font-mono font-medium">
                          {formatCurrency(paymentTotals["Dinheiro"])}
                        </span>
                      </div>
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-sm text-muted-foreground">Gaveta (Informado):</span>
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
                              : `Faltando ${formatCurrency(Math.abs(cashDifference))}`}
                          </AlertDescription>
                        </Alert>
                      ) : (
                        <Alert className="border-emerald-500 bg-emerald-50 text-emerald-900">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          <AlertTitle>Caixa Batendo!</AlertTitle>
                          <AlertDescription>Tudo correto com o dinheiro.</AlertDescription>
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
                    disabled={!canValidate}
                    title={hasDifference ? "Corrija a diferença para validar" : undefined}
                  >
                    {isReconciled ? "Validado ✓" : hasDifference ? "Ajuste a diferença" : "Validar Caixa"}
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
                    <span className="text-emerald-700 font-medium">Entradas (Vendas)</span>
                    <span className="font-mono font-bold text-lg text-emerald-700">
                      {formatCurrency(totalSalesValue)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-3 rounded-lg bg-red-50 border border-red-100">
                    <span className="text-red-700 font-medium">Saídas (Despesas)</span>
                    <span className="font-mono font-bold text-lg text-red-700">
                      -{formatCurrency(totalExpensesValue)}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center p-4 rounded-lg bg-slate-100 border border-slate-200">
                    <span className="font-bold text-slate-800">Resultado Líquido</span>
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
                    Movimentações de Estoque (manual)
                  </CardTitle>
                  <CardDescription>
                    Mostra entradas/saídas registradas manualmente (não inclui baixa automática de venda/cancelamento).
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {stockLogs.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Nenhuma movimentação manual nesta data.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {stockLogs.map((log) => (
                        <li
                          key={log.id}
                          className="flex justify-between items-center text-sm p-2 bg-muted/50 rounded-md"
                        >
                          <div className="min-w-0">
                            <p className="font-medium truncate">{log.product_name}</p>
                            <p className="text-xs text-muted-foreground">
                              Resp: {log.operator || "Sistema"}
                            </p>
                          </div>
                          <Badge variant="secondary">
                            {log.quantity >= 0 ? `+${log.quantity}` : `-${Math.abs(log.quantity)}`} un
                          </Badge>
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
                          <div className="min-w-0 pr-2">
                            <p className="font-medium truncate">{expense.description}</p>
                            <p className="text-xs text-muted-foreground">
                              {expense.entity_name || "Despesa Operacional"}
                            </p>
                          </div>
                          <span className="font-mono font-medium text-red-600 whitespace-nowrap">
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
                    {Array.from(new Set(todaySales.map((s) => s.entity_name || "Não Identificado"))).map(
                      (cliente, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {cliente}
                        </Badge>
                      )
                    )}
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
