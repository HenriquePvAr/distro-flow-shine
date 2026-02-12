import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const ASAAS_TOKEN = Deno.env.get("ASAAS_ACCESS_TOKEN")!;
const ASAAS_URL = "https://api.asaas.com/v3";

function todayYMD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Use POST" }), { status: 405 });
    }

    const { companyId, price } = await req.json();

    if (!companyId) {
      return new Response(JSON.stringify({ error: "companyId é obrigatório" }), { status: 400 });
    }

    const value = Number(price ?? 120);
    if (!Number.isFinite(value) || value <= 0) {
      return new Response(JSON.stringify({ error: "price inválido" }), { status: 400 });
    }

    // 1) procurar customer existente (por externalReference)
    const searchRes = await fetch(
      `${ASAAS_URL}/customers?externalReference=${encodeURIComponent(String(companyId))}`,
      { headers: { access_token: ASAAS_TOKEN } }
    );

    const search = await searchRes.json();
    let customerId: string | null = search?.data?.[0]?.id ?? null;

    // 2) criar customer se não existir
    if (!customerId) {
      const customerRes = await fetch(`${ASAAS_URL}/customers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          access_token: ASAAS_TOKEN,
        },
        body: JSON.stringify({
          name: `Empresa ${companyId}`,
          externalReference: String(companyId),
        }),
      });

      const customer = await customerRes.json();
      if (!customer?.id) {
        return new Response(JSON.stringify({ error: "Falha ao criar customer", details: customer }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      customerId = customer.id;
    }

    // 3) criar pagamento (link)
    const paymentRes = await fetch(`${ASAAS_URL}/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        access_token: ASAAS_TOKEN,
      },
      body: JSON.stringify({
        customer: customerId,
        billingType: "UNDEFINED", // Asaas decide (pix/boleto/cartão) conforme sua conta
        value,
        dueDate: todayYMD(),
        description: "Assinatura mensal - SaaS",
        externalReference: String(companyId),
      }),
    });

    const payment = await paymentRes.json();

    if (!payment?.invoiceUrl) {
      return new Response(JSON.stringify({ error: "Falha ao criar pagamento", details: payment }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ paymentUrl: payment.invoiceUrl }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || "Erro interno" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
