
-- Create stock_logs table for Kardex audit
CREATE TABLE public.stock_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    movement_type TEXT NOT NULL, -- 'entrada', 'saida', 'ajuste', 'venda', 'estorno'
    quantity INTEGER NOT NULL,
    previous_stock INTEGER NOT NULL,
    new_stock INTEGER NOT NULL,
    reason TEXT,
    notes TEXT,
    operator TEXT NOT NULL,
    cost_price NUMERIC(10,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Enable RLS
ALTER TABLE public.stock_logs ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view logs
CREATE POLICY "Authenticated users can view stock logs"
ON public.stock_logs
FOR SELECT
TO authenticated
USING (true);

-- All authenticated users can insert logs
CREATE POLICY "Authenticated users can insert stock logs"
ON public.stock_logs
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Only admins can delete logs (audit trail protection)
CREATE POLICY "Only admins can delete stock logs"
ON public.stock_logs
FOR DELETE
TO authenticated
USING (public.is_admin(auth.uid()));

-- Index for faster queries
CREATE INDEX idx_stock_logs_product ON public.stock_logs(product_id);
CREATE INDEX idx_stock_logs_created ON public.stock_logs(created_at DESC);
