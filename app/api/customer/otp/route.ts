import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { whatsappServer } from '@/lib/whatsappServer'
import { logError } from '@/lib/logger'

export const runtime = 'nodejs'

// Envia um código de 6 dígitos pelo WhatsApp DA LOJA para o cliente
// confirmar o telefone num aparelho novo (migration 045). Com o código
// confirmado (verify_customer_otp, chamado direto do navegador), o
// aparelho recebe um token e passa a ver endereços, pontos e pedidos.
// O código é gerado e guardado (com hash) no banco; esta rota só entrega.
export async function POST(request: NextRequest) {
  let body: { establishment_id?: string; phone?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const establishmentId = body.establishment_id || ''
  const phone = (body.phone || '').replace(/\D/g, '')
  if (!establishmentId || phone.length < 10) {
    return NextResponse.json({ error: 'Informe um telefone com DDD.' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: establishment } = await admin
    .from('establishments')
    .select('id, name')
    .eq('id', establishmentId)
    .maybeSingle()
  if (!establishment) return NextResponse.json({ error: 'Loja não encontrada.' }, { status: 404 })

  // Só manda código para quem já tem cadastro nesta loja (não vira um
  // jeito de disparar mensagem para qualquer número).
  const { data: customer } = await admin
    .from('customers')
    .select('id')
    .eq('establishment_id', establishmentId)
    .eq('phone', phone)
    .maybeSingle()
  if (!customer) {
    return NextResponse.json({ error: 'Não encontramos cadastro com esse telefone nesta loja.' }, { status: 404 })
  }

  const { data: code, error } = await admin.rpc('create_customer_otp', { p_establishment_id: establishmentId, p_phone: phone })
  if (error) {
    const message = error.message?.includes('Muitos') ? error.message : 'Não foi possível gerar o código agora.'
    return NextResponse.json({ error: message }, { status: 429 })
  }

  try {
    await whatsappServer.send(
      establishmentId,
      phone,
      `${establishment.name}: seu código de confirmação é ${code}. Ele vale por 10 minutos. Não compartilhe com ninguém.`
    )
  } catch (err) {
    logError('api:customer:otp', 'erro ao enviar código pelo WhatsApp', err)
    return NextResponse.json(
      { error: 'A loja não está com o envio pelo WhatsApp ativo agora. Faça seu pedido normalmente: seus pontos continuam somando.' },
      { status: 503 }
    )
  }

  return NextResponse.json({ sent: true })
}
