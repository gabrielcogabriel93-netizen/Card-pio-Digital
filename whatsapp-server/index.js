// Servidor separado do app principal — precisa rodar numa VPS (ou
// qualquer máquina Linux com Node 18+), NUNCA no Vercel. O motivo é o
// WPPConnect abrir um Chromium de verdade e manter ele vivo o tempo
// todo pra cada loja conectada, o que uma função serverless não permite
// (elas não mantêm processo em background entre chamadas).
//
// Cada estabelecimento = uma "sessão" independente = um Chromium
// próprio. Isso consome RAM de verdade (na prática, uns 200-400MB por
// loja conectada) — não escale isso pra dezenas de lojas numa VPS
// pequena sem medir o consumo primeiro.

require('dotenv').config()
const express = require('express')
const cors = require('cors')
const wppconnect = require('@wppconnect-team/wppconnect')

const app = express()
app.use(cors())
app.use(express.json())

const PORT = process.env.PORT || 3333
const API_SECRET = process.env.API_SECRET

if (!API_SECRET) {
  console.error('Defina API_SECRET no .env antes de iniciar (mesmo valor de WHATSAPP_SERVER_SECRET no app Next.js).')
  process.exit(1)
}

// Estado das sessões em memória: establishmentId -> { status, qrCode, client }
// status: 'disconnected' | 'starting' | 'qrcode' | 'connected'
const sessions = new Map()

function getSession(id) {
  return sessions.get(id) || { status: 'disconnected', qrCode: null, client: null }
}

function requireAuth(req, res, next) {
  if (req.headers['x-api-secret'] !== API_SECRET) {
    return res.status(401).json({ error: 'Não autorizado' })
  }
  next()
}

app.use(requireAuth)

// Dispara a criação da sessão em segundo plano — não dá pra esperar o
// `wppconnect.create()` terminar aqui, porque ele só resolve depois que
// o QR for escaneado. O QR chega via callback (`catchQR`) e fica salvo
// no Map; o app consulta /status em loop até aparecer.
function startSession(id) {
  const current = sessions.get(id)
  if (current && ['starting', 'qrcode', 'connected'].includes(current.status)) {
    return
  }

  sessions.set(id, { status: 'starting', qrCode: null, client: null })

  wppconnect
    .create({
      session: id,
      catchQR: (base64Qr) => {
        const now = sessions.get(id) || {}
        sessions.set(id, { ...now, status: 'qrcode', qrCode: base64Qr })
      },
      statusFind: (statusSession) => {
        console.log(`[${id}] status:`, statusSession)
      },
      folderNameToken: 'tokens', // sessão salva em disco — não precisa reler o QR toda vez que o servidor reiniciar
      headless: true,
      puppeteerOptions: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        // Em VPS ARM (ex: Oracle Cloud Ampere A1), o Chromium que o
        // WPPConnect baixa sozinho não existe pra essa arquitetura —
        // usa o Chromium instalado via apt e apontado aqui.
        ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
      },
    })
    .then((client) => {
      sessions.set(id, { status: 'connected', qrCode: null, client })
      client.onStateChange((state) => {
        console.log(`[${id}] estado mudou:`, state)
        if (['CONFLICT', 'UNPAIRED', 'UNLAUNCHED', 'UNPAIRED_IDLE'].includes(state)) {
          sessions.set(id, { status: 'disconnected', qrCode: null, client: null })
        }
      })
    })
    .catch((err) => {
      console.error(`[${id}] erro ao iniciar sessão:`, err.message)
      sessions.set(id, { status: 'disconnected', qrCode: null, client: null })
    })
}

app.get('/sessions/:id/status', (req, res) => {
  const session = getSession(req.params.id)
  res.json({ status: session.status, qrCode: session.qrCode })
})

app.post('/sessions/:id/start', (req, res) => {
  startSession(req.params.id)
  const session = getSession(req.params.id)
  res.json({ status: session.status, qrCode: session.qrCode })
})

app.post('/sessions/:id/logout', async (req, res) => {
  const session = sessions.get(req.params.id)
  if (session?.client) {
    try {
      await session.client.logout()
    } catch (err) {
      console.error(`[${req.params.id}] erro ao desconectar:`, err.message)
    }
  }
  sessions.delete(req.params.id)
  res.json({ ok: true })
})

app.post('/sessions/:id/send', async (req, res) => {
  const { phone, message } = req.body || {}
  if (!phone || !message) {
    return res.status(400).json({ error: 'phone e message são obrigatórios' })
  }

  const session = sessions.get(req.params.id)
  if (!session || session.status !== 'connected' || !session.client) {
    return res.status(409).json({ error: 'Sessão do WhatsApp não está conectada' })
  }

  try {
    const digits = String(phone).replace(/\D/g, '')
    const chatId = digits.startsWith('55') ? `${digits}@c.us` : `55${digits}@c.us`
    await session.client.sendText(chatId, message)
    res.json({ ok: true })
  } catch (err) {
    console.error(`[${req.params.id}] erro ao enviar mensagem:`, err.message)
    res.status(500).json({ error: 'Erro ao enviar mensagem' })
  }
})

app.listen(PORT, () => {
  console.log(`Servidor WhatsApp rodando na porta ${PORT}`)
})
