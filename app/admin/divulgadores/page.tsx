'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { log, logError } from '@/lib/logger'
import { ArrowLeft, Copy, Loader2, Megaphone, Pencil, Check, X } from 'lucide-react'
import { getBaseUrl } from '@/lib/baseUrl'

interface DivulgadorRow {
  id: string
  nome: string
  email: string
  codigoAfiliado: string
  percentualComissao: number
  status: 'ativo' | 'inativo'
  onboardingComplete: boolean
  indicacoesTotal: number
  indicacoesAtivas: number
  comissaoTotal: number
}

interface ComissaoRow {
  id: string
  criadoEm: string
  divulgadorNome: string
  estabelecimentoNome: string
  valorAssinatura: number
  valorComissao: number
  status: string
}

export default function AdminDivulgadoresPage() {
  const [divulgadores, setDivulgadores] = useState<DivulgadorRow[] | null>(null)
  const [comissoes, setComissoes] = useState<ComissaoRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [copied, setCopied] = useState(false)

  const load = async () => {
    try {
      const [divResponse, comResponse] = await Promise.all([
        fetch('/api/admin/divulgadores'),
        fetch('/api/admin/divulgadores/comissoes'),
      ])
      const divData = await divResponse.json()
      const comData = await comResponse.json()
      if (!divResponse.ok) throw new Error(divData.error || 'Erro ao carregar divulgadores')
      if (!comResponse.ok) throw new Error(comData.error || 'Erro ao carregar comissões')
      setDivulgadores(divData.divulgadores)
      setComissoes(comData.comissoes)
    } catch (err) {
      logError('admin:divulgadores', 'erro ao carregar dados', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
  const formatDate = (value: string) => new Date(value).toLocaleDateString('pt-BR')

  const handleCopySignupLink = () => {
    navigator.clipboard.writeText(`${getBaseUrl()}/divulgador/cadastro`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const startEdit = (row: DivulgadorRow) => {
    setEditingId(row.id)
    setEditDraft(String(row.percentualComissao))
  }

  const savePercentual = async (id: string) => {
    const value = Number(editDraft)
    if (!Number.isFinite(value) || value <= 0 || value > 100) {
      alert('Percentual inválido')
      return
    }
    try {
      const response = await fetch('/api/admin/divulgadores', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, percentualComissao: value }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Erro ao salvar')
      setEditingId(null)
      await load()
    } catch (err: any) {
      logError('admin:divulgadores', 'erro ao salvar percentual', err)
      alert(err.message || 'Erro ao salvar')
    }
  }

  const toggleStatus = async (row: DivulgadorRow) => {
    const novoStatus = row.status === 'ativo' ? 'inativo' : 'ativo'
    log('admin:divulgadores', 'alterando status', { id: row.id, novoStatus })
    try {
      const response = await fetch('/api/admin/divulgadores', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, status: novoStatus }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Erro ao salvar')
      await load()
    } catch (err: any) {
      logError('admin:divulgadores', 'erro ao alterar status', err)
      alert(err.message || 'Erro ao alterar status')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-primary-500" />
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={20} />
        </Link>
        <Megaphone size={24} className="text-primary-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Divulgadores</h1>
          <p className="text-gray-600 text-sm">Comissões recorrentes sobre a mensalidade da plataforma.</p>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Link de cadastro de divulgador</h2>
            <p className="text-sm text-gray-500">Compartilhe pra alguém virar divulgador.</p>
          </div>
          <button onClick={handleCopySignupLink} className="btn-secondary">
            <Copy size={16} />
            {copied ? 'Copiado!' : 'Copiar link'}
          </button>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="font-semibold text-gray-900 mb-4">Divulgadores</h2>
        {!divulgadores || divulgadores.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum divulgador cadastrado ainda.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100">
                <th className="py-2 pr-3">Nome</th>
                <th className="py-2 pr-3">Código</th>
                <th className="py-2 pr-3">Comissão</th>
                <th className="py-2 pr-3">Onboarding</th>
                <th className="py-2 pr-3">Indicações</th>
                <th className="py-2 pr-3">Total ganho</th>
                <th className="py-2 pr-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {divulgadores.map((row) => (
                <tr key={row.id} className="border-b border-gray-50 last:border-0">
                  <td className="py-2 pr-3">
                    <p className="font-medium text-gray-900">{row.nome}</p>
                    <p className="text-xs text-gray-500">{row.email}</p>
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs">{row.codigoAfiliado}</td>
                  <td className="py-2 pr-3">
                    {editingId === row.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.1"
                          className="input-field w-20 py-1"
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          autoFocus
                        />
                        <button onClick={() => savePercentual(row.id)} className="text-green-600 hover:text-green-700">
                          <Check size={16} />
                        </button>
                        <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600">
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => startEdit(row)} className="flex items-center gap-1 hover:text-primary-600">
                        {row.percentualComissao}% <Pencil size={12} className="text-gray-400" />
                      </button>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <span className={`badge ${row.onboardingComplete ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                      {row.onboardingComplete ? 'Completo' : 'Pendente'}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    {row.indicacoesAtivas} ativa{row.indicacoesAtivas !== 1 ? 's' : ''} / {row.indicacoesTotal} total
                  </td>
                  <td className="py-2 pr-3 font-medium">{formatCurrency(row.comissaoTotal)}</td>
                  <td className="py-2 pr-3">
                    <button
                      onClick={() => toggleStatus(row)}
                      className={`badge ${row.status === 'ativo' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}
                    >
                      {row.status === 'ativo' ? 'Ativo' : 'Inativo'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card overflow-x-auto">
        <h2 className="font-semibold text-gray-900 mb-4">Extrato de comissões</h2>
        {!comissoes || comissoes.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhuma comissão registrada ainda.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100">
                <th className="py-2 pr-3">Data</th>
                <th className="py-2 pr-3">Divulgador</th>
                <th className="py-2 pr-3">Estabelecimento</th>
                <th className="py-2 pr-3">Assinatura</th>
                <th className="py-2 pr-3">Comissão</th>
                <th className="py-2 pr-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {comissoes.map((c) => (
                <tr key={c.id} className="border-b border-gray-50 last:border-0">
                  <td className="py-2 pr-3">{formatDate(c.criadoEm)}</td>
                  <td className="py-2 pr-3">{c.divulgadorNome}</td>
                  <td className="py-2 pr-3">{c.estabelecimentoNome}</td>
                  <td className="py-2 pr-3">{formatCurrency(c.valorAssinatura)}</td>
                  <td className="py-2 pr-3 font-medium">{formatCurrency(c.valorComissao)}</td>
                  <td className="py-2 pr-3">
                    <span className={`badge ${c.status === 'confirmada' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {c.status === 'confirmada' ? 'Confirmada' : 'Falhou'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
