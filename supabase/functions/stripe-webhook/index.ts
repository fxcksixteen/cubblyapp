import { createClient } from 'npm:@supabase/supabase-js@2'
import Stripe from 'npm:stripe@17'

// No CORS — Stripe calls server-to-server.
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-12-18.acacia' as any })
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!

async function logEvent(userId: string | null, eventId: string, type: string, payload: unknown) {
  await admin.from('subscription_events').insert({
    user_id: userId,
    stripe_event_id: eventId,
    event_type: type,
    payload: payload as any,
  }).select().maybeSingle()
}

async function upsertSubFromStripe(sub: Stripe.Subscription) {
  const userId = (sub.metadata?.user_id as string) || null
  if (!userId) {
    // Try to find via customer
    const { data } = await admin.from('subscriptions').select('user_id').eq('stripe_customer_id', sub.customer as string).maybeSingle()
    if (!data?.user_id) { console.warn('[stripe-webhook] no user mapping for sub', sub.id); return }
  }
  const tier = (sub.metadata?.tier as 'basic' | 'honey') || 'basic'
  const interval = (sub.items.data[0]?.price?.recurring?.interval === 'year' ? 'annual' : 'monthly') as 'monthly' | 'annual'
  const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null

  const resolvedUser = userId ?? (await admin.from('subscriptions').select('user_id').eq('stripe_customer_id', sub.customer as string).maybeSingle()).data?.user_id
  if (!resolvedUser) return

  await admin.from('subscriptions').upsert({
    user_id: resolvedUser,
    tier,
    interval,
    status: sub.status,
    stripe_customer_id: sub.customer as string,
    stripe_subscription_id: sub.id,
    current_period_end: periodEnd,
    cancel_at_period_end: sub.cancel_at_period_end,
  }, { onConflict: 'user_id' })
}

async function creditGems(userId: string, amount: number, reason: string, sourceRef: string) {
  // Insert/upsert balance
  const { data: existing } = await admin.from('gems_balances').select('balance, lifetime_earned').eq('user_id', userId).maybeSingle()
  const newBalance = (existing?.balance ?? 0) + amount
  await admin.from('gems_balances').upsert({
    user_id: userId,
    balance: newBalance,
    lifetime_earned: (existing?.lifetime_earned ?? 0) + amount,
  }, { onConflict: 'user_id' })
  await admin.from('gems_transactions').insert({
    user_id: userId,
    amount,
    reason,
    source_ref: sourceRef,
    balance_after: newBalance,
  })
}

Deno.serve(async (req) => {
  const signature = req.headers.get('stripe-signature')
  if (!signature) return new Response('missing signature', { status: 400 })

  const raw = await req.text()
  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(raw, signature, WEBHOOK_SECRET)
  } catch (e: any) {
    console.error('[stripe-webhook] bad signature', e?.message)
    return new Response(`bad signature: ${e?.message}`, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object as Stripe.Checkout.Session
        const userId = (s.metadata?.user_id as string) || null
        const kind = s.metadata?.kind as string

        if (kind === 'subscription' && s.subscription) {
          const sub = await stripe.subscriptions.retrieve(s.subscription as string)
          await upsertSubFromStripe(sub)
        } else if (kind === 'gems_purchase' && userId) {
          const gems = Number(s.metadata?.gems || 0)
          if (gems > 0) await creditGems(userId, gems, 'purchase', s.id)
        } else if (kind === 'honey_gift' && userId) {
          const conversationId = s.metadata?.conversation_id as string
          const tier = (s.metadata?.tier as 'basic' | 'honey') || 'honey'
          const interval = (s.metadata?.interval as 'month' | 'year') || 'month'
          const giftMessage = (s.metadata?.gift_message as string) || null
          const priceCents = Number(s.metadata?.price_cents || 0)
          if (conversationId) {
            const { data: gift } = await admin.from('honey_gifts').insert({
              sender_id: userId,
              conversation_id: conversationId,
              tier,
              billing_interval: interval,
              payment_source: 'stripe',
              price_amount: priceCents,
              status: 'pending',
              message: giftMessage,
              stripe_session_id: s.id,
            }).select('id').single()
            if (gift?.id) {
              const marker = '[[cubbly:honey-gift:v1]]'
              const payload = {
                giftId: gift.id,
                tier,
                interval,
                message: giftMessage,
              }
              await admin.from('messages').insert({
                conversation_id: conversationId,
                sender_id: userId,
                content: marker + JSON.stringify(payload),
              })
            }
          }
        }
        await logEvent(userId, event.id, event.type, s)
        break
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        if (event.type === 'customer.subscription.deleted') {
          await admin.from('subscriptions')
            .update({ status: 'canceled' })
            .eq('stripe_subscription_id', sub.id)
        } else {
          await upsertSubFromStripe(sub)
        }
        await logEvent((sub.metadata?.user_id as string) || null, event.id, event.type, sub)
        break
      }
      case 'invoice.paid': {
        const inv = event.data.object as Stripe.Invoice
        const subId = inv.subscription as string | null
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId)
          await upsertSubFromStripe(sub)
          // Honey monthly gems stipend
          const tier = sub.metadata?.tier as string
          const userId = sub.metadata?.user_id as string
          if (tier === 'honey' && userId) {
            await creditGems(userId, 500, 'honey_monthly_stipend', inv.id)
          }
        }
        await logEvent(null, event.id, event.type, inv)
        break
      }
      case 'invoice.payment_failed': {
        const inv = event.data.object as Stripe.Invoice
        if (inv.subscription) {
          await admin.from('subscriptions')
            .update({ status: 'past_due' })
            .eq('stripe_subscription_id', inv.subscription as string)
        }
        await logEvent(null, event.id, event.type, inv)
        break
      }
      case 'charge.refunded': {
        const ch = event.data.object as Stripe.Charge
        await logEvent(null, event.id, event.type, ch)
        break
      }
      default:
        await logEvent(null, event.id, event.type, event.data.object)
    }
    return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (e: any) {
    console.error('[stripe-webhook] handler error', e)
    return new Response(`error: ${e?.message}`, { status: 500 })
  }
})
