"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import * as XLSX from "xlsx";
import {
  Users,
  Plus,
  Search,
  Edit,
  Trash2,
  Phone,
  MapPin,
  Loader2,
  FileText,
  MessageCircle,
  Copy,
  Upload,
  Filter,
  X,
  CheckCircle2,
  Download,
  Wallet,     // Novo ícone
  CheckCheck, // Novo ícone
  Calendar,   // Novo ícone
  DollarSign  // Novo ícone
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

// --- TIPAGEM ---
interface Customer {
  id: string;
  name: string;
  document: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  status: string;
  created_at: string;
}

interface DebtEntry {
  id: string;
  created_at: string;
  due_date: string | null;
  description: string;
  total_amount: number;
  status: string;
}

// --- UTILS ---
const onlyDigits = (v: string) => (v || "").replace(/\D/g, "");
const normalizeNullable = (v: string | undefined | null) => {
  const t = (v ?? "").trim();
  return t.length ? t : null;
};

const formatPhone = (value: string) => {
  if (!value) return "";
  const numbers = onlyDigits(value).slice(0, 11);
  if (numbers.length <= 10) {
    return numbers.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3").trim();
  }
  return numbers.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3").trim();
};

const formatDocument = (value: string) => {
  if (!value) return "";
  const numbers = onlyDigits(value).slice(0, 14);
  if (numbers.length <= 11) {
    return numbers
      .replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, "$1.$2.$3-$4")
      .trim();
  }
  return numbers
    .replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, "$1.$2.$3/$4-$5")
    .trim();
};

const formatCurrency = (val: number) => 
  val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copiado!");
  } catch {
    toast.error("Não foi possível copiar.");
  }
};

const openWhatsApp = (phone: string, name?: string) => {
  const clean = onlyDigits(phone);
  if (clean.length < 10) return toast.error("Telefone inválido.");
  const msg = encodeURIComponent(`Olá ${name || ""}!`);
  window.open(`https://wa.me/55${clean}?text=${msg}`, "_blank");
};

// --- SCHEMA ---
const customerSchema = z.object({
  name: z.string().min(2, "Nome é obrigatório (min 2 letras)").max(100),

  document: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((v) => {
      const d = onlyDigits(v || "");
      return d.length === 0 || d.length === 11 || d.length === 14;
    }, "CPF/CNPJ inválido (precisa ter 11 ou 14 dígitos)."),

  phone: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((v) => {
      const d = onlyDigits(v || "");
      return d.length === 0 || (d.length >= 10 && d.length <= 11);
    }, "Telefone inválido (DDD + número)."),

  address: z.string().optional().or(z.literal("")),
  city: z.string().optional().or(z.literal("")),
  status: z.enum(["ativo", "inativo"]).default("ativo"),
});

type CustomerFormData = z.infer<typeof customerSchema>;

// --- IMPORT ---
type ImportRow = {
  name: string;
  document?: string;
  phone?: string;
  address?: string;
  city?: string;
  status?: "ativo" | "inativo";
};

const getVal = (obj: any, keys: string[]) => {
  const lower = Object.keys(obj || {}).reduce<Record<string, any>>((acc, k) => {
    acc[k.toLowerCase().trim()] = obj[k];
    return acc;
  }, {});
  for (const k of keys) {
    const v = lower[k.toLowerCase()];
    if (v !== undefined && v !== null) return String(v).trim();
  }
  return "";
};

export default function Clientes() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Estados de CRUD
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deleteCustomer, setDeleteCustomer] = useState<Customer | null>(null);

  // Estados Financeiros (Carteira)
  const [financialModalOpen, setFinancialModalOpen] = useState(false);
  const [targetClient, setTargetClient] = useState<Customer | null>(null);
  const [clientDebts, setClientDebts] = useState<DebtEntry[]>([]);
  const [loadingDebts, setLoadingDebts] = useState(false);

  // Estados de Filtro e Importação
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "ativo" | "inativo">("all");
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);

  const form = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: "",
      document: "",
      phone: "",
      address: "",
      city: "",
      status: "ativo",
    },
  });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim().toLowerCase()), 200);
    return () => clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.from("customers").select("*").order("name");
      if (error) throw error;
      setCustomers((data as Customer[]) || []);
    } catch (error) {
      console.error("Erro ao buscar clientes:", error);
      toast.error("Erro ao carregar lista de clientes");
    } finally {
      setIsLoading(false);
    }
  };

  // --- LÓGICA FINANCEIRA (CARTEIRA) ---
  const openFinancialModal = async (customer: Customer) => {
    setTargetClient(customer);
    setFinancialModalOpen(true);
    setLoadingDebts(true);
    try {
      // Busca débitos (vendas a prazo não pagas)
      // Tenta bater pelo nome do cliente (entity_name)
      const { data, error } = await supabase
        .from("financial_entries")
        .select("id, created_at, due_date, description, total_amount, status")
        .eq("entity_name", customer.name) 
        .eq("type", "receivable")
        .neq("status", "paid")
        .order("due_date", { ascending: true });

      if (error) throw error;
      setClientDebts(data || []);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao buscar débitos do cliente.");
    } finally {
      setLoadingDebts(false);
    }
  };

  const handlePayDebt = async (debtId: string, amount: number) => {
    try {
      const { error } = await supabase
        .from("financial_entries")
        .update({
          status: "paid",
          paid_amount: amount, // Assume pagamento total
          updated_at: new Date().toISOString()
        })
        .eq("id", debtId);

      if (error) throw error;

      toast.success("Pagamento recebido!");
      // Atualiza lista local removendo o item pago
      setClientDebts((prev) => prev.filter((d) => d.id !== debtId));
    } catch (err) {
      console.error(err);
      toast.error("Erro ao registrar pagamento.");
    }
  };

  // --- LÓGICA CRUD ---
  const openNewDialog = () => {
    setEditingCustomer(null);
    form.reset({
      name: "",
      document: "",
      phone: "",
      address: "",
      city: "",
      status: "ativo",
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (customer: Customer) => {
    setEditingCustomer(customer);
    form.reset({
      name: customer.name,
      document: customer.document || "",
      phone: customer.phone || "",
      address: customer.address || "",
      city: customer.city || "",
      status: (customer.status as "ativo" | "inativo") || "ativo",
    });
    setIsDialogOpen(true);
  };

  const onSubmit = async (data: CustomerFormData) => {
    try {
      const payload = {
        name: data.name.trim(),
        document: normalizeNullable(data.document),
        phone: normalizeNullable(data.phone),
        address: normalizeNullable(data.address),
        city: normalizeNullable(data.city),
        status: data.status,
      };

      if (editingCustomer) {
        const { error } = await supabase.from("customers").update(payload).eq("id", editingCustomer.id);
        if (error) throw error;
        toast.success("Cliente atualizado com sucesso!");
      } else {
        const { error } = await supabase.from("customers").insert(payload);
        if (error) throw error;
        toast.success("Cliente cadastrado com sucesso!");
      }

      setIsDialogOpen(false);
      setEditingCustomer(null);
      await fetchCustomers();
    } catch (error: any) {
      console.error("Erro ao salvar cliente:", error);
      toast.error("Erro ao salvar: " + (error.message || "Verifique os dados"));
    }
  };

  const handleDelete = async () => {
    if (!deleteCustomer) return;

    try {
      const { error } = await supabase.from("customers").delete().eq("id", deleteCustomer.id);
      if (error) throw error;

      toast.success("Cliente excluído!");
      setDeleteCustomer(null);
      await fetchCustomers();
    } catch (error) {
      console.error("Erro ao excluir cliente:", error);
      toast.error("Não foi possível excluir o cliente.");
    }
  };

  // --- LÓGICA FILTROS ---
  const filteredCustomers = useMemo(() => {
    const s = debouncedSearch;

    const base =
      statusFilter === "all"
        ? customers
        : customers.filter((c) => c.status === statusFilter);

    if (!s) return base;

    return base.filter((c) => {
      const name = (c.name || "").toLowerCase();
      const city = (c.city || "").toLowerCase();
      const phone = (c.phone || "").toLowerCase();
      const doc = (c.document || "").toLowerCase();

      return (
        name.includes(s) ||
        city.includes(s) ||
        phone.includes(s) ||
        doc.includes(s) ||
        onlyDigits(phone).includes(onlyDigits(s)) ||
        onlyDigits(doc).includes(onlyDigits(s))
      );
    });
  }, [customers, debouncedSearch, statusFilter]);

  const total = customers.length;
  const active = customers.filter((c) => c.status === "ativo").length;
  const inactive = customers.filter((c) => c.status === "inativo").length;

  // --- IMPORTAÇÃO ---
  const downloadModeloClientesCSV = () => {
    const csv =
      "nome,telefone,documento,endereco,cidade,status\n" +
      "João da Silva,(92) 99999-9999,000.000.000-00,Rua A 123,Manaus,ativo\n" +
      "Maria Souza,(92) 98888-8888,00.000.000/0001-00,Rua B 500,Manaus,inativo\n";

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo_clientes.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileImport = async (file: File) => {
    try {
      const ext = (file.name.split(".").pop() || "").toLowerCase();

      if (ext === "csv") {
        const text = await file.text();
        const lines = text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);

        if (lines.length < 2) {
          toast.error("CSV vazio ou inválido.");
          return;
        }

        const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
        const idx = (name: string) => header.indexOf(name);

        const rows: ImportRow[] = lines
          .slice(1)
          .map((line) => {
            const cols = line.split(",").map((c) => c.trim());
            const name = cols[idx("nome")] || cols[idx("name")] || "";
            const phone = cols[idx("telefone")] || cols[idx("whatsapp")] || cols[idx("phone")] || "";
            const document =
              cols[idx("documento")] || cols[idx("cpf")] || cols[idx("cnpj")] || cols[idx("document")] || "";
            const address = cols[idx("endereco")] || cols[idx("endereço")] || cols[idx("address")] || "";
            const city = cols[idx("cidade")] || cols[idx("city")] || "";
            const statusRaw = (cols[idx("status")] || "ativo").toLowerCase();
            const status: "ativo" | "inativo" = statusRaw.includes("in") ? "inativo" : "ativo";

            return {
              name: name.trim(),
              document: formatDocument(document),
              phone: formatPhone(phone),
              address: address.trim(),
              city: city.trim(),
              status,
            };
          })
          .filter((r) => r.name.length >= 2);

        if (rows.length === 0) {
          toast.error("Nenhuma linha válida encontrada. Verifique a coluna 'nome'.");
          return;
        }

        setImportRows(rows);
        toast.success(`Arquivo lido: ${rows.length} clientes prontos para importar.`);
        return;
      }

      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws, { defval: "" }) as any[];

      const rows: ImportRow[] = json
        .map((r) => {
          const name = getVal(r, ["nome", "name"]);
          const document = getVal(r, ["documento", "cpf", "cnpj", "document"]);
          const phone = getVal(r, ["telefone", "whatsapp", "phone", "celular"]);
          const address = getVal(r, ["endereco", "endereço", "address"]);
          const city = getVal(r, ["cidade", "city"]);
          const statusRaw = getVal(r, ["status"]).toLowerCase();
          const status: "ativo" | "inativo" = statusRaw.includes("in") ? "inativo" : "ativo";

          return {
            name: name.trim(),
            document: formatDocument(document),
            phone: formatPhone(phone),
            address: address.trim(),
            city: city.trim(),
            status,
          };
        })
        .filter((r) => r.name.length >= 2);

      if (rows.length === 0) {
        toast.error("Nenhuma linha válida encontrada. Verifique a coluna 'nome'.");
        return;
      }

      setImportRows(rows);
      toast.success(`Arquivo lido: ${rows.length} clientes prontos para importar.`);
    } catch (e) {
      console.error(e);
      toast.error("Falha ao ler arquivo. Use CSV/XLSX.");
    }
  };

  const handleConfirmImport = async () => {
    if (importRows.length === 0) return;

    setImporting(true);
    try {
      const seen = new Set<string>();
      const unique = importRows.filter((r) => {
        const k = `${r.name.toLowerCase()}|${onlyDigits(r.phone || "")}|${onlyDigits(r.document || "")}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

      const payload = unique.map((r) => ({
        name: r.name.trim(),
        document: normalizeNullable(r.document),
        phone: normalizeNullable(r.phone),
        address: normalizeNullable(r.address),
        city: normalizeNullable(r.city),
        status: r.status || "ativo",
      }));

      const { error } = await supabase.from("customers").insert(payload);
      if (error) throw error;

      toast.success(`Importação concluída: ${payload.length} clientes cadastrados!`);
      setImportRows([]);
      setImportOpen(false);
      await fetchCustomers();
    } catch (e: any) {
      console.error(e);
      toast.error("Erro ao importar: " + (e.message || "Verifique os dados"));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* HEADER */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Clientes</h1>
            <p className="text-sm text-muted-foreground">Gerencie sua base de clientes e cobranças</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:flex gap-2 w-full sm:w-auto">
          {/* Importar */}
          <Dialog open={importOpen} onOpenChange={setImportOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full sm:w-auto">
                <Upload className="h-4 w-4 mr-2" />
                Importar
              </Button>
            </DialogTrigger>

            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Importar Clientes (CSV/XLSX)</DialogTitle>
                <DialogDescription>
                  Colunas aceitas: <strong>nome</strong>, telefone/whatsapp, documento/cpf/cnpj,
                  endereco, cidade, status.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
                  <Button variant="outline" onClick={downloadModeloClientesCSV} className="w-full sm:w-auto">
                    <Download className="h-4 w-4 mr-2" />
                    Baixar modelo (CSV)
                  </Button>

                  <Input
                    className="w-full sm:w-auto"
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileImport(f);
                    }}
                  />
                </div>

                {importRows.length > 0 ? (
                  <div className="rounded-md border overflow-auto max-h-[320px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nome</TableHead>
                          <TableHead>Telefone</TableHead>
                          <TableHead>Documento</TableHead>
                          <TableHead>Cidade</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {importRows.slice(0, 20).map((r, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{r.name}</TableCell>
                            <TableCell>{r.phone || "-"}</TableCell>
                            <TableCell>{r.document || "-"}</TableCell>
                            <TableCell>{r.city || "-"}</TableCell>
                            <TableCell>
                              <Badge variant={r.status === "ativo" ? "default" : "secondary"}>{r.status}</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>

                    {importRows.length > 20 && (
                      <div className="p-2 text-xs text-muted-foreground">Mostrando 20 de {importRows.length}.</div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">Selecione um arquivo para ver a prévia.</div>
                )}

                <div className="flex flex-col sm:flex-row justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setImportRows([]);
                      setImportOpen(false);
                    }}
                  >
                    Fechar
                  </Button>

                  <Button
                    onClick={handleConfirmImport}
                    disabled={importRows.length === 0 || importing}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    {importing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Importando...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Confirmar Importação
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Novo Cliente */}
          <Dialog
            open={isDialogOpen}
            onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) setEditingCustomer(null);
            }}
          >
            <DialogTrigger asChild>
              <Button onClick={openNewDialog} className="w-full sm:w-auto">
                <Plus className="h-4 w-4 mr-2" />
                Novo Cliente
              </Button>
            </DialogTrigger>

            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingCustomer ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
                <DialogDescription>Apenas o nome é obrigatório.</DialogDescription>
              </DialogHeader>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome Completo *</FormLabel>
                        <FormControl>
                          <Input placeholder="Ex: João da Silva" {...field} className="h-12 text-base" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="document"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>CPF/CNPJ (Opcional)</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="000.000.000-00"
                              {...field}
                              className="h-12 text-base"
                              onChange={(e) => field.onChange(formatDocument(e.target.value))}
                              maxLength={18}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>WhatsApp (Opcional)</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="(00) 00000-0000"
                              {...field}
                              className="h-12 text-base"
                              onChange={(e) => field.onChange(formatPhone(e.target.value))}
                              maxLength={15}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Endereço (Opcional)</FormLabel>
                        <FormControl>
                          <Input placeholder="Rua, número, bairro" {...field} className="h-12 text-base" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Cidade (Opcional)</FormLabel>
                          <FormControl>
                            <Input placeholder="Ex: Manaus" {...field} className="h-12 text-base" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Status</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="h-12">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="ativo">Ativo</SelectItem>
                              <SelectItem value="inativo">Inativo</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:justify-end">
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} className="w-full sm:w-auto">
                      Cancelar
                    </Button>
                    <Button type="submit" className="w-full sm:w-auto">
                      {editingCustomer ? "Salvar Alterações" : "Cadastrar Cliente"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* SUMMARY */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de Clientes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{total}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Clientes Ativos</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">{active}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Inativos</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-muted-foreground">{inactive}</p>
          </CardContent>
        </Card>
      </div>

      {/* LISTA */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, documento, telefone ou cidade..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-12"
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                <SelectTrigger className="w-full sm:w-[180px] h-12">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="ativo">Somente Ativos</SelectItem>
                  <SelectItem value="inativo">Somente Inativos</SelectItem>
                </SelectContent>
              </Select>

              {statusFilter !== "all" && (
                <Button variant="outline" onClick={() => setStatusFilter("all")} className="h-12">
                  <X className="h-4 w-4 mr-2" />
                  Limpar
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mb-2" />
              <p>Carregando clientes...</p>
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">Nenhum cliente encontrado.</div>
          ) : (
            <>
              {/* MOBILE: CARDS */}
              <div className="grid gap-3 sm:hidden">
                {filteredCustomers.map((c) => (
                  <Card key={c.id} className="border shadow-sm">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-base leading-snug truncate">{c.name}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <Badge
                              variant={c.status === "ativo" ? "default" : "secondary"}
                              className={c.status === "ativo" ? "bg-emerald-600 hover:bg-emerald-700" : ""}
                            >
                              {c.status === "ativo" ? "Ativo" : "Inativo"}
                            </Badge>

                            {c.city && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {c.city}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex gap-1 shrink-0">
                          {/* BOTÃO CARTEIRA (MOBILE) */}
                          <Button 
                            size="icon" 
                            variant="outline" 
                            className="h-10 w-10 text-amber-600 border-amber-200 hover:bg-amber-50" 
                            onClick={() => openFinancialModal(c)} 
                            title="Carteira / Fiado"
                          >
                            <Wallet className="h-4 w-4" />
                          </Button>

                          <Button size="icon" variant="outline" className="h-10 w-10" onClick={() => openEditDialog(c)} title="Editar">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-10 w-10 text-destructive"
                            onClick={() => setDeleteCustomer(c)}
                            title="Excluir"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {c.phone ? (
                        <div className="flex items-center justify-between gap-2 bg-muted/30 rounded-lg p-3">
                          <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">WhatsApp</p>
                            <p className="font-medium flex items-center gap-2 truncate">
                              <Phone className="h-4 w-4 text-emerald-600" />
                              {c.phone}
                            </p>
                          </div>

                          <div className="flex gap-2 shrink-0">
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-10 w-10"
                              onClick={() => copyToClipboard(c.phone!)}
                              title="Copiar"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              className="h-10 w-10 bg-emerald-600 hover:bg-emerald-700"
                              onClick={() => openWhatsApp(c.phone!, c.name)}
                              title="WhatsApp"
                            >
                              <MessageCircle className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground">Sem telefone</div>
                      )}

                      {c.document ? (
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">Documento</p>
                            <p className="text-sm font-mono truncate flex items-center gap-2">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                              {c.document}
                            </p>
                          </div>
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-10 w-10 shrink-0"
                            onClick={() => copyToClipboard(c.document!)}
                            title="Copiar documento"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* DESKTOP/TABLET: TABELA */}
              <div className="hidden sm:block rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Documento</TableHead>
                      <TableHead>Contato</TableHead>
                      <TableHead>Localização</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {filteredCustomers.map((customer) => (
                      <TableRow key={customer.id}>
                        <TableCell className="font-medium">{customer.name}</TableCell>

                        <TableCell>
                          {customer.document ? (
                            <div className="flex items-center gap-2">
                              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                                <FileText className="h-3 w-3" /> {customer.document}
                              </span>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={() => copyToClipboard(customer.document!)}
                                title="Copiar documento"
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            "-"
                          )}
                        </TableCell>

                        <TableCell>
                          {customer.phone ? (
                            <div className="flex items-center gap-2">
                              <span className="flex items-center gap-1 text-sm">
                                <Phone className="h-3 w-3 text-emerald-600" />
                                {customer.phone}
                              </span>

                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={() => copyToClipboard(customer.phone!)}
                                title="Copiar telefone"
                              >
                                <Copy className="h-4 w-4" />
                              </Button>

                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-emerald-700"
                                onClick={() => openWhatsApp(customer.phone!, customer.name)}
                                title="Abrir WhatsApp"
                              >
                                <MessageCircle className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </TableCell>

                        <TableCell>
                          {customer.city ? (
                            <span className="flex items-center gap-1 text-sm">
                              <MapPin className="h-3 w-3 text-blue-500" />
                              {customer.city}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </TableCell>

                        <TableCell>
                          <Badge
                            variant={customer.status === "ativo" ? "default" : "secondary"}
                            className={customer.status === "ativo" ? "bg-emerald-600 hover:bg-emerald-700" : ""}
                          >
                            {customer.status === "ativo" ? "Ativo" : "Inativo"}
                          </Badge>
                        </TableCell>

                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {/* BOTÃO CARTEIRA (DESKTOP) */}
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="text-amber-600 hover:text-amber-700 hover:bg-amber-100"
                              onClick={() => openFinancialModal(customer)} 
                              title="Ver Débitos (Fiado)"
                            >
                              <Wallet className="h-4 w-4" />
                            </Button>

                            <Button size="icon" variant="ghost" onClick={() => openEditDialog(customer)} title="Editar">
                              <Edit className="h-4 w-4 text-muted-foreground" />
                            </Button>

                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => setDeleteCustomer(customer)}
                              title="Excluir"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* DELETE DIALOG */}
      <AlertDialog open={!!deleteCustomer} onOpenChange={() => setDeleteCustomer(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a excluir o cliente <strong>{deleteCustomer?.name}</strong>. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await handleDelete();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Sim, Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* MODAL DE COBRANÇA (FINANCEIRO) */}
      <Dialog open={financialModalOpen} onOpenChange={setFinancialModalOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Wallet className="h-6 w-6 text-amber-600" />
              Carteira de Cobrança: <span className="text-primary">{targetClient?.name}</span>
            </DialogTitle>
            <DialogDescription>
              Gerencie as compras "a prazo" e débitos pendentes deste cliente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {loadingDebts ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : clientDebts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 bg-muted/20 rounded-lg border border-dashed">
                <CheckCircle2 className="h-12 w-12 text-emerald-500 mb-3" />
                <p className="text-lg font-medium text-foreground">Tudo pago!</p>
                <p className="text-sm text-muted-foreground">Este cliente não possui débitos em aberto.</p>
              </div>
            ) : (
              <>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex justify-between items-center">
                  <span className="text-amber-800 font-medium">Total Devido:</span>
                  <span className="text-xl font-bold text-amber-900">
                    {formatCurrency(clientDebts.reduce((acc, curr) => acc + Number(curr.total_amount), 0))}
                  </span>
                </div>

                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead>Data Compra</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead className="text-right w-[100px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {clientDebts.map((debt) => (
                        <TableRow key={debt.id}>
                          <TableCell>
                            {new Date(debt.created_at).toLocaleDateString('pt-BR')}
                          </TableCell>
                          <TableCell className="text-red-600 font-medium">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {debt.due_date ? new Date(debt.due_date).toLocaleDateString('pt-BR') : "Sem prazo"}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate" title={debt.description}>
                            {debt.description}
                          </TableCell>
                          <TableCell className="text-right font-bold">
                            {formatCurrency(Number(debt.total_amount))}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button 
                              size="sm" 
                              className="bg-emerald-600 hover:bg-emerald-700 h-8"
                              onClick={() => handlePayDebt(debt.id, Number(debt.total_amount))}
                            >
                              <CheckCheck className="h-3 w-3 mr-1" /> Receber
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFinancialModalOpen(false)}>
              Fechar Carteira
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}