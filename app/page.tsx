'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Menu, X, Smartphone, ShoppingCart, LineChart, Package, Store, Pizza, Shirt, ShoppingBag, ChevronRight, ChevronDown, CheckCircle, Palette, Bike, ClipboardList, Sparkles, Gift, Tag, Zap, Instagram, Quote } from 'lucide-react'
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

export default function LandingPage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0)

  useEffect(() => {
    setIsVisible(true)
  }, [])

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
              <a href="#funcionalidades" className="text-gray-600 hover:text-gray-900 transition-colors">Funcionalidades</a>
              <a href="#para-quem" className="text-gray-600 hover:text-gray-900 transition-colors">Para quem é</a>
              <a href="#como-funciona" className="text-gray-600 hover:text-gray-900 transition-colors">Como funciona</a>
              <a href="#planos" className="text-gray-600 hover:text-gray-900 transition-colors">Planos</a>
              <a href="#faq" className="text-gray-600 hover:text-gray-900 transition-colors">FAQ</a>
              <Link href="/login" className="text-gray-600 hover:text-gray-900 transition-colors">Acessar</Link>
              <Link href="/cadastro" className="btn-primary">
                Testar 7 dias grátis
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
              <a href="#funcionalidades" className="block py-2 text-gray-600 hover:text-gray-900" onClick={() => setIsMenuOpen(false)}>Funcionalidades</a>
              <a href="#para-quem" className="block py-2 text-gray-600 hover:text-gray-900" onClick={() => setIsMenuOpen(false)}>Para quem é</a>
              <a href="#como-funciona" className="block py-2 text-gray-600 hover:text-gray-900" onClick={() => setIsMenuOpen(false)}>Como funciona</a>
              <a href="#planos" className="block py-2 text-gray-600 hover:text-gray-900" onClick={() => setIsMenuOpen(false)}>Planos</a>
              <a href="#faq" className="block py-2 text-gray-600 hover:text-gray-900" onClick={() => setIsMenuOpen(false)}>FAQ</a>
              <Link href="/login" className="block py-2 text-gray-600 hover:text-gray-900" onClick={() => setIsMenuOpen(false)}>Acessar</Link>
              <Link href="/cadastro" className="btn-primary w-full text-center" onClick={() => setIsMenuOpen(false)}>
                Testar 7 dias grátis
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-50 via-white to-blue-50" />
        <div className="absolute top-20 right-20 w-72 h-72 bg-primary-200/30 rounded-full blur-3xl" />
        <div className="absolute bottom-20 left-20 w-72 h-72 bg-blue-200/30 rounded-full blur-3xl" />
        
        <div className={`relative max-w-4xl mx-auto text-center transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
          <div className="inline-flex items-center gap-2 bg-primary-50 text-primary-700 px-4 py-2 rounded-full text-sm font-medium mb-6">
            <CheckCircle size={16} />
            <span>7 dias grátis, tudo liberado • Sem taxas • Multi-empresa</span>
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight mb-6">
            Crie seu{' '}
            <span className="text-primary-500">cardápio digital</span>
            {' '}e receba pedidos direto no{' '}
            <span className="text-green-500">WhatsApp</span>
          </h1>
          <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
            Transforme seu negócio com um cardápio online profissional.
            Seus clientes visualizam produtos, escolhem variações e enviam o pedido
            pronto pro seu WhatsApp com só um toque.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/cadastro" className="btn-primary text-lg px-8 py-4">
              Testar 7 dias grátis
              <ChevronRight size={20} />
            </Link>
            <Link href="#como-funciona" className="btn-secondary text-lg px-8 py-4">
              Como funciona
            </Link>
          </div>
          <div className="mt-12 flex items-center justify-center gap-8 text-sm text-gray-500">
            <span>✅ Sem instalação</span>
            <span>🔒 Dados seguros</span>
            <span>📱 Compatível celular</span>
          </div>
        </div>
      </section>

      {/* Prova Social Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
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
              Quem usa, recomenda
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
                <Quote className="w-6 h-6 text-primary-300 mb-3" />
                <h3 className="font-semibold text-gray-900 mb-2 text-sm">{item.title}</h3>
                <p className="text-gray-600 text-sm mb-4 flex-1">{item.quote}</p>
                <p className="text-sm font-medium text-gray-900">
                  {item.name}
                  <span className="block text-xs text-gray-500 font-normal">{item.role}</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Funcionalidades Section */}
      <section id="funcionalidades" className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-50">
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
                description: 'Relatórios de faturamento diário, semanal e mensal. Gráficos e filtros por período.',
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

      {/* Para Quem Section */}
      <section id="para-quem" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Para quem é o CatalogAI?
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Ideal para qualquer negócio que queira vender mais com um catálogo digital profissional.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
            {[
              { icon: <Pizza className="w-8 h-8" />, title: 'Pizzarias', desc: 'Cardápio com variações de sabores e tamanhos' },
              { icon: <Store className="w-8 h-8" />, title: 'Restaurantes', desc: 'Menu completo com fotos e descrições' },
              { icon: <ShoppingBag className="w-8 h-8" />, title: 'Lanchonetes', desc: 'Catálogo rápido para delivery' },
              { icon: <Shirt className="w-8 h-8" />, title: 'Lojas de Roupa', desc: 'Catálogo de produtos com variações' },
              { icon: <Package className="w-8 h-8" />, title: 'Mercados', desc: 'Lista de produtos com preços' }
            ].map((item, index) => (
              <div
                key={index}
                className="card-hover text-center animate-fade-in"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="w-16 h-16 bg-primary-50 rounded-full flex items-center justify-center mx-auto mb-4 text-primary-500">
                  {item.icon}
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">{item.title}</h3>
                <p className="text-sm text-gray-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Como Funciona Section */}
      <section id="como-funciona" className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Comece em 3 passos
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Rápido e simples. Você começa a receber pedidos hoje mesmo, com 7 dias grátis e tudo liberado.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: '1',
                title: 'Crie sua conta',
                description: 'Cadastre-se (7 dias grátis, com tudo liberado) e responda um quiz rápido — o painel já nasce ajustado ao seu tipo de negócio.'
              },
              {
                step: '2',
                title: 'Monte seu cardápio',
                description: 'Adicione produtos, fotos, preços, categorias e variações. Tudo pelo painel intuitivo.'
              },
              {
                step: '3',
                title: 'Compartilhe e venda',
                description: 'Compartilhe o link do seu cardápio e comece a receber pedidos pelo WhatsApp!'
              }
            ].map((item, index) => (
              <div key={index} className="text-center animate-fade-in" style={{ animationDelay: `${index * 200}ms` }}>
                <div className="w-16 h-16 bg-primary-500 rounded-full flex items-center justify-center mx-auto mb-6">
                  <span className="text-2xl font-bold text-white">{item.step}</span>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">{item.title}</h3>
                <p className="text-gray-600">{item.description}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-12">
            <Link href="/cadastro" className="btn-primary text-lg px-8 py-4">
              Testar 7 dias grátis agora
              <ChevronRight size={20} />
            </Link>
          </div>
        </div>
      </section>

      {/* Planos Section */}
      <section id="planos" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Um preço só, tudo incluído
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Sem plano escalonado, sem letra miúda. Você paga o mesmo valor e usa tudo, do primeiro produto cadastrado até o programa de fidelidade.
            </p>
          </div>

          <div className="card border-2 border-primary-500 relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-primary-500 text-white text-xs font-semibold px-4 py-1 rounded-bl-lg">
              7 dias grátis
            </div>
            <div className="text-center py-4">
              <p className="text-gray-500 mb-2">Plano único</p>
              <p className="mb-1">
                <span className="text-5xl font-bold text-gray-900">R$ 49,90</span>
                <span className="text-gray-500">/mês</span>
              </p>
              <p className="text-sm text-gray-500 mb-8">Cancele quando quiser, sem multa</p>

              <div className="grid sm:grid-cols-2 gap-3 text-left max-w-xl mx-auto mb-8">
                {[
                  'Cardápio digital ilimitado',
                  'Pedidos via WhatsApp',
                  'Entrega e retirada',
                  'Controle de estoque',
                  'Relatórios financeiros',
                  'Balcão / PDV',
                  'Programa de fidelidade',
                  'Cupons de desconto',
                  'Pix automático',
                  'Cor de marca própria',
                  'PWA instalável',
                  'Sem comissão por pedido',
                ].map((benefit, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <CheckCircle size={18} className="text-primary-500 flex-shrink-0" />
                    <span className="text-gray-700 text-sm">{benefit}</span>
                  </div>
                ))}
              </div>

              <Link href="/cadastro" className="btn-primary text-lg px-8 py-4 inline-flex">
                Testar 7 dias grátis
                <ChevronRight size={20} />
              </Link>
              <p className="text-xs text-gray-400 mt-3">Sem cartão de crédito para começar</p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Perguntas frequentes
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              O que quem está decidindo mais pergunta antes de criar a conta.
            </p>
          </div>

          <div className="space-y-3">
            {FAQ_ITEMS.map((item, index) => {
              const isOpen = openFaqIndex === index
              return (
                <div key={index} className="border border-gray-200 rounded-xl overflow-hidden bg-white">
                  <button
                    type="button"
                    onClick={() => setOpenFaqIndex(isOpen ? null : index)}
                    className="w-full flex items-center justify-between gap-4 text-left px-5 py-4"
                    aria-expanded={isOpen}
                  >
                    <span className="font-medium text-gray-900">{item.question}</span>
                    <ChevronDown
                      size={20}
                      className={`flex-shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-4 text-gray-600 animate-fade-in">
                      {item.answer}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
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
                Plataforma completa para criar e gerenciar seu cardápio digital. 
                Receba pedidos direto no WhatsApp.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Produto</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#funcionalidades" className="hover:text-white transition-colors">Funcionalidades</a></li>
                <li><a href="#para-quem" className="hover:text-white transition-colors">Para quem é</a></li>
                <li><a href="#como-funciona" className="hover:text-white transition-colors">Como funciona</a></li>
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
