'use client'

// Guia "Pratos em 3D": como escanear um prato com o celular, exportar o
// arquivo, enviar no Freguês e testar a realidade aumentada na mesa.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { AlertTriangle, Box, CheckCircle2, ExternalLink, Loader2, Smartphone } from 'lucide-react'

type Item = { id: string; name: string; model_3d_url: string | null }

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex-shrink-0 w-7 h-7 rounded-full bg-primary-600 text-white text-sm font-bold flex items-center justify-center">{n}</span>
      <div className="min-w-0 flex-1">
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

const APPS = [
  { name: 'Polycam', url: 'https://poly.cam', where: 'iPhone e Android', how: 'Modo "Foto" (ou "Objeto" no iPhone com LiDAR). Exporta GLB e USDZ.' },
  { name: 'RealityScan', url: 'https://www.realityscan.com', where: 'iPhone e Android', how: 'Gratuito, guia as fotos na tela. Exporte em GLB.' },
  { name: 'Luma AI', url: 'https://lumalabs.ai', where: 'iPhone e Android', how: 'Grava um vídeo girando em volta do prato. Exporte como malha (GLB).' },
]

export default function Pratos3DPage() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<Item[]>([])
  const [pending, setPending] = useState(false)

  useEffect(() => {
    ;(async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return setLoading(false)
      const { data: est } = await supabase.from('establishments').select('id').eq('owner_id', user.id).single()
      if (est) {
        const { data, error } = await supabase.from('products').select('id, name, model_3d_url').eq('establishment_id', est.id).not('model_3d_url', 'is', null).order('name')
        if (error && /model_3d/.test(error.message)) setPending(true)
        setItems((data as Item[]) || [])
      }
      setLoading(false)
    })()
  }, [])

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="page-title">Pratos em 3D</h1>
        <p className="text-gray-600 mt-1">O cliente gira o prato no cardápio e toca em <strong>Ver na minha mesa</strong>: a câmera do celular coloca o prato em tamanho real sobre a mesa dele. Veja como fazer o 3D de um prato com o seu celular.</p>
      </div>

      <section className="card space-y-3">
        <h2 className="font-bold text-gray-900 flex items-center gap-2"><Box size={18} className="text-primary-600" /> Seus pratos em 3D</h2>
        {loading ? (
          <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> Carregando…</p>
        ) : pending ? (
          <p className="text-sm text-amber-800 bg-amber-50 rounded-lg p-3">O recurso de 3D ainda não foi ativado no banco da plataforma (migration 061). Assim que for, os campos aparecem no cadastro do produto.</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-600">Nenhum prato com 3D ainda. Comece pelo seu prato mais vendido: siga os passos abaixo e envie o arquivo em <Link href="/painel/produtos" className="text-primary-700 underline">Produtos</Link> → editar o prato → <strong>Prato em 3D</strong>.</p>
        ) : (
          <ul className="text-sm space-y-1.5">
            {items.map((p) => (
              <li key={p.id} className="flex items-center gap-2"><CheckCircle2 size={16} className="text-green-600" /> {p.name}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="card space-y-5">
        <h2 className="font-bold text-gray-900">Passo a passo</h2>
        <ol className="space-y-5">
          <Step n={1} title="Escolha o prato certo">
            <p>Comece pelos pratos fixos e mais vendidos. Ficam ótimos: hambúrguer, pizza, sobremesas, pratos executivos, porções e marmitas montadas.</p>
            <p>Evite no começo: sopas e caldos, coisas muito brilhantes (calda, gelatina), copos e bebidas transparentes.</p>
          </Step>
          <Step n={2} title="Monte o cenário">
            <ul className="list-disc pl-5 space-y-1">
              <li>Luz clara e uniforme: perto de uma janela, sem sol batendo direto e sem flash.</li>
              <li>Prato numa mesa ou banquinho onde você consiga andar em volta.</li>
              <li>Fundo sem brilho e sem nada se mexendo. Monte o prato bonito, como sai para o cliente.</li>
            </ul>
          </Step>
          <Step n={3} title="Escaneie com o celular">
            <p>Instale um destes apps de escaneamento 3D:</p>
            <div className="grid sm:grid-cols-3 gap-2">
              {APPS.map((a) => (
                <a key={a.name} href={a.url} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-gray-200 p-3 hover:border-primary-300 hover:bg-primary-50/40">
                  <p className="font-semibold text-gray-900 flex items-center gap-1">{a.name} <ExternalLink size={12} className="text-gray-400" /></p>
                  <p className="text-xs text-gray-500">{a.where}</p>
                  <p className="text-xs text-gray-700 mt-1">{a.how}</p>
                </a>
              ))}
            </div>
            <p>Dê <strong>três voltas</strong> em volta do prato: uma de cima, uma na altura do meio e uma mais baixa, com 60 a 100 fotos no total. Ande devagar, mantenha o prato sempre no centro e não use zoom.</p>
          </Step>
          <Step n={4} title="Recorte e confira o tamanho">
            <p>No app, recorte a mesa em volta e deixe só o prato. Confira a <strong>escala</strong>: o prato precisa ter o tamanho real (um prato raso tem uns 26 cm). Celulares com LiDAR já medem sozinhos; no modo foto, use a opção de medir ou ajustar escala do app.</p>
            <p className="text-amber-800 bg-amber-50 rounded-lg px-3 py-2">Na mesa do cliente o prato aparece exatamente no tamanho do arquivo. Escala errada deixa o prato gigante ou minúsculo.</p>
          </Step>
          <Step n={5} title="Exporte em GLB">
            <p>Exporte no formato <strong>GLB</strong>, com textura <strong>2K</strong> e malha média ou otimizada. O ideal é ficar com até 8 MB (o limite é 15 MB).</p>
            <p>Se o app também exportar <strong>USDZ</strong>, guarde: é o formato do iPhone e melhora a qualidade lá. Sem ele, o Freguês gera a versão do iPhone na hora.</p>
          </Step>
          <Step n={6} title="Envie no Freguês">
            <p>Em <Link href="/painel/produtos" className="text-primary-700 underline">Produtos</Link>, edite o prato e, em <strong>Prato em 3D e realidade aumentada</strong>, toque em <strong>Enviar arquivo 3D (.glb)</strong>. Use <strong>Ver prévia</strong> para girar o prato antes de divulgar.</p>
          </Step>
          <Step n={7} title="Teste na sua mesa">
            <p>Abra o seu cardápio no celular, toque no prato e em <strong>Ver em 3D e na sua mesa</strong>, depois em <strong>Ver na minha mesa</strong>. Aponte a câmera para a mesa, mova o celular devagar até ele achar a superfície, e o prato aparece.</p>
            <p>No Android, na primeira vez o celular pode pedir para instalar ou atualizar o <strong>Google Play Services para RA</strong>: é gratuito e oficial do Google. No iPhone abre direto.</p>
          </Step>
        </ol>
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold text-gray-900 flex items-center gap-2"><Smartphone size={18} /> Onde funciona</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead><tr className="text-left text-gray-500 text-xs uppercase tracking-wide"><th className="py-2 pr-3">Aparelho</th><th className="py-2 pr-3">Prato em 3D</th><th className="py-2">Ver na mesa</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              <tr><td className="py-2 pr-3">Android com suporte a RA (ARCore), a maioria dos intermediários e topo de linha</td><td className="py-2 pr-3 text-green-700 font-semibold">Sim</td><td className="py-2 text-green-700 font-semibold">Sim</td></tr>
              <tr><td className="py-2 pr-3">iPhone com iOS 12 ou mais novo</td><td className="py-2 pr-3 text-green-700 font-semibold">Sim</td><td className="py-2 text-green-700 font-semibold">Sim</td></tr>
              <tr><td className="py-2 pr-3">Computador</td><td className="py-2 pr-3 text-green-700 font-semibold">Sim</td><td className="py-2 text-gray-500">Mostra um QR code para abrir no celular</td></tr>
              <tr><td className="py-2 pr-3">Celulares simples ou antigos</td><td className="py-2 pr-3 text-green-700 font-semibold">Sim</td><td className="py-2 text-gray-500">Não (o botão não aparece)</td></tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-500">Lista oficial de celulares Android com RA: <a href="https://developers.google.com/ar/devices" target="_blank" rel="noopener noreferrer" className="text-primary-700 underline">developers.google.com/ar/devices</a>.</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-bold text-gray-900">Deu algum problema?</h2>
        <Problem title="O prato aparece gigante ou minúsculo na mesa">
          <p>A escala do arquivo está errada. Volte ao app de escaneamento, ajuste a escala para o tamanho real do prato (uns 26 cm de diâmetro) e exporte de novo.</p>
        </Problem>
        <Problem title="O prato ficou com buracos ou partes derretidas">
          <p>Faltaram fotos de algum ângulo ou a luz mudou durante a captura. Refaça com as três voltas completas e luz uniforme. Molho brilhante costuma sair assim: prefira pratos mais secos.</p>
        </Problem>
        <Problem title="O botão Ver na minha mesa não aparece">
          <ul className="list-disc pl-5 space-y-1">
            <li>No computador ele não aparece: use o QR code para abrir no celular.</li>
            <li>O celular pode não ter suporte a RA (veja a lista acima).</li>
            <li>No Android, instale ou atualize o Google Play Services para RA pela Play Store.</li>
          </ul>
        </Problem>
        <Problem title="Demora para abrir o 3D">
          <p>O arquivo está pesado. Exporte com textura 2K e malha otimizada, para ficar abaixo de 8 MB. O 3D só é baixado quando o cliente toca no botão, então o cardápio continua rápido.</p>
        </Problem>
        <Problem title="No iPhone as cores ficaram diferentes">
          <p>Envie também o arquivo .usdz exportado pelo app de escaneamento, no campo <strong>.usdz do iPhone</strong> do produto.</p>
        </Problem>
        <Problem title="Não quero escanear eu mesmo">
          <p>Dá para contratar um fotógrafo ou estúdio de 3D para pratos: peça o arquivo em <strong>GLB</strong> (e USDZ), em tamanho real e com até 8 MB. Serviços de IA que transformam foto em 3D também existem, mas com comida ainda erram bastante: confira a prévia antes de publicar.</p>
        </Problem>
      </section>

      <section className="card flex gap-3 items-start">
        <AlertTriangle size={18} className="text-amber-500 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-gray-700"><strong>Dica de divulgação:</strong> grave a tela do celular com o prato aparecendo na mesa e poste nos stories e no status do WhatsApp com o link do cardápio. É o tipo de vídeo que as pessoas compartilham.</p>
      </section>
    </div>
  )
}
