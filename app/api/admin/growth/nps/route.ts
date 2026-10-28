import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireGrowthAccess } from '@/lib/adminAccess'

export const runtime = 'nodejs'

// Respostas de NPS dos lojistas, com o nome da loja e o WhatsApp.
export async function GET() {
  const access = await requireGrowthAccess()
  if (!access) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  const { data, error } = await createAdminClient()
    .from('nps_responses')
    .select('id, score, comment, created_at, establishment_id, establishments(name, whatsapp_number)')
    .order('created_at', { ascending: false })
    .limit(300)
  if (error) return NextResponse.json({ error: 'Não foi possível carregar as respostas.' }, { status: 500 })
  return NextResponse.json({ responses: data })
}
