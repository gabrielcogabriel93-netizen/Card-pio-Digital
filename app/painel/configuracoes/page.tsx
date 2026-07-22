'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { log, logError } from '@/lib/logger'
import { ImageUpload } from '@/components/ImageUpload'
import type { Establishment } from '@/types'
import { Save, Loader2, Copy, Share2, Clock, Eye, EyeOff } from 'lucide-react'

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
                onChange={(e) => setFormData({ ...formData, whatsapp_number: e.target.value })}
                placeholder="(11) 99999-8888"
                required
              />
              <p className="text-xs text-gray-500 mt-1">Número para receber pedidos dos clientes.</p>
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
