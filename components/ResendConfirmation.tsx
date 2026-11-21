'use client'

// Reenvia o e-mail de confirmação do cadastro (muita gente não acha o
// primeiro: cai no spam ou em "Promoções").
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { logError } from '@/lib/logger'
import { Loader2, Mail } from 'lucide-react'

export function ResendConfirmation({ email, className }: { email: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [msg, setMsg] = useState('')

  const resend = async () => {
    if (!email.trim()) { setState('error'); setMsg('Digite o seu e-mail acima.'); return }
    setState('sending')
    const { error } = await createClient().auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/login?confirmado=1` },
    })
    if (error) {
      logError('cadastro', 'erro ao reenviar confirmação', error)
      setState('error')
      setMsg(/rate|seconds|security purposes/i.test(error.message) ? 'Aguarde um minuto antes de pedir outro e-mail.' : 'Não foi possível reenviar agora. Tente de novo em instantes.')
      return
    }
    setState('sent')
  }

  return (
    <div className={className}>
      <button type="button" onClick={resend} disabled={state === 'sending' || state === 'sent'} className="btn-secondary w-full">
        {state === 'sending' ? <Loader2 size={18} className="animate-spin" /> : <Mail size={18} />}
        {state === 'sent' ? 'E-mail reenviado' : 'Reenviar e-mail de confirmação'}
      </button>
      {state === 'sent' && <p className="text-sm text-green-700 mt-2">Enviamos de novo para <strong>{email}</strong>. Pode levar alguns minutos.</p>}
      {state === 'error' && <p className="text-sm text-red-600 mt-2">{msg}</p>}
      <p className="text-xs text-gray-500 mt-2">Não chegou? Procure na caixa de <strong>spam</strong> ou em <strong>Promoções</strong>, pelo remetente do Freguês.</p>
    </div>
  )
}
