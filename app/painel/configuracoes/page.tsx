'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { log, logError } from '@/lib/logger'
import { ImageUpload } from '@/components/ImageUpload'
import { formatPhoneNumber } from '@/lib/phone'
import { normalizeInstagramInput } from '@/lib/instagram'
import { PIX_KEY_TYPES } from '@/lib/pix'
import { publicStoreUrl } from '@/lib/domains'
import { CustomDomainCard } from '@/components/painel/CustomDomainCard'
import { toast, confirmDialog } from '@/components/Feedback'
import { useSubscription } from '@/contexts/SubscriptionContext'
import type { Establishment, BusinessType, BillingMode, OrderAutomationMode } from '@/types'
import { Save, Loader2, Copy, Share2, Clock, ChefHat, Package, Layers, Bike, Store as StoreIcon, CheckCircle2, QrCode, Zap, Unlink, Hand, Bot, Gift } from 'lucide-react'

const BUSINESS_TYPES: { value: BusinessType; title: string; description: string; icon: any }[] = [
  { value: 'preparo', title: 'Tem preparo', description: 'Comida, lanches, bebidas montadas na hora.', icon: ChefHat },
  { value: 'pronto', title: 'Já é pronto', description: 'Mercado, loja de roupa, adega, papelaria...', icon: Package },
  { value: 'hibrido', title: 'Um pouco dos dois', description: 'Vende produto pronto e também itens com preparo.', icon: Layers },
]

export default function ConfiguracoesPage() {
  const { hasCompletoAccess } = useSubscription()
  const [establishment, setEstablishment] = useState<Establishment | null>(null)
  const [pausedUntil, setPausedUntil] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    whatsapp_number: '',
    address: '',
    instagram_url: '',
    description: '',
    theme_color: '#22c55e',
    logo_url: '',
    is_open: true,
    delivery_fee: '0',
    business_type: 'preparo' as BusinessType,
    order_tracking_enabled: true,
    offers_delivery: true,
    offers_pickup: true,
    birthday_discount_percent: '',
    free_shipping_threshold: '',
    pix_key: '',
    pix_key_type: 'cpf',
    pix_city: '',
    custom_domain: '',
    billing_mode: 'comissao' as BillingMode,
    order_automation_mode: 'manual' as OrderAutomationMode,
    auto_confirm_minutes: '2',
    auto_preparing_minutes: '5',
    auto_completed_minutes_pickup: '15',
    auto_completed_minutes_delivery: '30',
    abandoned_cart_minutes: '15',
    inactive_customer_days: '20',
    delivery_time_min: '',
    delivery_time_max: '',
    min_order_value: '',
    google_review_url: '',
    hide_platform_badge: false,
  })
  const [mpStatus, setMpStatus] = useState<{ connected: boolean; email: string | null } | null>(null)
  const [mpStatusLoading, setMpStatusLoading] = useState(true)
  const [mpActionLoading, setMpActionLoading] = useState(false)
  const [mpBanner, setMpBanner] = useState<string | null>(null)
  const router = useRouter()
  const [openingHours, setOpeningHours] = useState<Record<string, { open: string; close: string }>>({
    seg: { open: '08:00', close: '22:00' },
    ter: { open: '08:00', close: '22:00' },
    qua: { open: '08:00', close: '22:00' },
    qui: { open: '08:00', close: '22:00' },
    sex: { open: '08:00', close: '22:00' },
    sab: { open: '09:00', close: '23:00' },
    dom: { open: '09:00', close: '21:00' },
  })

  const weekDays = [
    { key: 'seg', label: 'Segunda-feira' },
    { key: 'ter', label: 'Terça-feira' },
    { key: 'qua', label: 'Quarta-feira' },
    { key: 'qui', label: 'Quinta-feira' },
    { key: 'sex', label: 'Sexta-feira' },
    { key: 'sab', label: 'Sábado' },
    { key: 'dom', label: 'Domingo' },
  ]

  useEffect(() => {
    loadEstablishment()
  }, [])

  // Volta do OAuth do Mercado Pago com ?mp=connected|denied|error na URL —
  // mostra um aviso e limpa o parâmetro pra não reaparecer num refresh.
  // Lido direto de window.location (em vez de useSearchParams()) pra não
  // exigir Suspense boundary nessa página no build estático.
  useEffect(() => {
    const mp = new URLSearchParams(window.location.search).get('mp')
    if (!mp) return
    setMpBanner(mp)
    router.replace('/painel/configuracoes')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!establishment?.id) return
    loadMpStatus(establishment.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [establishment?.id])

  const loadMpStatus = async (establishmentId: string) => {
    setMpStatusLoading(true)
    try {
      const response = await fetch(`/api/mercadopago/status?establishment_id=${establishmentId}`)
      const data = await response.json()
      if (response.ok) setMpStatus({ connected: data.connected, email: data.email })
    } catch (error) {
      logError('painel:configuracoes', 'erro ao consultar status do Mercado Pago', error)
    } finally {
      setMpStatusLoading(false)
    }
  }

  const handleDisconnectMp = async () => {
    if (!establishment?.id) return
    if (!(await confirmDialog({ title: 'Desconectar o Mercado Pago?', message: 'O Pix automático some do cardápio até você conectar de novo.', confirmLabel: 'Desconectar', danger: true }))) return
    setMpActionLoading(true)
    try {
      const response = await fetch('/api/mercadopago/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ establishment_id: establishment.id }),
      })
      if (!response.ok) throw new Error('Erro ao desconectar')
      await loadMpStatus(establishment.id)
    } catch (error: any) {
      logError('painel:configuracoes', 'erro ao desconectar Mercado Pago', error)
      toast.error('Erro ao desconectar: ' + error.message)
    } finally {
      setMpActionLoading(false)
    }
  }

  const loadEstablishment = async () => {
    log('painel:configuracoes', 'carregando dados do estabelecimento...')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('establishments')
        .select('*')
        .eq('owner_id', user.id)
        .single()

      if (error) logError('painel:configuracoes', 'erro ao carregar estabelecimento', error)

      if (data) {
        log('painel:configuracoes', 'estabelecimento carregado', { id: data.id })
        setEstablishment(data)
        setFormData({
          name: data.name,
          slug: data.slug,
          whatsapp_number: data.whatsapp_number,
          address: data.address || '',
          instagram_url: data.instagram_url || '',
          description: data.description || '',
          theme_color: data.theme_color || '#22c55e',
          logo_url: data.logo_url || '',
          is_open: data.is_open ?? true,
          delivery_fee: String(data.delivery_fee ?? 0),
          business_type: (data.business_type as BusinessType) || 'preparo',
          order_tracking_enabled: data.order_tracking_enabled ?? true,
          offers_delivery: data.offers_delivery ?? true,
          offers_pickup: data.offers_pickup ?? true,
          birthday_discount_percent: data.birthday_discount_percent != null ? String(data.birthday_discount_percent) : '',
          free_shipping_threshold: data.free_shipping_threshold != null ? String(data.free_shipping_threshold) : '',
          pix_key: data.pix_key || '',
          pix_key_type: data.pix_key_type || 'cpf',
          pix_city: data.pix_city || '',
          custom_domain: data.custom_domain || '',
          billing_mode: (data.billing_mode as BillingMode) || 'comissao',
          order_automation_mode: (data.order_automation_mode as OrderAutomationMode) || 'manual',
          auto_confirm_minutes: String(data.auto_confirm_minutes ?? 2),
          auto_preparing_minutes: String(data.auto_preparing_minutes ?? 5),
          auto_completed_minutes_pickup: String(data.auto_completed_minutes_pickup ?? 15),
          auto_completed_minutes_delivery: String(data.auto_completed_minutes_delivery ?? 30),
          abandoned_cart_minutes: String(data.abandoned_cart_minutes ?? 15),
          inactive_customer_days: String(data.inactive_customer_days ?? 20),
          delivery_time_min: data.delivery_time_min != null ? String(data.delivery_time_min) : '',
          delivery_time_max: data.delivery_time_max != null ? String(data.delivery_time_max) : '',
          min_order_value: data.min_order_value != null ? String(data.min_order_value) : '',
          google_review_url: data.google_review_url || '',
          hide_platform_badge: !!data.hide_platform_badge,
        })
        setPausedUntil(data.paused_until || null)
        if (data.opening_hours) {
          setOpeningHours(data.opening_hours as Record<string, { open: string; close: string }>)
        }
      }
    } catch (error) {
      logError('painel:configuracoes', 'exceção ao carregar dados', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.offers_delivery && !formData.offers_pickup) {
      toast.error('Ative pelo menos uma opção: entrega ou retirada no local.')
      return
    }

    setSaving(true)
    log('painel:configuracoes', 'salvando configurações...', { isOpen: formData.is_open })

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { error } = await supabase
        .from('establishments')
        .update({
          name: formData.name,
          whatsapp_number: formData.whatsapp_number,
          address: formData.address || null,
          instagram_url: normalizeInstagramInput(formData.instagram_url),
          description: formData.description.trim() || null,
          theme_color: formData.theme_color,
          logo_url: formData.logo_url || null,
          is_open: formData.is_open,
          opening_hours: openingHours,
          delivery_fee: parseFloat(formData.delivery_fee) || 0,
          business_type: formData.business_type,
          order_tracking_enabled: formData.order_tracking_enabled,
          offers_delivery: formData.offers_delivery,
          offers_pickup: formData.offers_pickup,
          birthday_discount_percent: formData.birthday_discount_percent ? parseFloat(formData.birthday_discount_percent) : null,
          free_shipping_threshold: formData.free_shipping_threshold ? parseFloat(formData.free_shipping_threshold) : null,
          pix_key: formData.pix_key.trim() || null,
          pix_key_type: formData.pix_key.trim() ? formData.pix_key_type : null,
          pix_city: formData.pix_city.trim() || null,
          billing_mode: formData.billing_mode,
          order_automation_mode: formData.order_automation_mode,
          auto_confirm_minutes: parseInt(formData.auto_confirm_minutes) || 0,
          auto_preparing_minutes: parseInt(formData.auto_preparing_minutes) || 0,
          auto_completed_minutes_pickup: parseInt(formData.auto_completed_minutes_pickup) || 0,
          auto_completed_minutes_delivery: parseInt(formData.auto_completed_minutes_delivery) || 0,
          abandoned_cart_minutes: parseInt(formData.abandoned_cart_minutes) || 15,
          inactive_customer_days: parseInt(formData.inactive_customer_days) || 20,
          delivery_time_min: formData.delivery_time_min ? parseInt(formData.delivery_time_min) : null,
          delivery_time_max: formData.delivery_time_max ? parseInt(formData.delivery_time_max) : null,
          min_order_value: formData.min_order_value ? parseFloat(formData.min_order_value.replace(',', '.')) : null,
          google_review_url: formData.google_review_url.trim() || null,
          hide_platform_badge: formData.hide_platform_badge,
        })
        .eq('owner_id', user.id)

      if (error) throw error
      log('painel:configuracoes', 'configurações salvas com sucesso')
      toast.success('Configurações salvas')
    } catch (error: any) {
      logError('painel:configuracoes', 'erro ao salvar configurações', error)
      toast.error('Erro ao salvar: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const storeUrl = () =>
    publicStoreUrl({
      slug: formData.slug,
      customDomain: establishment?.custom_domain,
      rootDomain: process.env.NEXT_PUBLIC_ROOT_DOMAIN,
      baseUrl: typeof window !== 'undefined' ? window.location.origin : '',
    })

  // Pausa rápida ("cozinha cheia"): salva na hora, sem esperar o botão
  // Salvar lá embaixo. O cardápio mostra "Pausada, volta às HH:MM".
  const setPause = async (minutes: number | null) => {
    const value = minutes ? new Date(Date.now() + minutes * 60000).toISOString() : null
    const supabase = createClient()
    const { error } = await supabase.from('establishments').update({ paused_until: value }).eq('id', establishment?.id || '')
    if (error) {
      toast.error('Não foi possível pausar agora.')
      return
    }
    setPausedUntil(value)
    toast.success(minutes ? `Pedidos pausados por ${minutes} min` : 'Pedidos liberados de novo')
  }

  const copyLink = () => {
    const link = storeUrl()
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const shareLink = async () => {
    const link = `${window.location.origin}/loja/${formData.slug}`
    if (navigator.share) {
      try {
        await navigator.share({
          title: formData.name,
          text: `Confira o cardápio de ${formData.name}!`,
          url: link,
        })
      } catch {}
    } else {
      copyLink()
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-primary-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="page-title">Configurações</h1>
        <p className="text-gray-600 mt-1">Gerencie as configurações do seu estabelecimento.</p>
      </div>

      {mpBanner && (
        <div className={`rounded-lg p-4 text-sm flex items-center justify-between ${
          mpBanner === 'connected' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
        }`}>
          <span>
            {mpBanner === 'connected' && 'Mercado Pago conectado com sucesso! A Pix automática já está disponível no seu cardápio.'}
            {mpBanner === 'denied' && 'Conexão com o Mercado Pago cancelada.'}
            {mpBanner === 'error' && 'Não foi possível conectar com o Mercado Pago. Tente novamente.'}
          </span>
          <button onClick={() => setMpBanner(null)} className="text-xs underline ml-4 flex-shrink-0">Fechar</button>
        </div>
      )}

      {/* Cardápio Link */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Seu Cardápio Online</h2>
        <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-500">Link público do cardápio</p>
            <p className="font-medium text-gray-900 truncate">
              {typeof window !== 'undefined' && storeUrl()}
            </p>
          </div>
          <button onClick={copyLink} className="btn-secondary text-sm">
            <Copy size={16} />
            {copied ? 'Copiado!' : 'Copiar'}
          </button>
          <button onClick={shareLink} className="btn-primary text-sm">
            <Share2 size={16} />
            Compartilhar
          </button>
        </div>
      </div>

      {/* Pausa rápida */}
      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Cozinha cheia?</h2>
            <p className="text-sm text-gray-500">
              {pausedUntil && new Date(pausedUntil) > new Date()
                ? `Pedidos pausados até ${new Date(pausedUntil).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`
                : 'Pause os pedidos online por um tempo. O cardápio volta sozinho.'}
            </p>
          </div>
          <div className="flex gap-2">
            {pausedUntil && new Date(pausedUntil) > new Date() ? (
              <button type="button" onClick={() => setPause(null)} className="btn-primary text-sm">Voltar a receber</button>
            ) : (
              [20, 60].map((m) => (
                <button key={m} type="button" onClick={() => setPause(m)} className="btn-secondary text-sm">Pausar {m === 60 ? '1 h' : `${m} min`}</button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Domínio próprio (plano Completo) */}
      {establishment && (
        <CustomDomainCard hasCompletoAccess={hasCompletoAccess} initialDomain={establishment.custom_domain || null} />
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Basic Info */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Dados do Estabelecimento</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome do estabelecimento</label>
              <input
                type="text"
                className="input-field"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp</label>
              <input
                type="tel"
                className="input-field"
                value={formData.whatsapp_number}
                onChange={(e) => setFormData({ ...formData, whatsapp_number: formatPhoneNumber(e.target.value) })}
                placeholder="(11) 99999-8888"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Número para receber pedidos dos clientes, com DDD. Não precisa incluir o código do
                Brasil (55) — o link do WhatsApp já adiciona sozinho.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Endereço</label>
              <input
                type="text"
                className="input-field"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Rua, número, bairro - Cidade"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Instagram</label>
              <input
                type="text"
                className="input-field"
                value={formData.instagram_url}
                onChange={(e) => setFormData({ ...formData, instagram_url: e.target.value })}
                placeholder="@minhaloja"
              />
              <p className="text-xs text-gray-500 mt-1">
                Aparece como link no perfil da loja que o cliente vê no cardápio. Pode colar o @, o nome de usuário ou o link completo.
              </p>
            </div>

            {formData.offers_delivery && (
              <div className="grid grid-cols-2 gap-3 max-w-md">
                <div>
                  <label htmlFor="dt-min" className="block text-sm font-medium text-gray-700 mb-1">Entrega em (mín.)</label>
                  <input id="dt-min" type="number" min="0" className="input-field" value={formData.delivery_time_min} onChange={(e) => setFormData({ ...formData, delivery_time_min: e.target.value })} placeholder="30" />
                </div>
                <div>
                  <label htmlFor="dt-max" className="block text-sm font-medium text-gray-700 mb-1">até (min)</label>
                  <input id="dt-max" type="number" min="0" className="input-field" value={formData.delivery_time_max} onChange={(e) => setFormData({ ...formData, delivery_time_max: e.target.value })} placeholder="45" />
                </div>
                <p className="col-span-2 text-xs text-gray-500 -mt-1">Aparece no topo do cardápio: “30–45 min”.</p>
              </div>
            )}

            <div className="max-w-md">
              <label htmlFor="min-order" className="block text-sm font-medium text-gray-700 mb-1">Pedido mínimo (R$)</label>
              <input id="min-order" inputMode="decimal" className="input-field max-w-[160px]" value={formData.min_order_value} onChange={(e) => setFormData({ ...formData, min_order_value: e.target.value.replace(/[^\d,.]/g, '') })} placeholder="Sem mínimo" />
            </div>

            <div>
              <label htmlFor="google-review" className="block text-sm font-medium text-gray-700 mb-1">Link de avaliação no Google <span className="font-normal text-gray-400">(opcional)</span></label>
              <input id="google-review" type="url" className="input-field" value={formData.google_review_url} onChange={(e) => setFormData({ ...formData, google_review_url: e.target.value })} placeholder="https://g.page/r/..." />
              <p className="text-xs text-gray-500 mt-1">Quem der 4 ou 5 estrelas no pedido é convidado a avaliar sua loja no Google.</p>
            </div>

            <label className={`flex items-start gap-3 p-3 rounded-lg border ${hasCompletoAccess ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
              <input type="checkbox" className="mt-1 rounded text-primary-500" checked={formData.hide_platform_badge} disabled={!hasCompletoAccess} onChange={(e) => setFormData({ ...formData, hide_platform_badge: e.target.checked })} />
              <span>
                <span className="block text-sm font-medium text-gray-800">Esconder o selo “pedidos por freguês” no rodapé</span>
                <span className="block text-xs text-gray-500">Seu cardápio fica 100% com a sua marca.{!hasCompletoAccess && ' Disponível no plano Completo.'}</span>
              </span>
            </label>

            {formData.offers_delivery && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Taxa de entrega padrão</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input-field max-w-[160px]"
                  value={formData.delivery_fee}
                  onChange={(e) => setFormData({ ...formData, delivery_fee: e.target.value })}
                  placeholder="0,00"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Mostrada para o cliente antes de enviar o pedido pelo cardápio online. Deixe 0 se não cobrar entrega
                  (ou se preferir combinar o valor depois, pelo WhatsApp). Também serve de reserva quando a{' '}
                  <Link href="/painel/bairros" className="text-primary-600 hover:underline">taxa por bairro</Link>{' '}
                  está ativa mas o bairro do cliente não está cadastrado.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <ImageUpload
                label="Logo"
                value={formData.logo_url}
                onChange={(url) => setFormData({ ...formData, logo_url: url })}
                establishmentId={establishment?.id || ''}
                folder="logo"
                aspectClassName="h-20 w-20"
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cor do tema</label>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    className="w-10 h-10 rounded cursor-pointer border"
                    value={formData.theme_color}
                    onChange={(e) => setFormData({ ...formData, theme_color: e.target.value })}
                  />
                  <span className="text-sm text-gray-500">{formData.theme_color}</span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descrição da loja</label>
              <textarea
                className="input-field"
                rows={2}
                maxLength={200}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Ex: Pizzaria artesanal com massa de fermentação natural, no forno a lenha desde 2010."
              />
              <p className="text-xs text-gray-500 mt-1">
                Aparece junto com sua logo quando alguém compartilha o link do seu cardápio (WhatsApp,
                Instagram etc.). Deixe em branco para usar uma descrição padrão.
              </p>
            </div>
          </div>
        </div>

        {/* Tipo de negócio e funcionalidades */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Tipo de negócio e funcionalidades</h2>
          <p className="text-sm text-gray-500 mb-4">
            Ative só o que faz sentido pro seu negócio — o painel se ajusta automaticamente e some com o resto.
          </p>

          <div className="mb-5">
            <label className="block text-sm font-medium text-gray-700 mb-2">Seus produtos...</label>
            <div className="grid sm:grid-cols-3 gap-2">
              {BUSINESS_TYPES.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setFormData({
                    ...formData,
                    business_type: type.value,
                    order_tracking_enabled: type.value !== 'pronto',
                  })}
                  className={`text-left flex items-start gap-2 p-3 rounded-lg border-2 transition-colors ${
                    formData.business_type === type.value ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <type.icon size={18} className={formData.business_type === type.value ? 'text-primary-600 flex-shrink-0 mt-0.5' : 'text-gray-400 flex-shrink-0 mt-0.5'} />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{type.title}</p>
                    <p className="text-xs text-gray-500">{type.description}</p>
                  </div>
                  {formData.business_type === type.value && <CheckCircle2 size={16} className="text-primary-500 flex-shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-5 flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-gray-900">Acompanhamento detalhado do pedido</p>
              <p className="text-xs text-gray-500">
                Ligado: pedidos passam por Pendente → Confirmado → Em Preparo → Concluído.
                Desligado: só Pendente → Concluído, mais rápido pra quem não tem preparo.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, order_tracking_enabled: !formData.order_tracking_enabled })}
              className={`relative w-14 h-7 rounded-full flex-shrink-0 ml-3 transition-colors ${
                formData.order_tracking_enabled ? 'bg-primary-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${
                  formData.order_tracking_enabled ? 'translate-x-7' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Como o cliente recebe o pedido?</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, offers_delivery: !formData.offers_delivery })}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 text-sm font-medium transition-colors ${
                  formData.offers_delivery ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-500'
                }`}
              >
                <Bike size={16} /> Entrega
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, offers_pickup: !formData.offers_pickup })}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 text-sm font-medium transition-colors ${
                  formData.offers_pickup ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-500'
                }`}
              >
                <StoreIcon size={16} /> Retirada no local
              </button>
            </div>
            {!formData.offers_delivery && !formData.offers_pickup && (
              <p className="text-xs text-red-500 mt-2">Ative pelo menos uma opção.</p>
            )}
          </div>

          {formData.offers_delivery && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Valor mínimo para frete grátis</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="input-field max-w-[160px]"
                value={formData.free_shipping_threshold}
                onChange={(e) => setFormData({ ...formData, free_shipping_threshold: e.target.value })}
                placeholder="Desativado"
              />
              <p className="text-xs text-gray-500 mt-1">
                Se o cliente comprar esse valor ou mais, a taxa de entrega é isentada sozinha — e o
                carrinho mostra uma barra &quot;faltam R$X pra frete grátis&quot; incentivando a compra. Deixe em
                branco para não usar.
              </p>
            </div>
          )}
        </div>

        {/* Automação de pedidos */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Automação de pedidos</h2>
          <p className="text-sm text-gray-500 mb-4">
            Escolha se você mesmo muda o status de cada pedido conforme ele evolui, ou se prefere que o
            sistema avance sozinho — pensado pra quem não tem ninguém disponível pra ficar
            acompanhando o Kanban o tempo todo.
          </p>

          <div className="grid sm:grid-cols-2 gap-2 mb-4">
            <button
              type="button"
              onClick={() => setFormData({ ...formData, order_automation_mode: 'manual' })}
              className={`text-left flex items-start gap-2 p-3 rounded-lg border-2 transition-colors ${
                formData.order_automation_mode === 'manual' ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <Hand size={18} className={formData.order_automation_mode === 'manual' ? 'text-primary-600 flex-shrink-0 mt-0.5' : 'text-gray-400 flex-shrink-0 mt-0.5'} />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">Manual</p>
                <p className="text-xs text-gray-500">Você muda o status conforme o pedido evolui — como já funciona hoje.</p>
              </div>
              {formData.order_automation_mode === 'manual' && <CheckCircle2 size={16} className="text-primary-500 flex-shrink-0" />}
            </button>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, order_automation_mode: 'automatic' })}
              className={`text-left flex items-start gap-2 p-3 rounded-lg border-2 transition-colors ${
                formData.order_automation_mode === 'automatic' ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <Bot size={18} className={formData.order_automation_mode === 'automatic' ? 'text-primary-600 flex-shrink-0 mt-0.5' : 'text-gray-400 flex-shrink-0 mt-0.5'} />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">Automático</p>
                <p className="text-xs text-gray-500">O pedido avança sozinho, nos tempos que você configurar abaixo.</p>
              </div>
              {formData.order_automation_mode === 'automatic' && <CheckCircle2 size={16} className="text-primary-500 flex-shrink-0" />}
            </button>
          </div>

          {formData.order_automation_mode === 'automatic' && (
            <div className="space-y-4 bg-gray-50 rounded-lg p-4">
              {formData.order_tracking_enabled ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Confirmar pedido novo sozinho em (minutos)
                    </label>
                    <input
                      type="number"
                      min="0"
                      className="input-field max-w-[140px]"
                      value={formData.auto_confirm_minutes}
                      onChange={(e) => setFormData({ ...formData, auto_confirm_minutes: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Passar para &quot;Em preparo&quot; em (minutos)
                    </label>
                    <input
                      type="number"
                      min="0"
                      className="input-field max-w-[140px]"
                      value={formData.auto_preparing_minutes}
                      onChange={(e) => setFormData({ ...formData, auto_preparing_minutes: e.target.value })}
                    />
                  </div>
                </>
              ) : (
                <p className="text-xs text-gray-500">
                  Sua loja está com &quot;Acompanhamento detalhado do pedido&quot; desligado — o pedido pula
                  direto de Pendente para Concluído, sem os passos intermediários.
                </p>
              )}

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                    <StoreIcon size={14} /> Concluir retirada em (minutos)
                  </label>
                  <input
                    type="number"
                    min="0"
                    className="input-field max-w-[140px]"
                    value={formData.auto_completed_minutes_pickup}
                    onChange={(e) => setFormData({ ...formData, auto_completed_minutes_pickup: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                    <Bike size={14} /> Concluir entrega em (minutos)
                  </label>
                  <input
                    type="number"
                    min="0"
                    className="input-field max-w-[140px]"
                    value={formData.auto_completed_minutes_delivery}
                    onChange={(e) => setFormData({ ...formData, auto_completed_minutes_delivery: e.target.value })}
                  />
                </div>
              </div>

              <p className="text-xs text-gray-500">
                Os tempos contam a partir de quando o pedido entrou em cada etapa. Pedido pago por Pix
                automático (Mercado Pago) nunca é confirmado sozinho antes do pagamento cair — só depois
                disso ele passa a avançar pelos tempos acima. Cancelar continua sendo sempre manual.
              </p>
            </div>
          )}
        </div>

        {/* Carrinho abandonado (migration 042) */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Carrinho abandonado</h2>
          <p className="text-sm text-gray-500 mb-4">
            Quando um cliente chega a informar o telefone na etapa de finalizar pedido mas não confirma o
            envio, o pedido entra na lista de &quot;Carrinhos abandonados&quot; em WhatsApp, pra você chamar
            de volta.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Considerar abandonado depois de (minutos)
            </label>
            <input
              type="number"
              min="1"
              className="input-field max-w-[140px]"
              value={formData.abandoned_cart_minutes}
              onChange={(e) => setFormData({ ...formData, abandoned_cart_minutes: e.target.value })}
            />
          </div>
        </div>

        {/* Reengajamento de clientes inativos */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Clientes inativos</h2>
          <p className="text-sm text-gray-500 mb-4">
            Clientes que já pediram antes mas não voltam a pedir aparecem numa lista em WhatsApp, com um
            botão pra chamar de volta.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Considerar inativo depois de (dias sem pedir)
            </label>
            <input
              type="number"
              min="1"
              className="input-field max-w-[140px]"
              value={formData.inactive_customer_days}
              onChange={(e) => setFormData({ ...formData, inactive_customer_days: e.target.value })}
            />
          </div>
        </div>

        {/* Pix */}
        <div className="card">
          <div className="flex items-center gap-2 mb-1">
            <QrCode size={20} className="text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900">Pix</h2>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Cadastre sua chave Pix pra gerar QR Code e código &quot;copia e cola&quot; automaticamente na hora
            do pedido — sem gateway, sem taxa, o valor cai direto na sua conta.
          </p>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de chave</label>
              <select
                className="input-field"
                value={formData.pix_key_type}
                onChange={(e) => setFormData({ ...formData, pix_key_type: e.target.value })}
              >
                {PIX_KEY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Chave Pix</label>
              <input
                type="text"
                className="input-field"
                value={formData.pix_key}
                onChange={(e) => setFormData({ ...formData, pix_key: e.target.value })}
                placeholder="Sua chave Pix"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cidade (do seu cadastro Pix)</label>
            <input
              type="text"
              className="input-field max-w-xs"
              value={formData.pix_city}
              onChange={(e) => setFormData({ ...formData, pix_city: e.target.value })}
              placeholder="Ex: SAO PAULO"
            />
            <p className="text-xs text-gray-500 mt-1">
              Exigido pelo padrão do Pix. Obrigatório para o QR Code funcionar.
            </p>
          </div>
        </div>

        {/* Pagamento automático (Mercado Pago) */}
        <div className="card">
          <div className="flex items-center gap-2 mb-1">
            <Zap size={20} className="text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900">Pagamento automático (Mercado Pago)</h2>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            O cliente paga Pix na hora pelo Mercado Pago, o dinheiro cai direto na SUA conta, e o
            pedido já libera pra preparar sozinho assim que o pagamento é aprovado — sem precisar
            checar nada. A plataforma cobra uma comissão fixa de R$ 1,00 por pedido pago assim.
          </p>

          {mpStatusLoading ? (
            <Loader2 size={20} className="animate-spin text-gray-400" />
          ) : mpStatus?.connected ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
                <CheckCircle2 size={16} className="flex-shrink-0" />
                Conectado {mpStatus.email ? `como ${mpStatus.email}` : ''}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Como você paga a plataforma</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, billing_mode: 'comissao' })}
                    className={`text-left p-3 rounded-lg border-2 transition-colors ${
                      formData.billing_mode === 'comissao' ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <p className="font-medium text-sm text-gray-900">Comissão</p>
                    <p className="text-xs text-gray-500">R$ 1,00 por pedido pago automaticamente</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, billing_mode: 'mensalidade' })}
                    className={`text-left p-3 rounded-lg border-2 transition-colors ${
                      formData.billing_mode === 'mensalidade' ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <p className="font-medium text-sm text-gray-900">Mensalidade</p>
                    <p className="text-xs text-gray-500">Em breve — desativa a Pix automática por enquanto</p>
                  </button>
                </div>
                {formData.billing_mode === 'mensalidade' && (
                  <p className="text-xs text-amber-600 mt-2">
                    A cobrança por mensalidade ainda não está disponível — enquanto essa opção estiver
                    marcada, a Pix automática fica desligada no seu cardápio.
                  </p>
                )}
              </div>

              <button type="button" onClick={handleDisconnectMp} disabled={mpActionLoading} className="btn-secondary text-sm">
                {mpActionLoading ? <Loader2 size={14} className="animate-spin" /> : <Unlink size={14} />}
                Desconectar
              </button>
            </div>
          ) : (
            establishment?.id && (
              <a href={`/api/mercadopago/oauth/start?establishment_id=${establishment.id}`} className="btn-primary inline-flex text-sm">
                <Zap size={16} />
                Conectar com Mercado Pago
              </a>
            )
          )}
        </div>

        {/* Fidelização */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Fidelização</h2>
          <p className="text-sm text-gray-500 mb-4">
            Quando o cliente informa a data de nascimento (opcional, no checkout), o cardápio já
            mostra os parabéns e aplica o desconto sozinho no dia — sem precisar de nenhum envio manual.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Desconto automático de aniversário (%)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              className="input-field max-w-[160px]"
              value={formData.birthday_discount_percent}
              onChange={(e) => setFormData({ ...formData, birthday_discount_percent: e.target.value })}
              placeholder="Desativado"
            />
            <p className="text-xs text-gray-500 mt-1">
              Deixe em branco para não oferecer desconto de aniversário.
            </p>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100">
            <Link
              href="/painel/fidelidade"
              className="btn-secondary inline-flex items-center gap-1.5 text-sm"
            >
              <Gift size={16} />
              Configurar Programa de Pontos
            </Link>
            <p className="text-xs text-gray-500 mt-2">
              Cliente ganha pontos a cada compra e troca por descontos — configure a regra e as recompensas.
            </p>
          </div>
        </div>

        {/* Opening Hours */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock size={20} className="text-gray-400" />
              <h2 className="text-lg font-semibold text-gray-900">Horário de Funcionamento</h2>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-sm text-gray-600">Loja</span>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, is_open: !formData.is_open })}
                className={`relative w-14 h-7 rounded-full transition-colors ${
                  formData.is_open ? 'bg-green-500' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${
                    formData.is_open ? 'translate-x-7' : 'translate-x-0'
                  }`}
                />
              </button>
              <span className="text-sm font-medium">
                {formData.is_open ? 'Aberta' : 'Fechada'}
              </span>
            </label>
          </div>

          <p className="text-xs text-gray-500 mb-4 -mt-2">
            Esse botão liga/desliga a loja manualmente. Além dele, o cardápio público também fecha
            sozinho fora dos horários configurados abaixo — não precisa lembrar de fechar todo dia.
          </p>

          <div className="space-y-3">
            {weekDays.map((day) => {
              const closed = !openingHours[day.key]
              return (
              <div key={day.key} className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="w-28 text-sm font-medium text-gray-700">{day.label}</span>
                <label className="flex items-center gap-1.5 text-sm text-gray-600 w-24">
                  <input
                    type="checkbox"
                    className="rounded text-primary-500"
                    checked={closed}
                    onChange={(e) => {
                      const next = { ...openingHours }
                      if (e.target.checked) delete next[day.key]
                      else next[day.key] = { open: '08:00', close: '22:00' }
                      setOpeningHours(next)
                    }}
                  />
                  Fechado
                </label>
                {!closed && (<>
                <input
                  type="time"
                  className="input-field w-32"
                  value={openingHours[day.key]?.open || '08:00'}
                  onChange={(e) =>
                    setOpeningHours({
                      ...openingHours,
                      [day.key]: { ...openingHours[day.key], open: e.target.value },
                    })
                  }
                />
                <span className="text-gray-400">às</span>
                <input
                  type="time"
                  className="input-field w-32"
                  value={openingHours[day.key]?.close || '22:00'}
                  onChange={(e) =>
                    setOpeningHours({
                      ...openingHours,
                      [day.key]: { ...openingHours[day.key], close: e.target.value },
                    })
                  }
                />
                </>)}
              </div>
              )
            })}
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Save size={18} />
            )}
            Salvar Configurações
          </button>
        </div>
      </form>
    </div>
  )
}
