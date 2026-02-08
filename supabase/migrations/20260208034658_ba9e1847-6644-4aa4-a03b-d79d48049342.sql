
-- Create financial entries table for accounts receivable/payable
CREATE TABLE public.financial_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('receivable', 'payable')),
  description TEXT NOT NULL,
  total_amount NUMERIC NOT NULL,
  paid_amount NUMERIC NOT NULL DEFAULT 0,
  due_date TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid', 'overdue')),
  entity_name TEXT,
  reference TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.financial_entries ENABLE ROW LEVEL SECURITY;

-- RLS policies for authenticated users
CREATE POLICY "Authenticated users can view financial entries"
ON public.financial_entries FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can create financial entries"
ON public.financial_entries FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update financial entries"
ON public.financial_entries FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Only admins can delete financial entries"
ON public.financial_entries FOR DELETE
TO authenticated
USING (is_admin(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_financial_entries_updated_at
BEFORE UPDATE ON public.financial_entries
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();
