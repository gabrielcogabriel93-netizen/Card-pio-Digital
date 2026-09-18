'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { logError } from '@/lib/logger'
import { Copy, Loader2, CheckCircle2, XCircle, X } from 'lucide-react'

const POLL_INTERVAL_MS = 3000
const POLL_TIMEOUT_MS = 15 * 60 * 1000 // 15 minutos — validade típica do Pix do MP

interface MercadoPagoPixCheckoutProps {
  orderId: string
  amount: number
  qrCode: string
  qrCodeBase64: string
  trackingUrl: string
  onClose: () => void
}

type PaymentState = 'waiting' | 'approved' | 'rejected' | 'timeout'

/**
 * Tela de espera do Pix automático: mostra o QR + copia-e-cola gerados
 * pelo Mercado Pago e faz polling em `get_order_status` (RPC pública, a
 * mesma que a página /pedido/[id] usa) até o pagamento ser aprovado — o
 * cliente não precisa checar nada, nem passar pelo WhatsApp.
 */
export function MercadoPagoPixCheckout({ orderId, amount, qrCode, qrCodeBase64, trackingUrl, onClose }: MercadoPagoPixCheckoutProps) {
  const [state, setState] = useState<PaymentState>('waiting')
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const [currentQrCode, setCurrentQrCode] = useState(qrCode)
  const [currentQrCodeBase64, setCurrentQrCodeBase64] = useState(qrCodeBase64)
  const [retrying, setRetrying] = useState(false)
  const startedAtRef = useRef(Date.now())

  useEffect(() => {
    if (state !== 'waiting') return

    const poll = async () => {
      if (Date.now() - startedAtRef.current > POLL_TIMEOUT_MS) {
        setState('timeout')
        return
      }
      try {
        const supabase = createClient()
        const { data, error } = await supabase.rpc('get_order_status', { p_order_id: orderId })
        if (error) throw error
        const status = data?.[0]?.payment_status
        if (status === 'approved') setState('approved')
        else if (status === 'rejected' || status === 'cancelled') setState('rejected')
      } catch (err) {
        logError('mercadopago:checkout', 'erro ao consultar status do pagamento', err)
      }
    }

    poll()
    const interval = setInterval(poll, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [state, orderId])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(currentQrCode)
      setCopyFailed(false)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      logError('mercadopago:checkout', 'erro ao copiar código Pix', err)
      setCopyFailed(true)
    }
  }

  const handleRetry = async () => {
    setRetrying(true)
    try {
      const response = await fetch('/api/mercadopago/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Erro ao gerar novo Pix')
      setCurrentQrCode(data.qrCode)
      setCurrentQrCodeBase64(data.qrCodeBase64)
      startedAtRef.current = Date.now()
      setState('waiting')
    } catch (err) {
      logError('mercadopago:checkout', 'erro ao tentar pagamento novamente', err)
      alert('Não foi possível gerar um novo Pix. Tente novamente em instantes.')
    } finally {
      setRetrying(false)
    }
  }

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm max-h-[90vh] overflow-y-auto animate-fade-in">
        <button onClick={onClose} className="absolute top-4 right-4 p-1 hover:bg-gray-100 rounded z-10" aria-label="Fechar">
          <X size={20} />
        </button>

        {state === 'waiting' && (
          <div className="p-6 text-center">
            <p className="text-sm font-medium text-gray-700 mb-3">Pague {formatCurrency(amount)} com Pix</p>
            {currentQrCodeBase64 && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`data:image/png;base64,${currentQrCodeBase64}`}
                alt="QR Code Pix"
                className="mx-auto rounded-lg"
                width={220}
                height={220}
              />
            )}
            <button type="button" onClick={handleCopy} className="btn-secondary text-sm mt-3 w-full">
              <Copy size={14} />
              {copied ? 'Código copiado!' : 'Copiar código Pix'}
            </button>
            {copyFailed && (
              <div className="mt-2 text-left">
                <p className="text-xs text-red-600 mb-1">Não foi possível copiar automaticamente. Selecione o código abaixo e copie manualmente:</p>
                <input
                  type="text"
                  readOnly
                  value={currentQrCode}
                  onFocus={(e) => e.currentTarget.select()}
                  className="input-field text-xs"
                />
              </div>
            )}

            <div className="flex items-center justify-center gap-2 mt-4 text-sm text-gray-500">
              <Loader2 size={16} className="animate-spin" />
              Aguardando pagamento...
            </div>
            <p className="text-xs text-gray-400 mt-3">
              Assim que o pagamento cair, seu pedido é confirmado sozinho — pode fechar essa tela e
              acompanhar por aqui:
            </p>
            <a href={trackingUrl} className="text-xs text-primary-600 underline break-all">{trackingUrl}</a>
          </div>
        )}

        {state === 'approved' && (
          <div className="p-6 text-center">
            <CheckCircle2 size={48} className="text-green-500 mx-auto mb-3" />
            <p className="font-semibold text-gray-900 mb-1">Pagamento confirmado!</p>
            <p className="text-sm text-gray-600 mb-4">Já estamos preparando o seu pedido.</p>
            <a href={trackingUrl} className="btn-primary w-full block text-center">Acompanhar pedido</a>
          </div>
        )}

        {(state === 'rejected' || state === 'timeout') && (
          <div className="p-6 text-center">
            <XCircle size={48} className="text-red-500 mx-auto mb-3" />
            <p className="font-semibold text-gray-900 mb-1">
              {state === 'timeout' ? 'O código Pix expirou' : 'O pagamento não foi concluído'}
            </p>
            <p className="text-sm text-gray-600 mb-4">
              Seu pedido continua salvo — gere um novo código Pix pra tentar de novo.
            </p>
            <button onClick={handleRetry} disabled={retrying} className="btn-primary w-full">
              {retrying ? <Loader2 size={18} className="animate-spin" /> : 'Gerar novo Pix'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
