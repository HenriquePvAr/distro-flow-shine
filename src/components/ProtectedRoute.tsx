import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth, AppRole } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: AppRole;
}

export default function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, role, loading, subscriptionLoading, canUseApp, isSuperAdmin } = useAuth();
  const location = useLocation();
  const pathname = location.pathname;

  // ✅ 1. LISTA DE ROTAS SEGURAS (WHITELIST)
  // Rotas que não sofrem bloqueio de assinatura
  const isSubscriptionRoute = pathname === "/assinatura" || pathname.startsWith("/assinatura/");
  const isAlwaysAllowedRoute = isSubscriptionRoute;

  // ✅ 2. LOADING STATE
  if (loading || subscriptionLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  // ✅ 3. VERIFICAÇÃO DE LOGIN
  if (!user) {
    return <Navigate to="/login" replace state={{ from: pathname }} />;
  }

  // ✅ 4. BLOQUEIO DE ASSINATURA
  if (!isSuperAdmin) {
    // Se assinatura bloqueada E não está na tela de assinatura -> Manda pra lá
    if (!canUseApp && !isAlwaysAllowedRoute) {
      return <Navigate to="/assinatura" replace state={{ blockedFrom: pathname }} />;
    }
  }

  // ✅ 5. VERIFICAÇÃO DE PERMISSÃO (ROLE) - AQUI ESTAVA O ERRO
  // Se estivermos na rota de assinatura (bloqueio), IGNORAMOS a verificação de cargo.
  // Isso permite que funcionários vejam a tela de "Pagamento Necessário" sem serem chutados para a home.
  if (!isAlwaysAllowedRoute) {
    if (requiredRole && role !== requiredRole && role !== "admin") {
      // Se não tem permissão e não é a tela de bloqueio -> Home
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
}