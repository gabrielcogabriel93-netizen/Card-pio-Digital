import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

// Cifra segredos guardados no banco (tokens do Mercado Pago dos
// lojistas) com AES-256-GCM e uma chave que fica só nas variáveis de
// ambiente do servidor. Um vazamento do banco sozinho não dá acesso às
// contas de recebimento.
//
// Formato: "enc:v1:" + base64(iv[12] | tag[16] | texto cifrado).
// Valor sem o prefixo é tratado como texto puro (tokens gravados antes
// desta mudança continuam funcionando e são recifrados no próximo refresh).
const PREFIX = 'enc:v1:'

function getKey(): Buffer | null {
  const raw = process.env.SECRETS_ENCRYPTION_KEY
  if (!raw) return null
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
  if (key.length !== 32) throw new Error('SECRETS_ENCRYPTION_KEY precisa ter 32 bytes (64 caracteres hex ou base64).')
  return key
}

export function isEncrypted(value: string | null | undefined): boolean {
  return !!value && value.startsWith(PREFIX)
}

export function encryptSecret(plain: string): string {
  const key = getKey()
  if (!key) {
    // Sem chave configurada: mantém o comportamento antigo (texto puro)
    // para não derrubar a conexão do Mercado Pago num deploy sem a env.
    console.warn('SECRETS_ENCRYPTION_KEY ausente: segredo gravado sem cifrar.')
    return plain
  }
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return PREFIX + Buffer.concat([iv, tag, encrypted]).toString('base64')
}

export function decryptSecret(value: string): string {
  if (!isEncrypted(value)) return value
  const key = getKey()
  if (!key) throw new Error('Segredo cifrado no banco, mas SECRETS_ENCRYPTION_KEY não está configurada.')
  const data = Buffer.from(value.slice(PREFIX.length), 'base64')
  const iv = data.subarray(0, 12)
  const tag = data.subarray(12, 28)
  const encrypted = data.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}
