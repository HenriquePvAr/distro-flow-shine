import { LayoutDashboard, ShoppingCart, Package, BookOpen, History, Receipt, Trophy, Calculator, Users, LogOut, UserCircle } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  useSidebar,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";

interface MenuItem {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
}

const menuItems: MenuItem[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Vendas (PDV)", url: "/pdv", icon: ShoppingCart },
  { title: "Catálogo", url: "/catalogo", icon: BookOpen },
  { title: "Estoque", url: "/estoque", icon: Package },
  { title: "Clientes", url: "/clientes", icon: UserCircle },
  { title: "Histórico", url: "/historico", icon: History },
  { title: "Despesas", url: "/despesas", icon: Receipt, adminOnly: true },
  { title: "Performance", url: "/performance", icon: Trophy, adminOnly: true },
  { title: "Fechamento", url: "/fechamento", icon: Calculator, adminOnly: true },
  { title: "Equipe", url: "/funcionarios", icon: Users, adminOnly: true },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const { profile, role, isAdmin, signOut } = useAuth();
  const isCollapsed = state === "collapsed";

  const visibleMenuItems = menuItems.filter(
    (item) => !item.adminOnly || isAdmin
  );

  const initials = profile?.name
    ?.split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground font-bold text-lg">
            D
          </div>
          {!isCollapsed && (
            <div className="flex flex-col">
              <span className="font-semibold text-sidebar-foreground">Distribuidora</span>
              <span className="text-xs text-sidebar-foreground/60">Sistema ERP</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50 uppercase text-xs tracking-wider">
            Menu Principal
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="flex items-center gap-3 px-3 py-2 rounded-md transition-colors hover:bg-sidebar-accent"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="h-5 w-5 shrink-0" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        {!isCollapsed ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-sm">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-sidebar-foreground truncate">
                  {profile?.name || "Carregando..."}
                </p>
                <Badge variant={isAdmin ? "default" : "secondary"} className="text-xs">
                  {role === "admin" ? "Admin" : "Vendedor"}
                </Badge>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={signOut}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            onClick={signOut}
            title="Sair"
          >
            <LogOut className="h-5 w-5" />
          </Button>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
