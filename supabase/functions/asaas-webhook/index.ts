import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  try {
    const body = await req.json();
    console.log("Webhook recebido:", body);

    const event = body.event;
    const payment = body.payment;

    if (!payment?.externalReference) {
      return new Response("ok");
    }

    const companyId = payment.externalReference;

    // pagamento confirmado
    if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
      await fetch(`${SUPABASE_URL}/rest/v1/company_subscriptions?company_id=eq.${companyId}`, {
        method: "PATCH",
        headers: {
          apikey: SERVICE_ROLE,
          Authorization: `Bearer ${SERVICE_ROLE}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: "active",
          current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          manual_override: false,
        }),
      });
    }

    // pagamento venceu
    if (event === "PAYMENT_OVERDUE") {
      await fetch(`${SUPABASE_URL}/rest/v1/company_subscriptions?company_id=eq.${companyId}`, {
        method: "PATCH",
        headers: {
          apikey: SERVICE_ROLE,
          Authorization: `Bearer ${SERVICE_ROLE}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: "past_due",
        }),
      });
    }

    return new Response("ok");
  } catch (err) {
    console.error(err);
    return new Response("error", { status: 500 });
  }
});
