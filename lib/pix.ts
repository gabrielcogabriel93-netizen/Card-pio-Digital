// Gera o payload "Pix copia e cola" (padrão EMV do Banco Central) a
// partir da chave Pix do lojista — sem gateway, sem taxa, sem chamada de
// API nenhuma: é só formatar uma string seguindo o formato oficial e
// calcular o checksum. Qualquer app de banco lê isso normalmente.

function crc16ccitt(payload: string): string {
  let crc = 0xffff
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

function emvField(id: string, value: string): string {
  const length = String(value.length).padStart(2, '0')
  return `${id}${length}${value}`
}

// O padrão EMV do Pix não aceita acentuação nem caracteres especiais
// nesses campos — remove acento e filtra só letras/números/espaço.
function sanitize(value: string, maxLength: number): string {
  const clean = value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .trim()
    .slice(0, maxLength)
  return clean || 'NAO INFORMADO'
}

export interface PixPayloadOptions {
  pixKey: string
  merchantName: string
  merchantCity: string
  amount?: number
  txId?: string
}

export function generatePixPayload({ pixKey, merchantName, merchantCity, amount, txId }: PixPayloadOptions): string {
  const merchantAccountInfo = emvField('00', 'BR.GOV.BCB.PIX') + emvField('01', pixKey.trim())
  const tx = txId && txId.trim() ? sanitize(txId, 25) : '***'

  let payload = ''
  payload += emvField('00', '01') // Payload Format Indicator
  payload += emvField('26', merchantAccountInfo) // Merchant Account Info (Pix)
  payload += emvField('52', '0000') // Merchant Category Code
  payload += emvField('53', '986') // Moeda: Real (BRL)
  if (amount && amount > 0) {
    payload += emvField('54', amount.toFixed(2))
  }
  payload += emvField('58', 'BR')
  payload += emvField('59', sanitize(merchantName, 25))
  payload += emvField('60', sanitize(merchantCity, 15))
  payload += emvField('62', emvField('05', tx))
  payload += '6304' // ID + tamanho do CRC — o valor vem colado em seguida
  return payload + crc16ccitt(payload)
}

export const PIX_KEY_TYPES = [
  { value: 'cpf', label: 'CPF' },
  { value: 'cnpj', label: 'CNPJ' },
  { value: 'email', label: 'E-mail' },
  { value: 'telefone', label: 'Telefone' },
  { value: 'aleatoria', label: 'Chave aleatória' },
] as const
