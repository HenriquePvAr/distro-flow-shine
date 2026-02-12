import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // 1. Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Recebe os dados do Front-end
    const { companyId, plan, price, cpfCnpj } = await req.json()
    
    // Pega as chaves do ambiente
    const ASAAS_API_KEY = Deno.env.get('ASAAS_ACCESS_TOKEN')
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    // Validações Básicas
    if (!ASAAS_API_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
      throw new Error('Chaves de API (Asaas ou Supabase) não configuradas no servidor.')
    }
    if (!companyId) throw new Error('companyId é obrigatório')
    if (!cpfCnpj) throw new Error('CPF/CNPJ é obrigatório para emitir cobrança')

    console.log(`Processando assinatura. Empresa: ${companyId}, CPF: ${cpfCnpj}`)

    // 2. SALVAR O CPF NO BANCO DE DADOS (Supabase)
    // Isso garante que o CPF fica salvo para a próxima vez
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    
    const { error: dbError } = await supabase
      .from('company_subscriptions')
      .update({ cpf_cnpj: cpfCnpj }) // Salva o CPF na coluna nova
      .eq('company_id', companyId)

    if (dbError) {
      console.error('Erro ao salvar CPF no banco:', dbError)
      // Não vamos travar o processo se der erro aqui, mas logamos o aviso
    } else {
      console.log('CPF salvo no banco com sucesso.')
    }

    // 3. COMUNICAÇÃO COM O ASAAS
    const headers = {
      'access_token': ASAAS_API_KEY,
      'Content-Type': 'application/json'
    }

    // 3.1 Buscar cliente existente
    const searchResponse = await fetch(
      `https://www.asaas.com/api/v3/customers?externalReference=${companyId}`,
      { headers }
    )
    const searchData = await searchResponse.json()
    let customerId = searchData.data?.[0]?.id

    // 3.2 Criar ou Atualizar Cliente
    if (!customerId) {
      // --- CRIAR NOVO ---
      console.log('Criando novo cliente no Asaas...')
      const createRes = await fetch('https://www.asaas.com/api/v3/customers', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: `Empresa ${companyId}`,
          externalReference: companyId,
          cpfCnpj: cpfCnpj // Envia o CPF
        })
      })
      const createData = await createRes.json()
      
      if (createData.errors) {
        throw new Error(`Erro Asaas (Criar Cliente): ${createData.errors[0].description}`)
      }
      customerId = createData.id

    } else {
      // --- ATUALIZAR EXISTENTE ---
      // Importante: Se o cliente já existia mas estava sem CPF, isso corrige o erro.
      console.log(`Atualizando cliente ${customerId} com CPF...`)
      await fetch(`https://www.asaas.com/api/v3/customers/${customerId}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ cpfCnpj: cpfCnpj })
      })
    }

    // 4. CRIAR A COBRANÇA (Pagamento)
    const billingType = "UNDEFINED" // Permite Boleto, Pix ou Cartão
    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + 3) // Vencimento para 3 dias
    
    const paymentRes = await fetch('https://www.asaas.com/api/v3/payments', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        customer: customerId,
        billingType: billingType,
        value: price,
        dueDate: dueDate.toISOString().split('T')[0],
        description: `Assinatura ${plan || 'Mensal'} - Sistema Distro`,
        externalReference: `sub_${companyId}_${Date.now()}` // ID único para essa transação
      })
    })

    const paymentData = await paymentRes.json()

    if (paymentData.errors) {
      console.error('Erro Asaas Pagamento:', paymentData.errors)
      throw new Error(`Erro Asaas (Pagamento): ${paymentData.errors[0].description}`)
    }

    // 5. RETORNAR SUCESSO
    return new Response(
      JSON.stringify({ 
        paymentUrl: paymentData.invoiceUrl || paymentData.bankSlipUrl,
        paymentId: paymentData.id 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error: any) {
    console.error('Erro Edge Function:', error.message)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 // Bad Request
      }
    )
  }
})