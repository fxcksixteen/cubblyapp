import { createClient } from 'npm:@supabase/supabase-js@2'
import Stripe from 'npm:stripe@17'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-12-18.acacia' as any })

const BUNDLES: Record<string, { gems: number; unit_amount: number }> = {
  '100':  { gems: 100,  unit_amount: 99 },
  '500':  { gems: 500,  unit_amount: 499 },
  '1200': { gems: 1200, unit_amount: 999 },
  '2500': { gems: 2500, unit_amount: 1999 },
  '6500': { gems: 6500, unit_amount: 4999 },
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
    const bundleKey = String(body?.bundle || '')
    const cfg = BUNDLES[bundleKey]
    if (!cfg) {
      return new Response(JSON.stringify({ error: 'invalid_bundle' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: existing } = await admin.from('subscriptions').select('stripe_customer_id').eq('user_id', userId).maybeSingle()
    let customerId = existing?.stripe_customer_id as string | undefined
    if (!customerId) {
      const cust = await stripe.customers.create({ email, metadata: { user_id: userId } })
      customerId = cust.id
    }

    const origin = req.headers.get('origin') || 'https://web.cubbly.app'
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: cfg.unit_amount,
          product_data: { name: `${cfg.gems} Cubbly Gems` },
        },
      }],
      success_url: `${origin}/@me/shop?gems=success`,
      cancel_url: `${origin}/@me/shop?gems=cancel`,
      metadata: { user_id: userId, kind: 'gems_purchase', gems: String(cfg.gems) },
    })

    return new Response(JSON.stringify({ url: session.url }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e: any) {
    console.error('[stripe-create-gems-purchase]', e)
    return new Response(JSON.stringify({ error: e?.message || 'unknown' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
