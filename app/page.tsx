'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  Menu, X, Smartphone, ShoppingCart, LineChart, Package, Store, Pizza, ChevronRight, ChevronDown, ChevronLeft,
  CheckCircle, Palette, Bike, ClipboardList, Sparkles, Gift, Tag, Zap, Instagram, MessageCircle, Wallet, QrCode,
  PlayCircle, ArrowRight, MoreVertical, Sandwich, Cake, UtensilsCrossed, Truck, Send,
} from 'lucide-react'
import { Logo } from '@/components/Logo'

const TESTIMONIALS = [
  {
    title: 'Facilitou muito o atendimento aos meus clientes',
    quote: 'Antes eu precisava ficar mandando foto do cardápio toda hora no WhatsApp. Agora é só mandar o link e o cliente consegue ver tudo pelo celular. Ficou muito mais organizado.',
    name: 'Mariana',
    role: 'proprietária de lanchonete',
  },
  {
    title: 'Ficou muito mais profissional',
    quote: 'Eu queria uma solução simples para deixar meu cardápio mais bonito e profissional, sem precisar contratar alguém para fazer um site. Consegui colocar tudo no ar de forma muito mais prática.',
    name: 'Rafael',
    role: 'dono de hamburgueria',
  },
  {
    title: 'Meus clientes conseguem acessar de qualquer lugar',
    quote: 'Uma das coisas que mais gostei foi poder atualizar os produtos sem precisar refazer o cardápio inteiro. Quando mudo preço ou adiciono alguma coisa, fica muito mais fácil manter tudo atualizado.',
    name: 'Juliana',
    role: 'proprietária de restaurante',
  },
  {
    title: 'Muito mais prático que o cardápio tradicional',
    quote: 'Eu estava procurando uma opção simples para parar de depender daqueles cardápios impressos. O digital ficou muito mais prático para mim e para os clientes.',
    name: 'Lucas',
    role: 'proprietário de pizzaria',
  },
  {
    title: 'Consegui deixar meu negócio com outra aparência',
    quote: 'O cardápio digital deixou minha apresentação muito mais organizada. O cliente consegue abrir pelo celular, visualizar os produtos e encontrar o que quer de forma rápida.',
    name: 'Camila',
    role: 'proprietária de cafeteria',
  },
  {
    title: 'A implantação foi muito simples',
    quote: 'Eu não entendo muito de tecnologia e justamente por isso queria algo fácil de usar. Consegui configurar meu cardápio sem complicação e já comecei a divulgar o link para meus clientes.',
    name: 'André',
    role: 'proprietário de delivery',
  },
  {
    title: 'Agora não preciso ficar enviando o cardápio toda vez',
    quote: 'Antes, quando alguém perguntava pelos produtos, eu precisava procurar a imagem ou PDF e mandar no WhatsApp. Agora simplesmente envio o link do meu cardápio.',
    name: 'Fernanda',
    role: 'empreendedora',
  },
  {
    title: 'Era exatamente o que eu precisava',
    quote: 'Eu queria um cardápio digital simples, bonito e que funcionasse bem no celular. A solução resolveu justamente essa necessidade sem deixar o processo complicado.',
    name: 'Thiago',
    role: 'proprietário de restaurante',
  },
]

const FAQ_ITEMS = [
  {
    question: 'Tem taxa ou comissão por pedido?',
    answer: 'Não. Você paga sua assinatura e fica com 100% do valor das suas vendas — sem comissão por pedido, nem no Pix automático.',
  },
  {
    question: 'Preciso saber programar ou mexer com tecnologia?',
    answer: 'Não. Você monta o cardápio pelo painel — fotos, preços e categorias — em poucos minutos, sem instalar nada.',
  },
  {
    question: 'Funciona só para comida, ou serve pra loja de roupa, papelaria, chocolates...?',
    answer: 'Serve para qualquer tipo de produto. No cadastro você responde um quiz rápido (com preparo, produto pronto ou os dois) e o painel já nasce ajustado ao seu negócio.',
  },
  {
    question: 'Como o cliente faz o pedido?',
    answer: 'Ele acessa o link do seu cardápio e monta o pedido. O CatalogAI já abre o WhatsApp dele com a mensagem pronta — ele só confirma o envio por lá. Ou paga na hora com Pix automático, se você tiver essa opção ativada.',
  },
  {
    question: 'O pedido chega no meu WhatsApp de forma automática?',
    answer: 'A mensagem é montada automaticamente e o WhatsApp já abre pronto pra enviar — mas quem confirma o envio é o cliente, com um toque, dentro do próprio WhatsApp dele. Isso vale pra qualquer link de WhatsApp, não só o nosso: só é possível enviar mensagem sem essa confirmação usando a API oficial paga da Meta, que não é o que fazemos aqui.',
  },
  {
    question: 'Dá pra usar com iFood ao mesmo tempo?',
    answer: 'Hoje o CatalogAI é o seu canal de vendas próprio (site + WhatsApp), sem comissão nenhuma. Você pode continuar vendendo pelo iFood em paralelo — só não fica centralizado no mesmo painel.',
  },
  {
    question: 'Preciso de cartão de crédito para testar?',
    answer: 'Não. Você cria a conta e já usa os 7 dias grátis com tudo liberado, sem precisar cadastrar cartão.',
  },
  {
    question: 'Posso cancelar quando quiser?',
    answer: 'Sim. Sem contrato de fidelidade — o cancelamento é feito direto pelo painel, quando você quiser.',
  },
]

const CATEGORIES = [
  { icon: <Pizza className="w-7 h-7" />, title: 'Pizzarias' },
  { icon: <Sandwich className="w-7 h-7" />, title: 'Lanchonetes' },
  { icon: <Cake className="w-7 h-7" />, title: 'Confeitarias' },
  { icon: <UtensilsCrossed className="w-7 h-7" />, title: 'Restaurantes' },
  { icon: <Truck className="w-7 h-7" />, title: 'Delivery' },
  { icon: <Store className="w-7 h-7" />, title: 'Pequenos negócios' },
]

// Moldura de celular reutilizável — envolve prints reais do produto (não
// ilustrações) capturados do cardápio de demonstração real
// (/loja/pizzaria-demo-catalogai), pra mostrar a tela de verdade em vez de
// um mockup genérico.
function PhoneMockup({ src, alt, priority = false, size = 'md' }: { src: string; alt: string; priority?: boolean; size?: 'sm' | 'md' }) {
  const width = size === 'sm' ? 'w-[170px] sm:w-[190px]' : 'w-[240px] sm:w-[280px]'
  const border = size === 'sm' ? 'border-[7px]' : 'border-[10px]'
  return (
    <div className={`relative ${width} rounded-[2.2rem] ${border} border-gray-900 shadow-2xl overflow-hidden bg-gray-900 flex-shrink-0`}>
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-4 bg-gray-900 rounded-b-2xl z-10" />
      <Image src={src} alt={alt} width={390} height={844} className="w-full h-auto" priority={priority} />
    </div>
  )
}

// Mockup ilustrativo do WhatsApp — não é um print real (o WhatsApp é um app
// de terceiros, não dá pra capturar isso do nosso produto), mas o texto
// segue exatamente o mesmo formato que a mensagem real gerada pelo
// CatalogAI usa (ver handleSendOrder em PublicMenuClient.tsx): nome,
// telefone, tipo de entrega, endereço, itens, taxa e total.
function WhatsAppMockup({ compact = false }: { compact?: boolean }) {
  const textSize = compact ? 'text-[9px] leading-tight' : 'text-[11px] leading-snug'
  return (
    <div className="bg-[#e5ddd5] h-full flex flex-col">
      <div className="bg-[#075e54] text-white px-3 py-2.5 flex items-center gap-2 flex-shrink-0">
        <ChevronLeft className="w-4 h-4 flex-shrink-0" />
        <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
          <Store className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-xs truncate">Meu Restaurante</p>
          <p className="text-[9px] text-white/70">online</p>
        </div>
        <MoreVertical className="w-4 h-4 flex-shrink-0" />
      </div>
      <div className="flex-1 p-3 overflow-hidden" style={{ backgroundImage: 'radial-gradient(#00000008 1px, transparent 1px)', backgroundSize: '10px 10px' }}>
        <div className={`bg-white rounded-lg rounded-tl-none shadow-sm px-2.5 py-2 max-w-[92%] text-gray-800 ${textSize}`}>
          <p>👤 <strong>Cliente:</strong> Ana Souza</p>
          <p>📱 <strong>Telefone:</strong> (11) 98888-7777</p>
          <p>🛵 <strong>Entrega</strong></p>
          <p>📍 Rua das Flores, 123 - Centro</p>
          <p className="mt-1.5">📋 <strong>Itens do Pedido:</strong></p>
          <p>1. Pizza Margherita</p>
          <p className="pl-2">Qtd: 1 x R$ 39,90</p>
          <p>2. Refrigerante Lata</p>
          <p className="pl-2">Qtd: 2 x R$ 6,00</p>
          <p className="mt-1.5">🛵 <strong>Taxa de entrega:</strong> R$ 5,00</p>
          <p>💰 <strong>Total: R$ 56,90</strong></p>
          <p className="text-right text-[9px] text-gray-400 mt-1">10:24 ✓✓</p>
        </div>
      </div>
    </div>
  )
}

export default function LandingPage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0)

  useEffect(() => {
    setIsVisible(true)
  }, [])

  const navLinks = [
    { href: '#funcionalidades', label: 'Recursos' },
    { href: '#veja-como-funciona', label: 'Como funciona' },
    { href: '#planos', label: 'Planos' },
    { href: '#depoimentos', label: 'Depoimentos' },
  ]

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <Logo size={32} className="text-primary-500" />
              <span className="font-bold text-xl text-gray-900">Catalog<span className="text-primary-500">AI</span></span>
            </div>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-8">
              {navLinks.map((link) => (
                <a key={link.href} href={link.href} className="text-gray-600 hover:text-gray-900 transition-colors">
                  {link.label}
                </a>
              ))}
              <Link href="/login" className="text-gray-600 hover:text-gray-900 transition-colors">Entrar</Link>
              <Link href="/cadastro" className="btn-primary">
                Começar grátis
                <ChevronRight size={18} />
              </Link>
            </nav>

            {/* Mobile Menu Button */}
            <button
              className="md:hidden p-2 rounded-lg hover:bg-gray-100"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label={isMenuOpen ? 'Fechar menu' : 'Abrir menu'}
            >
              {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden bg-white border-t border-gray-100 animate-fade-in">
            <div className="px-4 py-4 space-y-3">
              {navLinks.map((link) => (
                <a key={link.href} href={link.href} className="block py-2 text-gray-600 hover:text-gray-900" onClick={() => setIsMenuOpen(false)}>
                  {link.label}
                </a>
              ))}
              <a href="#faq" className="block py-2 text-gray-600 hover:text-gray-900" onClick={() => setIsMenuOpen(false)}>FAQ</a>
              <Link href="/login" className="block py-2 text-gray-600 hover:text-gray-900" onClick={() => setIsMenuOpen(false)}>Entrar</Link>
              <Link href="/cadastro" className="btn-primary w-full text-center" onClick={() => setIsMenuOpen(false)}>
                Começar grátis
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-50 via-white to-green-50" />
        <div className="absolute top-20 right-20 w-72 h-72 bg-primary-200/30 rounded-full blur-3xl" />
        <div className="absolute bottom-20 left-20 w-72 h-72 bg-green-200/30 rounded-full blur-3xl" />

        <div className={`relative max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center gap-2 bg-primary-50 text-primary-700 px-4 py-2 rounded-full text-sm font-medium mb-6">
              <CheckCircle size={16} />
              <span>7 dias grátis • Sem taxa por pedido</span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight mb-6">
              Seu <span className="text-primary-500">cardápio digital</span>.
              <br />Seus pedidos.
              <br />No seu <span className="text-green-500">WhatsApp</span>.
            </h1>
            <p className="text-xl text-gray-600 mb-8 max-w-xl mx-auto lg:mx-0">
              Crie seu cardápio online profissional, receba pedidos automaticamente pelo WhatsApp
              e facilite a compra dos seus clientes.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start mb-8">
              <Link href="/cadastro" className="btn-primary text-lg px-8 py-4">
                Começar 7 dias grátis
                <ChevronRight size={20} />
              </Link>
              <a href="#veja-como-funciona" className="btn-secondary text-lg px-8 py-4">
                <PlayCircle size={20} />
                Ver como funciona
              </a>
            </div>
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-2 text-sm text-gray-500">
              <span className="flex items-center gap-1.5"><CheckCircle size={16} className="text-primary-500" /> Sem cartão de crédito</span>
              <span className="flex items-center gap-1.5"><CheckCircle size={16} className="text-primary-500" /> Configuração rápida</span>
              <span className="flex items-center gap-1.5"><CheckCircle size={16} className="text-primary-500" /> Funciona no celular</span>
            </div>
          </div>

          <div className="relative flex justify-center lg:justify-end items-center h-[420px] sm:h-[480px]">
            <div className="absolute left-1/2 -translate-x-[85%] sm:-translate-x-[90%] rotate-[-4deg]">
              <PhoneMockup src="/screenshots/cardapio-inicio.png" alt="Cardápio digital real do CatalogAI, aberto no celular" priority />
            </div>
            <div className="absolute left-1/2 translate-x-[-8%] sm:translate-x-[-5%] rotate-[4deg] z-10">
              <div className="relative w-[190px] sm:w-[220px] h-[400px] sm:h-[460px] rounded-[2.2rem] border-[8px] border-gray-900 shadow-2xl overflow-hidden bg-gray-900">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-3.5 bg-gray-900 rounded-b-xl z-10" />
                <WhatsAppMockup />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Resumo rápido (4 destaques) */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-10">
            Tudo que você precisa para vender pelo WhatsApp
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: <ClipboardList className="w-5 h-5" />, title: 'Cardápio profissional', desc: 'Mostre seus produtos de forma bonita e organizada.' },
              { icon: <MessageCircle className="w-5 h-5" />, title: 'Pedidos pelo WhatsApp', desc: 'Seu cliente monta o pedido e envia diretamente para seu WhatsApp.' },
              { icon: <Zap className="w-5 h-5" />, title: 'Pedido rápido', desc: 'Menos mensagens de ida e volta. O pedido chega organizado.' },
              { icon: <LineChart className="w-5 h-5" />, title: 'Gestão simples', desc: 'Tenha controle dos produtos, categorias e pedidos em um só lugar.' },
            ].map((item, index) => (
              <div key={index} className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm animate-fade-in" style={{ animationDelay: `${index * 80}ms` }}>
                <div className="w-10 h-10 rounded-lg bg-primary-500 text-white flex items-center justify-center mb-4">
                  {item.icon}
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">{item.title}</h3>
                <p className="text-sm text-gray-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comece a vender em poucos minutos (3 passos) */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Comece a vender em poucos minutos
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              É simples, rápido e sem complicação. Em 3 passos você já está recebendo pedidos pelo WhatsApp.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-4 items-start">
            {[
              { step: '01', icon: <Sparkles className="w-6 h-6" />, title: 'Crie sua conta', description: 'Cadastre seu negócio gratuitamente — 7 dias grátis, tudo liberado, sem cartão.' },
              { step: '02', icon: <ShoppingCart className="w-6 h-6" />, title: 'Monte seu cardápio', description: 'Adicione produtos, fotos, preços e categorias pelo painel intuitivo.' },
              { step: '03', icon: <MessageCircle className="w-6 h-6" />, title: 'Compartilhe seu link', description: 'Envie seu cardápio para seus clientes e receba pedidos pelo WhatsApp.' },
            ].map((item, index, arr) => (
              <div key={index} className="flex items-center gap-4">
                <div className="text-center animate-fade-in flex-1" style={{ animationDelay: `${index * 150}ms` }}>
                  <div className="relative w-16 h-16 bg-primary-500 rounded-full flex items-center justify-center mx-auto mb-5 text-white">
                    {item.icon}
                    <span className="absolute -top-1.5 -right-1.5 bg-gray-900 text-white text-[10px] font-bold w-6 h-6 rounded-full flex items-center justify-center">{item.step}</span>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{item.title}</h3>
                  <p className="text-gray-600 text-sm max-w-[220px] mx-auto">{item.description}</p>
                </div>
                {index < arr.length - 1 && (
                  <ArrowRight className="hidden md:block w-6 h-6 text-gray-300 flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Veja como é fácil receber pedidos (5 passos visuais, com prints reais) */}
      <section id="veja-como-funciona" className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-50 overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Veja como é fácil receber pedidos
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              As 4 primeiras telas são prints reais do cardápio de demonstração rodando no CatalogAI — não são ilustrações.
            </p>
          </div>

          <div className="flex flex-wrap justify-center items-start gap-x-3 gap-y-10">
            {[
              { kind: 'shot' as const, src: '/screenshots/cardapio-inicio.png', label: '1. Cliente acessa o cardápio' },
              { kind: 'shot' as const, src: '/screenshots/escolhe-produtos.png', label: '2. Escolhe os produtos' },
              { kind: 'shot' as const, src: '/screenshots/carrinho.png', label: '3. Adiciona ao carrinho' },
              { kind: 'shot' as const, src: '/screenshots/confirmar-pedido.png', label: '4. Confirma o pedido' },
              { kind: 'whatsapp' as const, label: '5. Pedido chega no WhatsApp' },
            ].map((step, index, arr) => (
              <div key={index} className="flex items-center gap-3">
                <div className="text-center">
                  {step.kind === 'shot' ? (
                    <PhoneMockup src={step.src} alt={step.label} size="sm" />
                  ) : (
                    <div className="relative w-[170px] sm:w-[190px] h-[368px] sm:h-[412px] rounded-[2.2rem] border-[7px] border-gray-900 shadow-2xl overflow-hidden bg-gray-900">
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-3.5 bg-gray-900 rounded-b-xl z-10" />
                      <WhatsAppMockup compact />
                    </div>
                  )}
                  <p className="mt-3 text-sm font-medium text-gray-700 max-w-[190px] mx-auto">{step.label}</p>
                </div>
                {index < arr.length - 1 && (
                  <ArrowRight className="hidden lg:block w-5 h-5 text-gray-300 flex-shrink-0" />
                )}
              </div>
            ))}
          </div>

          <p className="text-center text-sm text-gray-400 mt-2">
            A tela 5 é uma ilustração de como a mensagem chega no WhatsApp — o texto segue o mesmo formato que o CatalogAI realmente gera.
          </p>

          <div className="text-center mt-10">
            <a
              href="/loja/pizzaria-demo-catalogai"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary text-lg px-8 py-4 inline-flex"
            >
              Abrir cardápio de demonstração
              <ChevronRight size={20} />
            </a>
          </div>
        </div>
      </section>

      {/* Funcionalidades Section */}
      <section id="funcionalidades" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Tudo que você precisa em um só lugar
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Ferramentas completas para gerenciar seu cardápio, pedidos e vendas.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: <Smartphone className="w-6 h-6" />,
                title: 'Cardápio Digital',
                description: 'Cardápio online profissional com fotos, descrições, preços e variações. Atualize em tempo real.',
                color: 'bg-green-100 text-green-600'
              },
              {
                icon: <ShoppingCart className="w-6 h-6" />,
                title: 'Pedidos via WhatsApp',
                description: 'Cliente monta o pedido e o CatalogAI já abre o WhatsApp com a mensagem pronta e o link de acompanhamento — ele só confirma o envio, no WhatsApp dele.',
                color: 'bg-blue-100 text-blue-600'
              },
              {
                icon: <Bike className="w-6 h-6" />,
                title: 'Entrega ou retirada',
                description: 'O cliente escolhe como quer receber, com endereço estruturado quando for entrega. Você decide quais opções oferece.',
                color: 'bg-cyan-100 text-cyan-600'
              },
              {
                icon: <Sparkles className="w-6 h-6" />,
                title: 'Painel sob medida',
                description: 'Um quiz rápido no cadastro ajusta o painel pro seu negócio: com preparo, produto pronto ou os dois.',
                color: 'bg-amber-100 text-amber-600'
              },
              {
                icon: <Package className="w-6 h-6" />,
                title: 'Controle de Estoque',
                description: 'Gerencie estoque em tempo real. Baixa automática ao confirmar pedidos.',
                color: 'bg-purple-100 text-purple-600'
              },
              {
                icon: <LineChart className="w-6 h-6" />,
                title: 'Financeiro Automático',
                description: 'Faturamento de hoje, dos últimos 7 dias, do mês ou de um período personalizado — com gráficos e produtos mais vendidos.',
                color: 'bg-orange-100 text-orange-600'
              },
              {
                icon: <Store className="w-6 h-6" />,
                title: 'Balcão / PDV',
                description: 'Venda presencial rápida com busca de produtos e baixa de estoque automática.',
                color: 'bg-pink-100 text-pink-600'
              },
              {
                icon: <Palette className="w-6 h-6" />,
                title: 'Cor de marca própria',
                description: 'Escolha a cor do seu cardápio — botões e destaques seguem a identidade da sua loja.',
                color: 'bg-rose-100 text-rose-600'
              },
              {
                icon: <ClipboardList className="w-6 h-6" />,
                title: 'Histórico sem cadastro',
                description: 'Seu cliente consulta os próprios pedidos anteriores só com o telefone, sem precisar criar conta.',
                color: 'bg-indigo-100 text-indigo-600'
              },
              {
                icon: <Smartphone className="w-6 h-6" />,
                title: 'PWA Instalável',
                description: 'Seu cardápio funciona como app no celular do cliente. Instalação em um clique.',
                color: 'bg-teal-100 text-teal-600'
              },
              {
                icon: <Gift className="w-6 h-6" />,
                title: 'Programa de Fidelidade',
                description: 'Cliente ganha pontos a cada compra e troca por desconto ou frete grátis. Você define a regra.',
                color: 'bg-lime-100 text-lime-600'
              },
              {
                icon: <Tag className="w-6 h-6" />,
                title: 'Cupons de Desconto',
                description: 'Crie cupons por código, com validade e limite de uso por cliente — sem depender de planilha.',
                color: 'bg-fuchsia-100 text-fuchsia-600'
              },
              {
                icon: <Zap className="w-6 h-6" />,
                title: 'Pix Automático',
                description: 'Cliente paga na hora e o pedido é confirmado sozinho — sem precisar checar comprovante.',
                color: 'bg-emerald-100 text-emerald-600'
              },
              {
                icon: <Instagram className="w-6 h-6" />,
                title: 'Perfil Completo da Loja',
                description: 'Endereço, horário de funcionamento, WhatsApp e Instagram, tudo num só lugar pro cliente ver.',
                color: 'bg-violet-100 text-violet-600'
              },
              {
                icon: <QrCode className="w-6 h-6" />,
                title: 'Cardápio de Mesa com QR Code',
                description: 'Cada mesa tem um QR Code. O cliente escaneia, pede pelo celular e tudo fica na comanda até você fechar a conta pelo painel.',
                color: 'bg-sky-100 text-sky-600'
              }
            ].map((feature, index) => (
              <div
                key={index}
                className="card-hover animate-fade-in"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className={`w-12 h-12 rounded-lg ${feature.color} flex items-center justify-center mb-4`}>
                  {feature.icon}
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feito para quem vende todos os dias */}
      <section id="para-quem" className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Feito para quem vende todos os dias
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Serve para qualquer tipo de negócio — de comida a produto pronto. No cadastro, um quiz ajusta o painel pro seu jeito de vender.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {CATEGORIES.map((cat, index) => (
              <div
                key={index}
                className="bg-white rounded-xl p-6 text-center shadow-sm border border-gray-100 hover:shadow-md hover:-translate-y-0.5 transition-all animate-fade-in"
                style={{ animationDelay: `${index * 80}ms` }}
              >
                <div className="w-14 h-14 bg-primary-50 rounded-full flex items-center justify-center mx-auto mb-4 text-primary-500">
                  {cat.icon}
                </div>
                <h3 className="font-semibold text-gray-900 text-sm">{cat.title}</h3>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Quem usa, vende com mais praticidade (depoimentos reais) */}
      <section id="depoimentos" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-16">
            <div className="text-center">
              <p className="text-4xl font-bold text-primary-500 mb-1">53</p>
              <p className="text-gray-600">lojas ativas usando o CatalogAI</p>
            </div>
            <div className="text-center">
              <p className="text-4xl font-bold text-primary-500 mb-1">+1.500</p>
              <p className="text-gray-600">pedidos processados pela plataforma</p>
            </div>
            <div className="text-center">
              <p className="text-4xl font-bold text-primary-500 mb-1">0%</p>
              <p className="text-gray-600">comissão por pedido — sempre</p>
            </div>
          </div>

          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Quem usa, vende com mais praticidade
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Depoimentos reais de quem já colocou o cardápio digital pra rodar.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {TESTIMONIALS.map((item, index) => (
              <div
                key={index}
                className="card-hover animate-fade-in flex flex-col"
                style={{ animationDelay: `${index * 80}ms` }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-primary-700 font-semibold text-sm">{item.name.charAt(0)}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                    <p className="text-xs text-gray-500 truncate">{item.role}</p>
                  </div>
                </div>
                <h3 className="font-semibold text-gray-900 mb-2 text-sm">{item.title}</h3>
                <p className="text-gray-600 text-sm flex-1">{item.quote}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Integrações Section */}
      <section className="py-14 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-6">Já integrado com</p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-5 py-2.5 shadow-sm">
              <MessageCircle size={20} className="text-green-500" />
              <span className="font-medium text-gray-700">WhatsApp</span>
            </div>
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-5 py-2.5 shadow-sm">
              <Wallet size={20} className="text-blue-500" />
              <span className="font-medium text-gray-700">Mercado Pago</span>
            </div>
          </div>
          <p className="text-sm text-gray-400 mt-4">Sem taxa de integração — já vem incluído no seu plano.</p>
        </div>
      </section>

      {/* Comece grátis por 7 dias: benefícios + plano + FAQ lado a lado */}
      <section id="planos" className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Comece grátis <span className="text-primary-500">por 7 dias</span>
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Depois, um preço só, tudo incluído — sem plano escalonado e sem comissão por pedido.
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-8 items-start">
            {/* Benefícios */}
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-4">Tudo incluído no plano</h3>
              <div className="grid sm:grid-cols-2 lg:grid-cols-1 gap-3">
                {[
                  '7 dias grátis',
                  'Cardápio digital ilimitado',
                  'Pedidos via WhatsApp',
                  'Entrega e retirada',
                  'Controle de estoque',
                  'Relatórios financeiros',
                  'Balcão / PDV',
                  'Cardápio de mesa com QR Code',
                  'Programa de fidelidade',
                  'Cupons de desconto',
                  'Pix automático',
                  'Cor de marca própria',
                  'PWA instalável',
                  'Link personalizado',
                  'Sem comissão por pedido',
                ].map((benefit, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <CheckCircle size={16} className="text-primary-500 flex-shrink-0" />
                    <span className="text-gray-700 text-sm">{benefit}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Card de preço */}
            <div className="card border-2 border-primary-500 relative overflow-hidden text-center">
              <div className="absolute top-0 right-0 bg-primary-500 text-white text-xs font-semibold px-4 py-1 rounded-bl-lg">
                7 dias grátis
              </div>
              <div className="py-4">
                <p className="text-gray-500 mb-2 text-sm">Nos primeiros 7 dias</p>
                <p className="mb-1">
                  <span className="text-5xl font-bold text-gray-900">R$ 0,00</span>
                </p>
                <p className="text-sm text-gray-500 mb-6">tudo liberado, sem cartão de crédito</p>

                <div className="border-t border-gray-100 pt-5 mb-6">
                  <p className="text-sm text-gray-500 mb-1">Depois, plano único de</p>
                  <p className="text-2xl font-bold text-gray-900">R$ 49,90<span className="text-base font-normal text-gray-500">/mês</span></p>
                  <p className="text-xs text-gray-400 mt-1">Cancele quando quiser, sem multa</p>
                </div>

                <Link href="/cadastro" className="btn-primary text-lg px-8 py-4 inline-flex w-full justify-center">
                  Começar agora
                  <ChevronRight size={20} />
                </Link>
                <p className="text-xs text-gray-400 mt-3">Sem cartão de crédito para começar</p>
              </div>
            </div>

            {/* FAQ */}
            <div id="faq">
              <h3 className="font-semibold text-gray-900 mb-4">Perguntas frequentes</h3>
              <div className="space-y-3">
                {FAQ_ITEMS.map((item, index) => {
                  const isOpen = openFaqIndex === index
                  return (
                    <div key={index} className="border border-gray-200 rounded-xl overflow-hidden bg-white">
                      <button
                        type="button"
                        onClick={() => setOpenFaqIndex(isOpen ? null : index)}
                        className="w-full flex items-center justify-between gap-4 text-left px-4 py-3"
                        aria-expanded={isOpen}
                      >
                        <span className="font-medium text-gray-900 text-sm">{item.question}</span>
                        <ChevronDown
                          size={18}
                          className={`flex-shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                        />
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-3 text-gray-600 text-sm animate-fade-in">
                          {item.answer}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="px-4 sm:px-6 lg:px-8 py-14">
        <div className="max-w-6xl mx-auto bg-gradient-to-r from-primary-600 to-green-700 rounded-3xl px-8 py-12 sm:px-14 flex flex-col sm:flex-row items-center justify-between gap-8 relative overflow-hidden">
          <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-2xl" />
          <div className="flex items-center gap-5 relative">
            <div className="w-14 h-14 bg-white/15 rounded-2xl flex items-center justify-center flex-shrink-0">
              <MessageCircle size={28} className="text-white" />
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-1">
                Pronto para transformar seu WhatsApp em um canal de vendas?
              </h2>
              <p className="text-primary-100">Crie seu cardápio digital e comece seu teste grátis hoje.</p>
            </div>
          </div>
          <Link href="/cadastro" className="bg-white text-primary-700 hover:bg-gray-50 font-semibold px-8 py-4 rounded-xl inline-flex items-center gap-2 transition-colors flex-shrink-0 relative">
            Começar 7 dias grátis
            <ChevronRight size={20} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Logo size={32} className="text-primary-500" />
                <span className="font-bold text-xl text-white">Catalog<span className="text-primary-500">AI</span></span>
              </div>
              <p className="text-sm">
                Cardápio digital e pedidos pelo WhatsApp.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Produto</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#funcionalidades" className="hover:text-white transition-colors">Recursos</a></li>
                <li><a href="#veja-como-funciona" className="hover:text-white transition-colors">Como funciona</a></li>
                <li><a href="#planos" className="hover:text-white transition-colors">Planos</a></li>
                <li><a href="#faq" className="hover:text-white transition-colors">FAQ</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Suporte</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/login" className="hover:text-white transition-colors">Acessar painel</Link></li>
                <li><Link href="/cadastro" className="hover:text-white transition-colors">Criar conta</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 text-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <p>&copy; {new Date().getFullYear()} CatalogAI — um produto GL Digital. Todos os direitos reservados.</p>
            <div className="flex gap-4">
              <Link href="/termos" className="hover:text-white transition-colors">Termos de Uso</Link>
              <Link href="/privacidade" className="hover:text-white transition-colors">Privacidade</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
