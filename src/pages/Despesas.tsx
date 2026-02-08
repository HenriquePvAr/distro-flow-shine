import { useState } from "react";
import { Receipt, Plus, Trash2, Calendar, Pin } from "lucide-react";
import { useStore, expenseCategories, type ExpenseCategory } from "@/store/useStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function Despesas() {
  const { expenses, addExpense, deleteExpense } = useStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("Outros");
  const [value, setValue] = useState("");
  const [date, setDate] = useState<Date>(new Date());
  const [filterCategory, setFilterCategory] = useState<string>("all");

  const [isFixed, setIsFixed] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description || !value || parseFloat(value) <= 0) {
      toast.error("Preencha todos os campos corretamente");
      return;
    }

    addExpense({
      description,
      category,
      value: parseFloat(value),
      date: date.toISOString(),
      isFixed,
    });

    toast.success("Despesa cadastrada com sucesso!");
    setDescription("");
    setCategory("Outros");
    setValue("");
    setDate(new Date());
    setIsFixed(false);
    setDialogOpen(false);
  };

  const filteredExpenses = expenses.filter(
    (e) => filterCategory === "all" || e.category === filterCategory
  );

  const totalExpenses = filteredExpenses.reduce((sum, e) => sum + e.value, 0);

  const expensesByCategory = expenseCategories.map((cat) => ({
    category: cat,
    total: expenses.filter((e) => e.category === cat).reduce((sum, e) => sum + e.value, 0),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Receipt className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Despesas</h1>
            <p className="text-sm text-muted-foreground">Gestão de despesas e fluxo de caixa</p>
          </div>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nova Despesa
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cadastrar Despesa</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Input
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex: Pagamento de aluguel"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Categoria</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as ExpenseCategory)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {expenseCategories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="value">Valor (R$)</Label>
                <Input
                  id="value"
                  type="number"
                  step="0.01"
                  min="0"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="0,00"
                />
              </div>

              <div className="space-y-2">
                <Label>Data</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !date && "text-muted-foreground"
                      )}
                    >
                      <Calendar className="mr-2 h-4 w-4" />
                      {date ? format(date, "PPP", { locale: ptBR }) : "Selecione a data"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={date}
                      onSelect={(d) => d && setDate(d)}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-lg border border-border">
                <input
                  type="checkbox"
                  id="isFixed"
                  checked={isFixed}
                  onChange={(e) => setIsFixed(e.target.checked)}
                  className="h-4 w-4 rounded border-input accent-primary"
                />
                <div>
                  <Label htmlFor="isFixed" className="cursor-pointer font-medium">
                    Despesa Fixa
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Marque para custos recorrentes (aluguel, salários, etc.)
                  </p>
                </div>
              </div>

              <Button type="submit" className="w-full">
                Cadastrar Despesa
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {expensesByCategory.map(({ category: cat, total }) => (
          <Card key={cat}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{cat}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-foreground">
                {total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filtrar por categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {expenseCategories.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto text-sm text-muted-foreground">
          Total:{" "}
          <span className="font-semibold text-foreground">
            {totalExpenses.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </span>
        </div>
      </div>

      {/* Expenses Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredExpenses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Nenhuma despesa cadastrada
                  </TableCell>
                </TableRow>
              ) : (
                filteredExpenses
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .map((expense) => (
                    <TableRow key={expense.id}>
                      <TableCell>
                        {format(new Date(expense.date), "dd/MM/yyyy")}
                      </TableCell>
                      <TableCell className="font-medium">
                        {expense.description}
                        {expense.isFixed && (
                          <Badge variant="outline" className="ml-2 text-xs gap-1">
                            <Pin className="h-3 w-3" />
                            Fixa
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="px-2 py-1 rounded-full text-xs bg-muted">
                          {expense.category}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-destructive">
                        -{expense.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            deleteExpense(expense.id);
                            toast.success("Despesa removida");
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
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
