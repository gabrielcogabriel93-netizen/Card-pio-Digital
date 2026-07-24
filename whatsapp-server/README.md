# Servidor WhatsApp (WPPConnect)

Servidor separado do app principal — mantém a sessão do WhatsApp de cada
loja conectada e envia as notificações de status a pedido do painel.
**Não roda no Vercel.** Precisa de uma VPS (ou qualquer máquina Linux
sempre ligada) porque mantém um Chromium de verdade aberto por sessão
conectada — algo que uma função serverless não permite.

## ⚠️ Antes de usar, leia isto

Isso usa o WPPConnect, uma automação **não oficial** do WhatsApp (ele
controla o WhatsApp Web por trás dos panos). Não é a API oficial da
Meta. O WhatsApp pode banir o número que fizer esse tipo de uso,
principalmente em envio de muitas mensagens em pouco tempo pra
destinatários diferentes. Por isso:

- Aqui só está implementado o envio **1 para 1**, disparado por uma ação
  manual do lojista (mudar status de um pedido específico, ou clicar
  pra mandar parabéns pra um cliente específico) — não existe (e não foi
  implementado de propósito) nenhum envio em massa/automático pra lista
  de clientes.
- Ainda assim, use um número que não seja crítico pro negócio enquanto
  testa, e acompanhe se o WhatsApp não sinalizar nada estranho.
- Se quiser zero risco de banimento, a alternativa é a **WhatsApp
  Business Platform (Cloud API)** oficial da Meta — exige verificação de
  empresa e cobra por conversa, mas não tem esse risco.

## Deploy numa VPS (resumo)

1. VPS Linux (Ubuntu 22.04 é o mais testado com Puppeteer), Node 18+.
2. Instale as dependências do Chromium que o Puppeteer precisa:
   ```bash
   sudo apt-get update && sudo apt-get install -y \
     ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 \
     libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 \
     libfontconfig1 libgbm1 libgcc1 libglib2.0-0 libgtk-3-0 libnspr4 \
     libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 \
     libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 \
     libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 \
     libxtst6 lsb-release wget xdg-utils
   ```
3. Copie a pasta `whatsapp-server/` pra VPS.
4. `cp .env.example .env` e preencha `API_SECRET` com uma string aleatória.
5. `npm install`
6. Rode com um gerenciador de processo pra sobreviver a reinícios:
   ```bash
   npm install -g pm2
   pm2 start index.js --name whatsapp-server
   pm2 save
   pm2 startup
   ```
7. Libere a porta (padrão 3333) no firewall só pro seu app Next.js
   conseguir chamar — não deixe essa porta pública sem necessidade
   (idealmente, coloque atrás de HTTPS com um proxy reverso tipo Nginx +
   Certbot, e aponte `WHATSAPP_SERVER_URL` no Next.js pra essa URL HTTPS).

## Configuração no app Next.js

No `.env` do app principal (e nas variáveis de ambiente da Vercel):

```
WHATSAPP_SERVER_URL=https://seu-servidor-whatsapp.com
WHATSAPP_SERVER_SECRET=mesmo-valor-do-API_SECRET-aqui-em-cima
```

## Uso

Cada loja conecta o próprio número em **Painel → WhatsApp**, escaneando
um QR Code (igual conectar o WhatsApp Web) — a sessão fica salva em
`tokens/` nesta pasta, então um restart do servidor não exige escanear
de novo (só se o WhatsApp do celular desconectar a sessão).

## Escala

Cada sessão conectada = um processo Chromium rodando o tempo todo
(~200-400MB de RAM cada, na prática). Isso não escala como o resto do
app (que é serverless/sem estado) — se for oferecer isso pra muitas
lojas, meça o consumo de RAM por sessão na sua VPS antes de assumir que
uma máquina pequena aguenta todo mundo conectado ao mesmo tempo.
