import { useState, useEffect } from "react";
import {
  Users,
  Search,
  ShieldCheck,
  Phone,
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

// ✅ ID FIXO DA EMPRESA PRINCIPAL
// Garante que todo funcionário criado aqui entre na empresa correta
const MAIN_COMPANY_ID = "3dc76d55-2ea8-48da-9dbf-ffae7ede260d";

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
      // 1. Busca perfis 
      // O RLS do banco já deve filtrar apenas os da empresa do usuário logado,
      // mas como garantimos que todos estão na mesma empresa, vai funcionar.
      const { data: profiles, error: profilesError } = await (
        supabase.from("profiles") as any
      )
        .select(`*`)
        .order("name");

      if (profilesError) throw profilesError;

      // 2. Busca cargos 
      const { data: roles } = await supabase.from("user_roles").select("*");

      // 3. Formata e filtra 
      const formatted: Employee[] = (profiles || [])
        .map((p: any) => {
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
        })
        .filter((p) => p.active !== false);

      setEmployees(formatted);
    } catch (error: any) {
      console.error("Erro ao buscar:", error);
      toast.error("Erro ao carregar lista de funcionários.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateEmployee = async () => {
    if (!newEmployee.name || !newEmployee.email) {
      toast.error("Preencha Nome e E-mail.");
      return;
    }

    const finalPassword =
      newEmployee.password.trim() === "" ? "123456" : newEmployee.password;

    try {
      // 1. Cria usuário no Auth do Supabase
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: newEmployee.email,
        password: finalPassword,
        options: {
          data: { 
            name: newEmployee.name, 
            phone: newEmployee.phone,
            // ✅ FORÇA EMPRESA NOS METADADOS (Trigger do banco usa isso)
            company_id: MAIN_COMPANY_ID 
          },
        },
      });

      if (authError) {
        if (authError.message.includes("already registered")) {
          toast.error("E-mail em uso. O usuário pode estar arquivado.");
          return;
        }
        throw authError;
      }

      const userId = authData.user?.id;

      if (userId) {
        // Pequeno delay para garantir que a trigger do banco rodou (se houver)
        await new Promise((resolve) => setTimeout(resolve, 1500));

        // 2. Garante/Atualiza o perfil com o ID da empresa correto
        await (supabase.from("profiles") as any).upsert({
          id: userId,
          name: newEmployee.name,
          phone: newEmployee.phone,
          role: newEmployee.role,
          active: true,
          company_id: MAIN_COMPANY_ID // <--- LINHA CRUCIAL
        });

        // 3. Cria a role (permissão)
        await supabase
            .from("user_roles")
            .upsert(
            { user_id: userId, role: newEmployee.role },
            { onConflict: "user_id" }
            );

        // 4. Se for vendedor, adiciona na tabela sellers (para comissões, etc)
        if (newEmployee.role === "vendedor") {
          await (supabase.from("sellers") as any).upsert(
            { name: newEmployee.name },
            { onConflict: "name" }
          );
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
      toast.error("Erro ao cadastrar: " + error.message);
    }
  };

  const startEditing = (employee: Employee) => {
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
      const { error: profileError } = await (supabase.from("profiles") as any)
        .update({
          name: editData.name,
          phone: editData.phone,
          role: editData.role,
        })
        .eq("id", employee.id);

      if (profileError) throw profileError;

      const { error: roleError } = await supabase
        .from("user_roles")
        .upsert(
          { user_id: employee.id, role: editData.role },
          { onConflict: "user_id" }
        );

      if (roleError) throw roleError;

      toast.success("Cargo atualizado com sucesso!");
      setEditingId(null);
      setEditData(null);
      
      await fetchEmployees(); 
      
    } catch (error: any) {
      console.error("Erro na atualização:", error);
      toast.error("Erro ao atualizar: " + (error.message || "Verifique as permissões"));
    }
  };

  const handleDeleteEmployee = async () => {
    const employeeToDelete = deleteEmployee;
    if (!employeeToDelete) return;

    try {
      // Chama RPC para arquivar (mudar email para liberar o original)
      const { error: rpcError } = await (supabase.rpc as any)("archive_user", {
        target_user_id: employeeToDelete.id,
      });

      if (rpcError) throw rpcError;

      await (supabase.from("sellers") as any)
        .delete()
        .eq("name", employeeToDelete.name);

      toast.success("Funcionário arquivado!");

      setEmployees((prev) =>
        prev.filter((e) => e.id !== employeeToDelete.id)
      );
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
            <Button className="w-full sm:w-auto gap-2">
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
              <Button
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button onClick={handleCreateEmployee}>Cadastrar</Button>
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
                          value={editData?.name}
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
                          variant={
                            employee.role === "admin" ? "default" : "secondary"
                          }
                        >
                          {employee.role === "admin" ? "Admin" : "Vendedor"}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {editingId === employee.id ? (
                        <Input
                          value={editData?.phone}
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
                            >
                              <Save className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => setEditingId(null)}
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
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive h-8 w-8"
                              onClick={() => setDeleteEmployee(employee)}
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
        onOpenChange={() => setDeleteEmployee(null)}
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
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}