/**
 * Gera um CSV simples a partir de linhas já formatadas e dispara o
 * download no navegador. Sem dependência externa.
 */
export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escapeCell = (cell: string | number) => {
    const str = String(cell)
    if (str.includes(';') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  // Ponto e vírgula como separador: Excel em pt-BR abre corretamente sem
  // precisar de configuração extra (vírgula é o separador decimal aqui).
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(';'))
  const csvContent = '﻿' + lines.join('\r\n') // BOM ajuda o Excel a reconhecer UTF-8

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
