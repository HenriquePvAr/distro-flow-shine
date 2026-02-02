import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import Dashboard from "./pages/Dashboard";
import PDV from "./pages/PDV";
import Estoque from "./pages/Estoque";
import Catalogo from "./pages/Catalogo";
import Historico from "./pages/Historico";
import Despesas from "./pages/Despesas";
import Performance from "./pages/Performance";
import Fechamento from "./pages/Fechamento";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppLayout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/pdv" element={<PDV />} />
            <Route path="/estoque" element={<Estoque />} />
            <Route path="/catalogo" element={<Catalogo />} />
            <Route path="/historico" element={<Historico />} />
            <Route path="/despesas" element={<Despesas />} />
            <Route path="/performance" element={<Performance />} />
            <Route path="/fechamento" element={<Fechamento />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AppLayout>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
