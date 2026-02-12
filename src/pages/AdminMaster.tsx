"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ShieldAlert,
  Search,
  Ban,
  CalendarPlus,
  Loader2,
  Lock,
  PlusCircle,
  Building2,
  LogOut,
  Pencil,
  Unlock,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

// ✅ SEU EMAIL (Só você pode ver essa tela)
const SUPER_ADMIN_EMAIL = "henriquepaiva2808@gmail.com";

type CompanyStatus =
  | "active"
  | "past_due"
  | "blocked_manual"
  | "inactive"
  | "cancelled";

type CompanyData = {
  id: string;
  company_id: string;
  status: CompanyStatus;
  current_period_end: string | null;
  cpf_cnpj?: string | null;
  created_at: string;

  manual_override?: boolean | null;
  blocked_reason?: string | null;
};

function calcNewEndDate(currentEnd: string | null, addDays: number) {
  const now = new Date();
  const base =
    currentEnd && !isNaN(new Date(currentEnd).getTime())
      ? new Date(currentEnd)
      : now;

  // se já venceu, soma a partir de hoje
  const start = base.getTime() < now.getTime() ? now : base;

  const out = new Date(start);
  out.setDate(out.getDate() + addDays);
  return out.toISOString();
}

// ✅ extrai mensagem do erro da Edge Function (quando ela retorna JSON {error:"..."})
function extractFunctionsErrorMessage(error: any): string {
  try {
    const body = error?.context?.body;
    if (body) {
      const parsed = typeof body === "string" ? JSON.parse(body) : body;
      if (parsed?.error) return parsed.error;
      return typeof body === "string" ? body : JSON.stringify(body);
    }
  } catch {}
  return error?.message || "Edge Function returned a non-2xx status code";
}

export default function AdminMaster() {
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<CompanyData[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);

  // Criar Empresa
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newCompany, setNewCompany] = useState({
    name: "",
    email: "",
    password: "mudar123",
    days: 30,
  });

  // Editar Manualmente
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editCompany, setEditCompany] = useState<CompanyData | null>(null);
  const [customDays, setCustomDays] = useState<number>(30);
  const [customDate, setCustomDate] = useState<string>(""); // yyyy-mm-dd
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    checkUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkUser() {
    console.log("[AdminMaster] checkUser() start");
    const { data, error } = await supabase.auth.getUser();

    if (error) console.log("[AdminMaster] getUser error:", error);

    const user = data?.user;
    const emailLogado = user?.email?.trim().toLowerCase();
    const emailMestre = SUPER_ADMIN_EMAIL.trim().toLowerCase();

    console.log("[AdminMaster] email logado:", emailLogado);

    if (emailLogado === emailMestre) {
      setIsAuthorized(true);
      await fetchCompanies();
    } else {
      setLoading(false);
    }
  }

  async function fetchCompanies() {
    console.log("[AdminMaster] fetchCompanies()");
    setLoading(true);

    const { data, error } = await supabase
      .from("company_subscriptions")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[AdminMaster] Erro ao buscar empresas:", error);
      toast({
        title: "Erro ao carregar lista",
        description: error.message,
        variant: "destructive",
      });
    } else {
      console.log("[AdminMaster] companies loaded:", data?.length ?? 0);
      setCompanies((data || []) as CompanyData[]);
    }

    setLoading(false);
  }

  // ✅ logs completos ao criar empresa
  async function handleCreateCompany() {
    if (!newCompany.name || !newCompany.email || !newCompany.password) {
      toast({
        title: "Erro",
        description: "Preencha todos os campos.",
        variant: "destructive",
      });
      return;
    }

    setCreating(true);
    try {
      const { data: sessionData, error: sessErr } =
        await supabase.auth.getSession();
      if (sessErr) throw sessErr;

      const token = sessionData.session?.access_token;

      console.log("[CreateCompany] session exists:", !!sessionData.session);
      console.log("[CreateCompany] token exists:", !!token);

      if (!token) throw new Error("Sem access_token. Faça logout e login.");

      const payload = {
        companyName: newCompany.name,
        adminEmail: newCompany.email,
        adminPassword: newCompany.password,
        daysGiven: Number(newCompany.days),
      };

      console.log("[CreateCompany] payload:", payload);

      const { data, error } = await supabase.functions.invoke(
        "admin-create-tenant",
        {
          body: payload,
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      console.log("[CreateCompany] returned data:", data);
      console.log("[CreateCompany] returned error:", error);

      if (error) {
        const msg = extractFunctionsErrorMessage(error);
        console.error("[CreateCompany] EDGE ERROR FULL:", error);
        console.error("[CreateCompany] EDGE ERROR MSG:", msg);
        throw new Error(msg);
      }

      if ((data as any)?.error) throw new Error((data as any).error);

      toast({
        title: "Sucesso!",
        description: `Empresa ${data?.companyId ?? ""} criada. Login: ${newCompany.email}`,
        className: "bg-green-600 text-white border-none",
      });

      setIsCreateOpen(false);
      setNewCompany({ name: "", email: "", password: "mudar123", days: 30 });
      await fetchCompanies();
    } catch (e: any) {
      console.error("[CreateCompany] ERRO FINAL:", e);
      toast({
        title: "Falha ao criar",
        description: e?.message || "Verifique o console (F12) para detalhes.",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  }

  async function addDays(company: CompanyData, days: number) {
    const iso = calcNewEndDate(company.current_period_end, days);

    const { error } = await supabase
      .from("company_subscriptions")
      .update({
        current_period_end: iso,
        status: "active",
        manual_override: true,
      })
      .eq("company_id", company.company_id);

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Sucesso", description: `+${days} dias em ${company.company_id}` });
      await fetchCompanies();
    }
  }

  async function setManualEndDate(companyId: string, isoDate: string) {
    const { error } = await supabase
      .from("company_subscriptions")
      .update({
        current_period_end: isoDate,
        status: "active",
        manual_override: true,
      })
      .eq("company_id", companyId);

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Atualizado", description: "Vencimento ajustado manualmente." });
      await fetchCompanies();
    }
  }

  async function blockCompany(companyId: string) {
    const { error } = await supabase
      .from("company_subscriptions")
      .update({
        status: "blocked_manual",
        blocked_reason: "Bloqueio administrativo pelo Super Admin",
        manual_override: true,
      })
      .eq("company_id", companyId);

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Bloqueado", description: "Empresa bloqueada." });
      await fetchCompanies();
    }
  }

  async function unblockCompany(companyId: string) {
    const { error } = await supabase
      .from("company_subscriptions")
      .update({
        status: "active",
        blocked_reason: null,
        manual_override: true,
      })
      .eq("company_id", companyId);

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Liberado", description: "Empresa liberada." });
      await fetchCompanies();
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const filtered = useMemo(() => {
    return companies.filter(
      (c) =>
        c.company_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.cpf_cnpj || "").includes(searchTerm)
    );
  }, [companies, searchTerm]);

  // Tela de acesso negado
  if (!loading && !isAuthorized) {
    return (
      <div className="flex h-screen items-center justify-center flex-col gap-6 text-center p-4 bg-gray-50">
        <div className="bg-red-100 p-6 rounded-full">
          <ShieldAlert className="h-16 w-16 text-red-600" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">ACESSO RESTRITO</h1>
          <p className="text-gray-500 mt-2 max-w-md mx-auto">
            Esta área é exclusiva para o Super Admin.
          </p>
        </div>
        <div className="flex gap-4">
          <Button variant="outline" onClick={() => (window.location.href = "/")}>
            Voltar ao Início
          </Button>
          <Button variant="destructive" onClick={handleLogout}>
            Sair da Conta
          </Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="animate-spin h-10 w-10 text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-in fade-in max-w-7xl mx-auto">
      {/* MODAL EDITAR */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar assinatura</DialogTitle>
            <DialogDescription>
              Some dias ou defina um vencimento manual para a empresa.
            </DialogDescription>
          </DialogHeader>

          {!editCompany ? null : (
            <div className="space-y-4 py-2">
              <div className="text-sm">
                <div className="font-semibold">Empresa</div>
                <div className="text-muted-foreground break-all">
                  {editCompany.company_id}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Adicionar dias</Label>
                  <Input
                    type="number"
                    value={customDays}
                    onChange={(e) => setCustomDays(Number(e.target.value))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Definir vencimento</Label>
                  <Input
                    type="date"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setIsEditOpen(false);
                    setEditCompany(null);
                    setCustomDate("");
                    setCustomDays(30);
                  }}
                >
                  Cancelar
                </Button>

                <Button
                  variant="outline"
                  disabled={savingEdit}
                  onClick={async () => {
                    if (!editCompany) return;
                    if (!customDays || customDays <= 0) {
                      toast({
                        title: "Atenção",
                        description: "Informe dias > 0",
                        variant: "destructive",
                      });
                      return;
                    }
                    setSavingEdit(true);
                    await addDays(editCompany, customDays);
                    setSavingEdit(false);
                    setIsEditOpen(false);
                    setEditCompany(null);
                    setCustomDate("");
                    setCustomDays(30);
                  }}
                >
                  {savingEdit ? (
                    <Loader2 className="animate-spin h-4 w-4 mr-2" />
                  ) : null}
                  Somar dias
                </Button>

                <Button
                  disabled={savingEdit}
                  onClick={async () => {
                    if (!editCompany) return;
                    if (!customDate) {
                      toast({
                        title: "Atenção",
                        description: "Selecione uma data.",
                        variant: "destructive",
                      });
                      return;
                    }
                    const iso = new Date(`${customDate}T23:59:59`).toISOString();

                    setSavingEdit(true);
                    await setManualEndDate(editCompany.company_id, iso);
                    setSavingEdit(false);

                    setIsEditOpen(false);
                    setEditCompany(null);
                    setCustomDate("");
                    setCustomDays(30);
                  }}
                >
                  {savingEdit ? (
                    <Loader2 className="animate-spin h-4 w-4 mr-2" />
                  ) : null}
                  Definir vencimento
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-xl shadow-sm border">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2 rounded-lg">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Super Admin</h1>
            <p className="text-sm text-gray-500">Gerenciamento Mestre</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* MODAL DE CRIAÇÃO */}
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 font-semibold shadow-md">
                <PlusCircle className="h-5 w-5" /> Nova Empresa
              </Button>
            </DialogTrigger>

            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nova Empresa</DialogTitle>
                <DialogDescription>
                  Crie um novo ambiente completo (login + assinatura) para um cliente.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Nome da Empresa</Label>
                  <Input
                    placeholder="Ex: Pizzaria do João"
                    value={newCompany.name}
                    onChange={(e) =>
                      setNewCompany({ ...newCompany, name: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Email do Admin</Label>
                  <Input
                    placeholder="cliente@email.com"
                    value={newCompany.email}
                    onChange={(e) =>
                      setNewCompany({ ...newCompany, email: e.target.value })
                    }
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Senha Inicial</Label>
                    <Input
                      value={newCompany.password}
                      onChange={(e) =>
                        setNewCompany({ ...newCompany, password: e.target.value })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Dias Liberados</Label>
                    <Input
                      type="number"
                      value={newCompany.days}
                      onChange={(e) =>
                        setNewCompany({ ...newCompany, days: Number(e.target.value) })
                      }
                    />
                  </div>
                </div>

                <Button
                  onClick={handleCreateCompany}
                  disabled={creating}
                  className="w-full"
                >
                  {creating ? (
                    <Loader2 className="animate-spin mr-2 h-4 w-4" />
                  ) : (
                    <Building2 className="mr-2 h-4 w-4" />
                  )}
                  {creating ? "Criando..." : "Criar Acesso"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Button variant="ghost" size="icon" onClick={handleLogout} title="Sair">
            <LogOut className="h-5 w-5 text-red-500" />
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por ID ou CPF..."
            className="pl-8 bg-white"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <Button
          onClick={fetchCompanies}
          variant="secondary"
          className="bg-white border hover:bg-gray-50"
        >
          Atualizar
        </Button>
      </div>

      {/* Tabela */}
      <Card className="overflow-hidden border shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-gray-50">
              <TableRow>
                <TableHead className="font-semibold">Empresa (ID)</TableHead>
                <TableHead className="font-semibold">CPF/CNPJ</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="font-semibold">Vencimento</TableHead>
                <TableHead className="text-right font-semibold">Ações</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-gray-500">
                    Nenhuma empresa encontrada.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((company) => (
                  <TableRow key={company.id} className="hover:bg-gray-50/50">
                    <TableCell className="font-medium text-gray-900">
                      {company.company_id}
                    </TableCell>

                    <TableCell className="text-gray-500 font-mono text-xs">
                      {company.cpf_cnpj || "—"}
                    </TableCell>

                    <TableCell>
                      <Badge
                        variant={company.status === "active" ? "default" : "destructive"}
                        className="capitalize"
                      >
                        {company.status === "blocked_manual" ? "Bloqueado" : company.status}
                      </Badge>
                    </TableCell>

                    <TableCell className="text-gray-700">
                      {company.current_period_end
                        ? format(new Date(company.current_period_end), "dd/MM/yyyy", {
                            locale: ptBR,
                          })
                        : "—"}
                    </TableCell>

                    <TableCell className="text-right space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        onClick={() => {
                          setEditCompany(company);
                          setCustomDays(30);
                          setCustomDate("");
                          setIsEditOpen(true);
                        }}
                        title="Editar manualmente"
                      >
                        <Pencil className="h-4 w-4 mr-1" /> Editar
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 border-green-200 text-green-700 hover:bg-green-50 hover:text-green-800"
                        onClick={() => addDays(company, 30)}
                        title="Adicionar 30 dias"
                      >
                        <CalendarPlus className="h-4 w-4 mr-1" /> +30 Dias
                      </Button>

                      {company.status === "blocked_manual" ? (
                        <Button
                          size="sm"
                          className="h-8"
                          onClick={() => unblockCompany(company.company_id)}
                          title="Liberar empresa"
                        >
                          <Unlock className="h-4 w-4 mr-1" /> Liberar
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-8"
                          onClick={() => blockCompany(company.company_id)}
                          title="Bloquear empresa"
                        >
                          <Ban className="h-4 w-4 mr-1" /> Bloquear
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
