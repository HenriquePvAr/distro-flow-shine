import { useState, useMemo, useEffect } from "react";
import { Trophy, Users, TrendingUp, Medal, Crown, Award, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// --- TIPAGEM ---
interface Sale {
  id: string;
  total_amount: number;
  entity_name: string; // Cliente
  description: string; // Contém "Vend: NomeDoVendedor"
  created_at: string;
}

interface SellerStat {
  name: string;
  totalRevenue: number;
  salesCount: number;
  averageTicket: number;
}

interface CustomerStat {
  name: string;
  totalSpent: number;
  purchaseCount: number;
  lastPurchase: string;
  classification?: "A" | "B" | "C";
  percentageOfTotal?: number;
}

const formatCurrency = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function Performance() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  // Carregar Vendas do Banco
  useEffect(() => {
    async function fetchSales() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("financial_entries")
          .select("*")
          .eq("type", "receivable")
          .ilike("reference", "PDV%") // Filtra apenas vendas do PDV
          .order("created_at", { ascending: false });

        if (error) throw error;
        setSales(data || []);
      } catch (error) {
        console.error("Erro ao carregar vendas:", error);
        toast.error("Erro ao carregar dados de performance");
      } finally {
        setLoading(false);
      }
    }
    fetchSales();
  }, []);

  // --- ANÁLISE DE VENDEDORES ---
  const sellerStats = useMemo(() => {
    const statsMap = new Map<string, SellerStat>();

    sales.forEach((sale) => {
      // Tenta extrair o nome do vendedor da descrição (ex: "... | Vend: João")
      const match = sale.description?.match(/Vend: ([^|]+)/);
      const sellerName = match ? match[1].trim() : "Venda Balcão";

      const existing = statsMap.get(sellerName);
      if (existing) {
        existing.totalRevenue += Number(sale.total_amount);
        existing.salesCount += 1;
      } else {
        statsMap.set(sellerName, {
          name: sellerName,
          totalRevenue: Number(sale.total_amount),
          salesCount: 1,
          averageTicket: 0,
        });
      }
    });

    const stats = Array.from(statsMap.values()).map(s => ({
      ...s,
      averageTicket: s.salesCount > 0 ? s.totalRevenue / s.salesCount : 0
    }));

    return stats.sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [sales]);

  const maxRevenue = sellerStats.length > 0 ? Math.max(...sellerStats.map((s) => s.totalRevenue)) : 1;

  // --- CURVA ABC DE CLIENTES ---
  const customerStats = useMemo(() => {
    const customerMap = new Map<string, CustomerStat>();

    sales.forEach((sale) => {
      const customerName = sale.entity_name || "Cliente Avulso";
      if (customerName === "Cliente Avulso" || customerName === "Cliente Balcão") return;

      const existing = customerMap.get(customerName);
      if (existing) {
        existing.totalSpent += Number(sale.total_amount);
        existing.purchaseCount += 1;
        if (new Date(sale.created_at) > new Date(existing.lastPurchase)) {
          existing.lastPurchase = sale.created_at;
        }
      } else {
        customerMap.set(customerName, {
          name: customerName,
          totalSpent: Number(sale.total_amount),
          purchaseCount: 1,
          lastPurchase: sale.created_at,
        });
      }
    });

    const customers = Array.from(customerMap.values()).sort(
      (a, b) => b.totalSpent - a.totalSpent
    );

    // Calcular ABC
    const totalRevenue = customers.reduce((sum, c) => sum + c.totalSpent, 0);
    let accumulated = 0;

    return customers.map((customer) => {
      accumulated += customer.totalSpent;
      const percentage = totalRevenue > 0 ? (accumulated / totalRevenue) * 100 : 0;

      let classification: "A" | "B" | "C";
      if (percentage <= 80) {
        classification = "A";
      } else if (percentage <= 95) {
        classification = "B";
      } else {
        classification = "C";
      }

      return {
        ...customer,
        classification,
        percentageOfTotal: totalRevenue > 0 ? (customer.totalSpent / totalRevenue) * 100 : 0,
      };
    });
  }, [sales]);

  const classificationCounts = {
    A: customerStats.filter((c) => c.classification === "A").length,
    B: customerStats.filter((c) => c.classification === "B").length,
    C: customerStats.filter((c) => c.classification === "C").length,
  };

  const getRankIcon = (index: number) => {
    switch (index) {
      case 0:
        return <Crown className="h-5 w-5 text-amber-500" />;
      case 1:
        return <Medal className="h-5 w-5 text-slate-400" />;
      case 2:
        return <Award className="h-5 w-5 text-amber-700" />;
      default:
        return <span className="w-5 text-center font-bold text-muted-foreground">{index + 1}</span>;
    }
  };

  const getClassificationColor = (classification: "A" | "B" | "C") => {
    switch (classification) {
      case "A":
        return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
      case "B":
        return "bg-amber-500/10 text-amber-600 border-amber-500/20";
      case "C":
        return "bg-slate-500/10 text-slate-600 border-slate-500/20";
    }
  };

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
          <Trophy className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Performance</h1>
          <p className="text-sm text-muted-foreground">Análise de vendedores e clientes</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Vendas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{sales.length}</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Clientes A (80% receita)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">{classificationCounts.A}</p>
          </CardContent>
        </Card>
        <Card className="border-amber-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Clientes B (15% receita)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">{classificationCounts.B}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Clientes C (5% receita)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-muted-foreground">{classificationCounts.C}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Seller Ranking */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <CardTitle>Ranking de Vendedores</CardTitle>
            </div>
            <p className="text-sm text-muted-foreground">
              Performance por faturamento total
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {sellerStats.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhuma venda registrada ainda
              </p>
            ) : (
              sellerStats.map((stat, index) => (
                <div
                  key={stat.name}
                  className="flex items-center gap-4 p-3 rounded-lg bg-muted/30"
                >
                  <div className="flex items-center justify-center w-8">
                    {getRankIcon(index)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium truncate">{stat.name}</span>
                      <span className="text-sm font-bold">
                        {formatCurrency(stat.totalRevenue)}
                      </span>
                    </div>
                    <Progress
                      value={(stat.totalRevenue / maxRevenue) * 100}
                      className="h-2"
                    />
                    <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                      <span>{stat.salesCount} vendas</span>
                      <span>Ticket Médio: {formatCurrency(stat.averageTicket)}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Customer ABC */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <CardTitle>Melhores Clientes (Curva ABC)</CardTitle>
            </div>
            <p className="text-sm text-muted-foreground">
              Classificação por valor de compras
            </p>
          </CardHeader>
          <CardContent>
            {customerStats.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhum cliente identificado com compras
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-center">Classe</TableHead>
                    <TableHead className="text-center">Compras</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customerStats.slice(0, 10).map((customer, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <div>
                          <p className="font-medium truncate max-w-[120px] sm:max-w-none">{customer.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {customer.percentageOfTotal?.toFixed(1)}% do total
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant="outline"
                          className={getClassificationColor(customer.classification || "C")}
                        >
                          {customer.classification}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {customer.purchaseCount}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {formatCurrency(customer.totalSpent)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ABC Explanation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sobre a Curva ABC</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
              <Badge className="bg-emerald-500 text-white">A</Badge>
              <div>
                <p className="font-medium text-emerald-700">Clientes Premium</p>
                <p className="text-sm text-muted-foreground">
                  ~20% dos clientes que geram ~80% da receita. Prioridade máxima.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <Badge className="bg-amber-500 text-white">B</Badge>
              <div>
                <p className="font-medium text-amber-700">Clientes Regulares</p>
                <p className="text-sm text-muted-foreground">
                  ~30% dos clientes que geram ~15% da receita. Potencial de crescimento.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-500/5 border border-slate-500/20">
              <Badge variant="secondary">C</Badge>
              <div>
                <p className="font-medium">Clientes Ocasionais</p>
                <p className="text-sm text-muted-foreground">
                  ~50% dos clientes que geram ~5% da receita. Manter relacionamento.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}