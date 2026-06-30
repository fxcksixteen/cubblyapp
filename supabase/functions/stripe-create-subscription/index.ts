import { createClient } from 'npm:@supabase/supabase-js@2'
import Stripe from 'npm:stripe@17'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-12-18.acacia' as any })

// Price config — Cubbly Honey
const PRICES: Record<string, { unit_amount: number; recurring: { interval: 'month' | 'year' }; product_name: string }> = {
  'basic:monthly': { unit_amount: 299, recurring: { interval: 'month' }, product_name: 'Cubbly Honey Basic (Monthly)' },
  'basic:annual':  { unit_amount: 3588, recurring: { interval: 'year' }, product_name: 'Cubbly Honey Basic (Annual)' },
  'honey:monthly': { unit_amount: 799, recurring: { interval: 'month' }, product_name: 'Cubbly Honey (Monthly)' },
  'honey:annual':  { unit_amount: 7670, recurring: { interval: 'year' }, product_name: 'Cubbly Honey (Annual)' },
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
    const tier = body?.tier as string
    const interval = body?.interval as string
    const key = `${tier}:${interval}`
    const cfg = PRICES[key]
    if (!cfg) {
      return new Response(JSON.stringify({ error: 'invalid_plan' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Reuse existing Stripe customer if we have one for this user.
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: existing } = await admin.from('subscriptions').select('stripe_customer_id').eq('user_id', userId).maybeSingle()
    let customerId = existing?.stripe_customer_id as string | undefined
    if (!customerId) {
      const cust = await stripe.customers.create({ email, metadata: { user_id: userId } })
      customerId = cust.id
    }

    const origin = req.headers.get('origin') || 'https://web.cubbly.app'
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: cfg.unit_amount,
          recurring: cfg.recurring,
          product_data: { name: cfg.product_name },
        },
      }],
      success_url: `${origin}/@me/honey?checkout=success`,
      cancel_url: `${origin}/@me/honey?checkout=cancel`,
      metadata: { user_id: userId, tier, interval, kind: 'subscription' },
      subscription_data: { metadata: { user_id: userId, tier, interval } },
      allow_promotion_codes: true,
    })

    return new Response(JSON.stringify({ url: session.url }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e: any) {
    console.error('[stripe-create-subscription]', e)
    return new Response(JSON.stringify({ error: e?.message || 'unknown' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
