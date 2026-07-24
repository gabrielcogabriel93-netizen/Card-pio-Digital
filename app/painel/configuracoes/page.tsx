'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { log, logError } from '@/lib/logger'
import { ImageUpload } from '@/components/ImageUpload'
import { formatPhoneNumber } from '@/lib/phone'
import type { Establishment, BusinessType } from '@/types'
import { Save, Loader2, Copy, Share2, Clock, ChefHat, Package, Layers, Bike, Store as StoreIcon, CheckCircle2 } from 'lucide-react'

const BUSINESS_TYPES: { value: BusinessType; title: string; description: string; icon: any }[] = [
  { value: 'preparo', title: 'Tem preparo', description: 'Comida, lanches, bebidas montadas na hora.', icon: ChefHat },
  { value: 'pronto', title: 'Já é pronto', description: 'Mercado, loja de roupa, adega, papelaria...', icon: Package },
  { value: 'hibrido', title: 'Um pouco dos dois', description: 'Vende produto pronto e também itens com preparo.', icon: Layers },
]

export default function ConfiguracoesPage() {
  const [establishment, setEstablishment] = useState<Establishment | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    whatsapp_number: '',
    address: '',
    theme_color: '#22c55e',
    logo_url: '',
    is_open: true,
    delivery_fee: '0',
    business_type: 'preparo' as BusinessType,
    order_tracking_enabled: true,
    offers_delivery: true,
    offers_pickup: true,
  })
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
          theme_color: data.theme_color || '#22c55e',
          logo_url: data.logo_url || '',
          is_open: data.is_open ?? true,
          delivery_fee: String(data.delivery_fee ?? 0),
          business_type: (data.business_type as BusinessType) || 'preparo',
          order_tracking_enabled: data.order_tracking_enabled ?? true,
          offers_delivery: data.offers_delivery ?? true,
          offers_pickup: data.offers_pickup ?? true,
        })
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
      alert('Ative pelo menos uma opção: entrega ou retirada no local.')
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
          theme_color: formData.theme_color,
          logo_url: formData.logo_url || null,
          is_open: formData.is_open,
          opening_hours: openingHours,
          delivery_fee: parseFloat(formData.delivery_fee) || 0,
          business_type: formData.business_type,
          order_tracking_enabled: formData.order_tracking_enabled,
          offers_delivery: formData.offers_delivery,
          offers_pickup: formData.offers_pickup,
        })
        .eq('owner_id', user.id)

      if (error) throw error
      log('painel:configuracoes', 'configurações salvas com sucesso')
      alert('Configurações salvas com sucesso!')
    } catch (error: any) {
      logError('painel:configuracoes', 'erro ao salvar configurações', error)
      alert('Erro ao salvar: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const copyLink = () => {
    const link = `${window.location.origin}/loja/${formData.slug}`
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
        <h1 className="text-2xl font-bold text-gray-900">Configurações</h1>
        <p className="text-gray-600 mt-1">Gerencie as configurações do seu estabelecimento.</p>
      </div>

      {/* Cardápio Link */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Seu Cardápio Online</h2>
        <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-500">Link público do cardápio</p>
            <p className="font-medium text-gray-900 truncate">
              {typeof window !== 'undefined' && `${window.location.origin}/loja/${formData.slug}`}
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
            {weekDays.map((day) => (
              <div key={day.key} className="flex items-center gap-4">
                <span className="w-28 text-sm font-medium text-gray-700">{day.label}</span>
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
              </div>
            ))}
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
