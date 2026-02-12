import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
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
  company_id?: string | null;
}

// Assinatura
export type SubscriptionStatus =
  | "active"
  | "past_due"
  | "blocked_manual"
  | "inactive"
  | "cancelled";

export interface SubscriptionData {
  company_id: string;
  status: SubscriptionStatus;
  current_period_end: string | null;
  manual_override?: boolean | null;
  blocked_reason?: string | null;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  userData: UserData | null;
  role: AppRole | null;

  loading: boolean;

  subscription: SubscriptionData | null;
  subscriptionLoading: boolean;

  // ✅ regra final
  canUseApp: boolean;

  // ✅ bypass
  isSuperAdmin: boolean;

  isAdmin: boolean;

  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (
    email: string,
    password: string,
    data: { name: string; phone?: string; role?: AppRole }
  ) => Promise<{ error: any; data?: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ✅ SEU EMAIL MESTRE
const SUPER_ADMIN_EMAIL = "henriquepaiva2808@gmail.com";

// ✅ Regra oficial: quando o app deve ser liberado?
function calcCanUseApp(sub: SubscriptionData | null): boolean {
  // 🔒 se não existe assinatura -> BLOQUEIA (pra só deixar /assinatura)
  if (!sub) return false;

  if (sub.status !== "active") return false;
  if (!sub.current_period_end) return false;

  const end = new Date(sub.current_period_end).getTime();
  return end >= Date.now();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);

  const [userData, setUserData] = useState<UserData | null>(null);

  const [loading, setLoading] = useState(true);

  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);

  const isSuperAdmin = useMemo(() => {
    const email = user?.email?.trim().toLowerCase();
    return email === SUPER_ADMIN_EMAIL.trim().toLowerCase();
  }, [user?.email]);

  const canUseApp = useMemo(() => {
    // ✅ super admin nunca bloqueia
    if (isSuperAdmin) return true;
    return calcCanUseApp(subscription);
  }, [subscription, isSuperAdmin]);

  // Busca assinatura da empresa
  const fetchSubscription = async (companyId: string) => {
    setSubscriptionLoading(true);
    try {
      const { data, error } = await supabase
        .from("company_subscriptions")
        .select("company_id, status, current_period_end, manual_override, blocked_reason")
        .eq("company_id", companyId)
        .maybeSingle();

      if (error) {
        console.error("Erro ao buscar assinatura:", error);
        setSubscription(null); // vai bloquear (canUseApp=false) para não liberar indevidamente
        return;
      }

      setSubscription((data ?? null) as SubscriptionData | null);
    } catch (e) {
      console.error("Erro inesperado ao buscar assinatura:", e);
      setSubscription(null);
    } finally {
      setSubscriptionLoading(false);
    }
  };

  // Busca dados do perfil + assinatura
  const fetchUserData = async (userId: string, userEmail?: string) => {
    setLoading(true);
    setSubscriptionLoading(true);

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, role, phone, company_id")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        console.error("Erro ao buscar perfil:", error);
        setUserData(null);
        setSubscription(null); // sem profile -> bloqueia por segurança
        return;
      }

      if (!data) {
        setUserData(null);
        setSubscription(null);
        return;
      }

      const profile = data as any;

      const merged: UserData = {
        id: profile.id,
        name: profile.name || "Usuário",
        role: (profile.role as AppRole) || "vendedor",
        phone: profile.phone || null,
        email: userEmail,
        company_id: profile.company_id ?? null,
      };

      setUserData(merged);

      if (merged.company_id) {
        await fetchSubscription(merged.company_id);
      } else {
        // sem company_id -> bloqueia
        setSubscription(null);
        setSubscriptionLoading(false);
      }
    } catch (e) {
      console.error("Erro inesperado ao buscar perfil:", e);
      setUserData(null);
      setSubscription(null);
      setSubscriptionLoading(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      setLoading(true);
      setSubscriptionLoading(true);

      const { data } = await supabase.auth.getSession();
      const sess = data.session ?? null;

      setSession(sess);
      setUser(sess?.user ?? null);

      if (sess?.user) {
        await fetchUserData(sess.user.id, sess.user.email ?? undefined);
      } else {
        setUserData(null);
        setSubscription(null);
        setSubscriptionLoading(false);
        setLoading(false);
      }
    };

    initAuth();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);

      if (sess?.user) {
        await fetchUserData(sess.user.id, sess.user.email ?? undefined);
      } else {
        setUserData(null);
        setSubscription(null);
        setSubscriptionLoading(false);
        setLoading(false);
      }
    });

    return () => listener.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      if (data.user) {
        await fetchUserData(data.user.id, data.user.email ?? undefined);
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
            role: data.role,
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
    setSubscription(null);
    setSubscriptionLoading(false);
    setLoading(false);
    window.location.href = "/login";
  };

  const value: AuthContextType = {
    session,
    user,
    userData,
    role: userData?.role ?? null,

    loading,

    subscription,
    subscriptionLoading,
    canUseApp,

    isSuperAdmin,

    isAdmin: userData?.role === "admin",

    signIn,
    signUp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{!loading && children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
