import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  History,
  LogOut,
  FileText,
  BookOpen,
  Receipt,
  Trophy,
  Calculator,
  Landmark,
  UserCircle
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function AppSidebar() {
  const location = useLocation();
  const { signOut, isAdmin, userData } = useAuth();

  // Define os itens do menu
  const menuItems = [
    { title: "Dashboard", url: "/", icon: LayoutDashboard },
    { title: "Vendas (PDV)", url: "/pdv", icon: ShoppingCart },
    { title: "Catálogo", url: "/catalogo", icon: BookOpen },
    { title: "Estoque", url: "/estoque", icon: Package },
    { title: "Clientes", url: "/clientes", icon: UserCircle },
    { title: "Histórico", url: "/historico", icon: History },
  ];

  // Itens exclusivos de Admin
  if (isAdmin) {
    menuItems.push(
      { title: "Despesas", url: "/despesas", icon: Receipt },
      { title: "Performance", url: "/performance", icon: Trophy },
      { title: "Fechamento", url: "/fechamento", icon: Calculator },
      { title: "Equipe", url: "/funcionarios", icon: Users }
    );
  }

  // 1. Pega as iniciais do nome para o Avatar
  const initials = userData?.name
    ?.split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "U";

  // 2. NOVA FUNÇÃO: Formata para mostrar apenas Primeiro e Segundo nome
  const formatDisplayName = (fullName: string | undefined) => {
    if (!fullName) return "Usuário";
    const parts = fullName.trim().split(" ");
    if (parts.length <= 1) return parts[0]; // Só tem primeiro nome
    return `${parts[0]} ${parts[1]}`; // Retorna "Nome Sobrenome"
  };

  const displayName = formatDisplayName(userData?.name);

  const handleLogout = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      await signOut();
    } catch (error) {
      console.error("Erro ao sair", error);
      window.location.href = "/login";
    }
  };

  return (
    <Sidebar>
      {/* CABEÇALHO COM LOGO */}
      <SidebarHeader className="p-4 border-b border-border/50">
        <div className="flex items-center gap-3 px-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <img 
              src="/logo.png" 
              alt="Logo" 
              className="h-8 w-8 object-contain" 
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.nextElementSibling?.classList.remove('hidden');
              }} 
            />
            <Package className="h-6 w-6 text-primary hidden" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-lg leading-none text-primary">Distribuidora 2G</span>
            <span className="text-xs text-muted-foreground">Sistema de Gestão</span>
          </div>
        </div>
      </SidebarHeader>

      {/* MENU PRINCIPAL */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu Principal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === item.url}
                    className="gap-3 data-[active=true]:bg-primary/10 data-[active=true]:text-primary font-medium"
                  >
                    <Link to={item.url}>
                      <item.icon className="h-5 w-5" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* RODAPÉ COM PERFIL E BOTÃO SAIR */}
      <SidebarFooter className="p-4 border-t border-border/50 bg-sidebar-accent/30">
        <div className="flex flex-col gap-4">
          
          {/* Card do Usuário */}
          <div className="flex items-center gap-3 px-1">
            <Avatar className="h-10 w-10 border-2 border-primary/20">
              <AvatarFallback className="bg-primary text-primary-foreground font-bold text-lg">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col flex-1 min-w-0">
              {/* Usando o nome formatado (curto) */}
              <span className="text-lg font-extrabold truncate text-primary leading-tight" title={userData?.name}>
                {displayName}
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant={isAdmin ? "default" : "secondary"} className="text-[10px] px-2 h-5 font-semibold">
                  {isAdmin ? "Administrador" : "Vendedor"}
                </Badge>
              </div>
            </div>
          </div>

          {/* Botão de Sair (AZUL / Primary) */}
          <Button 
            variant="default" 
            className="w-full justify-center gap-2 font-bold shadow-sm hover:opacity-90 transition-opacity"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            Sair do Sistema
          </Button>

        </div>
      </SidebarFooter>
    </Sidebar>
  );
}