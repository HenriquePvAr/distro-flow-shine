import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import ProtectedRoute from "@/components/ProtectedRoute";

// Páginas
import Dashboard from "./pages/Dashboard";
import PDV from "./pages/PDV";
import Estoque from "./pages/Estoque";
import Catalogo from "./pages/Catalogo";
import Clientes from "./pages/Clientes";
import Historico from "./pages/Historico";
import Despesas from "./pages/Despesas";
import Performance from "./pages/Performance";
import Fechamento from "./pages/Fechamento";
import Funcionarios from "./pages/Funcionarios";
import Assinatura from "./pages/Assinatura";
import AdminMaster from "./pages/AdminMaster"; // ✅ [NOVO] Importação do Painel Master
import Login from "./pages/Login";
import Cadastro from "./pages/Cadastro";
import RedefinirSenha from "./pages/RedefinirSenha";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* --- Rotas Públicas --- */}
            <Route path="/login" element={<Login />} />
            <Route path="/cadastro" element={<Cadastro />} />
            <Route path="/redefinir-senha" element={<RedefinirSenha />} />

            {/* --- Rotas Protegidas (Exige Login) --- */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Dashboard />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/pdv"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <PDV />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/estoque"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Estoque />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/catalogo"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Catalogo />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/clientes"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Clientes />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/historico"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Historico />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/despesas"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Despesas />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/performance"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Performance />
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/fechamento"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Fechamento />
                  </AppLayout>
                </ProtectedRoute>
              }
            />

            {/* --- Rotas de Administrador da Empresa --- */}
            <Route
              path="/funcionarios"
              element={
                <ProtectedRoute requiredRole="admin">
                  <AppLayout>
                    <Funcionarios />
                  </AppLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/assinatura"
              element={
                <ProtectedRoute requiredRole="admin">
                  <AppLayout>
                    <Assinatura />
                  </AppLayout>
                </ProtectedRoute>
              }
            />

            {/* ✅ [NOVO] Rota Secreta do Super Admin */}
            {/* Não usamos o AppLayout aqui para ter mais espaço na tela */}
            <Route
              path="/admin-master"
              element={
                <ProtectedRoute>
                   <AdminMaster />
                </ProtectedRoute>
              }
            />

            {/* Rota de Erro 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;