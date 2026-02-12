import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Mail, Lock, User, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { toast } from "sonner";

// ✅ ID da empresa padrão
const DEFAULT_COMPANY_ID = "3dc76d55-2ea8-48da-9dbf-ffae7ede260d";

// Esquema de validação
const cadastroSchema = z
  .object({
    name: z.string().min(3, "Nome deve ter no mínimo 3 caracteres"),
    email: z.string().email("E-mail inválido"),
    password: z.string().min(6, "A senha deve ter no mínimo 6 caracteres"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não coincidem",
    path: ["confirmPassword"],
  });

type CadastroFormData = z.infer<typeof cadastroSchema>;

export default function Cadastro() {
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const form = useForm<CadastroFormData>({
    resolver: zodResolver(cadastroSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (data: CadastroFormData) => {
    setIsLoading(true);

    try {
      // ✅ evita signup com sessão velha presa
      // (se você quiser manter sessão, pode remover)
      await supabase.auth.signOut();

      const email = data.email.trim().toLowerCase();

      const payload = {
        name: data.name.trim(),
        company_id: DEFAULT_COMPANY_ID, // ✅ garante vínculo na empresa padrão
        role: "vendedor", // ✅ opcional
      };

      console.log("[Cadastro] payload metadata:", payload);

      const { data: authData, error } = await supabase.auth.signUp({
        email,
        password: data.password,
        options: {
          data: payload,
        },
      });

      console.log("[Cadastro] returned authData:", authData);
      console.log("[Cadastro] returned error:", error);

      if (error) throw error;

      // Se logou direto ou precisa confirmar email
      if (authData.session) {
        toast.success("Conta criada com sucesso!");
        navigate("/");
      } else {
        toast.success("Cadastro realizado!", {
          description: "Se necessário, verifique seu e-mail para confirmar.",
        });
        navigate("/login");
      }
    } catch (error: any) {
      console.error("[Cadastro] Erro no cadastro:", error);
      toast.error(error?.message || "Erro ao criar conta. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8">
      <Card className="w-full max-w-md shadow-lg border-0 sm:border">
        <CardHeader className="space-y-1">
          <div className="flex items-center mb-4">
            <Button
              variant="ghost"
              size="sm"
              className="p-0 h-auto hover:bg-transparent text-muted-foreground"
              onClick={() => navigate("/login")}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Button>
          </div>

          {/* LOGO */}
          <div className="mx-auto w-24 h-24 mb-2 flex items-center justify-center">
            <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
          </div>

          <CardTitle className="text-2xl font-bold text-center">Crie sua conta</CardTitle>
          <CardDescription className="text-center">
            Preencha os dados essenciais para começar
          </CardDescription>
        </CardHeader>

        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Nome */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome Completo</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input className="pl-9 h-11" placeholder="Seu nome" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Email */}
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>E-mail</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input className="pl-9 h-11" placeholder="seu@email.com" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Senha */}
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Senha</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          type={showPassword ? "text" : "password"}
                          className="pl-9 pr-10 h-11"
                          placeholder="******"
                          {...field}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                        >
                          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Confirmar Senha */}
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirmar Senha</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          type={showPassword ? "text" : "password"}
                          className="pl-9 h-11"
                          placeholder="******"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full h-11 mt-4 text-base" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Criando conta...
                  </>
                ) : (
                  "Finalizar Cadastro"
                )}
              </Button>
            </form>
          </Form>
        </CardContent>

        <CardFooter className="flex justify-center pb-8">
          <div className="text-sm text-muted-foreground">
            Já tem uma conta?{" "}
            <Link to="/login" className="text-primary hover:underline font-bold">
              Fazer login
            </Link>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
