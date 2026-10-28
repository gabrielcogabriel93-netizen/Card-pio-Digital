import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireGrowthAccess } from '@/lib/adminAccess'
import { loadGrowthMetrics } from '@/lib/growthData'
import { buildInsights } from '@/lib/growthInsights'
import { logError, logWarning } from '@/lib/logger'

export const runtime = 'nodejs'
export const maxDuration = 120

const SYSTEM = [
  'Você é consultor de crescimento de um SaaS brasileiro de cardápio digital e pedidos online para pequenos negócios (pizzarias, lanchonetes, lojas).',
  'Recebe as métricas reais dos últimos 30 dias e o parecer automático já calculado.',
  'Escreva em português do Brasil, direto e prático, para o dono e para quem faz o contato com os lojistas.',
  'Estrutura: 1) o principal gargalo agora e por quê; 2) as 3 a 5 ações mais importantes para esta semana, em ordem; 3) o que está indo bem.',
  'Use só os números recebidos, não invente dados. Se faltar dado para concluir algo, diga qual dado falta. No máximo 450 palavras. Não use travessão.',
].join('\n')

// Parecer escrito por IA (opcional): usa ANTHROPIC_API_KEY ou GEMINI_API_KEY.
// Sem chave, o parecer automático por regras continua na tela.
export async function POST() {
  const access = await requireGrowthAccess()
  if (!access) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  if (!process.env.ANTHROPIC_API_KEY && !process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'Para o parecer por IA, configure ANTHROPIC_API_KEY ou GEMINI_API_KEY na Vercel. O parecer automático acima já funciona sem chave.' }, { status: 400 })
  }

  try {
    const { metrics, billingEnabled } = await loadGrowthMetrics(createAdminClient(), 30)
    const insights = buildInsights(metrics, { billingEnabled })
    const input = JSON.stringify({ metricas: metrics, parecer_automatico: insights.items.map((i) => ({ area: i.area, gravidade: i.severity, titulo: i.title, detalhe: i.detail })) })

    if (process.env.ANTHROPIC_API_KEY) {
      const client = new Anthropic({ timeout: 90_000, maxRetries: 1 })
      const response = await client.beta.messages.create({
        model: 'claude-opus-5-5',
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low' },
        system: SYSTEM,
        messages: [{ role: 'user', content: input }],
      })
      if (response.stop_reason === 'refusal') {
        return NextResponse.json({ error: 'A IA não conseguiu escrever o parecer agora. Use o parecer automático.' }, { status: 502 })
      }
      const text = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim()
      if (!text) throw new Error('resposta vazia')
      return NextResponse.json({ text, provider: 'claude' })
    }

    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY || '' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ role: 'user', parts: [{ text: input }] }] }),
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) throw new Error(`Gemini respondeu ${res.status}`)
    const data = await res.json()
    const text = (data?.candidates?.[0]?.content?.parts || []).map((p: { text?: string }) => p.text || '').join('').trim()
    if (!text) throw new Error('resposta vazia')
    return NextResponse.json({ text, provider: 'gemini' })
  } catch (err) {
    if (err instanceof Anthropic.APIError) logWarning('api:admin:growth:ai', `IA respondeu ${err.status}`, err.message)
    else logError('api:admin:growth:ai', 'erro ao gerar parecer por IA', err)
    return NextResponse.json({ error: 'Não foi possível gerar o parecer por IA agora.' }, { status: 502 })
  }
}
