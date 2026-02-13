import { createClient } from "@supabase/supabase-js";
import { Preferences } from "@capacitor/preferences";

// 🔥 storage compatível com Capacitor (ESSENCIAL)
const capacitorStorage = {
  getItem: async (key: string) => {
    const { value } = await Preferences.get({ key });
    return value;
  },
  setItem: async (key: string, value: string) => {
    await Preferences.set({ key, value });
  },
  removeItem: async (key: string) => {
    await Preferences.remove({ key });
  },
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY!;

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      storage: capacitorStorage, // ⭐⭐⭐ AQUI ESTÁ A MÁGICA
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false, // evita bug ao abrir app novamente
    },
  }
);
