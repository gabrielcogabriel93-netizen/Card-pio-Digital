// Célula que começa com = + - @ (ou tab/CR) vira fórmula no Excel: um
// nome de cliente "=HYPERLINK(...)" executaria ao abrir a planilha.
// Prefixar com apóstrofo mantém o texto e desliga a fórmula. Números de
// verdade (ex: -10) chegam como number e continuam números.
export function escapeCsvCell(cell: string | number): string {
  let str = String(cell)
  if (typeof cell === 'string' && /^[=+\-@\t\r]/.test(str)) str = `'${str}`
  if (str.includes(';') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * Gera um CSV simples a partir de linhas já formatadas e dispara o
 * download no navegador. Sem dependência externa.
 */
export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  // Ponto e vírgula como separador: Excel em pt-BR abre corretamente sem
  // precisar de configuração extra (vírgula é o separador decimal aqui).
  const lines = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(';'))
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
