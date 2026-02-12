// supabase/functions/admin-create-tenant/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return json(500, {
        error: "Faltando SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY nos Secrets.",
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // ✅ valida super admin pelo token do caller
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return json(401, { error: "Missing Bearer token" });

    const supabaseCaller = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: callerData, error: callerErr } = await supabaseCaller.auth.getUser();
    const caller = callerData?.user;

    if (callerErr || !caller) return json(401, { error: "Invalid token" });

    const callerEmail = (caller.email ?? "").trim().toLowerCase();
    if (callerEmail !== SUPER_ADMIN_EMAIL.toLowerCase()) {
      return json(403, { error: "Forbidden: not super admin" });
    }

    // Body
    const body = (await req.json()) as Body;
    const companyName = (body.companyName ?? "").trim();
    const adminEmail = (body.adminEmail ?? "").trim().toLowerCase();
    const adminPassword = (body.adminPassword ?? "").trim();
    const daysGiven = Number(body.daysGiven ?? 30);

    if (!companyName || !adminEmail || !adminPassword) {
      return json(400, { error: "Campos obrigatórios: companyName, adminEmail, adminPassword" });
    }
    if (!Number.isFinite(daysGiven) || daysGiven < 0) {
      return json(400, { error: "daysGiven inválido" });
    }

    // ✅ company_id UUID (igual seu banco)
    const companyId = crypto.randomUUID();

    // 1) tenta criar usuário
    let newUserId: string | null = null;
    let reusedExistingUser = false;

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
    });

    if (createErr) {
      // ✅ se email já existe, pega o user existente e segue
      const msg = (createErr.message ?? "").toLowerCase();
      const isAlreadyRegistered =
        msg.includes("already been registered") ||
        msg.includes("already registered") ||
        msg.includes("already exists");

      if (!isAlreadyRegistered) {
        return json(400, { error: `Erro ao criar usuário: ${createErr.message}` });
      }

      const { data: listData, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });

      if (listErr) return json(400, { error: `Falha ao listar users: ${listErr.message}` });

      const found = listData?.users?.find((u) => (u.email ?? "").toLowerCase() === adminEmail);
      if (!found?.id) return json(400, { error: "Email já existe, mas não consegui localizar o usuário." });

      newUserId = found.id;
      reusedExistingUser = true;

      // opcional: se você quiser resetar a senha do usuário existente:
      // await supabaseAdmin.auth.admin.updateUserById(newUserId, { password: adminPassword });

    } else {
      newUserId = created.user?.id ?? null;
      if (!newUserId) return json(400, { error: "Usuário criado, mas sem ID." });
    }

    // 2) profile (colunas reais: id, name, role, active, phone, company_id)
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
      // rollback só se foi criado agora (pra não apagar user existente)
      if (!reusedExistingUser) {
        await supabaseAdmin.auth.admin.deleteUser(newUserId);
      }
      return json(400, { error: `Erro ao criar/vincular perfil: ${profileErr.message}` });
    }

    // 3) assinatura
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + daysGiven);

    const { error: subErr } = await supabaseAdmin
      .from("company_subscriptions")
      .upsert({
        company_id: companyId,
        status: daysGiven > 0 ? "active" : "inactive",
        current_period_end: daysGiven > 0 ? validUntil.toISOString() : null,
        manual_override: true,
        blocked_reason: null,
      });

    if (subErr) {
      // rollback profile; user só se foi criado agora
      await supabaseAdmin.from("profiles").delete().eq("id", newUserId);
      if (!reusedExistingUser) {
        await supabaseAdmin.auth.admin.deleteUser(newUserId);
      }
      return json(400, { error: `Erro ao criar assinatura: ${subErr.message}` });
    }

    return json(200, {
      success: true,
      companyId,
      userId: newUserId,
      adminEmail,
      reusedExistingUser,
    });
  } catch (error: any) {
    return json(400, { error: error?.message ?? String(error) });
  }
});
