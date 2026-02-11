"use client";
import { useState, useEffect } from "react";
import {
  Search,
  Edit2,
  Save,
  X,
  Trash2,
  Loader2,
  UserPlus,
  KeyRound,
  UserCog,
  AlertTriangle,
} from "lucide-react";
import { useAuth, AppRole } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface Employee {
  id: string;
  name: string;
  email?: string;
  phone?: string | null;
  role: AppRole;
  active?: boolean;
}

export default function Funcionarios() {
  const { isAdmin } = useAuth();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<{
    role: AppRole;
    phone: string;
    name: string;
  } | null>(null);

  const [deleteEmployee, setDeleteEmployee] = useState<Employee | null>(null);

  const [newEmployee, setNewEmployee] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    role: "vendedor" as AppRole,
  });

  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    setIsLoading(true);
    try {
      const { data: profiles, error: profilesError } = await (supabase
        .from("profiles") as any)
        .select(`*`)
        .eq("active", true)
        .order("name");

      if (profilesError) throw profilesError;

      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("*");

      if (rolesError) throw rolesError;

      const formatted: Employee[] = (profiles || []).map((p: any) => {
        const roleEntry = roles?.find((r: any) => r.user_id === p.id);
        const finalRole =
          (roleEntry?.role as AppRole) || (p.role as AppRole) || "vendedor";

        return {
          id: p.id,
          name: p.name || "Sem Nome",
          phone: p.phone,
          role: finalRole,
          active: p.active,
        };
      });

      setEmployees(formatted);
    } catch (error: any) {
      console.error("Erro ao buscar:", error);
      toast.error("Erro ao carregar lista.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateEmployee = async () => {
    if (!isAdmin) {
      toast.error("Apenas administradores podem cadastrar.");
      return;
    }

    if (!newEmployee.name || !newEmployee.email) {
      toast.error("Preencha Nome e E-mail.");
      return;
    }

    const finalPassword =
      newEmployee.password.trim() === "" ? "123456" : newEmployee.password;

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: newEmployee.email,
        password: finalPassword,
        options: {
          data: { name: newEmployee.name, phone: newEmployee.phone },
        },
      });

      if (authError) {
        if (authError.message?.includes("already registered")) {
          toast.error("E-mail em uso. O usuário pode estar arquivado.");
          return;
        }
        throw authError;
      }

      const userId = authData.user?.id;

      if (userId) {
        // dá um tempinho pro trigger/criação do profile acontecer
        await new Promise((resolve) => setTimeout(resolve, 1500));

        await (supabase.from("profiles") as any).upsert({
          id: userId,
          name: newEmployee.name,
          phone: newEmployee.phone,
          role: newEmployee.role,
          active: true,
        });

        await supabase
          .from("user_roles")
          .upsert(
            { user_id: userId, role: newEmployee.role },
            { onConflict: "user_id" }
          );

        // ✅ CORRIGIDO: cast no supabase ANTES do .from()
        if (newEmployee.role === "vendedor") {
          await (supabase as any)
            .from("sellers")
            .upsert({ name: newEmployee.name }, { onConflict: "name" });
        }

        toast.success("Funcionário criado!", {
          description: `Senha: ${finalPassword}`,
        });

        setIsDialogOpen(false);
        setNewEmployee({
          name: "",
          email: "",
          password: "",
          phone: "",
          role: "vendedor",
        });
        fetchEmployees();
      }
    } catch (error: any) {
      console.error(error);
      toast.error("Erro ao cadastrar: " + (error?.message || "desconhecido"));
    }
  };

  const startEditing = (employee: Employee) => {
    if (!isAdmin) {
      toast.error("Apenas administradores podem editar.");
      return;
    }

    setEditingId(employee.id);
    setEditData({
      role: employee.role,
      phone: employee.phone || "",
      name: employee.name,
    });
  };

  const saveEditing = async (employee: Employee) => {
    if (!isAdmin) {
      toast.error("Apenas administradores podem salvar alterações.");
      return;
    }
    if (!editData) return;

    try {
      await (supabase.from("profiles") as any)
        .update({
          name: editData.name,
          phone: editData.phone,
          role: editData.role,
        })
        .eq("id", employee.id);

      await supabase
        .from("user_roles")
        .upsert(
          { user_id: employee.id, role: editData.role },
          { onConflict: "user_id" }
        );

      toast.success("Dados atualizados!");
      setEditingId(null);
      setEditData(null);
      fetchEmployees();
    } catch (error: any) {
      console.error(error);
      toast.error("Erro ao atualizar.");
    }
  };

  const handleDeleteEmployee = async () => {
    if (!isAdmin) {
      toast.error("Apenas administradores podem arquivar.");
      return;
    }

    const employeeToDelete = deleteEmployee;
    if (!employeeToDelete) return;

    try {
      const { error: rpcError } = await (supabase.rpc as any)("archive_user", {
        target_user_id: employeeToDelete.id,
      });

      if (rpcError) throw rpcError;

      // ✅ CORRIGIDO: cast no supabase ANTES do .from()
      await (supabase as any)
        .from("sellers")
        .delete()
        .eq("name", employeeToDelete.name);

      toast.success("Funcionário arquivado!");

      setEmployees((prev) => prev.filter((e) => e.id !== employeeToDelete.id));
      setDeleteEmployee(null);
    } catch (error: any) {
      console.error(error);
      toast.error("Erro ao arquivar.");
    }
  };

  const filteredEmployees = employees.filter(
    (e) =>
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      (e.phone && e.phone.includes(search))
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <UserCog className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">
              Equipe Ativa
            </h1>
            <p className="text-sm text-muted-foreground">
              Gerenciamento de acesso
            </p>
          </div>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto gap-2" disabled={!isAdmin}>
              <UserPlus className="h-4 w-4" /> Novo Funcionário
            </Button>
          </DialogTrigger>

          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Cadastrar Funcionário</DialogTitle>
              <DialogDescription>
                Crie um acesso. Senha padrão: 123456
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome Completo *</Label>
                  <Input
                    value={newEmployee.name}
                    onChange={(e) =>
                      setNewEmployee({ ...newEmployee, name: e.target.value })
                    }
                    placeholder="Ex: João Silva"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input
                    value={newEmployee.phone}
                    onChange={(e) =>
                      setNewEmployee({ ...newEmployee, phone: e.target.value })
                    }
                    placeholder="(00) 00000-0000"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>E-mail (Login) *</Label>
                <Input
                  type="email"
                  value={newEmployee.email}
                  onChange={(e) =>
                    setNewEmployee({ ...newEmployee, email: e.target.value })
                  }
                  placeholder="joao@empresa.com"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Senha (Opcional)</Label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="password"
                      className="pl-10"
                      value={newEmployee.password}
                      onChange={(e) =>
                        setNewEmployee({
                          ...newEmployee,
                          password: e.target.value,
                        })
                      }
                      placeholder="Padrão: 123456"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Cargo *</Label>
                  <Select
                    value={newEmployee.role}
                    onValueChange={(v) =>
                      setNewEmployee({ ...newEmployee, role: v as AppRole })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vendedor">Vendedor</SelectItem>
                      <SelectItem value="admin">Administrador</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreateEmployee} disabled={!isAdmin}>
                Cadastrar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar funcionário..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum funcionário ativo encontrado.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {filteredEmployees.map((employee) => (
                  <TableRow key={employee.id}>
                    <TableCell className="font-medium">
                      {editingId === employee.id ? (
                        <Input
                          value={editData?.name ?? ""}
                          onChange={(e) =>
                            setEditData({ ...editData!, name: e.target.value })
                          }
                          className="h-8"
                        />
                      ) : (
                        employee.name
                      )}
                    </TableCell>

                    <TableCell>
                      {editingId === employee.id ? (
                        <Select
                          value={editData?.role}
                          onValueChange={(v) =>
                            setEditData({ ...editData!, role: v as AppRole })
                          }
                        >
                          <SelectTrigger className="w-32 h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="vendedor">Vendedor</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge
                          variant={employee.role === "admin" ? "default" : "secondary"}
                        >
                          {employee.role === "admin" ? "Admin" : "Vendedor"}
                        </Badge>
                      )}
                    </TableCell>

                    <TableCell>
                      {editingId === employee.id ? (
                        <Input
                          value={editData?.phone ?? ""}
                          onChange={(e) =>
                            setEditData({ ...editData!, phone: e.target.value })
                          }
                          className="h-8 w-32"
                        />
                      ) : (
                        employee.phone || "-"
                      )}
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {editingId === employee.id ? (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-green-600 h-8 w-8"
                              onClick={() => saveEditing(employee)}
                              disabled={!isAdmin}
                            >
                              <Save className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => {
                                setEditingId(null);
                                setEditData(null);
                              }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => startEditing(employee)}
                              disabled={!isAdmin}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive h-8 w-8"
                              onClick={() => setDeleteEmployee(employee)}
                              disabled={!isAdmin}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={!!deleteEmployee}
        onOpenChange={(open) => {
          if (!open) setDeleteEmployee(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" /> Arquivar Funcionário?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Isso mudará o e-mail de <strong>{deleteEmployee?.name}</strong> no
              banco para liberar o original.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteEmployee}
              className="bg-destructive hover:bg-destructive/90"
              disabled={!isAdmin}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
