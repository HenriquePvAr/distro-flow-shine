import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ✅ SEU EMAIL (Deve ser idêntico ao do login)
const SUPER_ADMIN_EMAIL = "henriquepaiva2808@gmail.com";

type Body = {
  companyName: string;
  adminEmail: string;
  adminPassword: string;
  daysGiven?: number;
};

function json(status: number, data: any) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  // 1. Handle OPTIONS (CORS preflight)
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    // 2. Carregar variáveis de ambiente
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    // ✅ FIX: Aceita a chave padrão do sistema OU a nossa chave manual PROJ_ANON_KEY
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("PROJ_ANON_KEY") ?? "";

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
      return json(500, {
        error: "Faltando variáveis de ambiente (URL, SERVICE_ROLE ou ANON_KEY/PROJ_ANON_KEY).",
      });
    }

    // 3. Cliente ADMIN (com poderes totais para criar empresa)
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // 4. Cliente CALLER (para verificar QUEM está chamando a função)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json(401, { error: "Missing Authorization header" });
    }

    // Usar ANON_KEY + Token do usuário para validar a sessão
    const supabaseCaller = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    // 5. Verificar se o caller é o Super Admin
    const { data: { user: caller }, error: callerErr } = await supabaseCaller.auth.getUser();

    if (callerErr || !caller) {
      console.error("Erro auth caller:", callerErr);
      return json(401, { error: "Token inválido ou expirado." });
    }

    const callerEmail = (caller.email ?? "").trim().toLowerCase();
    if (callerEmail !== SUPER_ADMIN_EMAIL.toLowerCase()) {
      return json(403, { error: `Forbidden: ${callerEmail} is not super admin.` });
    }

    // =================================================================
    // DAQUI PARA BAIXO, A LÓGICA DE CRIAÇÃO SEGUE IGUAL (USANDO ADMIN)
    // =================================================================

    const body = (await req.json()) as Body;
    const companyName = (body.companyName ?? "").trim();
    const adminEmail = (body.adminEmail ?? "").trim().toLowerCase();
    const adminPassword = (body.adminPassword ?? "").trim();
    const daysGiven = Number(body.daysGiven ?? 30);

    if (!companyName || !adminEmail || !adminPassword) {
      return json(400, { error: "Campos obrigatórios: companyName, adminEmail, adminPassword" });
    }

    // Gerar ID da empresa
    const companyId = crypto.randomUUID();

    // A) Criar Usuário (Auth)
    let newUserId: string | null = null;
    let reusedExistingUser = false;

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
    });

    if (createErr) {
      const msg = (createErr.message ?? "").toLowerCase();
      const isAlreadyRegistered =
        msg.includes("already been registered") ||
        msg.includes("already registered") ||
        msg.includes("already exists");

      if (!isAlreadyRegistered) {
        return json(400, { error: `Erro ao criar usuário: ${createErr.message}` });
      }

      // Se já existe, buscamos o ID
      const { data: listData } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });

      const found = listData?.users?.find((u) => (u.email ?? "").toLowerCase() === adminEmail);
      if (!found?.id) {
        return json(400, { error: "Email já existe, mas usuário não encontrado." });
      }

      newUserId = found.id;
      reusedExistingUser = true;
    } else {
      newUserId = created.user?.id ?? null;
      if (!newUserId) return json(400, { error: "Usuário criado sem ID." });
    }

    // B) Criar Profile
    const { error: profileErr } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          id: newUserId,
          name: companyName,
          role: "admin",
          active: true,
          company_id: companyId,
        },
        { onConflict: "id" }
      );

    if (profileErr) {
      // Rollback parcial (apagar user se foi criado agora)
      if (!reusedExistingUser) {
        await supabaseAdmin.auth.admin.deleteUser(newUserId);
      }
      return json(400, { error: `Erro profile: ${profileErr.message}` });
    }

    // C) Criar Assinatura
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + daysGiven);

    const { error: subErr } = await supabaseAdmin
      .from("company_subscriptions")
      .upsert({
        company_id: companyId,
        status: daysGiven > 0 ? "active" : "inactive",
        current_period_end: daysGiven > 0 ? validUntil.toISOString() : null,
        manual_override: true,
      });

    if (subErr) {
      // Rollback profile
      await supabaseAdmin.from("profiles").delete().eq("id", newUserId);
      if (!reusedExistingUser) {
        await supabaseAdmin.auth.admin.deleteUser(newUserId);
      }
      return json(400, { error: `Erro assinatura: ${subErr.message}` });
    }

    return json(200, {
      success: true,
      companyId,
      userId: newUserId,
      email: adminEmail,
      reusedUser: reusedExistingUser,
    });

  } catch (error: any) {
    return json(400, { error: error?.message || String(error) });
  }
});