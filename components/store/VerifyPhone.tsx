'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { saveCustomerToken } from '@/lib/customerStorage'
import { ShieldCheck, Loader2 } from 'lucide-react'

/**
 * O telefone já tem cadastro na loja, mas este aparelho ainda não foi
 * confirmado (migration 045). Manda um código pelo WhatsApp da loja e,
 * com o código certo, guarda o token no aparelho -- aí endereços,
 * pontos e histórico aparecem.
 */
export function VerifyPhone({
  establishmentId,
  phone,
  onVerified,
  compact = false,
}: {
  establishmentId: string
  phone: string
  onVerified: (token: string) => void
  compact?: boolean
}) {
  const [step, setStep] = useState<'idle' | 'sent'>('idle')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sendCode = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/customer/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ establishment_id: establishmentId, phone }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Não foi possível enviar o código.')
      setStep('sent')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const verify = async () => {
    if (code.replace(/\D/g, '').length !== 6) {
      setError('O código tem 6 números.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const supabase = createClient()
      const { data, error: rpcError } = await supabase.rpc('verify_customer_otp', {
        p_establishment_id: establishmentId,
        p_phone: phone,
        p_code: code.replace(/\D/g, ''),
      })
      if (rpcError) throw new Error(rpcError.message)
      saveCustomerToken(establishmentId, phone, data as string)
      onVerified(data as string)
    } catch (err: any) {
      setError(err.message || 'Código incorreto.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`rounded-xl bg-primary-50 border border-primary-100 ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex items-start gap-2.5">
        <ShieldCheck size={18} className="text-primary-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          {step === 'idle' ? (
            <>
              <p className="text-sm text-gray-800">
                Esse telefone já tem cadastro. Para usar seus endereços e pontos neste aparelho, confirme com um código no WhatsApp.
              </p>
              <button type="button" onClick={sendCode} disabled={loading} className="btn-primary text-sm py-2 px-3 mt-2.5">
                {loading ? <Loader2 size={15} className="animate-spin" /> : 'Receber código'}
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-800">Digite o código de 6 números que enviamos no seu WhatsApp.</p>
              <div className="flex gap-2 mt-2.5">
                <input
                  className="input-field text-center font-mono tracking-[0.4em] text-lg py-2 w-40"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  aria-label="Código de confirmação"
                />
                <button type="button" onClick={verify} disabled={loading} className="btn-primary text-sm py-2 px-4">
                  {loading ? <Loader2 size={15} className="animate-spin" /> : 'Confirmar'}
                </button>
              </div>
              <button type="button" onClick={sendCode} disabled={loading} className="text-xs text-primary-700 underline mt-2">
                Enviar de novo
              </button>
            </>
          )}
          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        </div>
      </div>
    </div>
  )
}
