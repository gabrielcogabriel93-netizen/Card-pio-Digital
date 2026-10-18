'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { saveCustomerToken } from '@/lib/customerStorage'
import { ShieldCheck, Loader2 } from 'lucide-react'

/**
 * O telefone já tem cadastro na loja, mas este aparelho ainda não foi
 * confirmado. O cliente confirma com o número de um pedido anterior
 * (#A1B2C3, aparece na página do pedido e nos avisos) e o aparelho
 * recebe o token: aí endereços, pontos e histórico aparecem.
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
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const verify = async () => {
    const clean = code.replace(/[^0-9a-f]/gi, '')
    if (clean.length < 6) {
      setError('O número do pedido tem 6 letras e números, como A1B2C3.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const supabase = createClient()
      const { data, error: rpcError } = await supabase.rpc('verify_customer_by_order', {
        p_establishment_id: establishmentId,
        p_phone: phone,
        p_order_code: clean,
      })
      if (rpcError) throw new Error(rpcError.message)
      if (!data) throw new Error('Esse número não confere com o seu telefone. Confira na página do pedido.')
      saveCustomerToken(establishmentId, phone, data as string)
      onVerified(data as string)
    } catch (err: any) {
      setError(err.message || 'Não foi possível confirmar.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`rounded-xl bg-primary-50 border border-primary-100 ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex items-start gap-2.5">
        <ShieldCheck size={18} className="text-primary-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-800">
            Esse telefone já tem cadastro. Para usar seus endereços e pontos neste aparelho, digite o número de um pedido seu
            (está na página do pedido e nos avisos, como <span className="font-mono">#A1B2C3</span>).
          </p>
          <div className="flex gap-2 mt-2.5">
            <input
              className="input-field text-center font-mono tracking-[0.3em] text-lg py-2 w-40 uppercase"
              autoCapitalize="characters"
              autoComplete="off"
              maxLength={9}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9a-fA-F#]/g, ''))}
              placeholder="A1B2C3"
              aria-label="Número do pedido"
            />
            <button type="button" onClick={verify} disabled={loading} className="btn-primary text-sm py-2 px-4">
              {loading ? <Loader2 size={15} className="animate-spin" /> : 'Confirmar'}
            </button>
          </div>
          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
          <p className="text-xs text-gray-500 mt-2">Não lembra? Sem problema: faça o pedido normalmente, seus pontos continuam somando.</p>
        </div>
      </div>
    </div>
  )
}
