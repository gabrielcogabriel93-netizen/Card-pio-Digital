'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { createEstablishmentWithUniqueSlug, slugify } from '@/lib/establishment'
import { Loader2, AlertCircle, Store } from 'lucide-react'

export default function CompletarCadastroPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [establishmentName, setEstablishmentName] = useState('')
  const [whatsapp, setWhatsapp] = useState('')

  useEffect(() => {
    checkExisting()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const checkExisting = async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      router.push('/login')
      return
    }

    // Se já existe estabelecimento, não há nada para completar.
    const { data: existing } = await supabase
      .from('establishments')
      .select('id')
      .eq('owner_id', user.id)
      .maybeSingle()

    if (existing) {
      router.push('/painel')
      return
    }

    // Pré-preenche com os dados salvos no cadastro (caso a confirmação de
    // e-mail estivesse ativada e a loja não tenha sido criada ainda).
    const meta = user.user_metadata || {}
    if (meta.pending_establishment_name) setEstablishmentName(meta.pending_establishment_name)
    if (meta.pending_whatsapp_number) setWhatsapp(meta.pending_whatsapp_number)

    setChecking(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      await createEstablishmentWithUniqueSlug(supabase, {
        ownerId: user.id,
        name: establishmentName,
        whatsappNumber: whatsapp,
      })

      router.push('/painel')
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 via-white to-blue-50">
        <Loader2 size={32} className="animate-spin text-primary-500" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-blue-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="w-10 h-10 bg-primary-500 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-lg">C</span>
            </div>
            <span className="font-bold text-2xl text-gray-900">Cardápio<span className="text-primary-500">SaaS</span></span>
          </Link>
        </div>

        <div className="card">
          <div className="w-14 h-14 bg-primary-50 rounded-full flex items-center justify-center mb-4">
            <Store size={26} className="text-primary-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Complete seu cadastro</h1>
          <p className="text-gray-600 mb-6">
            Falta só um passo: conte-nos sobre o seu negócio para criar seu cardápio.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="estName" className="block text-sm font-medium text-gray-700 mb-1">
                Nome do estabelecimento
              </label>
              <input
                id="estName"
                type="text"
                placeholder="Ex: Pizzaria do João"
                className="input-field"
                value={establishmentName}
                onChange={(e) => setEstablishmentName(e.target.value)}
                required
              />
              {establishmentName && (
                <p className="text-xs text-gray-500 mt-1">
                  Seu link: {typeof window !== 'undefined' ? window.location.host : ''}/loja/{slugify(establishmentName)}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="whatsapp" className="block text-sm font-medium text-gray-700 mb-1">
                WhatsApp para receber pedidos
              </label>
              <input
                id="whatsapp"
                type="tel"
                placeholder="(11) 99999-8888"
                className="input-field"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex items-start gap-2">
                <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button type="submit" className="btn-primary w-full" disabled={saving}>
              {saving ? <Loader2 size={20} className="animate-spin" /> : 'Criar meu cardápio'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
