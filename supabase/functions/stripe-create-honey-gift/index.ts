import { createClient } from 'npm:@supabase/supabase-js@2'
import Stripe from 'npm:stripe@17'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-12-18.acacia' as any })

const PRICES: Record<string, { unit_amount: number; label: string }> = {
  'basic:month': { unit_amount: 299, label: 'Cubbly Honey Basic — 1 month (Gift)' },
  'basic:year':  { unit_amount: 3588, label: 'Cubbly Honey Basic — 1 year (Gift)' },
  'honey:month': { unit_amount: 799, label: 'Cubbly Honey — 1 month (Gift)' },
  'honey:year':  { unit_amount: 7670, label: 'Cubbly Honey — 1 year (Gift)' },
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const token = authHeader.replace('Bearer ', '')
    const { data: claims, error: authErr } = await supabase.auth.getClaims(token)
    if (authErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const userId = claims.claims.sub as string
    const email = (claims.claims as any).email as string | undefined

    const body = await req.json().catch(() => ({}))
    const conversationId = body?.conversation_id as string
    const tier = body?.tier as string
    const interval = body?.interval as string
    const message = (body?.message ?? null) as string | null
    if (!conversationId || !tier || !interval) {
      return new Response(JSON.stringify({ error: 'missing_fields' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const key = `${tier}:${interval}`
    const cfg = PRICES[key]
    if (!cfg) {
      return new Response(JSON.stringify({ error: 'invalid_plan' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Verify caller is a participant.
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: isPart } = await admin.rpc('is_conversation_participant', {
      _conversation_id: conversationId, _user_id: userId,
    })
    if (!isPart) {
      return new Response(JSON.stringify({ error: 'not_a_participant' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const origin = req.headers.get('origin') || 'https://web.cubbly.app'
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: cfg.unit_amount,
          product_data: { name: cfg.label },
        },
      }],
      success_url: `${origin}/@me/chat/${conversationId}?honey_gift=success`,
      cancel_url: `${origin}/@me/chat/${conversationId}?honey_gift=cancel`,
      metadata: {
        kind: 'honey_gift',
        user_id: userId,
        conversation_id: conversationId,
        tier,
        interval,
        gift_message: (message ?? '').slice(0, 140),
        price_cents: String(cfg.unit_amount),
      },
    })

    return new Response(JSON.stringify({ url: session.url }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e: any) {
    console.error('[stripe-create-honey-gift]', e)
    return new Response(JSON.stringify({ error: e?.message || 'unknown' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
