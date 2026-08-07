'use client'

import { useState } from 'react'
import {
  ChevronDown, LayoutDashboard, Package, ListOrdered, Tag, ShoppingCart,
  Store, DollarSign, Settings, Sparkles, Smartphone, Link2, ClipboardList,
} from 'lucide-react'

interface TutorialSection {
  icon: any
  title: string
  summary: string
  steps: string[]
}

const SECTIONS: TutorialSection[] = [
  {
    icon: Sparkles,
    title: 'Quiz inicial (onboarding)',
    summary: 'Logo depois de criar a conta, 3 perguntas rápidas deixam o painel pronto pro seu jeito de vender.',
    steps: [
      'Escolha se seus produtos têm preparo, já são prontos ou os dois — isso ajusta sozinho o painel de Pedidos.',
      'Escolha se você trabalha com entrega, retirada no local, ou as duas opções.',
      'Escolha a cor de marca do seu cardápio (pode trocar depois em Configurações).',
      'Pode pular e ajustar tudo depois — nada fica travado.',
    ],
  },
  {
    icon: LayoutDashboard,
    title: 'Dashboard',
    summary: 'Visão geral rápida: pedidos pendentes, faturamento do dia e produtos com estoque baixo.',
    steps: [
      'Acompanhe de longe se há pedido esperando confirmação.',
      'Veja o faturamento sem precisar abrir o Financeiro.',
    ],
  },
  {
    icon: Package,
    title: 'Produtos',
    summary: 'Cadastre os itens que aparecem no seu cardápio, com foto, preço e variações.',
    steps: [
      'Clique em "Novo Produto", preencha nome, descrição, preço e foto (upload direto do celular).',
      'Se o produto tem opções (tamanho, sabor, cor), adicione "Grupos de Variação" — marque como obrigatório quando fizer sentido.',
      'Controle de estoque é opcional por produto: ligue "Controlar estoque" se quiser baixa automática a cada venda.',
    ],
  },
  {
    icon: ListOrdered,
    title: 'Categorias',
    summary: 'Organiza o cardápio em seções (Lanches, Bebidas, Sobremesas...).',
    steps: [
      'Crie quantas categorias fizerem sentido e arraste para reordenar.',
      'Produto sem categoria continua aparecendo em "Todos".',
    ],
  },
  {
    icon: Tag,
    title: 'Cupons',
    summary: 'Descontos por código, percentual ou valor fixo, com validade e limite de uso.',
    steps: [
      'Crie um código (ex: BEMVINDO10), escolha o tipo de desconto e, se quiser, uma validade.',
      'O cliente aplica o cupom direto no carrinho do cardápio público.',
    ],
  },
  {
    icon: ShoppingCart,
    title: 'Pedidos',
    summary: 'Onde os pedidos do cardápio online e do balcão aparecem em tempo real, com som de aviso.',
    steps: [
      'Com "acompanhamento detalhado" ativo (Configurações), o pedido passa por Pendente → Confirmado → Em Preparo → Concluído.',
      'Com o acompanhamento desligado (produto pronto), é só Pendente → Concluído, num clique.',
      'Ao confirmar, informe o frete final e a forma de pagamento — isso baixa o estoque e lança no financeiro automaticamente.',
      'Use "Imprimir" para gerar a comanda do pedido.',
      'O campo de busca filtra por nome ou telefone do cliente.',
    ],
  },
  {
    icon: Store,
    title: 'Balcão / PDV',
    summary: 'Para vendas presenciais, sem passar pelo cardápio público.',
    steps: [
      'Busque o produto, monte a venda e finalize com a forma de pagamento.',
      'Baixa o estoque automaticamente, igual a um pedido online confirmado.',
    ],
  },
  {
    icon: DollarSign,
    title: 'Financeiro',
    summary: 'Entradas e saídas, com filtro por período e exportação em CSV.',
    steps: [
      'Pedidos confirmados entram automaticamente como receita.',
      'Lance manualmente despesas ou outras receitas quando precisar.',
    ],
  },
  {
    icon: Settings,
    title: 'Configurações',
    summary: 'Nome da loja, WhatsApp, cor de marca, horários e o tipo de negócio.',
    steps: [
      'A "Cor do tema" muda a cor dos botões e destaques no seu cardápio público — não afeta o painel.',
      '"Tipo de negócio" liga/desliga o acompanhamento detalhado de pedido e decide se você aparece como entrega, retirada ou ambos.',
      'O horário de funcionamento fecha o cardápio pra pedidos automaticamente fora do expediente, mesmo se você esquecer de marcar como fechado.',
    ],
  },
  {
    icon: Link2,
    title: 'Pedido via WhatsApp',
    summary: 'Como o cliente compra: ele monta o carrinho, escolhe entrega/retirada e envia pro seu WhatsApp.',
    steps: [
      'A mensagem chega com todos os itens, variações, endereço (se for entrega) e o link de acompanhamento do pedido.',
      'Você confirma o pedido no painel — o cliente acompanha o status pelo link, sem precisar te chamar de novo.',
    ],
  },
  {
    icon: ClipboardList,
    title: '"Meus Pedidos" do cliente',
    summary: 'O cliente pode ver o histórico de pedidos feitos na sua loja, sem precisar criar conta.',
    steps: [
      'No cardápio público, o cliente clica no ícone de lista no topo e informa o telefone usado nos pedidos.',
      'Aparecem os últimos pedidos feitos com aquele telefone, com status e link para acompanhar cada um.',
    ],
  },
  {
    icon: Smartphone,
    title: 'App no celular (PWA)',
    summary: 'Seu cardápio pode ser "instalado" na tela inicial do celular do cliente, como um app.',
    steps: [
      'No navegador do celular, o cliente vê a opção de "Adicionar à tela inicial".',
      'Abre em tela cheia, sem barra de navegador, como um aplicativo de verdade.',
    ],
  },
]

export default function TutorialPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="page-title">Tutorial</h1>
        <p className="text-gray-600 mt-1">Como cada funcionalidade do painel funciona, passo a passo.</p>
      </div>

      <div className="space-y-3">
        {SECTIONS.map((section, index) => {
          const isOpen = openIndex === index
          return (
            <div key={section.title} className="card p-0 overflow-hidden">
              <button
                onClick={() => setOpenIndex(isOpen ? null : index)}
                className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="w-10 h-10 bg-primary-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <section.icon size={18} className="text-primary-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900">{section.title}</p>
                  <p className="text-sm text-gray-500 truncate">{section.summary}</p>
                </div>
                <ChevronDown size={18} className={`text-gray-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                <div className="px-4 pb-4 pl-[4.25rem]">
                  <ul className="space-y-2">
                    {section.steps.map((step, i) => (
                      <li key={i} className="text-sm text-gray-600 flex gap-2">
                        <span className="text-primary-500 flex-shrink-0">•</span>
                        {step}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
