"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CreditCard,
  RefreshCcw,
  AlertTriangle,
  Lock,
  Loader2,
  ExternalLink,
  CalendarClock,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  Sparkles,
  BadgeCheck,
  ArrowRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type SubStatus = "inactive" | "active" | "past_due" | "cancelled" | "blocked_manual";

type CompanySubscription = {
  company_id: string;
  plan: string;
  status: SubStatus;
  current_period_end: string | null;
  manual_override: boolean;
  blocked_reason: string | null;
};

const PRICE = 120;

const formatCurrency = (v: number) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function statusLabel(s: SubStatus) {
  switch (s) {
    case "active":
      return "Ativo";
    case "past_due":
      return "Atrasado";
    case "inactive":
      return "Inativo";
    case "cancelled":
      return "Cancelado";
    case "blocked_manual":
      return "Bloqueado";
    default:
      return s;
  }
}

function statusBadgeVariant(s: SubStatus): "default" | "secondary" | "destructive" | "outline" {
  switch (s) {
    case "active":
      return "default";
    case "past_due":
      return "destructive";
    case "blocked_manual":
      return "destructive";
    case "inactive":
      return "secondary";
    case "cancelled":
      return "outline";
    default:
      return "secondary";
  }
}

function statusIcon(s: SubStatus) {
  switch (s) {
    case "active":
      return <CheckCircle2 className="h-4 w-4" />;
    case "past_due":
      return <AlertTriangle className="h-4 w-4" />;
    case "inactive":
      return <Clock className="h-4 w-4" />;
    case "cancelled":
      return <XCircle className="h-4 w-4" />;
    case "blocked_manual":
      return <Lock className="h-4 w-4" />;
    default:
      return <Clock className="h-4 w-4" />;
  }
}

function humanPlan(plan?: string) {
  if (!plan) return "Mensal";
  if (plan.includes("monthly")) return "Mensal";
  return plan;
}

export default function Assinatura() {
  const { isAdmin } = useAuth();

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [companyId, setCompanyId] = useState<string | null>(null);
  const [sub, setSub] = useState<CompanySubscription | null>(null);

  const currentStatus: SubStatus = sub?.status || "inactive";

  const nextRenewal = useMemo(() => {
    if (!sub?.current_period_end) return "—";
    try {
      return format(new Date(sub.current_period_end), "dd/MM/yyyy", { locale: ptBR });
    } catch {
      return "—";
    }
  }, [sub?.current_period_end]);

  const canPay = currentStatus !== "blocked_manual";
  const primaryCtaLabel = currentStatus === "active" ? "Gerar novo link" : "Assinar agora";

  async function loadCompanyAndSubscription(showSpinner = true) {
    setErrorMsg(null);
    if (showSpinner) setLoading(true);
    else setRefreshing(true);

    try {
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (userErr) throw userErr;
      if (!user) throw new Error("Usuário não autenticado.");

      // company_id do perfil
      const { data: profile, error: pErr } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", user.id)
        .single();

      if (pErr) throw pErr;
      if (!profile?.company_id) throw new Error("Sua conta ainda não está vinculada a uma empresa.");

      setCompanyId(profile.company_id);

      const { data: subRows, error: sErr } = await supabase
        .from("company_subscriptions")
        .select("company_id,plan,status,current_period_end,manual_override,blocked_reason")
        .eq("company_id", profile.company_id)
        .limit(1);

      if (sErr) throw sErr;

      setSub((subRows?.[0] as CompanySubscription) || null);
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e?.message || "Erro ao carregar assinatura.");
    } finally {
      if (showSpinner) setLoading(false);
      setRefreshing(false);
    }
  }

  async function handleSubscribe() {
    if (!companyId) return;
    setErrorMsg(null);
    setCreating(true);

    try {
      const { data, error } = await supabase.functions.invoke("create-subscription", {
        body: { companyId, price: PRICE, cycle: "MONTHLY" },
      });

      if (error) throw error;
      if (!data?.paymentUrl) throw new Error("Não foi possível gerar o link de pagamento.");

      window.open(data.paymentUrl, "_blank", "noopener,noreferrer");

      // atualiza sem travar a tela
      await loadCompanyAndSubscription(false);
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e?.message || "Erro ao gerar pagamento.");
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    loadCompanyAndSubscription(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isAdmin) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive" className="bg-red-50 text-red-900 border-red-200">
          <Lock className="h-4 w-4" />
          <AlertTitle>Acesso restrito</AlertTitle>
          <AlertDescription>Somente administradores podem gerenciar a assinatura.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Top Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <CreditCard className="h-6 w-6 text-primary" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-foreground">Assinatura</h1>
              <Badge variant={statusBadgeVariant(currentStatus)} className="gap-1">
                {statusIcon(currentStatus)}
                {statusLabel(currentStatus)}
              </Badge>
              {sub?.manual_override && currentStatus !== "blocked_manual" && (
                <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50 gap-1">
                  <Sparkles className="h-3.5 w-3.5" />
                  Liberação manual
                </Badge>
              )}
            </div>

            <p className="text-sm text-muted-foreground">
              Cobrança mensal e liberação de acesso para a empresa
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => loadCompanyAndSubscription(false)}
            disabled={refreshing}
          >
            {refreshing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Atualizando...
              </>
            ) : (
              <>
                <RefreshCcw className="h-4 w-4 mr-2" />
                Atualizar
              </>
            )}
          </Button>
        </div>
      </div>

      {errorMsg && (
        <Alert variant="destructive" className="bg-red-50 text-red-900 border-red-200">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Erro</AlertTitle>
          <AlertDescription>{errorMsg}</AlertDescription>
        </Alert>
      )}

      {currentStatus === "blocked_manual" && (
        <Alert variant="destructive" className="bg-red-50 text-red-900 border-red-200">
          <Lock className="h-4 w-4" />
          <AlertTitle>Empresa bloqueada</AlertTitle>
          <AlertDescription>
            {sub?.blocked_reason ? sub.blocked_reason : "Bloqueio manual ativo."}
          </AlertDescription>
        </Alert>
      )}

      {/* HERO */}
      <Card className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-transparent to-transparent" />
        <CardHeader className="relative">
          <CardTitle className="text-lg font-medium flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Plano {humanPlan(sub?.plan)} — {formatCurrency(PRICE)}/mês
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Pagando, o acesso é liberado automaticamente para todos os usuários da empresa.
          </p>
        </CardHeader>

        <CardContent className="relative space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarClock className="h-4 w-4" />
              <span>
                Próxima renovação: <strong className="text-foreground">{nextRenewal}</strong>
              </span>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <Button
                onClick={handleSubscribe}
                disabled={creating || !canPay}
                className="w-full sm:w-auto"
              >
                {creating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Gerando link...
                  </>
                ) : (
                  <>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    {primaryCtaLabel}
                  </>
                )}
              </Button>

              <Button
                variant="outline"
                onClick={() => loadCompanyAndSubscription(false)}
                className="w-full sm:w-auto"
                disabled={refreshing}
              >
                <RefreshCcw className="h-4 w-4 mr-2" />
                Verificar status
              </Button>
            </div>
          </div>

          <Separator />

          {/* RESUMO */}
          <div className="grid gap-3 md:grid-cols-3">
            <Card className="border-border/60">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge variant={statusBadgeVariant(currentStatus)} className="gap-1">
                    {statusIcon(currentStatus)}
                    {statusLabel(currentStatus)}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {currentStatus === "active"
                    ? "Acesso liberado."
                    : currentStatus === "past_due"
                    ? "Pagamento em atraso."
                    : currentStatus === "cancelled"
                    ? "Assinatura cancelada."
                    : currentStatus === "blocked_manual"
                    ? "Bloqueio manual."
                    : "Aguardando assinatura."}
                </p>
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Renovação</p>
                  <CalendarClock className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="mt-2 text-xl font-semibold">{nextRenewal}</p>
                <p className="text-sm text-muted-foreground">Data do próximo ciclo</p>
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Plano</p>
                  <BadgeCheck className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="mt-2 text-xl font-semibold">{humanPlan(sub?.plan)}</p>
                <p className="text-sm text-muted-foreground">Cobrança recorrente</p>
              </CardContent>
            </Card>
          </div>

          {/* PASSOS */}
          <div className="pt-2">
            <p className="text-sm font-medium text-foreground mb-3">Como funciona</p>

            <div className="grid gap-2 md:grid-cols-3">
              <div className="rounded-lg border border-border/60 p-3 flex items-start gap-3">
                <div className="mt-0.5 h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <ExternalLink className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">1) Gerar link</p>
                  <p className="text-xs text-muted-foreground">
                    Clique em <strong>{primaryCtaLabel}</strong> e pague pelo Asaas.
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-border/60 p-3 flex items-start gap-3">
                <div className="mt-0.5 h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <ArrowRight className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">2) Confirmação</p>
                  <p className="text-xs text-muted-foreground">
                    O Asaas confirma e envia um webhook para seu sistema.
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-border/60 p-3 flex items-start gap-3">
                <div className="mt-0.5 h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">3) Liberação</p>
                  <p className="text-xs text-muted-foreground">
                    O status vira <strong>Ativo</strong> e o acesso é liberado.
                  </p>
                </div>
              </div>
            </div>

            {currentStatus === "past_due" && (
              <Alert className="mt-4 border-amber-200 bg-amber-50 text-amber-900">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Pagamento em atraso</AlertTitle>
                <AlertDescription>
                  Gere um novo link para regularizar o acesso da empresa.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Inclui */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Inclui</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 text-sm text-muted-foreground">
            <p>• PDV e vendas</p>
            <p>• Estoque e alertas</p>
            <p>• Financeiro e relatórios</p>
            <p>• Usuários e permissões</p>
            <p className="sm:col-span-2 pt-2 text-xs">
              * O status muda automaticamente quando o Asaas confirmar o pagamento (webhook).
            </p>
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Dicas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>• Clique em “Atualizar” após pagar para ver o status.</p>
            <p>• Se houver atraso, gere um novo link.</p>
            <p>• Caso esteja bloqueado manualmente, fale com o suporte/admin master.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
