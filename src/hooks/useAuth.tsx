import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Define os papéis possíveis
export type AppRole = "admin" | "vendedor";

// Interface dos dados do usuário
export interface UserData {
  id: string;
  name: string;
  role: AppRole;
  phone?: string | null;
  email?: string;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  userData: UserData | null;
  role: AppRole | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, data: { name: string; phone?: string; role?: AppRole }) => Promise<{ error: any, data?: any }>;
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
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("Erro ao buscar perfil:", error);
      return;
    }

    if (data) {
      // CORREÇÃO: Dizemos ao TypeScript para tratar 'data' como qualquer coisa (any)
      // Isso evita o erro de tipagem na leitura do 'role'
      const profile = data as any;

      setUserData({
        id: profile.id,
        name: profile.name || "Usuário",
        // Agora ele aceita converter a string do banco para o tipo AppRole
        role: (profile.role as AppRole) || "vendedor", 
        phone: profile.phone || null,
        email: user?.email
      });
    }
  } catch (error) {
    console.error("Erro inesperado ao buscar perfil:", error);
  } finally {
    setLoading(false);
  }
};

  useEffect(() => {
    // 1. Verifica sessão atual ao carregar a página
    const initAuth = async () => {
        setLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
            await fetchUserData(session.user.id);
        } else {
            setLoading(false);
        }
    };

    initAuth();

    // 2. Escuta mudanças na autenticação (login, logout, refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Se acabou de logar, busca os dados do perfil atualizados
          await fetchUserData(session.user.id);
        } else {
          setUserData(null);
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      // Força busca dos dados após login bem sucedido
      if (data.user) {
          await fetchUserData(data.user.id);
      }

      return { error: null };
    } catch (error: any) {
      return { error };
    }
  };

  const signUp = async (
    email: string,
    password: string,
    data: { name: string; phone?: string; role?: AppRole }
  ) => {
    try {
        const { data: authData, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    name: data.name,
                    phone: data.phone,
                    role: data.role // Passa o cargo nos metadados também
                },
            },
        });

        if (error) throw error;
        
        return { error: null, data: authData };
    } catch (error: any) {
        return { error };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setUserData(null);
    // Redirecionamento forçado é útil para limpar estados de cache de query (como TanStack Query)
    window.location.href = "/auth"; 
  };

  const value = {
    session,
    user,
    userData,
    role: userData?.role ?? null, 
    loading,
    isAdmin: userData?.role === "admin",
    signIn,
    signUp,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
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