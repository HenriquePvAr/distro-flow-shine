-- 1. Adicionar a coluna company_id aos perfis (para vincular o user a uma empresa)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS company_id TEXT;

-- 2. Criar a tabela de assinaturas
CREATE TABLE IF NOT EXISTS public.company_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id TEXT NOT NULL, -- ID da empresa (externalReference no Asaas)
    plan TEXT DEFAULT 'monthly',
    status TEXT DEFAULT 'inactive', -- active, past_due, inactive, cancelled, blocked_manual
    current_period_end TIMESTAMP WITH TIME ZONE,
    manual_override BOOLEAN DEFAULT false,
    blocked_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    UNIQUE (company_id)
);

-- 3. Habilitar Segurança (RLS)
ALTER TABLE public.company_subscriptions ENABLE ROW LEVEL SECURITY;

-- 4. Criar política de leitura para o Front-end
CREATE POLICY "Authenticated users can view subscriptions"
ON public.company_subscriptions
FOR SELECT
TO authenticated
USING (true);