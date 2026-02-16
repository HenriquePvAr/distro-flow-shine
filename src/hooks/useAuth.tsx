import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "vendedor";

export interface UserData {
  id: string;
  name: string;
  role: AppRole;
  phone?: string | null;
  email?: string;
  company_id?: string | null;
}

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

  // loading global (apenas boot/login)
  loading: boolean;

  subscription: SubscriptionData | null;
  subscriptionLoading: boolean;

  canUseApp: boolean;
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

const SUPER_ADMIN_EMAIL = "henriquepaiva2808@gmail.com";

function calcCanUseApp(sub: SubscriptionData | null): boolean {
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

  // Bloqueio global: usar com cuidado
  const [loading, setLoading] = useState<boolean>(true);

  // Estado de assinatura (pode atualizar em background)
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState<boolean>(true);

  // Apenas para mostrar overlay no boot inicial
  const [initialized, setInitialized] = useState<boolean>(false);

  // Refs de controle
  const mountedRef = useRef(true);
  const initRunningRef = useRef(false);
  const fetchIdRef = useRef(0);

  // ✅ A MÁGICA: não depende de state no listener
  const initializedRef = useRef(false);
  const userDataRef = useRef<UserData | null>(null);

  useEffect(() => {
    userDataRef.current = userData;
  }, [userData]);

  const isSuperAdmin = useMemo(() => {
    const email = user?.email?.trim().toLowerCase();
    return email === SUPER_ADMIN_EMAIL.trim().toLowerCase();
  }, [user?.email]);

  const canUseApp = useMemo(() => {
    if (isSuperAdmin) return true;
    return calcCanUseApp(subscription);
  }, [subscription, isSuperAdmin]);

  const fetchSubscription = async (
    companyId: string,
    fetchId: number,
    silent = false
  ) => {
    if (!silent) setSubscriptionLoading(true);

    try {
      const { data, error } = await supabase
        .from("company_subscriptions")
        .select("company_id, status, current_period_end, manual_override, blocked_reason")
        .eq("company_id", companyId)
        .maybeSingle();

      if (fetchIdRef.current !== fetchId || !mountedRef.current) return;

      if (error) {
        console.error("[Auth] Erro ao buscar assinatura:", error);
        setSubscription(null);
        return;
      }

      setSubscription((data ?? null) as SubscriptionData | null);
    } catch (e) {
      console.error("[Auth] Erro inesperado ao buscar assinatura:", e);
      if (fetchIdRef.current !== fetchId || !mountedRef.current) return;
      setSubscription(null);
    } finally {
      if (fetchIdRef.current === fetchId && mountedRef.current) {
        setSubscriptionLoading(false);
      }
    }
  };

  const fetchUserData = async (
    userId: string,
    userEmail?: string,
    silent = false
  ) => {
    const fetchId = ++fetchIdRef.current;

    if (!silent) {
      setLoading(true);
      setSubscriptionLoading(true);
    }

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, role, phone, company_id")
        .eq("id", userId)
        .maybeSingle();

      if (fetchIdRef.current !== fetchId || !mountedRef.current) return;

      if (error || !data) {
        console.warn("[Auth] Perfil não encontrado/erro. Limpando sessão...");

        setUserData(null);
        setSubscription(null);
        setSubscriptionLoading(false);

        fetchIdRef.current++;
        await supabase.auth.signOut();
        if (!mountedRef.current) return;

        setSession(null);
        setUser(null);
        return;
      }

      const profile: any = data;

      const merged: UserData = {
        id: profile.id,
        name: profile.name || "Usuário",
        role: (profile.role as AppRole) || "vendedor",
        phone: profile.phone || null,
        email: userEmail,
        company_id: profile.company_id ?? null,
      };

      setUserData(merged);
      userDataRef.current = merged;

      if (merged.company_id) {
        await fetchSubscription(merged.company_id, fetchId, silent);
      } else {
        setSubscription(null);
        setSubscriptionLoading(false);
      }
    } catch (e) {
      console.error("[Auth] Erro inesperado ao buscar perfil:", e);
      if (fetchIdRef.current !== fetchId || !mountedRef.current) return;

      setUserData(null);
      userDataRef.current = null;
      setSubscription(null);
      setSubscriptionLoading(false);
    } finally {
      if (fetchIdRef.current === fetchId && mountedRef.current) {
        if (!silent) setLoading(false);

        if (!initializedRef.current) {
          initializedRef.current = true;
          setInitialized(true);
        }

        // evita travar overlay por acidente
        setSubscriptionLoading(false);
      }
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    let subscriptionUnsub: any;

    const initAuth = async () => {
      if (initRunningRef.current) return;
      initRunningRef.current = true;

      try {
        setLoading(true);
        setSubscriptionLoading(true);

        const { data } = await supabase.auth.getSession();
        const sess = data.session ?? null;

        if (!mountedRef.current) return;

        setSession(sess);
        setUser(sess?.user ?? null);

        if (sess?.user) {
          // Boot inicial: não-silencioso
          await fetchUserData(sess.user.id, sess.user.email ?? undefined, false);
        } else {
          fetchIdRef.current++;

          setUserData(null);
          userDataRef.current = null;
          setSubscription(null);
          setSubscriptionLoading(false);
          setLoading(false);

          initializedRef.current = true;
          setInitialized(true);
        }

        const { data: listener } = supabase.auth.onAuthStateChange(
          async (event, sess2) => {
            if (!mountedRef.current) return;

            console.log("[AUTH EVENT]", event);

            setSession(sess2);
            setUser(sess2?.user ?? null);

            if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && sess2?.user) {
              // ✅ refresh/restauração: silencioso se já inicializou
              const silent = initializedRef.current && !!userDataRef.current;
              await fetchUserData(
                sess2.user.id,
                sess2.user.email ?? undefined,
                silent
              );
              return;
            }

            if (event === "SIGNED_OUT") {
              fetchIdRef.current++;

              setUserData(null);
              userDataRef.current = null;
              setSubscription(null);
              setSubscriptionLoading(false);
              setLoading(false);

              if (!initializedRef.current) {
                initializedRef.current = true;
                setInitialized(true);
              }
            }
          }
        );

        subscriptionUnsub = listener?.subscription;
      } catch (e) {
        console.error("[Auth] initAuth falhou:", e);
        if (!mountedRef.current) return;

        setLoading(false);
        setSubscriptionLoading(false);

        if (!initializedRef.current) {
          initializedRef.current = true;
          setInitialized(true);
        }
      }
    };

    initAuth();

    return () => {
      mountedRef.current = false;
      subscriptionUnsub?.unsubscribe?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      // ✅ deixa o listener cuidar do fetchUserData (evita duplicar)
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
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
    fetchIdRef.current++;
    await supabase.auth.signOut();

    if (!mountedRef.current) return;

    setSession(null);
    setUser(null);
    setUserData(null);
    userDataRef.current = null;

    setSubscription(null);
    setSubscriptionLoading(false);

    setLoading(false);

    if (!initializedRef.current) {
      initializedRef.current = true;
      setInitialized(true);
    }
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

  return (
    <AuthContext.Provider value={value}>
      {children}

      {/* ✅ Overlay APENAS no boot inicial */}
      {!initialized && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999999,
          }}
        >
          <div style={{ fontFamily: "sans-serif", fontSize: 14 }}>
            Carregando...
          </div>
        </div>
      )}
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
