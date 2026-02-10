import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Ajustado para ler as variáveis exatas do seu .env
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Verificação de segurança para evitar tela branca sem erro claro
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("ERRO CRÍTICO: Variáveis de ambiente do Supabase não encontradas. Verifique seu arquivo .env");
}

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});