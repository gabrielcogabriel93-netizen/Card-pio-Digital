// Pratos em 3D / realidade aumentada (migration 061). Regras do arquivo
// que o lojista envia e textos de apoio, compartilhados entre painel,
// guia e cardápio.

export const MODEL_MAX_BYTES = 15 * 1024 * 1024 // 15 MB
export const MODEL_IDEAL_BYTES = 8 * 1024 * 1024 // acima disso, avisa que pesa no 4G

export type ModelKind = 'glb' | 'usdz'

export function modelKindOf(fileName: string): ModelKind | null {
  const ext = fileName.toLowerCase().split('.').pop()
  if (ext === 'glb') return 'glb'
  if (ext === 'usdz') return 'usdz'
  return null
}

/** Confere a assinatura do arquivo: GLB começa com "glTF"; USDZ é um zip ("PK"). */
export function checkModelHeader(kind: ModelKind, head: Uint8Array): boolean {
  if (kind === 'glb') return head[0] === 0x67 && head[1] === 0x6c && head[2] === 0x54 && head[3] === 0x46
  return head[0] === 0x50 && head[1] === 0x4b
}

export function modelFileProblem(file: { name: string; size: number }, head: Uint8Array, expected: ModelKind): string | null {
  const kind = modelKindOf(file.name)
  if (!kind) return 'Envie um arquivo .glb (ou .usdz para o iPhone). Exporte nesse formato no app de escaneamento.'
  if (kind !== expected) return expected === 'glb' ? 'Aqui vai o arquivo .glb. O .usdz (iPhone) tem um campo próprio, opcional.' : 'Aqui vai o arquivo .usdz do iPhone.'
  if (file.size > MODEL_MAX_BYTES) return `O arquivo tem ${formatMB(file.size)}. O limite é ${formatMB(MODEL_MAX_BYTES)}: exporte com menos detalhe (textura 2K ou "médio").`
  if (!checkModelHeader(kind, head)) return 'Esse arquivo não parece um modelo 3D válido. Exporte de novo no app de escaneamento.'
  return null
}

export function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

/** Só aceitamos modelos do nosso próprio storage (https). */
export function isSafeModelUrl(url: string | null | undefined): url is string {
  return !!url && /^https:\/\/[^\s"'<>]+$/.test(url)
}
