// supabase/functions/create-subscription/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const ASAAS_TOKEN = Deno.env.get("ASAAS_ACCESS_TOKEN");
const ASAAS_URL = "https://api.asaas.com/v3";

// ✅ CORS
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function addDaysYMD(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

serve(async (req) => {
  // ✅ Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return json({ error: "Use POST" }, 405);
    }

    if (!ASAAS_TOKEN) {
      return json(
        {
          error:
            "Missing secret ASAAS_ACCESS_TOKEN. Configure em: Supabase Dashboard > Edge Functions > Secrets",
        },
        500
      );
    }

    // Body
    const body = await req.json().catch(() => null);
    const companyId = body?.companyId;
    const price = body?.price;
    const cycle = String(body?.cycle ?? "MONTHLY");

    if (!companyId) return json({ error: "companyId é obrigatório" }, 400);

    const value = Number(price ?? 120);
    if (!Number.isFinite(value) || value <= 0) {
      return json({ error: "price inválido" }, 400);
    }

    // ✅ Header correto do Asaas: access_token (não Bearer)
    const asaasHeaders: HeadersInit = {
      "Content-Type": "application/json",
      access_token: ASAAS_TOKEN,
    };

    // 1) Buscar customer por externalReference
    const searchRes = await fetch(
      `${ASAAS_URL}/customers?externalReference=${encodeURIComponent(
        String(companyId)
      )}`,
      { headers: asaasHeaders }
    );

    const searchJson = await searchRes.json().catch(() => ({}));

    if (!searchRes.ok) {
      return json(
        {
          error: "Falha ao buscar customer no Asaas",
          status: searchRes.status,
          details: searchJson,
        },
        400
      );
    }

    let customerId: string | null = searchJson?.data?.[0]?.id ?? null;

    // 2) Criar customer se não existir
    if (!customerId) {
      const customerRes = await fetch(`${ASAAS_URL}/customers`, {
        method: "POST",
        headers: asaasHeaders,
        body: JSON.stringify({
          name: `Empresa ${companyId}`,
          externalReference: String(companyId),
        }),
      });

      const customerJson = await customerRes.json().catch(() => ({}));

      if (!customerRes.ok || !customerJson?.id) {
        return json(
          {
            error: "Falha ao criar customer no Asaas",
            status: customerRes.status,
            details: customerJson,
          },
          400
        );
      }

      customerId = customerJson.id;
    }

    // 3) Criar cobrança (payment link)
    // ⚠️ Isso cria UMA cobrança. Para recorrência real, depois usamos /subscriptions.
    const dueDate = addDaysYMD(1); // amanhã

    const paymentRes = await fetch(`${ASAAS_URL}/payments`, {
      method: "POST",
      headers: asaasHeaders,
      body: JSON.stringify({
        customer: customerId,
        billingType: "UNDEFINED", // Asaas deixa o pagador escolher (pix/boleto/cartão) se sua conta permitir
        value,
        dueDate,
        description: `Assinatura ${cycle} - SaaS`,
        externalReference: String(companyId),
      }),
    });

    const paymentJson = await paymentRes.json().catch(() => ({}));

    if (!paymentRes.ok) {
      return json(
        {
          error: "Falha ao criar cobrança no Asaas",
          status: paymentRes.status,
          details: paymentJson,
        },
        400
      );
    }

    const paymentUrl = paymentJson?.invoiceUrl || paymentJson?.bankSlipUrl || null;

    if (!paymentUrl) {
      return json(
        {
          error: "Cobrança criada mas não veio invoiceUrl/bankSlipUrl",
          details: paymentJson,
        },
        400
      );
    }

    return json(
      {
        paymentUrl,
        asaas: {
          paymentId: paymentJson?.id ?? null,
          customerId,
          dueDate,
        },
      },
      200
    );
  } catch (err: any) {
    return json(
      { error: err?.message || "Erro interno", details: String(err) },
      500
    );
  }
});
