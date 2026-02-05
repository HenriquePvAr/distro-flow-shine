-- Tabela de Clientes
CREATE TABLE public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    document TEXT, -- CPF ou CNPJ
    phone TEXT,
    address TEXT,
    city TEXT,
    credit_limit DECIMAL(10,2) DEFAULT 0,
    status TEXT DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Habilitar RLS
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Policies - Todos usuários autenticados podem gerenciar clientes
CREATE POLICY "Authenticated users can view customers" ON public.customers
FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can create customers" ON public.customers
FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update customers" ON public.customers
FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete customers" ON public.customers
FOR DELETE TO authenticated USING (true);

-- Trigger para updated_at
CREATE TRIGGER on_customers_updated
BEFORE UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();