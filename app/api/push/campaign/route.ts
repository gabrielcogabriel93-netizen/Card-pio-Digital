import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOwnerStore } from '@/lib/ownerStore'
import { resolveTargets, sendToTargets, AUDIENCE_LABELS, type Audience } from '@/lib/customerPush'
import { logError } from '@/lib/logger'
import { PUSH_BODY_MAX, PUSH_TITLE_MAX } from '@/lib/pushAudience'

export const runtime = 'nodejs'

interface Store {
  id: string
  name: string
  slug: string
  logo_url: string | null
  timezone: string | null
  inactive_customer_days: number | null
}

const STORE_COLUMNS = 'id, name, slug, logo_url, timezone, inactive_customer_days'
const AUDIENCES = Object.keys(AUDIENCE_LABELS) as Audience[]
// Notificação demais faz o cliente bloquear: limite por dia por loja.
const MAX_BROADCASTS_PER_DAY = 3
const MAX_DIRECT_PER_DAY = 100

// Quantos aparelhos o público alcança (prévia antes de enviar).
export async function GET(request: NextRequest) {
  const store = await getOwnerStore<Store>(STORE_COLUMNS)
  if (!store) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const audience = request.nextUrl.searchParams.get('audience') as Audience
  if (!AUDIENCES.includes(audience)) return NextResponse.json({ error: 'Público inválido' }, { status: 400 })
  const admin = createAdminClient()
  const targets = await resolveTargets(admin, store, audience, request.nextUrl.searchParams.get('value'))
  return NextResponse.json({ count: targets.length })
}

export async function POST(request: NextRequest) {
  const store = await getOwnerStore<Store>(STORE_COLUMNS)
  if (!store) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  let body: { title?: string; body?: string; audience?: Audience; audience_value?: string; product_id?: string; source?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const title = (body.title || '').trim().slice(0, PUSH_TITLE_MAX)
  const text = (body.body || '').trim().slice(0, PUSH_BODY_MAX)
  const audience = body.audience as Audience
  if (!title || !text) return NextResponse.json({ error: 'Escreva o título e a mensagem.' }, { status: 400 })
  if (!AUDIENCES.includes(audience)) return NextResponse.json({ error: 'Escolha para quem enviar.' }, { status: 400 })
  const source = ['manual', 'sugestao', 'aniversario', 'carrinho', 'sumido'].includes(body.source || '') ? body.source! : 'manual'

  const admin = createAdminClient()

  const since = new Date(Date.now() - 24 * 3600e3).toISOString()
  const isDirect = audience === 'customer'
  const { count } = await admin
    .from('push_campaigns')
    .select('id', { count: 'exact', head: true })
    .eq('establishment_id', store.id)
    .gte('created_at', since)
    [isDirect ? 'eq' : 'neq']('audience', 'customer')
  if ((count || 0) >= (isDirect ? MAX_DIRECT_PER_DAY : MAX_BROADCASTS_PER_DAY)) {
    return NextResponse.json({
      error: isDirect
        ? 'Limite de mensagens individuais de hoje atingido.'
        : `Você já mandou ${MAX_BROADCASTS_PER_DAY} notificações para vários clientes nas últimas 24 horas. Mais que isso faz o cliente desativar os avisos.`,
    }, { status: 429 })
  }

  // Link: cardápio, ou o produto direto (abre a ficha dele).
  let url = `/loja/${store.slug}`
  let image: string | null = null
  if (body.product_id) {
    const { data: product } = await admin.from('products').select('id, image_url').eq('id', body.product_id).eq('establishment_id', store.id).maybeSingle()
    if (product) {
      url = `/loja/${store.slug}?produto=${product.id}`
      image = product.image_url
    }
  }

  try {
    const targets = await resolveTargets(admin, store, audience, body.audience_value)
    if (targets.length === 0) {
      return NextResponse.json({ error: 'Nenhum aparelho desse público está com os avisos ativos ainda.' }, { status: 400 })
    }

    const { data: campaign, error } = await admin
      .from('push_campaigns')
      .insert({
        establishment_id: store.id, title, body: text, image_url: image, url, audience,
        audience_value: isDirect ? (body.audience_value || '').replace(/\D/g, '') : null,
        source, target_count: targets.length,
      })
      .select('id')
      .single()
    if (error) throw error

    const result = await sendToTargets(admin, targets, {
      title, body: text, url, icon: store.logo_url, image, campaignId: campaign.id, tag: `campanha-${campaign.id}`,
    })
    await admin.from('push_campaigns').update({ sent_count: result.sent, failed_count: result.failed }).eq('id', campaign.id)
    return NextResponse.json({ id: campaign.id, target: targets.length, sent: result.sent, failed: result.failed })
  } catch (err) {
    logError('api:push:campaign', 'erro ao enviar notificação da loja', err, store.id)
    return NextResponse.json({ error: 'Não foi possível enviar agora.' }, { status: 500 })
  }
}
