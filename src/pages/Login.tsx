import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { LogIn, Eye, EyeOff, Loader2, X, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Interface para contas salvas no navegador
interface SavedAccount {
  email: string;
  name: string;
  lastLogin: number;
}

export default function Login() {
  const navigate = useNavigate();
  const { signIn, session } = useAuth();
  
  // Estados do Formulário
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Estados da Tela de Seleção de Conta
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const [viewState, setViewState] = useState<'selecting' | 'login'>('login');

  // 1. Efeito de Auto-Login: Se já tiver sessão válida, entra direto!
  useEffect(() => {
    if (session?.user) {
      navigate("/");
    }
  }, [session, navigate]);

  // 2. Carregar contas salvas ao abrir a tela
  useEffect(() => {
    const saved = localStorage.getItem('distro_saved_accounts');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSavedAccounts(parsed);
          setViewState('selecting');
        }
      } catch (e) {
        localStorage.removeItem('distro_saved_accounts');
      }
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const { error } = await signIn(email, password, rememberMe);

    if (error) {
      toast.error("Erro ao entrar", { description: "Verifique suas credenciais." });
    } else {
      // Login Sucesso! Salvar conta na lista de "Recentes"
      await saveAccountToLocal(email);
      toast.success("Bem-vindo de volta!");
      navigate("/");
    }
    setIsLoading(false);
  };

  // Função auxiliar para salvar o usuário na lista local (CORRIGIDA)
  const saveAccountToLocal = async (emailToSave: string) => {
    try {
      let userName = emailToSave.split('@')[0]; // Nome padrão (parte antes do @)

      // 1. Pega o usuário logado agora para descobrir o ID
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        // 2. Busca o nome real na tabela de perfis usando o ID
        const { data } = await supabase
          .from('profiles')
          .select('name')
          .eq('id', user.id)
          .maybeSingle();
        
        if (data?.name) {
          userName = data.name;
        }
      }

      // 3. Salva no navegador
      const newAccount: SavedAccount = {
        email: emailToSave,
        name: userName,
        lastLogin: Date.now()
      };

      // Filtra para remover duplicatas e mantém apenas os 3 últimos
      const currentList = savedAccounts.filter(acc => acc.email !== emailToSave);
      const newList = [newAccount, ...currentList].slice(0, 3); 

      localStorage.setItem('distro_saved_accounts', JSON.stringify(newList));
      setSavedAccounts(newList); // Atualiza estado local também
    } catch (e) {
      console.error("Erro ao salvar conta local", e);
    }
  };

  const handleRemoveAccount = (emailToRemove: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Evita clicar no card ao remover
    const newList = savedAccounts.filter(acc => acc.email !== emailToRemove);
    setSavedAccounts(newList);
    localStorage.setItem('distro_saved_accounts', JSON.stringify(newList));
    
    if (newList.length === 0) setViewState('login');
  };

  const handleSelectAccount = (account: SavedAccount) => {
    setEmail(account.email);
    setViewState('login');
    // A senha o usuário precisará digitar
  };

  const handleForgotPassword = async () => {
    if (!email) {
      toast.error("Digite seu e-mail primeiro.");
      return;
    }
    setIsResetting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });
    if (error) toast.error("Erro ao enviar", { description: error.message });
    else toast.success("E-mail enviado!", { description: "Verifique sua caixa de entrada." });
    setIsResetting(false);
  };

  // --- RENDERIZAÇÃO ---

  // TELA 1: LISTA DE CONTAS SALVAS
  if (viewState === 'selecting' && savedAccounts.length > 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <Card className="w-full max-w-md shadow-lg border-0 sm:border animate-in fade-in zoom-in duration-300">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-20 h-20 mb-2 flex items-center justify-center">
               <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
            </div>
            <CardTitle className="text-xl font-bold">Escolha uma conta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {savedAccounts.map((account) => (
              <div 
                key={account.email}
                onClick={() => handleSelectAccount(account)}
                className="group flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50 cursor-pointer transition-all hover:shadow-sm relative"
              >
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarFallback className="bg-primary/10 text-primary font-bold">
                      {account.name.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="text-left">
                    <p className="font-medium text-sm text-gray-900">{account.name}</p>
                    <p className="text-xs text-gray-500">{account.email}</p>
                  </div>
                </div>
                
                {/* Botão X para remover conta */}
                <button 
                  onClick={(e) => handleRemoveAccount(account.email, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded-full text-gray-400 hover:text-red-500 transition-all"
                  title="Remover esta conta da lista"
                >
                  <X size={16} />
                </button>
              </div>
            ))}

            <div 
              onClick={() => { setEmail(""); setPassword(""); setViewState('login'); }}
              className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-gray-300 hover:bg-gray-50 cursor-pointer transition-all text-gray-600 hover:text-primary"
            >
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                <Plus size={20} />
              </div>
              <p className="font-medium text-sm">Usar outra conta</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // TELA 2: FORMULÁRIO DE LOGIN
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md shadow-lg border-0 sm:border animate-in slide-in-from-right-4 duration-300">
        <CardHeader className="text-center space-y-1 relative">
          {/* Botão Voltar se tiver contas salvas */}
          {savedAccounts.length > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="absolute left-2 top-2 text-muted-foreground"
              onClick={() => setViewState('selecting')}
            >
              ← Voltar
            </Button>
          )}
          
          <div className="mx-auto w-20 h-20 mb-2 flex items-center justify-center">
             <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
          </div>
          <CardTitle className="text-2xl font-bold text-primary">Acesso ao Sistema</CardTitle>
          <CardDescription>
            {email ? `Olá, ${email}` : "Entre com suas credenciais"}
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleLogin}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="exemplo@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Senha</Label>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-11 pr-10"
                  autoFocus={!!email} // Foca na senha se o email já estiver preenchido
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="remember" 
                  checked={rememberMe}
                  onCheckedChange={(c) => setRememberMe(!!c)}
                />
                <label htmlFor="remember" className="font-medium cursor-pointer">
                  Manter conectado
                </label>
              </div>
              
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={isResetting}
                className="text-primary hover:underline font-medium disabled:opacity-50"
              >
                {isResetting ? "Enviando..." : "Esqueci a senha"}
              </button>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full h-11 text-base" disabled={isLoading}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <><LogIn className="mr-2 h-4 w-4" /> Entrar</>}
            </Button>
            
            <p className="text-sm text-muted-foreground text-center mt-2">
              Não tem conta?{" "}
              <Link to="/cadastro" className="text-primary hover:underline font-bold">
                Criar conta
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}