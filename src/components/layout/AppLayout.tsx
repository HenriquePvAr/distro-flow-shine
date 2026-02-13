import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <SidebarProvider>
      {/* trava qualquer overflow horizontal do app inteiro */}
      <div className="min-h-screen w-screen max-w-[100vw] overflow-x-hidden bg-background">
        {/* min-w-0 é essencial pra não estourar no mobile */}
        <div className="flex w-full max-w-[100vw] min-w-0">
          <AppSidebar />

          {/* main precisa de min-w-0 pra permitir shrink */}
          <main className="flex-1 min-w-0 flex flex-col">
            <header className="h-14 border-b border-border bg-card flex items-center px-3 sm:px-4 gap-3 sm:gap-4 min-w-0">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground shrink-0" />
              <div className="h-6 w-px bg-border shrink-0" />
              <h1 className="text-sm font-medium text-foreground truncate min-w-0">
                Distribuidora ERP
              </h1>
            </header>

            {/* aqui era o grande culpado: overflow-auto + p-6 */}
            <div className="flex-1 min-w-0 p-3 sm:p-6 bg-background overflow-y-auto overflow-x-hidden">
              {/* garante que filhos não causem overflow */}
              <div className="w-full max-w-[100vw] min-w-0">
                {children}
              </div>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
