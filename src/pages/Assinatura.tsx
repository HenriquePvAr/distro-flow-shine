"use client";

import React, { useEffect, useMemo, useState } from "react";
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
  Zap,
  Users,
  Boxes,
  BarChart3,
  Shield,
  Crown,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  cpf_cnpj?: string | null; // Adicionado para receber o CPF do banco
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
  if (plan.toLowerCase().includes("monthly")) return "Mensal";
  return plan;
}

function statusShortDescription(s: SubStatus) {
  switch (s) {
    case "active":
      return "Acesso liberado para toda a empresa.";
    case "past_due":
      return "Pagamento em atraso. Gere um novo link para regularizar.";
    case "cancelled":
      return "Assinatura cancelada. Gere um novo link para reativar.";
    case "blocked_manual":
      return "Bloqueio manual ativo. Fale com o admin master/suporte.";
    case "inactive":
    default:
      return "Assinatura ainda não iniciada. Gere um link para ativar.";
  }
}

function FeatureRow({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border/60 bg-background/60 p-4">
      <div className="mt-0.5 h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

export default function Assinatura() {
  const { isAdmin } = useAuth();

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Novo estado para controlar o CPF digitado
  const [cpfCnpj, setCpfCnpj] = useState("");

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
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      if (!userData.user) throw new Error("Usuário não autenticado.");

      const { data: profile, error: pErr } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", userData.user.id)
        .single();

      if (pErr) throw pErr;
      if (!profile?.company_id) throw new Error("Sua conta ainda não está vinculada a uma empresa.");

      setCompanyId(profile.company_id);

      // Busca dados da assinatura + CPF salvo
      const { data: subRows, error: sErr } = await supabase
        .from("company_subscriptions")
        .select("*, cpf_cnpj") // Incluindo cpf_cnpj na busca
        .eq("company_id", profile.company_id)
        .limit(1);

      if (sErr) throw sErr;

      const subscription = (subRows?.[0] as CompanySubscription) || null;
      setSub(subscription);

      // Se existir CPF salvo no banco, preenche o campo automaticamente
      if (subscription?.cpf_cnpj) {
        setCpfCnpj(subscription.cpf_cnpj);
      }

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

    // Remove caracteres não numéricos para validação
    const cleanCpf = cpfCnpj.replace(/\D/g, "");
    
    // Validação simples de tamanho (CPF 11 ou CNPJ 14)
    if (cleanCpf.length < 11) {
      setErrorMsg("Por favor, digite um CPF ou CNPJ válido para emitir a cobrança.");
      return;
    }

    setErrorMsg(null);
    setCreating(true);

    try {
      const { data: sessData, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) throw sessErr;

      const token = sessData.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Faça login novamente.");

      const { data, error } = await supabase.functions.invoke("create-subscription", {
        body: { 
          companyId, 
          price: PRICE, 
          cycle: "MONTHLY",
          cpfCnpj: cleanCpf // Envia o CPF limpo para a Edge Function
        },
        headers: { Authorization: `Bearer ${token}` },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error); // Trata erro retornado pela API
      if (!data?.paymentUrl) throw new Error("Não foi possível gerar o link de pagamento.");

      // Sucesso: Abre link e recarrega dados
      window.open(data.paymentUrl, "_blank", "noopener,noreferrer");
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
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Top Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-2xl bg-primary/10">
            <CreditCard className="h-6 w-6 text-primary" />
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
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

              <Badge variant="outline" className="gap-1">
                <Crown className="h-3.5 w-3.5" />
                SaaS
              </Badge>
            </div>

            <p className="text-sm text-muted-foreground">
              Plano, cobrança e liberação de acesso por empresa (multi-tenant).
            </p>
          </div>
        </div>

        <Button variant="outline" onClick={() => loadCompanyAndSubscription(false)} disabled={refreshing}>
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
          <AlertDescription>{sub?.blocked_reason || "Bloqueio manual ativo."}</AlertDescription>
        </Alert>
      )}

      {/* Hero / Pricing */}
      <Card className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/12 via-primary/5 to-transparent" />
        <div className="absolute -top-24 -right-24 h-56 w-56 rounded-full bg-primary/10 blur-2xl" />
        <div className="absolute -bottom-24 -left-24 h-56 w-56 rounded-full bg-primary/10 blur-2xl" />

        <CardContent className="relative p-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-3 py-1 text-xs text-muted-foreground">
                <BadgeCheck className="h-3.5 w-3.5 text-primary" />
                Plano recomendado para pequenas e médias empresas
              </div>

              <h2 className="text-xl sm:text-2xl font-semibold text-foreground flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Plano {humanPlan(sub?.plan)}{" "}
                <Badge variant="outline" className="ml-1">
                  Recomendado
                </Badge>
              </h2>

              <p className="text-sm text-muted-foreground max-w-xl">
                Cobrança mensal com liberação automática após confirmação do pagamento via Asaas.
              </p>

              <div className="flex items-end gap-2">
                <p className="text-4xl font-extrabold tracking-tight text-foreground">
                  {formatCurrency(PRICE)}
                </p>
                <span className="text-sm text-muted-foreground pb-1">/ mês</span>
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarClock className="h-4 w-4" />
                <span>
                  Próxima renovação: <strong className="text-foreground">{nextRenewal}</strong>
                </span>
              </div>
            </div>

            <div className="w-full lg:w-[420px] space-y-3">
              <Card className="border-border/60 bg-background/70 shadow-sm backdrop-blur-sm">
                <CardContent className="p-5 space-y-4">
                  
                  {/* Status Display */}
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">Status da empresa</p>
                    <Badge variant={statusBadgeVariant(currentStatus)} className="gap-1">
                      {statusIcon(currentStatus)}
                      {statusLabel(currentStatus)}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{statusShortDescription(currentStatus)}</p>

                  <Separator />

                  {/* CPF Input Field */}
                  <div className="space-y-2">
                    <Label htmlFor="cpf" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      CPF/CNPJ do Pagador
                    </Label>
                    <Input 
                      id="cpf"
                      placeholder="000.000.000-00" 
                      value={cpfCnpj}
                      onChange={(e) => setCpfCnpj(e.target.value)}
                      disabled={creating || loading}
                      className="bg-background/80"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Obrigatório para emissão. Ficará salvo como padrão.
                    </p>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-col sm:flex-row gap-2 pt-2">
                    <Button onClick={handleSubscribe} disabled={creating || !canPay} className="w-full shadow-md">
                      {creating ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Gerando...
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
                      disabled={refreshing}
                      className="w-full sm:w-auto"
                      title="Verificar status atualizado"
                    >
                      <RefreshCcw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Benefits */}
          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <FeatureRow
              icon={<Zap className="h-5 w-5 text-primary" />}
              title="Ativação rápida"
              desc="Link de pagamento em 1 clique. Confirmação via webhook."
            />
            <FeatureRow
              icon={<Users className="h-5 w-5 text-primary" />}
              title="Multiusuário"
              desc="Liberação para todos os usuários vinculados à empresa."
            />
            <FeatureRow
              icon={<Boxes className="h-5 w-5 text-primary" />}
              title="Recursos completos"
              desc="PDV, estoque, clientes, histórico e relatórios."
            />
            <FeatureRow
              icon={<BarChart3 className="h-5 w-5 text-primary" />}
              title="Gestão e performance"
              desc="Métricas, fechamento e controle do operacional."
            />
          </div>
        </CardContent>
      </Card>

      {/* Steps + Security */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Como funciona</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 md:grid-cols-3">
              <div className="rounded-2xl border border-border/60 p-4">
                <div className="flex items-center gap-2">
                  <div className="h-9 w-9 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <ExternalLink className="h-4 w-4 text-primary" />
                  </div>
                  <p className="text-sm font-semibold">1) Gerar link</p>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Informe o CPF/CNPJ, clique em <strong>{primaryCtaLabel}</strong> e pague no Asaas.
                </p>
              </div>

              <div className="rounded-2xl border border-border/60 p-4">
                <div className="flex items-center gap-2">
                  <div className="h-9 w-9 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <ArrowRight className="h-4 w-4 text-primary" />
                  </div>
                  <p className="text-sm font-semibold">2) Confirmação</p>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  O Asaas confirma e envia webhook pro seu backend.
                </p>
              </div>

              <div className="rounded-2xl border border-border/60 p-4">
                <div className="flex items-center gap-2">
                  <div className="h-9 w-9 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  </div>
                  <p className="text-sm font-semibold">3) Liberação</p>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  O status vira <strong>Ativo</strong> e o acesso é liberado.
                </p>
              </div>
            </div>

            <Separator />

            <div className="flex items-start gap-3 rounded-2xl border border-border/60 p-4 bg-background/60">
              <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Segurança</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Os links são gerados no servidor (Edge Function). A liberação é feita automaticamente
                  quando o Asaas confirmar via webhook.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Inclui no plano</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>• PDV e vendas</p>
            <p>• Estoque e alertas</p>
            <p>• Clientes e histórico</p>
            <p>• Despesas, performance e fechamento</p>
            <p>• Usuários e permissões</p>

            <p className="pt-2 text-xs">
              * O status muda automaticamente quando o Asaas confirmar o pagamento (webhook).
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}