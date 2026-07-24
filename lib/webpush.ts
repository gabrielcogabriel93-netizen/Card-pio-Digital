import webpush from 'web-push'

// Só é importado por rotas de servidor (app/api/push/*) — nunca pelo
// client, porque usa a chave PRIVADA do VAPID (assina os pushes; se
// vazasse pro navegador, qualquer um poderia mandar push fingindo ser
// o app).
let configured = false

export function getWebPush() {
  if (!configured) {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    const privateKey = process.env.VAPID_PRIVATE_KEY
    const subject = process.env.VAPID_SUBJECT || 'mailto:contato@example.com'

    if (!publicKey || !privateKey) {
      throw new Error(
        'VAPID keys ausentes. Configure NEXT_PUBLIC_VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY no .env.'
      )
    }

    webpush.setVapidDetails(subject, publicKey, privateKey)
    configured = true
  }

  return webpush
}
