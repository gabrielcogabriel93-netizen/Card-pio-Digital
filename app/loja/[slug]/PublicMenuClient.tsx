'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { SmartImage } from '@/components/SmartImage'
import { createClient } from '@/lib/supabase/client'
import { log, logError, logCritical } from '@/lib/logger'
import { isWithinOpeningHours, getWeeklyHours } from '@/lib/hours'
import { formatPhoneNumber, toWhatsAppNumber } from '@/lib/phone'
import { useEscapeKey } from '@/lib/useEscapeKey'
import { generateColorShades, themeShadesToCssVars } from '@/lib/theme'
import { lookupCep, formatCep } from '@/lib/cep'
import { PAYMENT_METHODS, paymentMethodLabel, MERCADOPAGO_MIN_ORDER_TOTAL } from '@/lib/paymentMethods'
import { generatePixPayload } from '@/lib/pix'
import QRCode from 'qrcode'
import {
  getSavedCustomer,
  saveCustomer,
  getSavedCart,
  saveCart,
  getSavedLastOrder,
  saveLastOrder,
  clearSavedLastOrder,
  getSavedAddress,
  saveAddress,
  type SavedAddress,
} from '@/lib/customerStorage'
import type { PublicEstablishment, Category, PublicProduct, PublicCombo, VariationGroup, VariationOption, CartItem, PublicDeliveryNeighborhood, CustomerProfile, CustomerAddress, PublicLoyaltySettings, PublicLoyaltyReward, LoyaltyBenefitType } from '@/types'
import { PizzaOrderModal, type PizzaOrderResult } from '@/components/PizzaOrderModal'
import { MercadoPagoPixCheckout } from '@/components/MercadoPagoPixCheckout'
import { Logo } from '@/components/Logo'
import { ShoppingCart, X, Plus, Minus, MapPin, Clock, Loader2, Store, Send, Bike, Package, ClipboardList, Trash2, CheckCircle2, PlusCircle, Copy, AlertCircle, Instagram, Gift, Table2, Layers } from 'lucide-react'
import { ComboOrderModal, type ComboOrderResult } from '@/components/ComboOrderModal'

export default function PublicMenuClient({
  establishment,
  categories,
  products,
  combos,
  tableIdParam,
}: {
  establishment: PublicEstablishment
  categories: Category[]
  products: PublicProduct[]
  combos: PublicCombo[]
  // Presente quando o cliente chegou via QR de mesa (?mesa=<id>,
  // migration 039) — ver useEffect que resolve isTableMode abaixo.
  tableIdParam?: string | null
}) {
  const [cart, setCart] = useState<CartItem<PublicProduct>[]>([])
  const [showCart, setShowCart] = useState(false)
  const [showVariations, setShowVariations] = useState<PublicProduct | null>(null)
  const [showPizzaOrder, setShowPizzaOrder] = useState<PublicProduct | null>(null)
  const [showComboOrder, setShowComboOrder] = useState<PublicCombo | null>(null)
  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [pixQrDataUrl, setPixQrDataUrl] = useState<string | null>(null)
  const [pixCopied, setPixCopied] = useState(false)
  const [mpCheckout, setMpCheckout] = useState<{ orderId: string; amount: number; qrCode: string; qrCodeBase64: string } | null>(null)
  // Pedido já foi salvo, mas gerar a cobrança falhou — mostra um jeito de
  // tentar de novo pro MESMO pedido, em vez de um alert() sem saída (que
  // deixava o pedido "órfão": salvo, mas invisível pro cliente, e uma
  // nova tentativa criaria outro pedido consumindo o cupom de novo).
  const [mpCheckoutFailure, setMpCheckoutFailure] = useState<{ orderId: string; amount: number; message: string } | null>(null)
  const [mpRetrying, setMpRetrying] = useState(false)
  const [birthDate, setBirthDate] = useState('')
  const offersDelivery = establishment.offers_delivery ?? true
  const offersPickup = establishment.offers_pickup ?? true
  const [orderType, setOrderType] = useState<'delivery' | 'pickup'>(offersDelivery ? 'delivery' : 'pickup')
  const [address, setAddress] = useState<SavedAddress>({ street: '', number: '', neighborhood: '', complement: '', reference: '', zip_code: '' })
  const [cepLoading, setCepLoading] = useState(false)
  const useNeighborhoodFee = establishment.use_neighborhood_delivery_fee ?? false
  const [neighborhoods, setNeighborhoods] = useState<PublicDeliveryNeighborhood[]>([])
  const [selectedNeighborhoodId, setSelectedNeighborhoodId] = useState<string>('')
  // Perfil do cliente (nome + endereços salvos), identificado só pelo
  // telefone — funciona mesmo trocando de aparelho, diferente do
  // localStorage. "new" = formulário em branco/edição, "select" = lista
  // de endereços salvos, "confirm" = mostra o endereço já escolhido.
  const [customerProfile, setCustomerProfile] = useState<CustomerProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [addressMode, setAddressMode] = useState<'new' | 'select' | 'confirm'>('new')
  const [selectedAddressId, setSelectedAddressId] = useState<string>('')
  const [addressLabel, setAddressLabel] = useState('')
  const [website, setWebsite] = useState('') // honeypot: campo invisível, só bot preenche
  const [formOpenedAt] = useState(() => Date.now())
  const [saving, setSaving] = useState(false)
  // true depois da 1a tentativa de envio com campo faltando — liga a
  // exibição de erro em tempo real nos campos enquanto o cliente corrige,
  // em vez de só desabilitar o botão sem dizer o motivo.
  const [attemptedSubmit, setAttemptedSubmit] = useState(false)
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [couponInput, setCouponInput] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discountType: 'percent' | 'fixed' | 'free_shipping'; discountValue: number } | null>(null)
  const [couponError, setCouponError] = useState<string | null>(null)
  const [couponLoading, setCouponLoading] = useState(false)
  // Programa de fidelidade (pontos) — migrations 037/038. Carregado uma
  // vez via views públicas; a seção de resgate só aparece se is_active e
  // sem cupom aplicado (mutuamente exclusivos, ver constraint no banco).
  const [loyaltySettings, setLoyaltySettings] = useState<PublicLoyaltySettings | null>(null)
  const [loyaltyRewards, setLoyaltyRewards] = useState<PublicLoyaltyReward[]>([])
  const [selectedRewardId, setSelectedRewardId] = useState('')
  const [appliedReward, setAppliedReward] = useState<{ id: string; name: string; benefitType: LoyaltyBenefitType; benefitValue: number | null; pointsCost: number } | null>(null)
  const [rewardError, setRewardError] = useState<string | null>(null)
  const [rewardLoading, setRewardLoading] = useState(false)
  // Cardápio de mesa (migration 039) — QR aponta pra ?mesa=<table_id>.
  // tableModeFailed cobre QR antigo/mesa desativada: degrada pro
  // cardápio online normal em vez de travar o cliente numa tela quebrada.
  const [tableTab, setTableTab] = useState<{ id: string; label: string } | null>(null)
  const [tableModeFailed, setTableModeFailed] = useState(false)
  const isTableMode = !!tableIdParam && !!tableTab && !tableModeFailed
  const [tableOrderToast, setTableOrderToast] = useState(false)
  // Drawer "Sobre a loja" (perfil do estabelecimento) — aberto ao tocar
  // no nome/logo no header.
  const [showEstablishmentProfile, setShowEstablishmentProfile] = useState(false)
  const [lastOrderId, setLastOrderId] = useState<string | null>(null)
  const [blockedWhatsAppUrl, setBlockedWhatsAppUrl] = useState<string | null>(null)

  // A loja fecha automaticamente fora do horário configurado, mesmo que o
  // lojista tenha esquecido de virar a chave manual para "fechado".
  const isEffectivelyOpen = useMemo(() => {
    if (!establishment.is_open) return false
    return isWithinOpeningHours(establishment.opening_hours)
  }, [establishment.is_open, establishment.opening_hours])

  const selectedNeighborhood = neighborhoods.find(n => n.id === selectedNeighborhoodId) || null

  const cartSubtotal = cart.reduce((sum, item) => sum + item.total_price, 0)

  // Taxa de entrega só entra na conta quando o cliente escolhe "Entrega" —
  // antes disso era cobrada em qualquer pedido, mesmo retirando no local.
  // Se a loja usa taxa por bairro e o bairro escolhido tem valor próprio,
  // esse valor vale em vez da taxa padrão do estabelecimento.
  // isTableMode força frete zero mesmo se orderType ainda estiver no
  // valor padrão 'delivery' (o seletor de entrega/retirada fica
  // escondido em modo mesa, mas o state não muda sozinho).
  const deliveryFee = !isTableMode && orderType === 'delivery'
    ? (useNeighborhoodFee && selectedNeighborhood
        ? Number(selectedNeighborhood.fee) || 0
        : Number(establishment.delivery_fee) || 0)
    : 0
  const isFreeShippingCoupon = appliedCoupon?.discountType === 'free_shipping'
  // Resgate de pontos de fidelidade — mutuamente exclusivo com cupom
  // (constraint no banco, migration 038). "Frete grátis" como benefício
  // de recompensa funciona igual ao de cupom: zera o frete, não desconta
  // o subtotal.
  const isFreeShippingReward = appliedReward?.benefitType === 'free_shipping'
  // Frete grátis progressivo: valor mínimo configurado pelo lojista —
  // conta real em cima do carrinho atual, não é sugestão nem estimativa.
  const freeShippingThreshold = Number(establishment.free_shipping_threshold) || 0
  const qualifiesForFreeShippingThreshold =
    orderType === 'delivery' && freeShippingThreshold > 0 && cartSubtotal >= freeShippingThreshold
  // Taxa realmente cobrada — zerada quando o cupom/recompensa aplicado é
  // de frete grátis OU quando o carrinho já bateu o valor mínimo configurado.
  const effectiveDeliveryFee = (isFreeShippingCoupon || isFreeShippingReward || qualifiesForFreeShippingThreshold) ? 0 : deliveryFee

  // Desconto de aniversário: 100% automático, sem nenhuma mensagem
  // enviada — só compara mês/dia (string, evita fuso horário bagunçar a
  // comparação) com a data salva no perfil. Não acumula com cupom
  // manual nem resgate de pontos, pra não complicar a conta.
  const todayMonthDay = useMemo(() => {
    const now = new Date()
    return `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  }, [])
  const isBirthdayToday = !!birthDate && birthDate.slice(5, 10) === todayMonthDay
  const birthdayDiscountPercent = Number(establishment.birthday_discount_percent) || 0
  const isBirthdayDiscountActive = isBirthdayToday && birthdayDiscountPercent > 0 && !appliedCoupon && !appliedReward

  // Aplica a cor de marca da loja (Configurações > Cor do tema) como CSS
  // custom properties só dentro desta árvore — todas as classes
  // `bg-primary-*`/`text-primary-*`/`btn-primary` já existentes passam a
  // refletir a cor escolhida, sem precisar trocar classe por classe.
  const themeStyle = useMemo(
    () => themeShadesToCssVars(generateColorShades(establishment.theme_color)) as React.CSSProperties,
    [establishment.theme_color]
  )

  useEscapeKey(() => setShowCart(false), showCart)
  useEscapeKey(() => setShowCustomerModal(false), showCustomerModal)
  useEscapeKey(() => setShowEstablishmentProfile(false), showEstablishmentProfile)

  // Recupera carrinho, dados do cliente e último pedido salvos neste
  // navegador. Roda só no client (após hidratar) para não gerar
  // mismatch entre o HTML renderizado no servidor e o do navegador.
  useEffect(() => {
    const savedCart = getSavedCart<CartItem<PublicProduct>[]>(establishment.id)
    if (savedCart && savedCart.length > 0) setCart(savedCart)

    const savedCustomer = getSavedCustomer()
    if (savedCustomer) {
      setCustomerName(savedCustomer.name)
      setCustomerPhone(savedCustomer.phone)
    }

    const savedAddress = getSavedAddress()
    if (savedAddress) setAddress(savedAddress)

    const savedLastOrderId = getSavedLastOrder(establishment.id)
    if (savedLastOrderId) setLastOrderId(savedLastOrderId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [establishment.id])

  // Lista de bairros com frete próprio, só quando a loja usa esse modo —
  // vira um <select> no lugar do campo de texto livre de bairro.
  useEffect(() => {
    if (!useNeighborhoodFee) return
    const loadNeighborhoods = async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('public_delivery_neighborhoods')
        .select('*')
        .eq('establishment_id', establishment.id)
        .order('name')

      if (error) {
        logError('loja', 'erro ao carregar bairros de entrega', error)
        return
      }
      setNeighborhoods((data || []) as PublicDeliveryNeighborhood[])
    }
    loadNeighborhoods()
  }, [useNeighborhoodFee, establishment.id])

  // Programa de fidelidade: carrega config + recompensas uma vez (views
  // públicas, leve). Sem erro pro usuário se falhar — a seção de pontos
  // simplesmente não aparece, o resto do cardápio funciona normal.
  useEffect(() => {
    const loadLoyalty = async () => {
      const supabase = createClient()
      const [{ data: settingsData }, { data: rewardsData }] = await Promise.all([
        supabase.from('public_loyalty_settings').select('*').eq('establishment_id', establishment.id).maybeSingle(),
        supabase.from('public_loyalty_rewards').select('*').eq('establishment_id', establishment.id).order('points_cost', { ascending: true }),
      ])
      if (settingsData) setLoyaltySettings(settingsData as PublicLoyaltySettings)
      if (rewardsData) setLoyaltyRewards(rewardsData as PublicLoyaltyReward[])
    }
    loadLoyalty()
  }, [establishment.id])

  // Cardápio de mesa: assim que detecta ?mesa=<id> na URL, abre (ou
  // reusa) a comanda daquela mesa via RPC SECURITY DEFINER — nunca lê
  // restaurant_tables/table_tabs direto (RLS não deixa o anônimo, ver
  // migration 039). Erro aqui (QR antigo, mesa desativada) degrada pro
  // cardápio online normal, silenciosamente.
  useEffect(() => {
    if (!tableIdParam) return
    const supabase = createClient()
    supabase
      .rpc('get_or_create_table_tab', { p_establishment_id: establishment.id, p_table_id: tableIdParam })
      .then(({ data, error }) => {
        if (error || !data?.[0]?.tab_id) {
          logError('loja', 'mesa inválida no link, caindo pro cardápio normal', error)
          setTableModeFailed(true)
          return
        }
        setTableTab({ id: data[0].tab_id, label: data[0].table_label })
      })
  }, [tableIdParam, establishment.id])

  // Mantém o carrinho salvo a cada mudança, para sobreviver a um refresh
  // acidental da página (fraqueza comum de navegador mobile).
  useEffect(() => {
    saveCart(establishment.id, cart)
  }, [cart, establishment.id])

  // Preenche os campos do endereço a partir de um endereço salvo do
  // perfil e tenta casar o bairro com a lista de taxa por bairro, se a
  // loja usar isso (mesma lógica do auto-match por CEP).
  const selectSavedAddress = (addr: CustomerAddress) => {
    setSelectedAddressId(addr.id)
    setAddress({
      street: addr.street,
      number: addr.number,
      neighborhood: addr.neighborhood,
      complement: addr.complement || '',
      reference: addr.reference || '',
      zip_code: addr.zip_code || '',
    })
    if (useNeighborhoodFee) {
      const match = neighborhoods.find(n => n.name.trim().toLowerCase() === addr.neighborhood.trim().toLowerCase())
      setSelectedNeighborhoodId(match ? match.id : '')
      if (!match && neighborhoods.length > 0) {
        // Bairro salvo não está mais na lista de entrega da loja — manda
        // pro formulário editável (com os campos já preenchidos) em vez
        // de "confirmar" um endereço sem taxa de entrega definida.
        setAddressMode('new')
        return
      }
    }
    setAddressMode('confirm')
  }

  // Busca o perfil (nome + endereços) pelo telefone digitado — funciona
  // mesmo se o cliente nunca pediu nesse aparelho antes, já que fica
  // vinculado ao telefone e não ao navegador.
  const lookupCustomerProfile = async () => {
    const digits = customerPhone.replace(/\D/g, '')
    if (digits.length < 10) return

    setProfileLoading(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('get_customer_profile', {
        p_establishment_id: establishment.id,
        p_phone: customerPhone,
      })
      if (error) throw error
      const result = data?.[0]

      if (result?.customer_id) {
        if (!customerName.trim()) setCustomerName(result.name)
        if (result.birth_date && !birthDate) setBirthDate(result.birth_date)
        const addresses = (result.addresses || []) as CustomerAddress[]
        setCustomerProfile({ customer_id: result.customer_id, name: result.name, birth_date: result.birth_date, loyalty_points_balance: result.loyalty_points_balance ?? 0, addresses })
        if (orderType === 'delivery' && addresses.length > 0 && addressMode === 'new' && !address.street.trim()) {
          selectSavedAddress(addresses[0])
        }
      } else {
        setCustomerProfile(null)
      }
    } catch (err) {
      logError('loja', 'erro ao buscar perfil do cliente', err)
    } finally {
      setProfileLoading(false)
    }
  }

  // Se o telefone já veio pré-preenchido do localStorage (cliente
  // recorrente neste mesmo navegador), busca o perfil assim que o modal
  // abre — sem precisar esperar o campo perder o foco.
  useEffect(() => {
    if (showCustomerModal && customerPhone.replace(/\D/g, '').length >= 10) {
      lookupCustomerProfile()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCustomerModal])

  // Carrinho abandonado (migration 042): assim que o telefone fica
  // válido na etapa de "Finalizar Pedido", salva/atualiza um rascunho
  // do carrinho (debounced) — é o único momento em que dá pra saber o
  // telefone do lado do servidor antes do pedido ser confirmado (ver
  // comentário na migration). Não roda em modo mesa (isTableMode): lá
  // o telefone é opcional e o fluxo não passa pelo WhatsApp.
  useEffect(() => {
    if (isTableMode || !showCustomerModal) return
    const digits = customerPhone.replace(/\D/g, '')
    if (digits.length < 10 || cart.length === 0) return

    const timer = setTimeout(() => {
      const supabase = createClient()
      supabase
        .rpc('save_cart_draft', {
          p_establishment_id: establishment.id,
          p_customer_phone: customerPhone,
          p_customer_name: customerName,
          p_cart_snapshot: cart.map((item) => ({
            name: item.product.name,
            quantity: item.quantity,
            unit_price: item.unit_price,
          })),
          p_cart_total: cartSubtotal,
        })
        .then(({ error }) => {
          if (error) logError('loja', 'erro ao salvar rascunho de carrinho', error)
        })
    }, 1500)

    return () => clearTimeout(timer)
  }, [isTableMode, showCustomerModal, customerPhone, customerName, cart, cartSubtotal, establishment.id])

  const handleDeleteSavedAddress = async (addressId: string) => {
    if (!confirm('Remover este endereço salvo?')) return
    try {
      const supabase = createClient()
      const { error } = await supabase.rpc('delete_customer_address', {
        p_establishment_id: establishment.id,
        p_phone: customerPhone.trim(),
        p_address_id: addressId,
      })
      if (error) throw error
      setCustomerProfile(prev => prev ? { ...prev, addresses: prev.addresses.filter(a => a.id !== addressId) } : prev)
      if (selectedAddressId === addressId) {
        setSelectedAddressId('')
        setAddressLabel('')
        setAddress({ street: '', number: '', neighborhood: '', complement: '', reference: '', zip_code: '' })
        setAddressMode('new')
      }
    } catch (err) {
      logError('loja', 'erro ao remover endereço salvo', err)
      alert('Não foi possível remover este endereço. Tente novamente.')
    }
  }

  const addToCart = async (product: PublicProduct) => {
    if (product.pizza_flavor_id) {
      setShowPizzaOrder(product)
      return
    }

    const supabase = createClient()
    const { data: groups } = await supabase
      .from('variation_groups')
      .select('*, options:variation_options(*)')
      .eq('product_id', product.id)
      .order('display_order')

    if (groups && groups.length > 0) {
      setShowVariations(product)
      return
    }

    addToCartDirect(product, [])
  }

  // Item de pizza: o preço já vem calculado pela regra do sabor mais caro
  // (lib/pizza.ts), não é a soma dos price_delta das variações — por isso
  // não passa por addToCartDirect, que soma os deltas.
  const addPizzaItemToCart = (product: PublicProduct, result: PizzaOrderResult) => {
    const variationsKey = result.variations.map(v => `${v.group_name}:${v.option_name}`).sort().join('|')
    const existingIndex = cart.findIndex(
      item => item.product.id === product.id &&
      item.variations.map(v => `${v.group_name}:${v.option_name}`).sort().join('|') === variationsKey
    )

    if (existingIndex >= 0) {
      const updated = [...cart]
      updated[existingIndex].quantity += 1
      updated[existingIndex].total_price = updated[existingIndex].unit_price * updated[existingIndex].quantity
      setCart(updated)
    } else {
      setCart([...cart, {
        product,
        quantity: 1,
        variations: result.variations,
        unit_price: result.unitPrice,
        total_price: result.unitPrice,
      }])
    }

    setShowPizzaOrder(null)
  }

  // Item de combo: preço sempre é o fixo do combo (migration 040), as
  // escolhas do cliente nunca mudam o total. "produto" sintético só pra
  // reaproveitar toda a renderização de carrinho existente (nome/imagem/
  // preço/quantidade) sem mexer em CartItem<P> -- o vínculo real com o
  // combo e as escolhas de cada slot ficam em `combo`, usado na hora de
  // montar o pedido (handleSendOrder/handleAddOrderToTable) e na baixa de
  // estoque dos componentes escolhidos (app/painel/pedidos/page.tsx).
  const addComboItemToCart = (combo: PublicCombo, result: ComboOrderResult) => {
    const variationsKey = result.variations.map(v => `${v.group_name}:${v.option_name}`).sort().join('|')
    const existingIndex = cart.findIndex(
      item => item.product.id === combo.id &&
      item.variations.map(v => `${v.group_name}:${v.option_name}`).sort().join('|') === variationsKey
    )

    const syntheticProduct: PublicProduct = {
      id: combo.id,
      establishment_id: combo.establishment_id,
      name: combo.name,
      description: combo.description ?? undefined,
      price: combo.price,
      image_url: combo.image_url ?? undefined,
      display_order: combo.display_order,
      in_stock: true,
      pizza_flavor_id: null,
    }

    if (existingIndex >= 0) {
      const updated = [...cart]
      updated[existingIndex].quantity += 1
      updated[existingIndex].total_price = updated[existingIndex].unit_price * updated[existingIndex].quantity
      setCart(updated)
    } else {
      setCart([...cart, {
        product: syntheticProduct,
        quantity: 1,
        variations: result.variations,
        unit_price: result.unitPrice,
        total_price: result.unitPrice,
        combo: { combo_id: result.comboId, selections: result.selections },
      }])
    }

    setShowComboOrder(null)
  }

  const addToCartDirect = (product: PublicProduct, variations: CartItem<PublicProduct>['variations']) => {
    const variationsKey = variations.map(v => `${v.group_name}:${v.option_name}`).sort().join('|')
    const existingIndex = cart.findIndex(
      item => item.product.id === product.id &&
      item.variations.map(v => `${v.group_name}:${v.option_name}`).sort().join('|') === variationsKey
    )

    if (existingIndex >= 0) {
      const updated = [...cart]
      updated[existingIndex].quantity += 1
      updated[existingIndex].total_price = updated[existingIndex].unit_price * updated[existingIndex].quantity
      setCart(updated)
    } else {
      const priceDelta = variations.reduce((sum, v) => sum + v.price_delta, 0)
      const unitPrice = Number(product.price) + priceDelta
      setCart([...cart, {
        product,
        quantity: 1,
        variations,
        unit_price: unitPrice,
        total_price: unitPrice,
      }])
    }

    setShowVariations(null)
  }

  const updateQuantity = (index: number, delta: number) => {
    const updated = [...cart]
    const item = updated[index]
    item.quantity = Math.max(1, item.quantity + delta)
    item.total_price = item.unit_price * item.quantity
    setCart(updated)
  }

  const removeFromCart = (index: number) => {
    setCart(cart.filter((_, i) => i !== index))
  }

  const handleApplyCoupon = async () => {
    if (!couponInput.trim()) return
    setCouponLoading(true)
    setCouponError(null)
    log('loja', 'validando cupom...', { code: couponInput })

    try {
      const supabase = createClient()
      // Se o telefone já foi preenchido antes (cliente recorrente, vem
      // do localStorage), já dá pra checar o limite por cliente aqui.
      // Senão, essa checagem só acontece de fato no envio do pedido —
      // ver handleSendOrder.
      const { data, error } = await supabase.rpc('validate_coupon', {
        p_establishment_id: establishment.id,
        p_code: couponInput.trim(),
        p_customer_phone: customerPhone.trim() || null,
      })

      if (error) throw error
      const result = data?.[0]

      if (!result?.valid) {
        setCouponError(result?.message || 'Cupom inválido.')
        setAppliedCoupon(null)
        return
      }

      setAppliedCoupon({
        code: couponInput.trim().toUpperCase(),
        discountType: result.discount_type,
        discountValue: Number(result.discount_value),
      })
      log('loja', 'cupom aplicado', { code: couponInput })
    } catch (err) {
      logError('loja', 'erro ao validar cupom', err)
      setCouponError('Não foi possível validar o cupom. Tente novamente.')
    } finally {
      setCouponLoading(false)
    }
  }

  const removeCoupon = () => {
    setAppliedCoupon(null)
    setCouponInput('')
    setCouponError(null)
  }

  // Resgate de pontos — mesmo formato de handleApplyCoupon, mas exige
  // telefone (não dá pra saber o saldo de ninguém sem ele).
  const handleApplyReward = async (rewardId: string) => {
    if (!rewardId || !customerPhone.trim()) return
    setRewardLoading(true)
    setRewardError(null)
    log('loja', 'validando resgate de pontos...', { rewardId })

    try {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('validate_loyalty_redemption', {
        p_establishment_id: establishment.id,
        p_reward_id: rewardId,
        p_customer_phone: customerPhone.trim(),
      })

      if (error) throw error
      const result = data?.[0]

      if (!result?.valid) {
        setRewardError(result?.message || 'Não foi possível resgatar essa recompensa.')
        return
      }

      const reward = loyaltyRewards.find(r => r.id === rewardId)
      setAppliedReward({
        id: rewardId,
        name: reward?.name || 'Recompensa',
        benefitType: result.benefit_type,
        benefitValue: result.benefit_value != null ? Number(result.benefit_value) : null,
        pointsCost: result.points_cost,
      })
      log('loja', 'recompensa de fidelidade aplicada', { rewardId })
    } catch (err) {
      logError('loja', 'erro ao validar resgate de pontos', err)
      setRewardError('Não foi possível resgatar essa recompensa agora. Tente novamente.')
    } finally {
      setRewardLoading(false)
    }
  }

  const removeReward = () => {
    setAppliedReward(null)
    setSelectedRewardId('')
    setRewardError(null)
  }

  // Quando a loja usa taxa por bairro E já tem bairro cadastrado, o
  // cliente precisa escolher um da lista em vez de só digitar o nome.
  const usingNeighborhoodSelect = useNeighborhoodFee && neighborhoods.length > 0
  const selectedSavedAddress = customerProfile?.addresses.find(a => a.id === selectedAddressId) || null
  const isAddressValid = orderType === 'pickup' ||
    (address.street.trim() && address.number.trim() &&
      (usingNeighborhoodSelect ? !!selectedNeighborhoodId : !!address.neighborhood.trim()))

  // Lista viva do que falta pra enviar o pedido — recalculada a cada
  // digitação. Alimenta o resumo de erro e o destaque vermelho por campo,
  // pra nunca deixar o cliente sem saber por que o botão não sai do lugar.
  const missingFields = useMemo(() => {
    const missing: { key: string; label: string }[] = []
    if (!customerName.trim()) missing.push({ key: 'name', label: 'Nome' })
    if (!isTableMode) {
      if (!customerPhone.trim()) missing.push({ key: 'phone', label: 'Telefone' })
      if (orderType === 'delivery') {
        if (!address.street.trim()) missing.push({ key: 'street', label: 'Rua' })
        if (!address.number.trim()) missing.push({ key: 'number', label: 'Número' })
        if (usingNeighborhoodSelect ? !selectedNeighborhoodId : !address.neighborhood.trim()) {
          missing.push({ key: 'neighborhood', label: 'Bairro' })
        }
      }
    }
    return missing
  }, [customerName, customerPhone, isTableMode, orderType, address.street, address.number, address.neighborhood, usingNeighborhoodSelect, selectedNeighborhoodId])

  const fieldError = (key: string) => attemptedSubmit && missingFields.some((f) => f.key === key)

  const handleSubmitClick = () => {
    if (missingFields.length > 0) {
      setAttemptedSubmit(true)
      return
    }
    if (isTableMode) {
      handleAddOrderToTable()
    } else {
      handleSendOrder()
    }
  }

  const handleCepBlur = async () => {
    const digits = (address.zip_code || '').replace(/\D/g, '')
    if (digits.length !== 8) return

    setCepLoading(true)
    const result = await lookupCep(digits)
    setCepLoading(false)

    if (result) {
      setAddress((prev) => ({
        ...prev,
        street: result.street || prev.street,
        // No modo de bairro por lista, o texto livre não é usado pra
        // enviar o pedido — só serve de referência caso o bairro do CEP
        // não esteja cadastrado (ver match abaixo).
        neighborhood: result.neighborhood || prev.neighborhood,
      }))

      if (useNeighborhoodFee && result.neighborhood) {
        const match = neighborhoods.find(
          n => n.name.trim().toLowerCase() === result.neighborhood.trim().toLowerCase()
        )
        if (match) setSelectedNeighborhoodId(match.id)
      }
    }
  }

  // Tenta gerar a cobrança Pix pro pedido já salvo (`orderId`) — reaproveitada
  // tanto no envio inicial quanto no botão "Tentar novamente", sempre pro
  // MESMO pedido (nunca cria um pedido novo nem reconsome cupom).
  const tryCreateMercadoPagoPayment = async (targetOrderId: string, amount: number): Promise<boolean> => {
    try {
      const response = await fetch('/api/mercadopago/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: targetOrderId }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Erro ao gerar o Pix')
      setMpCheckoutFailure(null)
      setMpCheckout({ orderId: targetOrderId, amount, qrCode: data.qrCode, qrCodeBase64: data.qrCodeBase64 })
      return true
    } catch (mpErr: any) {
      logError('loja', 'erro ao gerar pagamento Mercado Pago', mpErr)
      setMpCheckoutFailure({ orderId: targetOrderId, amount, message: mpErr.message || 'Erro ao gerar o Pix' })
      return false
    }
  }

  const handleSendOrder = async () => {
    if (!customerName.trim() || !customerPhone.trim() || !isAddressValid) return

    // Honeypot: campo invisível para humanos. Se veio preenchido, é bot —
    // finge sucesso sem gravar nada.
    if (website.trim()) {
      log('loja', 'pedido bloqueado (honeypot preenchido)')
      setCart([])
      setShowCustomerModal(false)
      return
    }

    // Um humano normalmente leva pelo menos alguns segundos preenchendo o
    // formulário; um bot script costuma submeter quase instantaneamente.
    if (Date.now() - formOpenedAt < 1500) {
      log('loja', 'pedido bloqueado (submissão rápida demais)')
      return
    }

    // Pix automático (Mercado Pago) não passa pelo WhatsApp — o cliente
    // paga e o sistema confirma sozinho, sem precisar dessa aba.
    const isMpAutomatic = paymentMethod === 'mercadopago_pix'

    // Abre a aba do WhatsApp AGORA, em branco, ainda dentro do clique
    // síncrono do usuário. Se esperarmos o pedido salvar no banco (que
    // tem um `await` de rede) pra só então chamar window.open, vários
    // navegadores — principalmente iOS Safari e o navegador embutido do
    // Instagram/Facebook — não reconhecem mais isso como gesto direto do
    // usuário e bloqueiam o popup EM SILÊNCIO: o pedido salva, mas o
    // WhatsApp nunca abre e ninguém percebe. Só preenchemos a URL de
    // verdade depois que a mensagem estiver pronta.
    const whatsappWindow = isMpAutomatic ? null : window.open('', '_blank')

    setSaving(true)
    log('loja', 'enviando pedido...', { itens: cart.length, establishmentId: establishment.id })

    try {
      const subtotal = cartSubtotal
      let total = cartTotal
      let finalDiscount = discountAmount
      let finalRewardId: string | null = null
      let finalPointsRedeemed = 0

      const supabase = createClient()

      // Revalida o cupom agora que o telefone é conhecido (obrigatório
      // neste passo). No carrinho, um cliente novo ainda não tinha
      // digitado o telefone, então o limite "por cliente" não dava pra
      // checar antes — é aqui que isso é garantido de verdade. O banco
      // também barra isso de novo no INSERT como segunda camada, então
      // mesmo pulando esse passo o limite continua valendo.
      if (appliedCoupon) {
        const { data: recheckData, error: recheckError } = await supabase.rpc('validate_coupon', {
          p_establishment_id: establishment.id,
          p_code: appliedCoupon.code,
          p_customer_phone: customerPhone.trim(),
        })
        if (recheckError) throw recheckError
        const recheckResult = recheckData?.[0]
        if (!recheckResult?.valid) {
          whatsappWindow?.close()
          removeCoupon()
          alert(recheckResult?.message || 'Esse cupom não é mais válido. Removemos ele do pedido — confira o total e envie novamente.')
          return // o `finally` abaixo cuida de setSaving(false)
        }

        // Usa o desconto que o servidor acabou de confirmar, não o que
        // estava em memória desde que o cupom foi aplicado no carrinho —
        // evita gravar um desconto desatualizado se o lojista tiver
        // editado o cupom no meio da sessão do cliente.
        finalDiscount = recheckResult.discount_type === 'percent'
          ? subtotal * (Number(recheckResult.discount_value) / 100)
          : recheckResult.discount_type === 'fixed'
            ? Math.min(Number(recheckResult.discount_value), subtotal)
            : 0 // free_shipping não desconta o subtotal
        total = Math.max(0, subtotal - finalDiscount + effectiveDeliveryFee)
      } else if (appliedReward) {
        // Mesmo motivo do recheck de cupom: o saldo de pontos pode ter
        // mudado desde que a recompensa foi aplicada no carrinho (outro
        // pedido no meio do caminho, por exemplo) — nunca confia no valor
        // em memória pra gravar o desconto final.
        const { data: recheckData, error: recheckError } = await supabase.rpc('validate_loyalty_redemption', {
          p_establishment_id: establishment.id,
          p_reward_id: appliedReward.id,
          p_customer_phone: customerPhone.trim(),
        })
        if (recheckError) throw recheckError
        const recheckResult = recheckData?.[0]
        if (!recheckResult?.valid) {
          whatsappWindow?.close()
          removeReward()
          alert(recheckResult?.message || 'Essa recompensa não está mais disponível. Removemos ela do pedido — confira o total e envie novamente.')
          return // o `finally` abaixo cuida de setSaving(false)
        }

        finalDiscount = recheckResult.benefit_type === 'percent_discount'
          ? subtotal * (Number(recheckResult.benefit_value) / 100)
          : recheckResult.benefit_type === 'fixed_discount'
            ? Math.min(Number(recheckResult.benefit_value), subtotal)
            : 0 // free_shipping não desconta o subtotal
        total = Math.max(0, subtotal - finalDiscount + effectiveDeliveryFee)
        finalRewardId = appliedReward.id
        finalPointsRedeemed = recheckResult.points_cost
      }

      // Gera o id no client em vez de pedir de volta com .select(): o
      // RLS só deixa o DONO da loja ler pedidos, então um .select() após
      // o insert do visitante anônimo voltaria vazio mesmo com sucesso.
      const orderId = crypto.randomUUID()

      const { error: orderError } = await supabase.from('orders').insert({
        id: orderId,
        establishment_id: establishment.id,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        items: cart.map(item => ({
          product_id: item.product.id,
          product_name: item.product.name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.total_price,
          image_url: item.product.image_url,
          variations: item.variations,
          combo_id: item.combo?.combo_id ?? null,
          combo_selections: item.combo?.selections,
        })),
        subtotal,
        shipping_fee: effectiveDeliveryFee,
        discount: finalDiscount,
        coupon_code: appliedCoupon?.code || (isBirthdayDiscountActive ? 'ANIVERSARIO' : null),
        loyalty_reward_id: finalRewardId,
        loyalty_points_redeemed: finalPointsRedeemed,
        total,
        status: 'pending',
        source: 'online',
        order_type: orderType,
        delivery_address: orderType === 'delivery' ? {
          street: address.street.trim(),
          number: address.number.trim(),
          neighborhood: address.neighborhood.trim(),
          complement: address.complement?.trim() || null,
          reference: address.reference?.trim() || null,
          zip_code: address.zip_code?.trim() || null,
          neighborhood_id: usingNeighborhoodSelect ? (selectedNeighborhoodId || null) : null,
        } : null,
        payment_method: paymentMethod || null,
        notes: notes.trim() || null,
      })

      if (orderError) throw orderError
      log('loja', 'pedido salvo com sucesso, montando mensagem do WhatsApp...')
      if (orderType === 'delivery') saveAddress(address)

      // Pedido confirmado -- não é mais "abandonado" (migration 042).
      // Best-effort: uma falha aqui não pode derrubar o pedido, que já
      // foi salvo com sucesso.
      supabase.rpc('mark_cart_draft_recovered', {
        p_establishment_id: establishment.id,
        p_customer_phone: customerPhone.trim(),
      }).then(({ error }) => {
        if (error) logError('loja', 'erro ao marcar carrinho como recuperado', error)
      })

      // Salva o perfil (nome + telefone) e, se foi um endereço novo, o
      // endereço com o rótulo — vinculado ao telefone, então funciona
      // mesmo trocando de aparelho depois. Uma falha aqui não pode
      // derrubar o pedido, que já foi salvo com sucesso — por isso tem
      // try/catch próprio, separado do catch geral lá embaixo.
      try {
        await supabase.rpc('upsert_customer_profile', {
          p_establishment_id: establishment.id,
          p_phone: customerPhone.trim(),
          p_name: customerName.trim(),
          p_birth_date: birthDate || null,
        })

        if (orderType === 'delivery' && addressMode === 'new') {
          const { data: newAddressId } = await supabase.rpc('upsert_customer_address', {
            p_establishment_id: establishment.id,
            p_phone: customerPhone.trim(),
            p_label: addressLabel.trim() || 'Principal',
            p_street: address.street.trim(),
            p_number: address.number.trim(),
            p_neighborhood: address.neighborhood.trim(),
            p_complement: address.complement?.trim() || null,
            p_reference: address.reference?.trim() || null,
            p_zip_code: address.zip_code?.trim() || null,
          })
          if (newAddressId) {
            const savedAddr: CustomerAddress = {
              id: newAddressId as string,
              label: addressLabel.trim() || 'Principal',
              street: address.street.trim(),
              number: address.number.trim(),
              neighborhood: address.neighborhood.trim(),
              complement: address.complement?.trim() || null,
              reference: address.reference?.trim() || null,
              zip_code: address.zip_code?.trim() || null,
            }
            setCustomerProfile(prev => prev
              ? { ...prev, addresses: [savedAddr, ...prev.addresses.filter(a => a.id !== savedAddr.id)] }
              : { customer_id: '', name: customerName.trim(), loyalty_points_balance: 0, addresses: [savedAddr] })
          }
        }
      } catch (profileErr) {
        logError('loja', 'erro ao salvar perfil/endereço do cliente', profileErr)
      }

      // Pix automático: em vez de montar a mensagem do WhatsApp, gera a
      // cobrança no Mercado Pago e mostra o QR — a confirmação acontece
      // sozinha (webhook), sem o cliente precisar fazer mais nada.
      if (isMpAutomatic) {
        // Salva a referência do pedido ANTES de tentar gerar o Pix — se a
        // geração falhar, o cliente ainda assim tem como achar esse
        // pedido depois (link de acompanhamento, "Meus Pedidos"), em vez
        // de ficar com um pedido órfão que só existe no banco.
        saveCustomer({ name: customerName.trim(), phone: customerPhone.trim() })
        setLastOrderId(orderId)
        saveLastOrder(establishment.id, orderId)

        const created = await tryCreateMercadoPagoPayment(orderId, total)
        if (created) {
          setCart([])
          setShowCustomerModal(false)
          setCustomerName('')
          setCustomerPhone('')
          setNotes('')
          setPaymentMethod('')
          setSelectedNeighborhoodId('')
          setSelectedAddressId('')
          setAddressLabel('')
          setAddressMode('new')
          setShowCart(false)
          removeCoupon()
          removeReward()
        }
        // Se falhou, `mpCheckoutFailure` já foi setado dentro da função —
        // o modal de retry cuida do resto, sem fechar o carrinho/form.
        setSaving(false)
        return
      }

      let message = `🛵 *Novo Pedido - ${establishment.name}*\n\n`
      message += `👤 *Cliente:* ${customerName.trim()}\n`
      message += `📱 *Telefone:* ${customerPhone.trim()}\n`
      message += orderType === 'delivery' ? `🛵 *Entrega*\n` : `🏪 *Retirada no local*\n`
      if (orderType === 'delivery') {
        message += `📍 *Endereço:* ${address.street.trim()}, ${address.number.trim()}`
        if (address.complement?.trim()) message += ` - ${address.complement.trim()}`
        message += ` - ${address.neighborhood.trim()}`
        if (address.zip_code?.trim()) message += `\n   CEP: ${address.zip_code.trim()}`
        if (address.reference?.trim()) message += `\n   Referência: ${address.reference.trim()}`
        message += `\n`
      }
      message += `\n📋 *Itens do Pedido:*\n`

      cart.forEach((item, index) => {
        message += `\n${index + 1}. *${item.product.name}*`
        if (item.variations.length > 0) {
          item.variations.forEach(v => {
            message += `\n   - ${v.group_name}: ${v.option_name}`
            if (v.price_delta > 0) message += ` (+R$ ${v.price_delta.toFixed(2)})`
          })
        }
        message += `\n   Qtd: ${item.quantity} x R$ ${item.unit_price.toFixed(2)}`
        message += ` = R$ ${item.total_price.toFixed(2)}`
      })

      if (isFreeShippingCoupon && deliveryFee > 0) {
        message += `\n\n🚚 *Frete grátis* (cupom ${appliedCoupon?.code})`
      } else if (isFreeShippingReward && deliveryFee > 0) {
        message += `\n\n🚚 *Frete grátis* (recompensa: ${appliedReward?.name})`
      } else if (effectiveDeliveryFee > 0) {
        message += `\n\n🛵 *Taxa de entrega:* R$ ${effectiveDeliveryFee.toFixed(2)}`
      }
      if (appliedCoupon && (discountAmount > 0 || isFreeShippingCoupon) && !isFreeShippingCoupon) {
        message += `\n🏷️ *Cupom ${appliedCoupon.code}:* -R$ ${discountAmount.toFixed(2)}`
      } else if (appliedReward && (discountAmount > 0 || isFreeShippingReward) && !isFreeShippingReward) {
        message += `\n🎁 *Recompensa (${appliedReward.name}):* -R$ ${discountAmount.toFixed(2)}`
      } else if (isBirthdayDiscountActive) {
        message += `\n🎉 *Desconto de aniversário (${birthdayDiscountPercent}%):* -R$ ${discountAmount.toFixed(2)}`
      }
      if (notes.trim()) {
        message += `\n\n📝 *Observações:* ${notes.trim()}`
      }
      if (paymentMethod) {
        message += `\n💳 *Pagamento:* ${paymentMethodLabel(paymentMethod)}`
      }

      message += `\n\n💰 *Total: R$ ${total.toFixed(2)}*`

      // Link de acompanhamento também vai na própria mensagem do WhatsApp
      // — assim ele sobrevive mesmo se o cliente fechar a aba do cardápio
      // (o único outro lugar onde ele aparece é um banner em memória, que
      // se perde ao recarregar a página).
      const trackingUrl = `${window.location.origin}/pedido/${orderId}`
      message += `\n\n📍 *Acompanhe seu pedido:*\n${trackingUrl}`

      const encodedMessage = encodeURIComponent(message)
      const whatsappUrl = `https://wa.me/${toWhatsAppNumber(establishment.whatsapp_number)}?text=${encodedMessage}`

      log('loja', 'abrindo WhatsApp', { whatsappNumber: establishment.whatsapp_number })
      if (whatsappWindow) {
        whatsappWindow.location.href = whatsappUrl
      } else {
        // Mesmo abrindo em branco de forma síncrona, algum bloqueador
        // manual/extensão pode ter impedido. Não deixa o pedido "sumir"
        // silenciosamente — guarda a URL pra mostrar um botão de abrir
        // manualmente logo abaixo.
        log('loja', 'popup do WhatsApp bloqueado mesmo com abertura síncrona')
        setBlockedWhatsAppUrl(whatsappUrl)
      }
      setLastOrderId(orderId)
      saveLastOrder(establishment.id, orderId)
      saveCustomer({ name: customerName.trim(), phone: customerPhone.trim() })

      setCart([])
      setShowCustomerModal(false)
      setCustomerName('')
      setCustomerPhone('')
      setNotes('')
      setPaymentMethod('')
      setSelectedNeighborhoodId('')
      setSelectedAddressId('')
      setAddressLabel('')
      setAddressMode('new')
      setShowCart(false)
      removeCoupon()
      removeReward()
    } catch (err: any) {
      logError('loja', 'erro ao enviar pedido', err)
      logCritical('loja:enviar-pedido', err.message, err, establishment.id)
      whatsappWindow?.close() // fecha a aba em branco — o pedido não foi salvo
      alert('Erro ao enviar pedido: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // Pedido de mesa (migration 039) — separado de handleSendOrder de
  // propósito: aquela função está profundamente acoplada a
  // WhatsApp/Mercado Pago/endereço, que não existem aqui. Diferença
  // central de UX: não fecha pra uma tela de "pedido enviado"
  // definitiva — o cliente continua na mesma mesa e pode pedir de novo,
  // então só o carrinho é limpo e um toast confirma o envio.
  const handleAddOrderToTable = async () => {
    if (!customerName.trim() || !tableIdParam) return
    if (website.trim()) {
      log('loja', 'pedido de mesa bloqueado (honeypot preenchido)')
      setCart([])
      return
    }
    if (Date.now() - formOpenedAt < 1500) {
      log('loja', 'pedido de mesa bloqueado (submissão rápida demais)')
      return
    }

    setSaving(true)
    log('loja', 'adicionando pedido à comanda da mesa...', { itens: cart.length, establishmentId: establishment.id })

    try {
      const supabase = createClient()
      const subtotal = cartSubtotal
      let finalDiscount = discountAmount
      let finalRewardId: string | null = null
      let finalPointsRedeemed = 0

      // Recheck de cupom/recompensa só faz sentido com telefone
      // informado (validate_coupon/validate_loyalty_redemption exigem
      // p_customer_phone) — mesmo motivo/lógica do handleSendOrder.
      if (customerPhone.trim() && appliedCoupon) {
        const { data: recheckData, error: recheckError } = await supabase.rpc('validate_coupon', {
          p_establishment_id: establishment.id,
          p_code: appliedCoupon.code,
          p_customer_phone: customerPhone.trim(),
        })
        if (recheckError) throw recheckError
        const recheckResult = recheckData?.[0]
        if (!recheckResult?.valid) {
          removeCoupon()
          alert(recheckResult?.message || 'Esse cupom não é mais válido. Removemos ele do pedido — confira o total e envie novamente.')
          return
        }
        finalDiscount = recheckResult.discount_type === 'percent'
          ? subtotal * (Number(recheckResult.discount_value) / 100)
          : recheckResult.discount_type === 'fixed'
            ? Math.min(Number(recheckResult.discount_value), subtotal)
            : 0
      } else if (customerPhone.trim() && appliedReward) {
        const { data: recheckData, error: recheckError } = await supabase.rpc('validate_loyalty_redemption', {
          p_establishment_id: establishment.id,
          p_reward_id: appliedReward.id,
          p_customer_phone: customerPhone.trim(),
        })
        if (recheckError) throw recheckError
        const recheckResult = recheckData?.[0]
        if (!recheckResult?.valid) {
          removeReward()
          alert(recheckResult?.message || 'Essa recompensa não está mais disponível. Removemos ela do pedido — confira o total e envie novamente.')
          return
        }
        finalDiscount = recheckResult.benefit_type === 'percent_discount'
          ? subtotal * (Number(recheckResult.benefit_value) / 100)
          : recheckResult.benefit_type === 'fixed_discount'
            ? Math.min(Number(recheckResult.benefit_value), subtotal)
            : 0
        finalRewardId = appliedReward.id
        finalPointsRedeemed = recheckResult.points_cost
      }

      // Re-resolve a comanda agora (não confia no tableTab.id obtido no
      // mount) — o garçom pode ter fechado a conta enquanto o cliente
      // montava o carrinho; a RPC abre uma nova sozinha se preciso.
      const { data: tabData, error: tabError } = await supabase.rpc('get_or_create_table_tab', {
        p_establishment_id: establishment.id,
        p_table_id: tableIdParam,
      })
      if (tabError || !tabData?.[0]?.tab_id) throw tabError || new Error('Mesa indisponível no momento.')
      const currentTabId = tabData[0].tab_id as string
      if (currentTabId !== tableTab?.id) setTableTab({ id: currentTabId, label: tabData[0].table_label })

      const total = Math.max(0, subtotal - finalDiscount)
      const orderId = crypto.randomUUID()

      const { error: orderError } = await supabase.from('orders').insert({
        id: orderId,
        establishment_id: establishment.id,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim() || '',
        items: cart.map(item => ({
          product_id: item.product.id,
          product_name: item.product.name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.total_price,
          image_url: item.product.image_url,
          variations: item.variations,
          combo_id: item.combo?.combo_id ?? null,
          combo_selections: item.combo?.selections,
        })),
        subtotal,
        shipping_fee: 0,
        discount: finalDiscount,
        coupon_code: appliedCoupon?.code || null,
        loyalty_reward_id: finalRewardId,
        loyalty_points_redeemed: finalPointsRedeemed,
        total,
        status: 'pending',
        source: 'mesa',
        order_type: 'mesa',
        delivery_address: null,
        payment_method: null,
        notes: notes.trim() || null,
        table_tab_id: currentTabId,
      })

      if (orderError) throw orderError
      log('loja', 'pedido de mesa salvo com sucesso')

      if (customerPhone.trim()) {
        try {
          await supabase.rpc('upsert_customer_profile', {
            p_establishment_id: establishment.id,
            p_phone: customerPhone.trim(),
            p_name: customerName.trim(),
            p_birth_date: birthDate || null,
          })
        } catch (profileErr) {
          logError('loja', 'erro ao salvar perfil do cliente (mesa)', profileErr)
        }
      }

      setCart([])
      setShowCustomerModal(false)
      setNotes('')
      removeCoupon()
      removeReward()
      // customerName/customerPhone permanecem preenchidos — o cliente
      // provavelmente vai pedir de novo na mesma sessão à mesa.
      setTableOrderToast(true)
      setTimeout(() => setTableOrderToast(false), 4000)
    } catch (err: any) {
      logError('loja', 'erro ao enviar pedido de mesa', err)
      logCritical('loja:pedido-mesa', err.message, err, establishment.id)
      alert('Erro ao enviar pedido: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const discountAmount = appliedCoupon
    ? appliedCoupon.discountType === 'percent'
      ? cartSubtotal * (appliedCoupon.discountValue / 100)
      : appliedCoupon.discountType === 'fixed'
        ? Math.min(appliedCoupon.discountValue, cartSubtotal)
        : 0 // free_shipping não desconta o subtotal, desconta o frete (effectiveDeliveryFee)
    : appliedReward
      ? appliedReward.benefitType === 'percent_discount'
        ? cartSubtotal * ((appliedReward.benefitValue || 0) / 100)
        : appliedReward.benefitType === 'fixed_discount'
          ? Math.min(appliedReward.benefitValue || 0, cartSubtotal)
          : 0 // free_shipping não desconta o subtotal, desconta o frete (effectiveDeliveryFee)
      : isBirthdayDiscountActive
        ? cartSubtotal * (birthdayDiscountPercent / 100)
        : 0
  const cartTotal = Math.max(0, cartSubtotal - discountAmount + effectiveDeliveryFee)
  const cartItemsCount = cart.reduce((sum, item) => sum + item.quantity, 0)

  // Quando a loja tem Pix automático (Mercado Pago) ativo, esconde a opção
  // de Pix manual pra não confundir o cliente com duas variantes — e
  // vice-versa, só mostra a automática se a loja realmente tiver conectado.
  // Abaixo do pedido mínimo, esconde a automática também: a comissão fixa
  // da plataforma ficaria igual/maior que o total e o Mercado Pago recusa
  // a cobrança (ver MERCADOPAGO_MIN_ORDER_TOTAL).
  const belowMpMinimum = cartTotal < MERCADOPAGO_MIN_ORDER_TOTAL
  const visiblePaymentMethods = PAYMENT_METHODS.filter((p) => {
    if (p.value === 'mercadopago_pix') return establishment.mercadopago_pix_enabled && !belowMpMinimum
    if (p.value === 'pix') return !establishment.mercadopago_pix_enabled
    return true
  })

  // Se o carrinho mudou (item removido, cupom aplicado etc.) e o total caiu
  // abaixo do mínimo enquanto "Pix automático" já estava selecionado, volta
  // pra "combinar pelo WhatsApp" em vez de deixar uma opção escondida
  // selecionada por baixo dos panos.
  useEffect(() => {
    if (paymentMethod === 'mercadopago_pix' && belowMpMinimum) {
      setPaymentMethod('')
    }
  }, [paymentMethod, belowMpMinimum])

  const canShowPixQr = paymentMethod === 'pix' && !!establishment.pix_key && !!establishment.pix_city && cartTotal > 0

  // Gera o QR do Pix na hora, com o valor exato do pedido — some
  // sozinho se o cliente trocar a forma de pagamento ou o total mudar.
  useEffect(() => {
    if (!canShowPixQr) {
      setPixQrDataUrl(null)
      return
    }
    let cancelled = false
    const payload = generatePixPayload({
      pixKey: establishment.pix_key!,
      merchantName: establishment.name,
      merchantCity: establishment.pix_city!,
      amount: cartTotal,
    })
    QRCode.toDataURL(payload, { width: 220, margin: 1 })
      .then((url) => { if (!cancelled) setPixQrDataUrl(url) })
      .catch((err) => logError('loja', 'erro ao gerar QR Code do Pix', err))
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canShowPixQr, cartTotal])

  const pixPayload = canShowPixQr
    ? generatePixPayload({ pixKey: establishment.pix_key!, merchantName: establishment.name, merchantCity: establishment.pix_city!, amount: cartTotal })
    : ''

  const handleCopyPixCode = () => {
    navigator.clipboard.writeText(pixPayload)
    setPixCopied(true)
    setTimeout(() => setPixCopied(false), 2000)
  }

  const filteredProducts = activeCategory === 'all'
    ? products
    : products.filter(p => p.category_id === activeCategory)

  // Sugestões no carrinho: só produtos que o próprio lojista marcou
  // como destaque, disponíveis e que o cliente ainda não colocou no
  // carrinho — nunca é uma "adivinhação" de afinidade.
  const featuredSuggestions = products
    .filter(p => p.is_featured && p.in_stock && !cart.some(item => item.product.id === p.id))
    .slice(0, 4)

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
  }

  return (
    <div className="min-h-screen bg-gray-50" style={themeStyle}>
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowEstablishmentProfile(true)}
              className="flex items-center gap-3 flex-1 min-w-0 text-left"
              aria-label="Ver perfil do estabelecimento"
            >
              {establishment.logo_url && (
                <div className="relative w-12 h-12 rounded-xl overflow-hidden flex-shrink-0">
                  <SmartImage
                    src={establishment.logo_url}
                    alt={establishment.name}
                    fill
                    sizes="48px"
                    className="object-cover"
                  />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h1 className="font-bold text-lg text-gray-900 truncate">{establishment.name}</h1>
                <div className="flex items-center gap-2 text-sm flex-wrap">
                  <span className={`flex items-center gap-1 ${
                    isEffectivelyOpen ? 'text-green-600' : 'text-red-500'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${
                      isEffectivelyOpen ? 'bg-green-500' : 'bg-red-500'
                    }`} />
                    {isEffectivelyOpen ? 'Aberto' : 'Fechado'}
                  </span>
                  {establishment.address && (
                    <span className="flex items-center gap-1 text-gray-400 truncate">
                      <MapPin size={12} />
                      {establishment.address}
                    </span>
                  )}
                </div>
              </div>
            </button>
            {/* Meus Pedidos */}
            <Link
              href={`/loja/${establishment.slug}/pedidos`}
              className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors flex-shrink-0"
              aria-label="Meus pedidos"
              title="Meus pedidos"
            >
              <ClipboardList size={22} className="text-gray-700" />
            </Link>
            {/* Cart Button */}
            <button
              onClick={() => setShowCart(true)}
              className="relative p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors flex-shrink-0"
              aria-label="Abrir carrinho"
            >
              <ShoppingCart size={22} className="text-gray-700" />
              {cartItemsCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                  {cartItemsCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Categories Scroll */}
        {(categories.length > 0 || combos.length > 0) && (
          <div className="border-t border-gray-100">
            <div className="max-w-2xl mx-auto px-4 py-2 overflow-x-auto">
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveCategory('all')}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                    activeCategory === 'all'
                      ? 'bg-primary-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Todos
                </button>
                {combos.length > 0 && (
                  <button
                    onClick={() => setActiveCategory('combos')}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                      activeCategory === 'combos'
                        ? 'bg-primary-500 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <Layers size={14} />
                    Combos
                  </button>
                )}
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                      activeCategory === cat.id
                        ? 'bg-primary-500 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Banner de mesa (migration 039) — sinaliza claramente que o
          pedido vai pra comanda da mesa, não pro WhatsApp/entrega. */}
      {isTableMode && (
        <div className="sticky top-[calc(4rem+1px)] z-20 bg-primary-500 text-white text-sm font-medium text-center py-2 px-4 flex items-center justify-center gap-2">
          <Table2 size={16} />
          {tableTab?.label}
        </div>
      )}

      {/* Toast temporário de pedido de mesa adicionado */}
      {tableOrderToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg animate-fade-in">
          Pedido enviado! Fica na conta da mesa.
        </div>
      )}

      {/* Perfil do Estabelecimento ("Sobre a loja") */}
      {showEstablishmentProfile && (
        <div className="fixed inset-0 z-50">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowEstablishmentProfile(false)} />
          <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-xl animate-slide-in flex flex-col overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 sticky top-0 bg-white z-10">
              <h2 className="text-lg font-semibold text-gray-900">Sobre a loja</h2>
              <button onClick={() => setShowEstablishmentProfile(false)} className="p-1 hover:bg-gray-100 rounded" aria-label="Fechar">
                <X size={20} />
              </button>
            </div>

            <div className="p-4 space-y-5">
              {/* Logo + nome + status */}
              <div className="flex items-center gap-4">
                {establishment.logo_url ? (
                  <div className="relative w-20 h-20 rounded-2xl overflow-hidden flex-shrink-0">
                    <SmartImage src={establishment.logo_url} alt={establishment.name} fill sizes="80px" className="object-cover" />
                  </div>
                ) : (
                  <Logo size={80} className="text-primary-500 flex-shrink-0" />
                )}
                <div className="min-w-0">
                  <h3 className="text-xl font-bold text-gray-900 truncate">{establishment.name}</h3>
                  <span className={`inline-flex items-center gap-1 text-sm mt-1 ${isEffectivelyOpen ? 'text-green-600' : 'text-red-500'}`}>
                    <span className={`w-2 h-2 rounded-full ${isEffectivelyOpen ? 'bg-green-500' : 'bg-red-500'}`} />
                    {isEffectivelyOpen ? 'Aberto agora' : 'Fechado agora'}
                  </span>
                </div>
              </div>

              {establishment.description && (
                <p className="text-sm text-gray-600">{establishment.description}</p>
              )}

              {/* Entrega/Retirada */}
              <div className="flex gap-2 flex-wrap">
                {offersDelivery && (
                  <span className="inline-flex items-center gap-1.5 text-sm bg-gray-100 text-gray-700 px-3 py-1.5 rounded-full">
                    <Bike size={14} /> Entrega
                  </span>
                )}
                {offersPickup && (
                  <span className="inline-flex items-center gap-1.5 text-sm bg-gray-100 text-gray-700 px-3 py-1.5 rounded-full">
                    <Store size={14} /> Retirada no local
                  </span>
                )}
              </div>

              {/* Endereço */}
              {establishment.address && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(establishment.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 text-sm text-gray-700 hover:text-primary-600"
                >
                  <MapPin size={18} className="flex-shrink-0 mt-0.5 text-gray-400" />
                  <span>
                    {establishment.address}
                    <br />
                    <span className="text-xs text-primary-600">Ver no mapa</span>
                  </span>
                </a>
              )}

              {/* WhatsApp */}
              <a
                href={`https://wa.me/${toWhatsAppNumber(establishment.whatsapp_number)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 text-sm text-gray-700 hover:text-primary-600"
              >
                <Send size={18} className="flex-shrink-0 text-gray-400" />
                <span>{formatPhoneNumber(establishment.whatsapp_number)}</span>
              </a>

              {/* Instagram */}
              {establishment.instagram_url && (
                <a
                  href={establishment.instagram_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 text-sm text-gray-700 hover:text-primary-600"
                >
                  <Instagram size={18} className="flex-shrink-0 text-gray-400" />
                  <span>Instagram</span>
                </a>
              )}

              {/* Horário de funcionamento — semana inteira */}
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-1.5">
                  <Clock size={16} className="text-gray-400" /> Horário de funcionamento
                </h4>
                <div className="space-y-1">
                  {getWeeklyHours(establishment.opening_hours).map(day => (
                    <div key={day.key} className={`flex justify-between text-sm ${day.isToday ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
                      <span>{day.label}</span>
                      <span>{day.hours ? `${day.hours.open} - ${day.hours.close}` : 'Fechado'}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Meus pontos */}
              {loyaltySettings?.is_active && (
                <div className="bg-primary-50 rounded-xl p-4">
                  <h4 className="text-sm font-semibold text-primary-700 mb-2 flex items-center gap-1.5">
                    <Gift size={16} /> Meus pontos
                  </h4>
                  {customerProfile ? (
                    <p className="text-sm text-primary-700">
                      Você tem <strong>{customerProfile.loyalty_points_balance}</strong> pontos nesta loja.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-primary-700">Informe seu telefone para ver seu saldo de pontos.</p>
                      <input
                        type="tel"
                        className="input-field text-sm py-1.5"
                        placeholder="(11) 99999-8888"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(formatPhoneNumber(e.target.value))}
                        onBlur={lookupCustomerProfile}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Products */}
      <main className="max-w-2xl mx-auto px-4 py-6 pb-32">
        {blockedWhatsAppUrl && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex items-center justify-between gap-3">
            <div>
              <p className="font-medium text-amber-800">Pedido salvo!</p>
              <p className="text-sm text-amber-600">
                Seu navegador bloqueou a abertura automática do WhatsApp — toque no botão para enviar.
              </p>
            </div>
            <a
              href={blockedWhatsAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setBlockedWhatsAppUrl(null)}
              className="btn-primary text-sm py-2 px-3 flex-shrink-0"
            >
              Abrir WhatsApp
            </a>
          </div>
        )}

        {lastOrderId && (
          <div className="bg-primary-50 border border-primary-200 rounded-lg p-4 mb-6 flex items-center justify-between gap-3">
            <div>
              <p className="font-medium text-primary-800">Pedido enviado!</p>
              <p className="text-sm text-primary-600">Acompanhe o status por aqui.</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Link href={`/pedido/${lastOrderId}`} className="btn-primary text-sm py-2 px-3">
                Acompanhar
              </Link>
              <button
                onClick={() => { setLastOrderId(null); clearSavedLastOrder(establishment.id) }}
                className="p-1 text-primary-600 hover:text-primary-800"
                aria-label="Fechar aviso"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        {!isEffectivelyOpen && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 text-center">
            <Clock size={24} className="text-amber-500 mx-auto mb-2" />
            <p className="font-medium text-amber-800">Loja fechada no momento</p>
            <p className="text-sm text-amber-600 mt-1">
              Você pode visualizar o cardápio, mas os pedidos estão desativados.
            </p>
          </div>
        )}

        {activeCategory === 'combos' ? (
          combos.length === 0 ? (
            <div className="text-center py-12">
              <Layers size={48} className="text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">Nenhum combo disponível no momento.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {combos.map(combo => {
                const disabled = !isEffectivelyOpen
                return (
                  <button
                    key={combo.id}
                    onClick={() => !disabled && setShowComboOrder(combo)}
                    disabled={disabled}
                    className="w-full text-left bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow disabled:opacity-60 disabled:cursor-not-allowed flex gap-4"
                  >
                    {combo.image_url && (
                      <div className="relative w-20 h-20 rounded-lg overflow-hidden flex-shrink-0">
                        <SmartImage src={combo.image_url} alt={combo.name} fill sizes="80px" className="object-cover" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-medium text-gray-900">{combo.name}</h3>
                        <span className="text-[10px] font-medium text-primary-700 bg-primary-100 px-1.5 py-0.5 rounded-full flex-shrink-0">
                          Combo
                        </span>
                      </div>
                      {combo.description && (
                        <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{combo.description}</p>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-lg font-bold text-primary-600">{formatCurrency(Number(combo.price))}</span>
                        {isEffectivelyOpen && (
                          <span className="text-sm text-primary-500 font-medium">Montar combo</span>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-12">
            <Store size={48} className="text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Nenhum produto disponível nesta categoria.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredProducts.map(product => {
              const disabled = !isEffectivelyOpen || !product.in_stock
              return (
                <button
                  key={product.id}
                  onClick={() => !disabled && addToCart(product)}
                  disabled={disabled}
                  className="w-full text-left bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow disabled:opacity-60 disabled:cursor-not-allowed flex gap-4"
                >
                  {product.image_url && (
                    <div className="relative w-20 h-20 rounded-lg overflow-hidden flex-shrink-0">
                      <SmartImage
                        src={product.image_url}
                        alt={product.name}
                        fill
                        sizes="80px"
                        className="object-cover"
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-medium text-gray-900">{product.name}</h3>
                      {product.is_bestseller && (
                        <span className="text-[10px] font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full flex-shrink-0">
                          🔥 Mais vendido
                        </span>
                      )}
                    </div>
                    {product.description && (
                      <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{product.description}</p>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-lg font-bold text-primary-600">
                        {formatCurrency(product.price)}
                      </span>
                      {!product.in_stock ? (
                        <span className="text-sm text-red-500 font-medium">Esgotado</span>
                      ) : isEffectivelyOpen && (
                        <span className="text-sm text-primary-500 font-medium">Adicionar</span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </main>

      {/* Cart Floating Button */}
      {cartItemsCount > 0 && isEffectivelyOpen && (
        <button
          onClick={() => setShowCart(true)}
          className="fixed bottom-4 left-4 right-4 max-w-2xl mx-auto z-20 btn-primary shadow-lg py-3"
        >
          <ShoppingCart size={20} />
          <span>Ver Carrinho ({cartItemsCount} itens)</span>
          <span className="font-bold">{formatCurrency(cartTotal)}</span>
        </button>
      )}

      {/* Cart Sidebar */}
      {showCart && (
        <div className="fixed inset-0 z-50">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowCart(false)} />
          <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-xl animate-slide-in flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Seu Carrinho</h2>
              <button onClick={() => setShowCart(false)} className="p-1 hover:bg-gray-100 rounded" aria-label="Fechar carrinho">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {cart.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <ShoppingCart size={40} className="mx-auto mb-2" />
                  <p>Carrinho vazio</p>
                </div>
              ) : (
                cart.map((item, index) => (
                  <div key={index} className="flex gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900">{item.product.name}</p>
                      {item.variations.map((v, i) => (
                        <p key={i} className="text-xs text-gray-500">{v.group_name}: {v.option_name}</p>
                      ))}
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          onClick={() => updateQuantity(index, -1)}
                          className="w-7 h-7 bg-gray-200 rounded flex items-center justify-center hover:bg-gray-300"
                          aria-label="Diminuir quantidade"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="text-sm font-medium w-6 text-center">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(index, 1)}
                          className="w-7 h-7 bg-gray-200 rounded flex items-center justify-center hover:bg-gray-300"
                          aria-label="Aumentar quantidade"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-medium">{formatCurrency(item.total_price)}</p>
                      <button
                        onClick={() => removeFromCart(index)}
                        className="text-red-400 hover:text-red-600 text-sm mt-1"
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {cart.length > 0 && featuredSuggestions.length > 0 && (
              <div className="px-4 pb-3 border-t border-gray-100 pt-3">
                <p className="text-xs font-medium text-gray-500 mb-2">Que tal adicionar também?</p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {featuredSuggestions.map((product) => (
                    <button
                      key={product.id}
                      onClick={() => addToCart(product)}
                      className="flex-shrink-0 w-28 text-left bg-gray-50 hover:bg-gray-100 rounded-lg p-2 border border-gray-100 transition-colors"
                    >
                      {product.image_url && (
                        <div className="relative w-full h-16 rounded-md overflow-hidden mb-1">
                          <SmartImage src={product.image_url} alt={product.name} fill sizes="112px" className="object-cover" />
                        </div>
                      )}
                      <p className="text-xs font-medium text-gray-900 truncate">{product.name}</p>
                      <p className="text-xs text-primary-600 font-bold">{formatCurrency(product.price)}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!isTableMode && cart.length > 0 && orderType === 'delivery' && freeShippingThreshold > 0 && (
              <div className="px-4 pb-3">
                {qualifiesForFreeShippingThreshold ? (
                  <p className="text-sm text-primary-600 font-medium flex items-center gap-1">🎉 Você ganhou frete grátis!</p>
                ) : (
                  <div>
                    <p className="text-xs text-gray-600 mb-1">
                      Faltam <strong>{formatCurrency(Math.max(0, freeShippingThreshold - cartSubtotal))}</strong> para frete grátis!
                    </p>
                    <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary-500 transition-all"
                        style={{ width: `${Math.min(100, (cartSubtotal / freeShippingThreshold) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {cart.length > 0 && establishment.has_completo_access !== false && (
              <div className="p-4 border-t border-gray-200 space-y-2">
                {/* Cupom */}
                {appliedCoupon ? (
                  <div className="flex items-center justify-between bg-primary-50 text-primary-700 text-sm px-3 py-2 rounded-lg">
                    <span>Cupom <strong>{appliedCoupon.code}</strong> aplicado</span>
                    <button onClick={removeCoupon} className="text-primary-500 hover:text-primary-700" aria-label="Remover cupom">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="input-field text-sm py-1.5 uppercase"
                      placeholder="Cupom de desconto"
                      value={couponInput}
                      onChange={(e) => { setCouponInput(e.target.value.toUpperCase()); setCouponError(null) }}
                    />
                    <button
                      onClick={handleApplyCoupon}
                      disabled={couponLoading || !couponInput.trim()}
                      className="btn-secondary text-sm py-1.5 px-3 flex-shrink-0"
                    >
                      {couponLoading ? <Loader2 size={14} className="animate-spin" /> : 'Aplicar'}
                    </button>
                  </div>
                )}
                {couponError && <p className="text-xs text-red-500">{couponError}</p>}

                {/* Resgate de pontos — exclusivo com cupom */}
                {!appliedCoupon && loyaltySettings?.is_active && loyaltyRewards.length > 0 && (
                  <div>
                    {appliedReward ? (
                      <div className="flex items-center justify-between bg-primary-50 text-primary-700 text-sm px-3 py-2 rounded-lg">
                        <span>Recompensa <strong>{appliedReward.name}</strong> (-{appliedReward.pointsCost} pontos)</span>
                        <button onClick={removeReward} className="text-primary-500 hover:text-primary-700" aria-label="Remover recompensa">
                          <X size={14} />
                        </button>
                      </div>
                    ) : !customerPhone.trim() ? (
                      <input
                        type="tel"
                        className="input-field text-sm py-1.5"
                        placeholder="Seu telefone p/ ver seus pontos"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(formatPhoneNumber(e.target.value))}
                        onBlur={lookupCustomerProfile}
                      />
                    ) : (
                      <div className="space-y-1.5">
                        <p className="text-xs text-gray-500">
                          Você tem <strong>{customerProfile?.loyalty_points_balance ?? 0}</strong> pontos
                        </p>
                        <div className="flex gap-2">
                          <select
                            className="input-field text-sm py-1.5"
                            value={selectedRewardId}
                            onChange={(e) => setSelectedRewardId(e.target.value)}
                          >
                            <option value="">Escolher recompensa...</option>
                            {loyaltyRewards.map(r => (
                              <option key={r.id} value={r.id} disabled={(customerProfile?.loyalty_points_balance ?? 0) < r.points_cost}>
                                {r.name} — {r.points_cost} pontos
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleApplyReward(selectedRewardId)}
                            disabled={rewardLoading || !selectedRewardId}
                            className="btn-secondary text-sm py-1.5 px-3 flex-shrink-0"
                          >
                            {rewardLoading ? <Loader2 size={14} className="animate-spin" /> : 'Resgatar'}
                          </button>
                        </div>
                      </div>
                    )}
                    {rewardError && <p className="text-xs text-red-500 mt-1">{rewardError}</p>}
                  </div>
                )}

                <div className="flex justify-between text-sm text-gray-600">
                  <span>Subtotal</span>
                  <span>{formatCurrency(cartSubtotal)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-sm text-primary-600">
                    <span>
                      Desconto
                      {appliedReward ? ` (${appliedReward.name})` : isBirthdayDiscountActive && !appliedCoupon ? ' (Aniversário)' : ''}
                    </span>
                    <span>-{formatCurrency(discountAmount)}</span>
                  </div>
                )}
                {deliveryFee > 0 && (isFreeShippingCoupon || isFreeShippingReward) && (
                  <div className="flex justify-between text-sm text-primary-600">
                    <span>Taxa de entrega</span>
                    <span>Grátis</span>
                  </div>
                )}
                {effectiveDeliveryFee > 0 && (
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Taxa de entrega</span>
                    <span>{formatCurrency(effectiveDeliveryFee)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold pt-1">
                  <span>Total</span>
                  <span className="text-primary-600">{formatCurrency(cartTotal)}</span>
                </div>
                <button
                  onClick={() => { setShowCart(false); setAttemptedSubmit(false); setShowCustomerModal(true) }}
                  className="btn-primary w-full py-3 mt-2"
                >
                  <Send size={18} />
                  Enviar Pedido
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mercado Pago Pix Checkout */}
      {mpCheckout && (
        <MercadoPagoPixCheckout
          orderId={mpCheckout.orderId}
          amount={mpCheckout.amount}
          qrCode={mpCheckout.qrCode}
          qrCodeBase64={mpCheckout.qrCodeBase64}
          trackingUrl={`${window.location.origin}/pedido/${mpCheckout.orderId}`}
          onClose={() => setMpCheckout(null)}
        />
      )}

      {/* Falha ao gerar o Pix — pedido já foi salvo, oferece tentar de
          novo pro MESMO pedido em vez de deixar o cliente sem saída. */}
      {mpCheckoutFailure && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-6 text-center animate-fade-in">
            <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <AlertCircle size={26} className="text-amber-600" />
            </div>
            <p className="font-semibold text-gray-900 mb-1">Não deu pra gerar o Pix agora</p>
            <p className="text-sm text-gray-600 mb-1">
              Seu pedido já foi salvo — {formatCurrency(mpCheckoutFailure.amount)}. É só tentar de novo.
            </p>
            <p className="text-xs text-gray-400 mb-4">{mpCheckoutFailure.message}</p>
            <button
              onClick={() => {
                setMpRetrying(true)
                tryCreateMercadoPagoPayment(mpCheckoutFailure.orderId, mpCheckoutFailure.amount).finally(() => setMpRetrying(false))
              }}
              disabled={mpRetrying}
              className="btn-primary w-full mb-2"
            >
              {mpRetrying ? <Loader2 size={18} className="animate-spin" /> : 'Tentar novamente'}
            </button>
            <a
              href={`/pedido/${mpCheckoutFailure.orderId}`}
              className="text-xs text-gray-500 underline"
            >
              Ou acompanhe esse pedido por aqui
            </a>
          </div>
        </div>
      )}

      {/* Pizza Order Modal */}
      {showPizzaOrder && showPizzaOrder.pizza_flavor_id && (
        <PizzaOrderModal
          productName={showPizzaOrder.name}
          productImageUrl={showPizzaOrder.image_url}
          pizzaFlavorId={showPizzaOrder.pizza_flavor_id}
          establishmentId={showPizzaOrder.establishment_id}
          onConfirm={(result) => addPizzaItemToCart(showPizzaOrder, result)}
          onClose={() => setShowPizzaOrder(null)}
        />
      )}

      {/* Variations Modal */}
      {showVariations && (
        <VariationsModal
          product={showVariations}
          onConfirm={(variations) => addToCartDirect(showVariations, variations)}
          onClose={() => setShowVariations(null)}
        />
      )}

      {/* Combo Modal (migration 040) */}
      {showComboOrder && (
        <ComboOrderModal
          comboId={showComboOrder.id}
          comboName={showComboOrder.name}
          comboImageUrl={showComboOrder.image_url}
          comboPrice={showComboOrder.price}
          establishmentId={establishment.id}
          onConfirm={(result) => addComboItemToCart(showComboOrder, result)}
          onClose={() => setShowComboOrder(null)}
        />
      )}

      {/* Customer Info Modal */}
      {showCustomerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowCustomerModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-fade-in p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              {isTableMode ? `Pedido para a ${tableTab?.label}` : 'Finalizar Pedido'}
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              {isTableMode ? 'Informe seu nome — o pedido fica na conta da mesa.' : 'Informe seus dados para enviar o pedido.'}
            </p>

            <div className="space-y-4">
              {/* Honeypot - invisível para humanos */}
              <div className="absolute -left-[9999px]" aria-hidden="true">
                <label htmlFor="website">Não preencha este campo</label>
                <input
                  id="website"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input
                  type="text"
                  className={`input-field ${fieldError('name') ? 'border-red-400 focus:border-red-500' : ''}`}
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Seu nome"
                  required
                />
                {fieldError('name') && (
                  <p className="text-xs text-red-600 mt-1">Informe seu nome para continuar.</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isTableMode ? 'Telefone (opcional)' : 'Telefone *'}
                  {profileLoading && <Loader2 size={12} className="inline-block animate-spin ml-2 text-gray-400" />}
                </label>
                <input
                  type="tel"
                  className={`input-field ${fieldError('phone') ? 'border-red-400 focus:border-red-500' : ''}`}
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(formatPhoneNumber(e.target.value))}
                  onBlur={lookupCustomerProfile}
                  placeholder="(11) 99999-8888"
                  required={!isTableMode}
                />
                {customerProfile && (
                  <p className="text-xs text-primary-600 mt-1">
                    Olá de novo, {customerProfile.name.split(' ')[0]}! Já preenchemos seus dados.
                  </p>
                )}
                {isTableMode && !customerPhone.trim() && (
                  <p className="text-xs text-gray-400 mt-1">Informe o telefone pra usar cupom ou pontos de fidelidade.</p>
                )}
                {fieldError('phone') && (
                  <p className="text-xs text-red-600 mt-1">Informe seu telefone para continuar.</p>
                )}
              </div>

              {isBirthdayDiscountActive && (
                <div className="bg-primary-50 border border-primary-200 rounded-lg p-3 text-sm text-primary-700 flex items-center gap-2">
                  🎉
                  <span>
                    Feliz aniversário{customerName.trim() ? `, ${customerName.trim().split(' ')[0]}` : ''}! Você ganhou{' '}
                    <strong>{birthdayDiscountPercent}% OFF</strong> nesse pedido.
                  </span>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data de nascimento (opcional)</label>
                <input
                  type="date"
                  className="input-field"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  max={new Date().toISOString().slice(0, 10)}
                />
                <p className="text-xs text-gray-500 mt-1">
                  {establishment.birthday_discount_percent
                    ? `Ganhe ${establishment.birthday_discount_percent}% OFF automaticamente no dia do seu aniversário.`
                    : 'Só usamos pra te desejar feliz aniversário — fica salvo no seu perfil.'}
                </p>
              </div>

              {!isTableMode && offersDelivery && offersPickup && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Como você quer receber?</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setOrderType('delivery')}
                      className={`flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 text-sm font-medium transition-colors ${
                        orderType === 'delivery' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <Bike size={16} />
                      Entrega
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrderType('pickup')}
                      className={`flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 text-sm font-medium transition-colors ${
                        orderType === 'pickup' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <Package size={16} />
                      Retirar no local
                    </button>
                  </div>
                </div>
              )}

              {!isTableMode && (orderType === 'delivery' ? (
                <div className="space-y-3">
                  {addressMode === 'confirm' && selectedSavedAddress ? (
                    <div className="bg-gray-50 rounded-lg p-3 flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2 min-w-0">
                        <MapPin size={16} className="text-primary-600 flex-shrink-0 mt-0.5" />
                        <div className="text-sm min-w-0">
                          <p className="font-medium text-gray-900">{selectedSavedAddress.label}</p>
                          <p className="text-gray-600 truncate">
                            {selectedSavedAddress.street}, {selectedSavedAddress.number}
                            {selectedSavedAddress.complement ? ` - ${selectedSavedAddress.complement}` : ''}
                            {' — '}{selectedSavedAddress.neighborhood}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAddressMode('select')}
                        className="text-xs text-primary-600 hover:underline flex-shrink-0"
                      >
                        Trocar
                      </button>
                    </div>
                  ) : addressMode === 'select' && customerProfile && customerProfile.addresses.length > 0 ? (
                    <div className="space-y-2">
                      {customerProfile.addresses.map((addr) => (
                        <div key={addr.id} className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => selectSavedAddress(addr)}
                            className={`flex-1 text-left p-3 rounded-lg border-2 transition-colors ${
                              selectedAddressId === addr.id ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <p className="font-medium text-sm text-gray-900">{addr.label}</p>
                            <p className="text-xs text-gray-500 truncate">{addr.street}, {addr.number} — {addr.neighborhood}</p>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSavedAddress(addr.id)}
                            className="p-2 text-red-400 hover:bg-red-50 rounded-lg flex-shrink-0"
                            aria-label="Remover endereço salvo"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setAddressMode('new')
                          setSelectedAddressId('')
                          setAddressLabel('')
                          setAddress({ street: '', number: '', neighborhood: '', complement: '', reference: '', zip_code: '' })
                        }}
                        className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-primary-400 hover:text-primary-600 transition-colors"
                      >
                        <PlusCircle size={16} />
                        Cadastrar novo endereço
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3 bg-gray-50 rounded-lg p-3">
                      {customerProfile && customerProfile.addresses.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setAddressMode('select')}
                          className="text-xs text-primary-600 hover:underline"
                        >
                          ← Usar um endereço salvo
                        </button>
                      )}
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Nome do endereço (opcional)</label>
                        <input
                          type="text"
                          className="input-field text-sm"
                          value={addressLabel}
                          onChange={(e) => setAddressLabel(e.target.value)}
                          placeholder="Ex: Casa, Trabalho..."
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">CEP</label>
                        <div className="relative max-w-[160px]">
                          <input
                            type="text"
                            inputMode="numeric"
                            className="input-field text-sm"
                            value={address.zip_code}
                            onChange={(e) => setAddress({ ...address, zip_code: formatCep(e.target.value) })}
                            onBlur={handleCepBlur}
                            placeholder="00000-000"
                          />
                          {cepLoading && (
                            <Loader2 size={14} className="animate-spin text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" />
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">Preenche rua e bairro automaticamente (opcional).</p>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-gray-700 mb-1">Rua *</label>
                          <input
                            type="text"
                            className={`input-field text-sm ${fieldError('street') ? 'border-red-400 focus:border-red-500' : ''}`}
                            value={address.street}
                            onChange={(e) => setAddress({ ...address, street: e.target.value })}
                            placeholder="Rua/Av."
                            required
                          />
                          {fieldError('street') && <p className="text-xs text-red-600 mt-1">Obrigatório.</p>}
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Número *</label>
                          <input
                            type="text"
                            className={`input-field text-sm ${fieldError('number') ? 'border-red-400 focus:border-red-500' : ''}`}
                            value={address.number}
                            onChange={(e) => setAddress({ ...address, number: e.target.value })}
                            placeholder="Nº"
                            required
                          />
                          {fieldError('number') && <p className="text-xs text-red-600 mt-1">Obrigatório.</p>}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Bairro *</label>
                        {usingNeighborhoodSelect ? (
                          <select
                            className={`input-field text-sm ${fieldError('neighborhood') ? 'border-red-400 focus:border-red-500' : ''}`}
                            value={selectedNeighborhoodId}
                            onChange={(e) => {
                              const id = e.target.value
                              setSelectedNeighborhoodId(id)
                              const n = neighborhoods.find(n => n.id === id)
                              if (n) setAddress({ ...address, neighborhood: n.name })
                            }}
                            required
                          >
                            <option value="">Selecione o bairro</option>
                            {neighborhoods.map((n) => (
                              <option key={n.id} value={n.id}>
                                {n.name} — {formatCurrency(Number(n.fee))}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            className={`input-field text-sm ${fieldError('neighborhood') ? 'border-red-400 focus:border-red-500' : ''}`}
                            value={address.neighborhood}
                            onChange={(e) => setAddress({ ...address, neighborhood: e.target.value })}
                            placeholder="Bairro"
                            required
                          />
                        )}
                        {fieldError('neighborhood') && <p className="text-xs text-red-600 mt-1">Obrigatório — selecione ou digite o bairro.</p>}
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Complemento</label>
                        <input
                          type="text"
                          className="input-field text-sm"
                          value={address.complement}
                          onChange={(e) => setAddress({ ...address, complement: e.target.value })}
                          placeholder="Apto, bloco, casa..."
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Ponto de referência</label>
                        <input
                          type="text"
                          className="input-field text-sm"
                          value={address.reference}
                          onChange={(e) => setAddress({ ...address, reference: e.target.value })}
                          placeholder="Ex: perto do mercado X"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                establishment.address && (
                  <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600 flex items-start gap-2">
                    <MapPin size={16} className="flex-shrink-0 mt-0.5 text-gray-400" />
                    <span>Retire em: {establishment.address}</span>
                  </div>
                )
              ))}

              {!isTableMode && (
              <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Forma de pagamento (opcional)</label>
                <select
                  className="input-field"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  <option value="">Combinar pelo WhatsApp</option>
                  {visiblePaymentMethods.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  {paymentMethod === 'mercadopago_pix'
                    ? 'Confirmação automática — assim que você pagar, a loja já recebe o pedido liberado pra preparar.'
                    : 'A loja confirma com você pelo WhatsApp — isso só adianta a informação.'}
                </p>
                {establishment.mercadopago_pix_enabled && belowMpMinimum && (
                  <p className="text-xs text-gray-500 mt-1">
                    Pix automático disponível a partir de {formatCurrency(MERCADOPAGO_MIN_ORDER_TOTAL)} em pedidos.
                  </p>
                )}
              </div>

              {paymentMethod === 'pix' && (
                canShowPixQr ? (
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <p className="text-sm font-medium text-gray-700 mb-3">Pague {formatCurrency(cartTotal)} com Pix</p>
                    {pixQrDataUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={pixQrDataUrl} alt="QR Code Pix" className="mx-auto rounded-lg" width={200} height={200} />
                    )}
                    <button type="button" onClick={handleCopyPixCode} className="btn-secondary text-sm mt-3 w-full">
                      <Copy size={14} />
                      {pixCopied ? 'Código copiado!' : 'Copiar código Pix'}
                    </button>
                    <p className="text-xs text-gray-500 mt-2">
                      Depois de pagar, envie o pedido pelo WhatsApp normalmente para a loja confirmar.
                    </p>
                  </div>
                ) : (!establishment.pix_key || !establishment.pix_city) && (
                  <p className="text-xs text-gray-500 -mt-2">
                    Essa loja ainda não configurou a chave Pix — combine o pagamento pelo WhatsApp.
                  </p>
                )
              )}

              {paymentMethod === 'mercadopago_pix' && (
                <p className="text-xs text-gray-500 -mt-2 bg-gray-50 rounded-lg p-3">
                  Ao enviar, vamos gerar um QR Code Pix de {formatCurrency(cartTotal)} pra você pagar na
                  hora — a loja recebe direto na conta dela e o pedido é liberado sozinho assim que o
                  pagamento cair.
                </p>
              )}
              </>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                <textarea
                  className="input-field"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex: sem cebola, troco para R$ 50..."
                />
              </div>
              <p className="text-xs text-gray-500">
                {isTableMode ? 'O pedido entra direto na comanda da mesa — o garçom acompanha pelo painel.' : 'O pedido será enviado via WhatsApp para o estabelecimento.'}
              </p>

              <div className="border-t border-gray-200 pt-4">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Subtotal</span>
                  <span>{formatCurrency(cartSubtotal)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-sm text-primary-600 mt-1">
                    <span>Desconto ({appliedCoupon?.code || appliedReward?.name || 'Aniversário'})</span>
                    <span>-{formatCurrency(discountAmount)}</span>
                  </div>
                )}
                {deliveryFee > 0 && (isFreeShippingCoupon || isFreeShippingReward) && (
                  <div className="flex justify-between text-sm text-primary-600 mt-1">
                    <span>Taxa de entrega</span>
                    <span>Grátis</span>
                  </div>
                )}
                {effectiveDeliveryFee > 0 && (
                  <div className="flex justify-between text-sm text-gray-600 mt-1">
                    <span>Taxa de entrega</span>
                    <span>{formatCurrency(effectiveDeliveryFee)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-lg mt-2 mb-4">
                  <span>Total</span>
                  <span className="text-primary-600">{formatCurrency(cartTotal)}</span>
                </div>

                {attemptedSubmit && missingFields.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3 text-sm text-red-700 flex items-start gap-2">
                    <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                    <span>
                      Falta preencher: <strong>{missingFields.map((f) => f.label).join(', ')}</strong>.
                    </span>
                  </div>
                )}

                <div className="flex gap-3">
                  <button onClick={() => setShowCustomerModal(false)} className="btn-secondary flex-1">
                    Cancelar
                  </button>
                  <button
                    onClick={handleSubmitClick}
                    className="btn-primary flex-1"
                    disabled={saving}
                  >
                    {saving ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <>
                        <Send size={18} />
                        {isTableMode ? 'Adicionar à comanda' : 'Enviar Pedido'}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Variations Modal Component
function VariationsModal({
  product,
  onConfirm,
  onClose,
}: {
  product: PublicProduct
  onConfirm: (variations: CartItem<PublicProduct>['variations']) => void
  onClose: () => void
}) {
  const [groups, setGroups] = useState<(VariationGroup & { options: VariationOption[] })[]>([])
  const [selected, setSelected] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [attemptedConfirm, setAttemptedConfirm] = useState(false)

  useEffect(() => {
    loadVariations()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  const loadVariations = async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('variation_groups')
      .select('*, options:variation_options(*)')
      .eq('product_id', product.id)
      .order('display_order')

    if (data) {
      setGroups(data as any)
      const initial: Record<string, string[]> = {}
      data.forEach((g: any) => { initial[g.id] = [] })
      setSelected(initial)
    }
    setLoading(false)
  }

  const toggleOption = (groupId: string, optionId: string, allowMultiple: boolean) => {
    setSelected(prev => {
      const current = [...(prev[groupId] || [])]
      if (allowMultiple) {
        const index = current.indexOf(optionId)
        if (index >= 0) current.splice(index, 1)
        else current.push(optionId)
        return { ...prev, [groupId]: current }
      }
      return { ...prev, [groupId]: [optionId] }
    })
  }

  const missingGroups = groups.filter((group) => group.is_required && (selected[group.id]?.length || 0) === 0)

  const handleConfirmClick = () => {
    if (missingGroups.length > 0) {
      setAttemptedConfirm(true)
      return
    }
    handleConfirm()
  }

  const handleConfirm = () => {
    const variations: CartItem<PublicProduct>['variations'] = []
    groups.forEach(group => {
      const selectedOptions = selected[group.id] || []
      selectedOptions.forEach(optId => {
        const option = group.options.find(o => o.id === optId)
        if (option) {
          variations.push({
            group_name: group.name,
            option_name: option.name,
            price_delta: Number(option.price_delta),
          })
        }
      })
    })
    onConfirm(variations)
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50" />
        <div className="relative bg-white rounded-xl p-6">
          <Loader2 size={24} className="animate-spin text-primary-500" />
        </div>
      </div>
    )
  }

  // Sem variações cadastradas — adiciona direto (fallback de segurança)
  if (groups.length === 0) {
    onConfirm([])
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md max-h-[80vh] overflow-y-auto animate-fade-in">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 rounded-t-xl flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{product.name}</h2>
            <p className="text-sm text-gray-500">{formatCurrency(product.price)}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {groups.map(group => {
            const groupMissing = attemptedConfirm && group.is_required && (selected[group.id]?.length || 0) === 0
            return (
            <div key={group.id} className={groupMissing ? 'border border-red-300 bg-red-50/50 rounded-lg p-3 -m-3' : ''}>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="font-medium text-gray-900">{group.name}</h3>
                {group.is_required && (
                  <span className="text-xs text-red-500">*Obrigatório</span>
                )}
                {group.allow_multiple && (
                  <span className="text-xs text-gray-400">(múltipla escolha)</span>
                )}
              </div>
              {groupMissing && (
                <p className="text-xs text-red-600 mb-2">Escolha uma opção para continuar.</p>
              )}
              <div className="space-y-2">
                {group.options.map(option => {
                  const isSelected = (selected[group.id] || []).includes(option.id)
                  return (
                    <button
                      key={option.id}
                      onClick={() => toggleOption(group.id, option.id, group.allow_multiple)}
                      className={`w-full flex items-center justify-between p-3 rounded-lg border-2 transition-colors ${
                        isSelected
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <span className="font-medium text-sm">{option.name}</span>
                      {Number(option.price_delta) > 0 && (
                        <span className="text-sm text-primary-600">
                          + {formatCurrency(Number(option.price_delta))}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
            )
          })}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4">
          {attemptedConfirm && missingGroups.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3 text-sm text-red-700 flex items-start gap-2">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <span>
                Escolha uma opção em: <strong>{missingGroups.map((g) => g.name).join(', ')}</strong>.
              </span>
            </div>
          )}
          <button
            onClick={handleConfirmClick}
            className="btn-primary w-full"
          >
            Adicionar ao Carrinho
          </button>
        </div>
      </div>
    </div>
  )
}
