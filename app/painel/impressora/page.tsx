'use client'

// Guia de impressão de recibos: configuração passo a passo por aparelho,
// recibo de teste, impressão automática e solução de problemas.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { AutoPrintToggle } from '@/components/AutoPrintToggle'
import { buildReceiptText, rawbtPrintUrl, receiptPrintStyle, type PaperWidth } from '@/lib/receipt'
import { toast } from '@/components/Feedback'
import type { Order } from '@/types'
import { AlertTriangle, CheckCircle2, Copy, Laptop, Loader2, Printer, ShoppingCart, Smartphone } from 'lucide-react'

const PAPER_KEY = 'painel:paper-width'
const KIOSK_FLAG = ' --kiosk-printing'
type Device = 'computador' | 'android' | 'iphone'

function sampleOrder(): Order {
  const now = new Date().toISOString()
  return {
    id: 'teste000-0000-0000-0000-000000000000',
    establishment_id: '',
    customer_name: 'Cliente Teste',
    customer_phone: '(21) 99999-0000',
    items: [
      { product_id: 'x', product_name: 'Marmita G - Filé de frango à milanesa', quantity: 1, unit_price: 18, total_price: 18, variations: [{ group_name: 'Acompanhamentos', option_name: 'Arroz, feijão e farofa', price_delta: 0 }], note: 'Sem cebola' },
      { product_id: 'y', product_name: 'Refrigerante lata 350 ml', quantity: 2, unit_price: 6, total_price: 12, variations: [] },
    ],
    subtotal: 30,
    shipping_fee: 5,
    total: 35,
    status: 'pending',
    source: 'online',
    order_type: 'delivery',
    delivery_address: { street: 'Rua de Teste', number: '123', neighborhood: 'Centro', complement: '', reference: 'Recibo de teste' },
    payment_method: 'dinheiro',
    change_for: 50,
    notes: 'RECIBO DE TESTE - pode descartar',
    created_at: now,
    updated_at: now,
  } as unknown as Order
}

function detectDevice(): Device {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'iphone'
  if (/Android/i.test(ua)) return 'android'
  return 'computador'
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex-shrink-0 w-7 h-7 rounded-full bg-primary-600 text-white text-sm font-bold flex items-center justify-center">{n}</span>
      <div className="min-w-0 flex-1 pb-1">
        <p className="font-semibold text-gray-900">{title}</p>
        <div className="text-sm text-gray-700 mt-1 space-y-1.5">{children}</div>
      </div>
    </li>
  )
}

function Problem({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-xl border border-gray-200 bg-white px-4 py-3">
      <summary className="cursor-pointer font-medium text-gray-900 list-none flex items-center justify-between gap-2">
        {title}
        <span className="text-gray-400 group-open:rotate-180 transition-transform">⌄</span>
      </summary>
      <div className="text-sm text-gray-700 mt-2 space-y-1.5">{children}</div>
    </details>
  )
}

export default function ImpressoraPage() {
  const [loading, setLoading] = useState(true)
  const [store, setStore] = useState<{ id: string; name: string } | null>(null)
  const [autoPrint, setAutoPrint] = useState<boolean | null>(null)
  const [printerLabel, setPrinterLabel] = useState('')
  const [paper, setPaper] = useState<PaperWidth>(80)
  const [device, setDevice] = useState<Device>('computador')
  const [detected, setDetected] = useState<Device>('computador')
  const [installed, setInstalled] = useState(false)
  const [printing, setPrinting] = useState(false)

  useEffect(() => {
    const d = detectDevice()
    setDevice(d)
    setDetected(d)
    setInstalled(window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true)
    try {
      const saved = Number(localStorage.getItem(PAPER_KEY))
      if (saved === 58 || saved === 80) setPaper(saved)
    } catch {}
    ;(async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return setLoading(false)
      const { data: est } = await supabase.from('establishments').select('id, name, auto_print_enabled, printer_label').eq('owner_id', user.id).single()
      if (est) {
        setStore({ id: est.id, name: est.name })
        setAutoPrint(est.auto_print_enabled ?? null)
        setPrinterLabel(est.printer_label || '')
      }
      setLoading(false)
    })()
  }, [])

  const changePaper = (w: PaperWidth) => {
    setPaper(w)
    try { localStorage.setItem(PAPER_KEY, String(w)) } catch {}
  }

  const receipt = buildReceiptText(sampleOrder(), { storeName: store?.name || 'Minha loja', width: paper })

  const printTest = () => {
    setPrinting(true)
    window.setTimeout(() => {
      window.print()
      setPrinting(false)
    }, 80)
  }

  const copyFlag = async () => {
    try {
      await navigator.clipboard.writeText(KIOSK_FLAG.trim())
      toast.success('Copiado: cole no fim do campo "Destino".')
    } catch {
      toast.error('Não consegui copiar. Digite: --kiosk-printing')
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 size={32} className="animate-spin text-primary-500" /></div>
  }

  const tabs: { id: Device; label: string; icon: typeof Laptop }[] = [
    { id: 'computador', label: 'Computador (Windows)', icon: Laptop },
    { id: 'android', label: 'Celular Android', icon: Smartphone },
    { id: 'iphone', label: 'iPhone', icon: Smartphone },
  ]

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="print:hidden">
        <h1 className="page-title">Impressora e recibos</h1>
        <p className="text-gray-600 mt-1">Configure uma vez e os recibos saem certinhos, na mão ou automaticamente a cada pedido.</p>
      </div>

      {/* Resumo e teste */}
      <section className="card space-y-4 print:hidden">
        <h2 className="font-bold text-gray-900 flex items-center gap-2"><Printer size={18} /> Este aparelho</h2>
        <ul className="text-sm space-y-1.5">
          <li className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-green-600" />
            Detectado: <strong>{tabs.find((t) => t.id === detected)?.label}</strong>
            {installed ? ' · app instalado' : ' · aberto no navegador'}
          </li>
          {detected === 'computador' && (
            <li className="flex items-start gap-2 text-gray-700">
              <AlertTriangle size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
              O navegador não informa se a impressão silenciosa está ligada. Faça o teste abaixo: se a janela &quot;Imprimir&quot; aparecer, siga o passo 4.
            </li>
          )}
          {detected !== 'computador' && (
            <li className="flex items-start gap-2 text-gray-700">
              <AlertTriangle size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
              Para impressão automática, o ideal é um computador no balcão. No celular a impressão é feita pedido a pedido.
            </li>
          )}
        </ul>

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-gray-700 flex items-center gap-2">
            Papel
            <select value={paper} onChange={(e) => changePaper(Number(e.target.value) as PaperWidth)} className="input-field py-2 text-sm w-auto" aria-label="Largura do papel">
              <option value={80}>80 mm</option>
              <option value={58}>58 mm</option>
            </select>
          </label>
          <button type="button" onClick={printTest} disabled={printing} className="btn-primary text-sm">
            {printing ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />} Imprimir recibo de teste
          </button>
          {detected === 'android' && (
            <a href={rawbtPrintUrl(receipt)} className="btn-secondary text-sm">Teste na térmica (RawBT)</a>
          )}
        </div>
        <p className="text-xs text-gray-500">A largura do papel fica salva neste aparelho e vale também na tela de Pedidos.</p>

        {store && (
          <div className="border-t border-gray-100 pt-4 space-y-2">
            <p className="text-sm font-semibold text-gray-900">Impressão automática da loja</p>
            <AutoPrintToggle
              establishmentId={store.id}
              autoPrintEnabled={autoPrint}
              printerLabel={printerLabel}
              onChange={({ autoPrintEnabled, printerLabel: l }) => { setAutoPrint(autoPrintEnabled); setPrinterLabel(l) }}
            />
            <p className="text-xs text-gray-500">
              Quando ligada, todo aparelho com a tela <strong>Pedidos</strong> aberta imprime cada pedido novo. Deixe só o computador do balcão nessa tela.
            </p>
          </div>
        )}
      </section>

      {/* Passo a passo por aparelho */}
      <section className="space-y-4 print:hidden">
        <div className="flex flex-wrap gap-2" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={device === t.id}
              onClick={() => setDevice(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium ${device === t.id ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              <t.icon size={15} /> {t.label}
            </button>
          ))}
        </div>

        {device === 'computador' && (
          <div className="card space-y-5">
            <p className="text-sm text-gray-700">É o jeito mais confiável, e o único em que a impressão automática sai sozinha, sem ninguém clicar.</p>
            <ol className="space-y-5">
              <Step n={1} title="Instale a impressora no Windows">
                <p>Ligue a impressora no USB e instale o driver que vem com ela (CD, site do fabricante ou link do vendedor).</p>
                <p>Em <strong>Configurações → Bluetooth e dispositivos → Impressoras</strong>, abra a térmica e clique em <strong>Definir como padrão</strong>. Desligue a opção &quot;Permitir que o Windows gerencie minha impressora padrão&quot;, senão ele troca sozinho.</p>
              </Step>
              <Step n={2} title="Ajuste o papel no driver">
                <p>Na mesma tela, abra <strong>Preferências de impressão</strong> e escolha o papel <strong>80 mm</strong> (ou 58 mm), com altura contínua/rolo e margens zero, se houver a opção.</p>
                <p>Se a impressora tem guilhotina, ative o <strong>corte automático</strong> ao final do documento.</p>
              </Step>
              <Step n={3} title="Faça o recibo de teste e acerte a janela de impressão">
                <p>Clique em <strong>Imprimir recibo de teste</strong> acima. Na janela do Chrome/Edge:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Destino:</strong> a térmica.</li>
                  <li><strong>Mais configurações → Margens:</strong> Nenhuma.</li>
                  <li><strong>Escala:</strong> Padrão (100%).</li>
                  <li>Desmarque <strong>Cabeçalhos e rodapés</strong> (tira data e endereço do site do papel).</li>
                </ul>
                <p>O navegador guarda essas escolhas para as próximas impressões.</p>
              </Step>
              <Step n={4} title="Impressão automática sem a janela &quot;Imprimir&quot;">
                <p>Por segurança, todo site abre a janela de impressão. Para o app imprimir direto, ligue o modo de impressão silenciosa no atalho:</p>
                <ol className="list-decimal pl-5 space-y-1">
                  <li>Ache o atalho que você usa para abrir o painel: o do app instalado (Menu Iniciar → clique direito no app → <strong>Abrir local do arquivo</strong>) ou o do Chrome/Edge na área de trabalho.</li>
                  <li>Clique com o botão direito no atalho → <strong>Propriedades</strong>.</li>
                  <li>No campo <strong>Destino</strong>, vá até o final, dê um espaço e cole:
                    <span className="inline-flex items-center gap-1.5 ml-1">
                      <code className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-900">--kiosk-printing</code>
                      <button type="button" onClick={copyFlag} className="inline-flex items-center gap-1 text-primary-700 hover:underline text-xs"><Copy size={12} /> copiar</button>
                    </span>
                  </li>
                  <li>Clique em <strong>OK</strong>, feche <strong>todas</strong> as janelas do Chrome/Edge (inclusive o ícone perto do relógio) e abra o painel <strong>por esse atalho</strong>.</li>
                  <li>Imprima o recibo de teste de novo: agora ele deve sair direto, sem janela.</li>
                </ol>
                <p className="text-amber-800 bg-amber-50 rounded-lg px-3 py-2">Se o navegador já estava aberto antes, o modo silencioso não liga. Sempre abra pelo atalho ajustado, de preferência com o navegador fechado.</p>
              </Step>
              <Step n={5} title="Ligue a impressão automática e deixe a tela de Pedidos aberta">
                <p>Ative <strong>Impressão automática</strong> (aqui ou na tela Pedidos) e deixe a tela <Link href="/painel/pedidos" className="text-primary-700 underline">Pedidos</Link> aberta. Pode minimizar, mas não feche.</p>
                <p>Evite que o computador durma: <strong>Configurações → Sistema → Energia</strong> → &quot;Colocar em suspensão&quot;: <strong>Nunca</strong> (quando ligado na tomada).</p>
                <p>Pedidos que chegam juntos imprimem um depois do outro.</p>
              </Step>
            </ol>
          </div>
        )}

        {device === 'android' && (
          <div className="card space-y-5">
            <p className="text-sm text-gray-700">No Android você imprime cada pedido com um toque, direto na térmica Bluetooth ou USB, usando o app gratuito RawBT.</p>
            <ol className="space-y-5">
              <Step n={1} title="Instale o RawBT">
                <p>Na Play Store, instale <strong>RawBT ESC/POS thermal printer driver</strong>.</p>
              </Step>
              <Step n={2} title="Pareie a impressora">
                <p>Ligue a impressora e pareie no Bluetooth do celular (a senha costuma ser 0000 ou 1234). Impressora USB funciona com cabo OTG.</p>
              </Step>
              <Step n={3} title="Configure o RawBT">
                <p>Abra o RawBT → <strong>Configurações</strong> → escolha a conexão (Bluetooth) e a impressora, e a largura do papel (58 ou 80 mm, igual à escolhida acima).</p>
              </Step>
              <Step n={4} title="Teste e use">
                <p>Toque em <strong>Teste na térmica (RawBT)</strong> lá em cima. Nos pedidos, use o botão <strong>Térmica</strong> dentro de cada pedido.</p>
                <p>A primeira vez o Android pergunta com qual app abrir: escolha RawBT e marque <strong>Sempre</strong>.</p>
              </Step>
            </ol>
            <p className="text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2">
              A impressão automática não é confiável no celular: o Android pausa a página com a tela apagada, e ela abriria a janela de impressão do sistema. Se a loja tiver movimento, use um computador no balcão para a automática e deixe o celular para conferir pedidos.
            </p>
          </div>
        )}

        {device === 'iphone' && (
          <div className="card space-y-4">
            <p className="text-sm text-gray-700">O iPhone só imprime em impressoras <strong>AirPrint</strong> (as comuns de folha A4, Wi-Fi). Impressoras térmicas de recibo, em geral, não funcionam com iPhone pelo navegador.</p>
            <ul className="text-sm text-gray-700 list-disc pl-5 space-y-1">
              <li>Use o iPhone para acompanhar e aceitar pedidos normalmente.</li>
              <li>Para imprimir comandas, use um computador com Windows (veja a aba Computador) ou um celular Android barato só para a impressão.</li>
            </ul>
          </div>
        )}
      </section>

      {/* Problemas comuns */}
      <section className="space-y-2 print:hidden">
        <h2 className="font-bold text-gray-900">Deu algum problema?</h2>
        <Problem title="Toda vez abre a janela &quot;Imprimir&quot;">
          <p>O modo silencioso não está ligado. Confira o passo 4 do computador: o <code>--kiosk-printing</code> precisa estar no fim do campo Destino, e o navegador precisa ser aberto por esse atalho com todas as outras janelas fechadas.</p>
        </Problem>
        <Problem title="Saiu num papel A4 ou na impressora errada">
          <p>A térmica não é a impressora padrão. Defina como padrão (passo 1) e desligue &quot;Permitir que o Windows gerencie minha impressora padrão&quot;. Na janela de impressão, escolha a térmica em Destino.</p>
        </Problem>
        <Problem title="Saiu cortado, com letra muito pequena ou muito grande">
          <p>Confira se o papel escolhido aqui (58 ou 80 mm) é o mesmo da impressora e do driver. Na janela de impressão use <strong>Margens: Nenhuma</strong> e <strong>Escala: Padrão</strong>.</p>
        </Problem>
        <Problem title="Saiu com data, endereço do site ou número de página">
          <p>Desmarque <strong>Cabeçalhos e rodapés</strong> em Mais configurações na janela de impressão.</p>
        </Problem>
        <Problem title="Saiu em branco ou com quadradinhos">
          <p>Reinstale o driver da impressora pelo site do fabricante e imprima a página de teste do Windows. Se a página do Windows também sair em branco, o papel pode estar ao contrário (o lado térmico fica para fora do rolo; risque com a unha: o lado que escurece é o certo).</p>
        </Problem>
        <Problem title="O pedido chegou e não imprimiu">
          <ul className="list-disc pl-5 space-y-1">
            <li>A impressão automática está <strong>ativa</strong>? (botão acima)</li>
            <li>A tela <strong>Pedidos</strong> estava aberta nesse aparelho? Fechar o navegador ou a aba para a impressão.</li>
            <li>O computador entrou em suspensão ou perdeu a internet?</li>
            <li>A impressora está ligada, com papel e tampa fechada?</li>
          </ul>
          <p>Para reimprimir, abra o pedido e toque no ícone da impressora.</p>
        </Problem>
        <Problem title="Saíram duas vias do mesmo pedido">
          <p>Provavelmente há dois aparelhos com a tela Pedidos aberta (por exemplo o computador e o celular). Deixe só um nessa tela, ou use o celular em outra tela do painel.</p>
        </Problem>
        <Problem title="Os acentos não aparecem">
          <p>É de propósito: o recibo sai sem acento porque muitas térmicas não têm acentuação e imprimiriam símbolos estranhos.</p>
        </Problem>
      </section>

      {/* Recomendação */}
      <section className="card space-y-3 print:hidden">
        <h2 className="font-bold text-gray-900">Qual impressora comprar</h2>
        <p className="text-sm text-gray-700">Para não ter dor de cabeça: <strong>térmica de 80 mm, USB, com guilhotina (corte automático) e driver para Windows</strong>, ligada a um computador ou notebook fixo no balcão. Prefira USB a Wi-Fi ou Bluetooth no computador: é a conexão que menos falha.</p>
        <ul className="text-sm text-gray-700 list-disc pl-5 space-y-1">
          <li><strong>Custo-benefício:</strong> Elgin i9 (USB, com guilhotina). Fácil de achar, com driver e assistência no Brasil.</li>
          <li><strong>Para movimento alto:</strong> Epson TM-T20X ou Elgin/Bematech MP-4200 TH.</li>
          <li><strong>Econômica:</strong> genéricas &quot;80 mm USB com guilhotina&quot; (POS-80) de marketplace funcionam com o driver de Windows que vem junto; compre de vendedor bem avaliado.</li>
          <li><strong>Só com celular Android:</strong> mini térmica Bluetooth de 58 mm usando o RawBT (sem impressão automática).</li>
        </ul>
        <p className="text-xs text-gray-500">Papel: bobina térmica 80 × 40 mm (ou 57 × 30 mm para 58 mm).</p>
      </section>

      <p className="text-sm text-gray-500 print:hidden">
        <Link href="/painel/pedidos" className="inline-flex items-center gap-1.5 text-primary-700 hover:underline"><ShoppingCart size={14} /> Voltar para Pedidos</Link>
      </p>

      {/* Área impressa (só aparece no papel) */}
      <div className="print-area hidden print:block" style={receiptPrintStyle(paper).box}>
        <pre style={receiptPrintStyle(paper).text}>{receipt}</pre>
      </div>
    </div>
  )
}
