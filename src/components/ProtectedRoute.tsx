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

  // ✅ Rotas que SEMPRE podem passar mesmo com assinatura bloqueada
  // (você pode adicionar "/login", "/logout", "/suporte" etc se quiser)
  const isSubscriptionRoute = pathname === "/assinatura" || pathname.startsWith("/assinatura/");
  const isAlwaysAllowedRoute = isSubscriptionRoute;

  // Loading (auth ou assinatura)
  if (loading || subscriptionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Não logado
  if (!user) {
    return <Navigate to="/login" replace state={{ from: pathname }} />;
  }

  // ✅ Super admin nunca é bloqueado por assinatura
  if (!isSuperAdmin) {
    // Se assinatura não permite usar o app: libera só /assinatura
    if (!canUseApp && !isAlwaysAllowedRoute) {
      return <Navigate to="/assinatura" replace state={{ blockedFrom: pathname }} />;
    }
  }

  // Validação de role (mantém sua regra: admin pode tudo)
  if (requiredRole && role !== requiredRole && role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
