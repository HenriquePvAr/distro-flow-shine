import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Define os papéis possíveis
export type AppRole = "admin" | "vendedor";

// Interface dos dados do usuário (flexível para evitar erros se faltar campo no banco)
export interface UserData {
  id: string;
  name: string;
  role: AppRole;
  commission?: number; // Opcional
  phone?: string | null; // Opcional
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  userData: UserData | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string, rememberMe?: boolean) => Promise<{ error: any }>;
  signUp: (email: string, password: string, data: { name: string; phone?: string; commission?: number; role?: AppRole }) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  // Função para buscar dados do perfil no banco
  const fetchUserData = async (userId: string) => {
    try {
      // Busca perfil na tabela 'profiles'
      const { data, error } = await supabase
        .from("profiles")
        .select("*") // Seleciona tudo o que tiver lá
        .eq("id", userId)
        .single();

      if (error) {
        console.error("Erro ao buscar perfil:", error);
        // Mesmo com erro, paramos o loading
        setLoading(false); 
        return;
      }

      if (data) {
        // Mapeia os dados do banco para nosso objeto UserData
        // Usamos 'any' no data para evitar que o TypeScript reclame se o campo não existir nos types gerados
        const safeData = data as any;
        
        setUserData({
          id: safeData.id,
          name: safeData.name || "Usuário",
          role: (safeData.role as AppRole) || "vendedor",
          // Só tenta ler se existir, senão usa padrão
          commission: safeData.commission || 0, 
          phone: safeData.phone || null
        });
      }
    } catch (error) {
      console.error("Erro inesperado ao buscar perfil:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 1. Verifica sessão atual ao carregar
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserData(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // 2. Escuta mudanças na autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Se acabou de logar, busca os dados do perfil
          await fetchUserData(session.user.id);
        } else {
          setUserData(null);
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string, rememberMe: boolean = true) => {
    try {
      // Opcional: Configuração de persistência poderia ser feita aqui
      // Mas o cliente padrão já lida bem com isso.
      
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      return { error };
    } catch (error: any) {
      return { error };
    }
  };

  const signUp = async (
    email: string,
    password: string,
    data: { name: string; phone?: string; commission?: number; role?: AppRole }
  ) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: data.name,
          phone: data.phone, // Envia para os metadados
          // O trigger handle_new_user no banco deve ser capaz de ler isso
        },
      },
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setUserData(null);
    window.location.href = "/login"; // Redirecionamento forçado para limpar estado
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        userData,
        loading,
        isAdmin: userData?.role === "admin",
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}