'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { logError } from '@/lib/logger'
import { Printer, Loader2, Pencil, Check, X } from 'lucide-react'

interface AutoPrintToggleProps {
  establishmentId: string
  autoPrintEnabled: boolean | null
  printerLabel: string
  onChange: (next: { autoPrintEnabled: boolean; printerLabel: string }) => void
}

// Liga/desliga a impressão automática de comanda e deixa editar o
// "apelido" da impressora — que é só um lembrete em texto, não um
// seletor de verdade (o navegador sempre usa a impressora padrão do
// Windows daquele computador, não dá pra escolher por código).
export function AutoPrintToggle({ establishmentId, autoPrintEnabled, printerLabel, onChange }: AutoPrintToggleProps) {
  const [busy, setBusy] = useState(false)
  const [editingLabel, setEditingLabel] = useState(false)
  const [labelDraft, setLabelDraft] = useState(printerLabel)

  const save = async (next: { auto_print_enabled: boolean; printer_label?: string | null }) => {
    setBusy(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.from('establishments').update(next).eq('id', establishmentId)
      if (error) throw error
      onChange({
        autoPrintEnabled: next.auto_print_enabled,
        printerLabel: next.printer_label !== undefined ? next.printer_label || '' : printerLabel,
      })
    } catch (err) {
      logError('painel:pedidos', 'erro ao salvar impressão automática', err)
      alert('Erro ao salvar configuração de impressão.')
    } finally {
      setBusy(false)
    }
  }

  const handleToggle = () => save({ auto_print_enabled: !(autoPrintEnabled === true) })

  const handleSaveLabel = async () => {
    await save({ auto_print_enabled: autoPrintEnabled === true, printer_label: labelDraft.trim() || null })
    setEditingLabel(false)
  }

  const isOn = autoPrintEnabled === true

  if (editingLabel) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={labelDraft}
          onChange={(e) => setLabelDraft(e.target.value)}
          placeholder="Apelido da impressora"
          className="input-field text-sm py-1.5 w-44"
          autoFocus
        />
        <button onClick={handleSaveLabel} disabled={busy} className="p-1.5 hover:bg-gray-100 rounded" title="Salvar" aria-label="Salvar apelido da impressora">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} className="text-primary-600" />}
        </button>
        <button
          onClick={() => { setEditingLabel(false); setLabelDraft(printerLabel) }}
          className="p-1.5 hover:bg-gray-100 rounded"
          title="Cancelar"
          aria-label="Cancelar edição"
        >
          <X size={14} className="text-gray-400" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={handleToggle}
        disabled={busy}
        className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg transition-colors ${
          isOn ? 'bg-primary-50 text-primary-700 hover:bg-primary-100' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
        title={isOn ? 'Desativar impressão automática de comanda' : 'Ativar impressão automática de comanda'}
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
        {isOn ? 'Impressão automática ativa' : 'Ativar impressão automática'}
      </button>
      {isOn && (
        <button
          onClick={() => setEditingLabel(true)}
          className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
          title="Editar apelido da impressora (lembrete — a impressão usa sempre a impressora padrão do Windows)"
        >
          <Pencil size={11} />
          {printerLabel || 'nomear impressora'}
        </button>
      )}
    </div>
  )
}
