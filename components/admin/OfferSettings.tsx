'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast, confirmDialog } from '@/components/Feedback'
import { ctaLabel, discountText, daysText, normalizeCampaignCode } from '@/lib/offer'
import { Copy, Loader2, Megaphone, Pencil, Plus, Trash2, Gift } from 'lucide-react'

interface Campaign {
  code: string
  name: string
  trial_days: number
  discount_percent: number
  discount_months: number
  starts_at: string | null
  ends_at: string | null
  is_active: boolean
  note: string | null
  stores: number
  paying: number
}

interface Settings { billing_enabled: boolean; trial_enabled: boolean; trial_days: number }

const EMPTY = { code: '', name: '', trial_days: '0', discount_percent: '0', discount_months: '0', starts_at: '', ends_at: '', note: '' }
const toLocalInput = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : '')
const dateBR = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : null)

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Erro ao salvar.')
  return data
}

function status(c: Campaign): { label: string; cls: string } {
  const now = Date.now()
  if (!c.is_active) return { label: 'Desativada', cls: 'bg-gray-100 text-gray-600' }
  if (c.starts_at && new Date(c.starts_at).getTime() > now) return { label: 'Agendada', cls: 'bg-blue-50 text-blue-700' }
  if (c.ends_at && new Date(c.ends_at).getTime() <= now) return { label: 'Encerrada', cls: 'bg-gray-100 text-gray-600' }
  return { label: 'Valendo', cls: 'bg-green-50 text-green-700' }
}

/**
 * Teste grátis do site (liga/desliga e prazo) e campanhas com link próprio
 * (migration 059). Tudo o que aparece para quem se cadastra sai daqui.
 */
export function OfferSettings() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [error, setError] = useState<string | null>(null)
  const [trialEnabled, setTrialEnabled] = useState(true)
  const [trialDays, setTrialDays] = useState('30')
  const [savingTrial, setSavingTrial] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [savingCampaign, setSavingCampaign] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await call('/api/admin/offer', 'GET')
      setSettings(data.settings)
      setTrialEnabled(data.settings.trial_enabled)
      setTrialDays(String(data.settings.trial_days))
      setCampaigns(data.campaigns)
      setError(null)
    } catch (err: any) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const saveTrial = async () => {
    if (!trialEnabled && !(await confirmDialog('Desligar o teste grátis? Novos cadastros (sem campanha) vão precisar assinar logo depois de criar a conta, e o site deixa de falar em dias grátis.'))) return
    setSavingTrial(true)
    try {
      await call('/api/admin/offer', 'PUT', { trial_enabled: trialEnabled, trial_days: Number(trialDays) })
      toast.success('Oferta salva. O site e o cadastro já mostram a nova condição.')
      load()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSavingTrial(false)
    }
  }

  const startEdit = (c?: Campaign) => {
    setEditing(c?.code || null)
    setForm(c ? {
      code: c.code, name: c.name, trial_days: String(c.trial_days), discount_percent: String(c.discount_percent),
      discount_months: String(c.discount_months), starts_at: toLocalInput(c.starts_at), ends_at: toLocalInput(c.ends_at), note: c.note || '',
    } : EMPTY)
    setShowForm(true)
  }

  const saveCampaign = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingCampaign(true)
    try {
      const body = {
        ...form,
        code: editing || form.code,
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      }
      await call('/api/admin/campaigns', editing ? 'PATCH' : 'POST', body)
      toast.success(editing ? 'Campanha salva.' : 'Campanha criada. Copie o link e envie ao parceiro.')
      setShowForm(false)
      load()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSavingCampaign(false)
    }
  }

  const toggle = async (c: Campaign) => {
    try {
      await call('/api/admin/campaigns', 'PATCH', { code: c.code, is_active: !c.is_active })
      load()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const remove = async (c: Campaign) => {
    if (!(await confirmDialog(`Excluir a campanha ${c.name}?`))) return
    try {
      await call(`/api/admin/campaigns?code=${encodeURIComponent(c.code)}`, 'DELETE')
      load()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const link = (code: string) => `${typeof window !== 'undefined' ? window.location.origin : ''}/p/${code}`
  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(link(code))
      toast.success('Link copiado')
    } catch {
      toast(link(code))
    }
  }

  if (error) return <div className="card text-sm text-amber-800 bg-amber-50 border border-amber-200">{error}</div>
  if (!settings) return <div className="card flex justify-center py-8"><Loader2 className="animate-spin text-primary-500" /></div>

  const preview = { trialDays: trialEnabled ? Number(trialDays) || 0 : 0, campaignCode: null, campaignName: null, discountPercent: 0, discountMonths: 0, campaignEndsAt: null }
  const formPreview = { trialDays: Number(form.trial_days) || 0, campaignCode: null, campaignName: form.name, discountPercent: Number(form.discount_percent) || 0, discountMonths: Number(form.discount_months) || 0, campaignEndsAt: null }

  return (
    <div className="space-y-6">
      <section className="card space-y-4">
        <div className="flex items-center gap-2">
          <Gift size={20} className="text-primary-600" />
          <h2 className="text-lg font-semibold text-gray-900">Teste grátis do site</h2>
        </div>
        <p className="text-sm text-gray-600">Vale para quem se cadastra pelo site sem link de campanha. Muda o banco e todos os textos: site, cadastro, login, planos e o aviso de bloqueio.</p>
        <div className="grid sm:grid-cols-2 gap-2">
          <button type="button" onClick={() => setTrialEnabled(true)} className={`text-left rounded-xl border-2 p-3 ${trialEnabled ? 'border-primary-500 bg-primary-50' : 'border-gray-200'}`}>
            <p className="font-medium text-gray-900">Com teste grátis</p>
            <p className="text-xs text-gray-500">A loja usa tudo liberado pelo prazo abaixo e depois escolhe o plano.</p>
          </button>
          <button type="button" onClick={() => setTrialEnabled(false)} className={`text-left rounded-xl border-2 p-3 ${!trialEnabled ? 'border-primary-500 bg-primary-50' : 'border-gray-200'}`}>
            <p className="font-medium text-gray-900">Sem teste (cobra desde o início)</p>
            <p className="text-xs text-gray-500">Depois de criar a conta, a loja assina para liberar o painel.</p>
          </button>
        </div>
        {trialEnabled && (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-gray-700">Prazo grátis</span>
            <input type="number" min={1} max={365} className="input-field w-24" value={trialDays} onChange={(e) => setTrialDays(e.target.value)} aria-label="Dias grátis" />
            <span className="text-gray-500">dias</span>
          </label>
        )}
        <p className="text-sm text-gray-600">O botão do site vai mostrar: <strong>“{ctaLabel(preview)}”</strong></p>
        {!settings.billing_enabled && <p className="text-xs text-amber-700">A cobrança da plataforma está desligada: hoje ninguém paga. Esta regra passa a valer quando a cobrança for ligada.</p>}
        <button onClick={saveTrial} disabled={savingTrial} className="btn-primary">{savingTrial ? <Loader2 size={16} className="animate-spin" /> : 'Salvar oferta'}</button>
        <p className="text-xs text-gray-500">Lojas já cadastradas mantêm o prazo que receberam.</p>
      </section>

      <section className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Megaphone size={20} className="text-primary-600" />
            <h2 className="text-lg font-semibold text-gray-900">Campanhas com link</h2>
          </div>
          <button onClick={() => startEdit()} className="btn-secondary text-sm"><Plus size={15} /> Nova campanha</button>
        </div>
        <p className="text-sm text-gray-600">Cada campanha tem um link próprio (ex.: o do parceiro ou o da Black Friday). Quem entra por ele recebe a condição da campanha enquanto ela estiver valendo. Fora do período, o link leva para a oferta normal do site.</p>

        {showForm && (
          <form onSubmit={saveCampaign} className="rounded-xl border border-gray-200 p-4 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="block text-gray-700 mb-1">Nome (aparece no cadastro e no pagamento)</span>
                <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Parceria João Marketing" required maxLength={80} />
              </label>
              <label className="text-sm">
                <span className="block text-gray-700 mb-1">Código do link</span>
                <input className="input-field" value={editing || form.code} disabled={!!editing} onChange={(e) => setForm({ ...form, code: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} placeholder="parceria-joao" required />
                {!editing && form.code && <span className="block text-xs text-gray-500 mt-1">{normalizeCampaignCode(form.code) ? link(form.code) : 'Use 2 a 40 letras minúsculas, números ou hífen.'}</span>}
              </label>
              <label className="text-sm">
                <span className="block text-gray-700 mb-1">Dias grátis (0 = cobra desde o início)</span>
                <input type="number" min={0} max={365} className="input-field" value={form.trial_days} onChange={(e) => setForm({ ...form, trial_days: e.target.value })} />
              </label>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <label>
                  <span className="block text-gray-700 mb-1">Desconto (%)</span>
                  <input type="number" min={0} max={90} className="input-field" value={form.discount_percent} onChange={(e) => setForm({ ...form, discount_percent: e.target.value })} />
                </label>
                <label>
                  <span className="block text-gray-700 mb-1">Por quantos meses</span>
                  <input type="number" min={0} max={24} className="input-field" value={form.discount_months} onChange={(e) => setForm({ ...form, discount_months: e.target.value })} />
                </label>
              </div>
              <label className="text-sm">
                <span className="block text-gray-700 mb-1">Começa em (opcional)</span>
                <input type="datetime-local" className="input-field" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} />
              </label>
              <label className="text-sm">
                <span className="block text-gray-700 mb-1">Termina em (opcional)</span>
                <input type="datetime-local" className="input-field" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} />
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="block text-gray-700 mb-1">Observação interna</span>
                <input className="input-field" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Ex.: acordo com o parceiro, comissão combinada…" maxLength={300} />
              </label>
            </div>
            <p className="text-sm text-gray-600">
              Quem entrar pelo link vê: <strong>“{ctaLabel(formPreview)}”</strong>
              {discountText(formPreview) ? <> e paga com <strong>{discountText(formPreview)}</strong> (aplicado no pagamento do Stripe, na primeira assinatura)</> : null}.
            </p>
            <div className="flex gap-2">
              <button type="submit" disabled={savingCampaign} className="btn-primary text-sm">{savingCampaign ? <Loader2 size={15} className="animate-spin" /> : editing ? 'Salvar campanha' : 'Criar campanha'}</button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary text-sm">Cancelar</button>
            </div>
          </form>
        )}

        {campaigns.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhuma campanha ainda.</p>
        ) : (
          <ul className="space-y-2">
            {campaigns.map((c) => {
              const st = status(c)
              const perks = [c.trial_days > 0 ? `${daysText(c.trial_days)} grátis` : 'cobra desde o início', discountText({ discountPercent: c.discount_percent, discountMonths: c.discount_months })].filter(Boolean).join(' · ')
              return (
                <li key={c.code} className="rounded-xl border border-gray-100 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-gray-900">{c.name}</p>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                    <span className="text-xs text-gray-500 ml-auto">{c.stores} loja(s) · {c.paying} assinante(s)</span>
                  </div>
                  <p className="text-sm text-gray-600 mt-0.5">{perks}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    /p/{c.code}
                    {c.starts_at ? ` · de ${dateBR(c.starts_at)}` : ''}
                    {c.ends_at ? ` · até ${dateBR(c.ends_at)}` : ''}
                    {c.note ? ` · ${c.note}` : ''}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <button onClick={() => copy(c.code)} className="btn-secondary text-xs py-1.5"><Copy size={13} /> Copiar link</button>
                    <button onClick={() => startEdit(c)} className="btn-secondary text-xs py-1.5"><Pencil size={13} /> Editar</button>
                    <button onClick={() => toggle(c)} className="btn-secondary text-xs py-1.5">{c.is_active ? 'Desativar' : 'Ativar'}</button>
                    {c.stores === 0 && <button onClick={() => remove(c)} className="btn-secondary text-xs py-1.5 text-red-600"><Trash2 size={13} /> Excluir</button>}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
