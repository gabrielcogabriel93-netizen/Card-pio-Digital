'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { logError } from '@/lib/logger'
import { ImageUpload } from '@/components/ImageUpload'
import { SmartImage } from '@/components/SmartImage'
import { toast, confirmDialog } from '@/components/Feedback'
import { IMAGE_FORMATS } from '@/lib/imageFormats'
import { ArrowDown, ArrowUp, Eye, EyeOff, GalleryHorizontalEnd, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'

interface Banner {
  id: string
  title: string | null
  subtitle: string | null
  image_url: string | null
  link_type: 'nenhum' | 'produto' | 'combo' | 'categoria' | 'cupom'
  link_ref: string | null
  is_active: boolean
  starts_at: string | null
  ends_at: string | null
  display_order: number
  promotion_id: string | null
}
interface Option { id: string; name: string }

const EMPTY = { title: '', subtitle: '', image_url: '', link_type: 'nenhum' as Banner['link_type'], link_ref: '', starts_at: '', ends_at: '' }
const LINKS: { value: Banner['link_type']; label: string }[] = [
  { value: 'nenhum', label: 'Só mostrar (sem link)' },
  { value: 'produto', label: 'Abrir um produto' },
  { value: 'combo', label: 'Abrir um combo' },
  { value: 'categoria', label: 'Ir para uma categoria' },
  { value: 'cupom', label: 'Aplicar um cupom' },
]

/**
 * Banners do topo do cardápio (acima da busca): os do lojista, os mais
 * pedidos e os cupons divulgados (migration 060).
 */
export default function BannersPage() {
  const [estId, setEstId] = useState('')
  const [banners, setBanners] = useState<Banner[]>([])
  const [flags, setFlags] = useState({ banner_show_top: true, banner_show_coupons: true })
  const [targets, setTargets] = useState<{ produto: Option[]; combo: Option[]; categoria: Option[]; cupom: Option[] }>({ produto: [], combo: [], categoria: [], cupom: [] })
  const [loading, setLoading] = useState(true)
  const [needsMigration, setNeedsMigration] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: est } = await supabase.from('establishments').select('*').eq('owner_id', user.id).single()
      if (!est) return
      setEstId(est.id)
      setFlags({ banner_show_top: est.banner_show_top !== false, banner_show_coupons: est.banner_show_coupons !== false })
      const [b, p, c, cat, cp] = await Promise.all([
        supabase.from('store_banners').select('*').eq('establishment_id', est.id).order('display_order').order('created_at'),
        supabase.from('products').select('id, name').eq('establishment_id', est.id).eq('is_active', true).order('name'),
        supabase.from('combos').select('id, name').eq('establishment_id', est.id).eq('is_active', true).order('name'),
        supabase.from('categories').select('id, name').eq('establishment_id', est.id).order('display_order'),
        supabase.from('coupons').select('id, code').eq('establishment_id', est.id).eq('is_active', true).order('code'),
      ])
      if (b.error) setNeedsMigration(true)
      setBanners((b.data || []) as Banner[])
      setTargets({
        produto: p.data || [],
        combo: c.data || [],
        categoria: cat.data || [],
        cupom: (cp.data || []).map((x) => ({ id: x.code, name: x.code })),
      })
    } catch (err) {
      logError('painel:banners', 'erro ao carregar banners', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const saveFlag = async (key: 'banner_show_top' | 'banner_show_coupons', value: boolean) => {
    setFlags((f) => ({ ...f, [key]: value }))
    const { error } = await createClient().from('establishments').update({ [key]: value }).eq('id', estId)
    if (error) toast.error('Erro ao salvar: ' + error.message)
  }

  const startEdit = (b?: Banner) => {
    setEditing(b?.id || null)
    setForm(b ? {
      title: b.title || '', subtitle: b.subtitle || '', image_url: b.image_url || '', link_type: b.link_type, link_ref: b.link_ref || '',
      starts_at: b.starts_at ? b.starts_at.slice(0, 10) : '', ends_at: b.ends_at ? b.ends_at.slice(0, 10) : '',
    } : EMPTY)
    setShowForm(true)
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.image_url && !form.title.trim()) {
      toast.error('Envie uma imagem ou escreva um título para o banner.')
      return
    }
    if (form.link_type !== 'nenhum' && !form.link_ref) {
      toast.error('Escolha para onde o banner leva.')
      return
    }
    setSaving(true)
    const row = {
      establishment_id: estId,
      title: form.title.trim() || null,
      subtitle: form.subtitle.trim() || null,
      image_url: form.image_url || null,
      link_type: form.link_type,
      link_ref: form.link_type === 'nenhum' ? null : form.link_ref,
      starts_at: form.starts_at ? new Date(`${form.starts_at}T00:00:00`).toISOString() : null,
      ends_at: form.ends_at ? new Date(`${form.ends_at}T23:59:59`).toISOString() : null,
    }
    const supabase = createClient()
    const { error } = editing
      ? await supabase.from('store_banners').update(row).eq('id', editing)
      : await supabase.from('store_banners').insert({ ...row, display_order: banners.length })
    setSaving(false)
    if (error) {
      toast.error('Erro ao salvar: ' + error.message)
      return
    }
    toast.success('Banner salvo. Já aparece no topo do cardápio.')
    setShowForm(false)
    load()
  }

  const toggle = async (b: Banner) => {
    await createClient().from('store_banners').update({ is_active: !b.is_active }).eq('id', b.id)
    load()
  }
  const remove = async (b: Banner) => {
    if (!(await confirmDialog('Excluir este banner?'))) return
    await createClient().from('store_banners').delete().eq('id', b.id)
    load()
  }
  const move = async (index: number, dir: -1 | 1) => {
    const list = [...banners]
    const j = index + dir
    if (j < 0 || j >= list.length) return
    ;[list[index], list[j]] = [list[j], list[index]]
    setBanners(list)
    const supabase = createClient()
    await Promise.all(list.map((b, i) => supabase.from('store_banners').update({ display_order: i }).eq('id', b.id)))
  }

  const targetName = (b: Banner) => {
    if (b.link_type === 'nenhum' || !b.link_ref) return 'sem link'
    const list = targets[b.link_type] || []
    const name = list.find((x) => x.id === b.link_ref)?.name || 'item removido'
    return `${LINKS.find((l) => l.value === b.link_type)?.label.toLowerCase()}: ${name}`
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary-500" /></div>

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2"><GalleryHorizontalEnd size={24} className="text-primary-600" /> Banners do cardápio</h1>
          <p className="text-gray-600 mt-1">Aparecem no topo do cardápio, antes da busca, passando sozinhos. O cliente toca e vai direto para o produto, combo, categoria ou cupom.</p>
        </div>
        <button onClick={() => startEdit()} className="btn-primary" disabled={needsMigration}><Plus size={18} /> Novo banner</button>
      </div>

      {needsMigration && <p className="card text-sm text-amber-800 bg-amber-50 border border-amber-200">Os banners ficam disponíveis assim que a atualização do banco (migration 060) for aplicada.</p>}

      <section className="card space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Banners automáticos</h2>
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-1 rounded text-primary-500" checked={flags.banner_show_top} onChange={(e) => saveFlag('banner_show_top', e.target.checked)} />
          <span><span className="block text-sm font-medium text-gray-800">Mais pedidos</span><span className="block text-xs text-gray-500">Até 3 produtos mais pedidos nos últimos 30 dias, com foto e preço.</span></span>
        </label>
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-1 rounded text-primary-500" checked={flags.banner_show_coupons} onChange={(e) => saveFlag('banner_show_coupons', e.target.checked)} />
          <span><span className="block text-sm font-medium text-gray-800">Cupons divulgados</span><span className="block text-xs text-gray-500">Os cupons marcados como “Divulgar no banner” em <Link href="/painel/cupons" className="text-primary-600 underline">Cupons</Link>. O cliente aplica com um toque.</span></span>
        </label>
      </section>

      {showForm && (
        <form onSubmit={save} className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">{editing ? 'Editar banner' : 'Novo banner'}</h2>
            <button type="button" onClick={() => setShowForm(false)} className="p-1 text-gray-400" aria-label="Fechar"><X size={20} /></button>
          </div>
          <ImageUpload label="Imagem do banner" value={form.image_url} onChange={(url) => setForm({ ...form, image_url: url })} establishmentId={estId} folder="banners" />
          <p className="text-xs text-gray-500 -mt-2">Crie a arte em <strong>{IMAGE_FORMATS.banners.label}</strong> (Canva: “tamanho personalizado”). {IMAGE_FORMATS.banners.tip} Sem imagem, o banner usa a cor da loja com o título.</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Título {form.image_url ? '(opcional)' : ''}</span>
              <input className="input-field" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={60} placeholder="Ex.: Marmita do dia por R$ 15" />
            </label>
            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Texto de apoio (opcional)</span>
              <input className="input-field" value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} maxLength={90} placeholder="Ex.: Arroz, feijão, farofa e salada" />
            </label>
            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Ao tocar</span>
              <select className="input-field" value={form.link_type} onChange={(e) => setForm({ ...form, link_type: e.target.value as Banner['link_type'], link_ref: '' })}>
                {LINKS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </label>
            {form.link_type !== 'nenhum' && (
              <label className="text-sm">
                <span className="block text-gray-700 mb-1">Qual</span>
                <select className="input-field" value={form.link_ref} onChange={(e) => setForm({ ...form, link_ref: e.target.value })}>
                  <option value="">Escolha…</option>
                  {(targets[form.link_type] || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
            )}
            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Começa em (opcional)</span>
              <input type="date" className="input-field" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} />
            </label>
            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Termina em (opcional)</span>
              <input type="date" className="input-field" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} />
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary">{saving ? <Loader2 size={16} className="animate-spin" /> : 'Salvar banner'}</button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancelar</button>
          </div>
        </form>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Seus banners</h2>
        {banners.length === 0 ? (
          <p className="card text-sm text-gray-500">Nenhum banner seu ainda. Os automáticos (mais pedidos e cupons) já aparecem sozinhos.</p>
        ) : banners.map((b, i) => (
          <div key={b.id} className={`card p-3 flex flex-col sm:flex-row gap-3 ${b.is_active ? '' : 'opacity-60'}`}>
            <div className="relative w-full sm:w-64 aspect-[8/3] rounded-lg overflow-hidden bg-primary-500 flex-shrink-0">
              {b.image_url ? <SmartImage src={b.image_url} alt={b.title || 'Banner'} fill sizes="256px" className="object-cover" /> : (
                <div className="absolute inset-0 p-3 text-white bg-gradient-to-br from-primary-500 to-primary-800"><p className="font-bold leading-tight">{b.title}</p><p className="text-xs">{b.subtitle}</p></div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 truncate">{b.title || 'Banner com imagem'}</p>
              <p className="text-xs text-gray-500">{targetName(b)}{b.promotion_id ? ' · criado pelas Sugestões de promoções' : ''}</p>
              <p className="text-xs text-gray-400">
                {b.starts_at ? `de ${new Date(b.starts_at).toLocaleDateString('pt-BR')} ` : ''}{b.ends_at ? `até ${new Date(b.ends_at).toLocaleDateString('pt-BR')}` : 'sem data de fim'}
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <button onClick={() => move(i, -1)} disabled={i === 0} className="btn-secondary text-xs py-1 px-2" aria-label="Subir"><ArrowUp size={13} /></button>
                <button onClick={() => move(i, 1)} disabled={i === banners.length - 1} className="btn-secondary text-xs py-1 px-2" aria-label="Descer"><ArrowDown size={13} /></button>
                <button onClick={() => startEdit(b)} className="btn-secondary text-xs py-1 px-2"><Pencil size={13} /> Editar</button>
                <button onClick={() => toggle(b)} className="btn-secondary text-xs py-1 px-2">{b.is_active ? <><EyeOff size={13} /> Pausar</> : <><Eye size={13} /> Mostrar</>}</button>
                <button onClick={() => remove(b)} className="btn-secondary text-xs py-1 px-2 text-red-600"><Trash2 size={13} /> Excluir</button>
              </div>
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}
