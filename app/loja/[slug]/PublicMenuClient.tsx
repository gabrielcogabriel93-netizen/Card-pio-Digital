'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import Link from 'next/link'
import QRCode from 'qrcode'
import { SmartImage } from '@/components/SmartImage'
import { createClient } from '@/lib/supabase/client'
import { log, logError, logCritical } from '@/lib/logger'
import { getStoreAvailability, getWeeklyHours } from '@/lib/hours'
import { formatPhoneNumber, toWhatsAppNumber } from '@/lib/phone'
import { useEscapeKey } from '@/lib/useEscapeKey'
import { generateColorShades, themeShadesToCssVars } from '@/lib/theme'
import { lookupCep, formatCep } from '@/lib/cep'
import { PAYMENT_METHODS, MERCADOPAGO_MIN_ORDER_TOTAL } from '@/lib/paymentMethods'
import { generatePixPayload } from '@/lib/pix'
import { formatBRL } from '@/lib/money'
import { computeCartTotals, type DiscountSource } from '@/lib/cartTotals'
import { buildOrderItemsPayload, cartItemKey, type OrderItemPayload } from '@/lib/orderPayload'
import { buildWhatsAppOrderMessage } from '@/lib/whatsappOrderMessage'
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
  getCustomerToken,
  saveCustomerToken,
  takeReorder,
  type SavedAddress,
} from '@/lib/customerStorage'
import type {
  PublicEstablishment,
  Category,
  PublicProduct,
  PublicCombo,
  CartItem,
  OrderItem,
  PublicDeliveryNeighborhood,
  CustomerProfile,
  CustomerAddress,
  PublicLoyaltySettings,
  PublicLoyaltyReward,
  LoyaltyBenefitType,
} from '@/types'
import { PizzaOrderModal, type PizzaOrderResult } from '@/components/PizzaOrderModal'
import { ComboOrderModal, type ComboOrderResult } from '@/components/ComboOrderModal'
import { MercadoPagoPixCheckout } from '@/components/MercadoPagoPixCheckout'
import { ProductSheet, type GroupWithOptions, type ProductSheetResult } from '@/components/store/ProductSheet'
import { VerifyPhone } from '@/components/store/VerifyPhone'
import { InstallPrompt } from '@/components/store/InstallPrompt'
import { Logo } from '@/components/Logo'
import { toast, confirmDialog } from '@/components/Feedback'
import { BRAND } from '@/lib/brand'
import {
  ShoppingBag, X, Plus, Minus, MapPin, Clock, Loader2, Store, Bike, Package, ClipboardList, Trash2,
  CheckCircle2, PlusCircle, Copy, AlertCircle, Instagram, Gift, Table2, Layers, Search, Send, ChevronRight, Info,
} from 'lucide-react'

type CartLine = CartItem<PublicProduct>

interface PlacedOrder {
  orderId: string
  total: number
  whatsappUrl: string | null
}

interface ServerOrderResult {
  order_id: string
  subtotal: number
  discount: number
  shipping_fee: number
  total: number
  items: OrderItem[]
  customer_token: string | null
}

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const EMPTY_ADDRESS: SavedAddress = { street: '', number: '', neighborhood: '', complement: '', reference: '', zip_code: '' }

export default function PublicMenuClient({
  establishment,
  categories,
  products,
  combos,
  renderedAt,
}: {
  establishment: PublicEstablishment
  categories: Category[]
  products: PublicProduct[]
  combos: PublicCombo[]
  // Hora em que o servidor montou a página (que fica em cache). A primeira
  // renderização no navegador usa a MESMA hora, senão "Aberto · fecha às"
  // sai diferente do HTML e o React quebra a hidratação (erro #425).
  renderedAt: string
}) {
  const supabase = useMemo(() => createClient(), [])

  // ---------- Loja ----------
  const [now, setNow] = useState(() => new Date(renderedAt))
  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(t)
  }, [])
  const availability = useMemo(
    () => getStoreAvailability({
      isOpen: establishment.is_open,
      pausedUntil: establishment.paused_until,
      openingHours: establishment.opening_hours,
      timeZone: establishment.timezone,
    }, now),
    [establishment.is_open, establishment.paused_until, establishment.opening_hours, establishment.timezone, now]
  )
  const canOrder = availability.open
  const offersDelivery = establishment.offers_delivery ?? true
  const offersPickup = establishment.offers_pickup ?? true
  const hasCompleto = establishment.has_completo_access !== false
  const themeStyle = useMemo(
    () => themeShadesToCssVars(generateColorShades(establishment.theme_color)) as React.CSSProperties,
    [establishment.theme_color]
  )

  // ---------- Cardápio: busca, seções ----------
  const [search, setSearch] = useState('')
  const [activeSection, setActiveSection] = useState<string>('')
  const [groupsByProduct, setGroupsByProduct] = useState<Record<string, GroupWithOptions[]>>({})

  const sections = useMemo(() => {
    const list: { id: string; name: string; products: PublicProduct[]; combos: PublicCombo[] }[] = []
    if (combos.length > 0) list.push({ id: 'combos', name: 'Combos', products: [], combos })
    const known = new Set(categories.map((c) => c.id))
    for (const cat of categories) {
      const items = products.filter((p) => p.category_id === cat.id)
      if (items.length > 0) list.push({ id: cat.id, name: cat.name, products: items, combos: [] })
    }
    const others = products.filter((p) => !p.category_id || !known.has(p.category_id))
    if (others.length > 0) list.push({ id: 'outros', name: categories.length > 0 ? 'Outros' : 'Cardápio', products: others, combos: [] })
    return list
  }, [categories, products, combos])

  const searchResults = useMemo(() => {
    const term = normalize(search.trim())
    if (!term) return null
    return {
      products: products.filter((p) => normalize(`${p.name} ${p.description || ''}`).includes(term)),
      combos: combos.filter((c) => normalize(`${c.name} ${c.description || ''}`).includes(term)),
    }
  }, [search, products, combos])

  // Grupos de opções de todos os produtos, carregados uma vez: o "+"
  // rápido sabe se pode adicionar direto ou precisa abrir a ficha.
  useEffect(() => {
    const ids = products.filter((p) => !p.pizza_flavor_id).map((p) => p.id)
    if (ids.length === 0) return
    let cancelled = false
    ;(async () => {
      const map: Record<string, GroupWithOptions[]> = {}
      for (let i = 0; i < ids.length; i += 100) {
        const { data, error } = await supabase
          .from('variation_groups')
          .select('*, options:variation_options(*)')
          .in('product_id', ids.slice(i, i + 100))
        if (error) {
          logError('loja', 'erro ao carregar opções dos produtos', error)
          continue
        }
        for (const g of (data || []) as GroupWithOptions[]) {
          ;(map[g.product_id] ||= []).push(g)
        }
      }
      if (!cancelled) setGroupsByProduct(map)
    })()
    return () => {
      cancelled = true
    }
  }, [products, supabase])

  // Aba ativa acompanha a rolagem.
  useEffect(() => {
    if (searchResults) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActiveSection(visible[0].target.id.replace('sec-', ''))
      },
      { rootMargin: '-140px 0px -60% 0px' }
    )
    sections.forEach((s) => {
      const el = document.getElementById(`sec-${s.id}`)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [sections, searchResults])

  const tabsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const tab = tabsRef.current?.querySelector<HTMLElement>(`[data-tab="${activeSection}"]`)
    tab?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [activeSection])

  const scrollToSection = (id: string) => {
    setSearch('')
    setActiveSection(id)
    requestAnimationFrame(() => document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  // ---------- Mesa (QR) ----------
  const [tableId, setTableId] = useState<string | null>(null)
  const [tableLabel, setTableLabel] = useState<string | null>(null)
  const isTableMode = !!tableId && !!tableLabel

  useEffect(() => {
    const mesa = new URLSearchParams(window.location.search).get('mesa')
    if (!mesa) return
    supabase
      .rpc('get_or_create_table_tab', { p_establishment_id: establishment.id, p_table_id: mesa })
      .then(({ data, error }) => {
        if (error || !data?.[0]?.tab_id) {
          logError('loja', 'mesa inválida no link, caindo pro cardápio normal', error)
          return
        }
        setTableId(mesa)
        setTableLabel(data[0].table_label)
      })
  }, [establishment.id, supabase])

  // ---------- Carrinho ----------
  const [cart, setCart] = useState<CartLine[]>([])
  const [cartReady, setCartReady] = useState(false)
  const [showCart, setShowCart] = useState(false)
  const [sheetProduct, setSheetProduct] = useState<PublicProduct | null>(null)
  const [pizzaProduct, setPizzaProduct] = useState<PublicProduct | null>(null)
  const [comboOpen, setComboOpen] = useState<PublicCombo | null>(null)

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const comboById = useMemo(() => new Map(combos.map((c) => [c.id, c])), [combos])

  // Reconstrói linhas do carrinho a partir dos itens precificados pelo
  // servidor (usado para conferir o carrinho salvo e para "pedir de novo").
  const linesFromServer = useCallback(
    (serverItems: OrderItem[]): CartLine[] =>
      serverItems
        .map((item): CartLine | null => {
          const product: PublicProduct | undefined = item.combo_id
            ? (() => {
                const combo = comboById.get(item.combo_id!)
                return combo
                  ? { id: combo.id, establishment_id: combo.establishment_id, name: combo.name, description: combo.description ?? undefined, price: combo.price, image_url: combo.image_url ?? undefined, display_order: combo.display_order, in_stock: true, pizza_flavor_id: null }
                  : undefined
              })()
            : productById.get(item.product_id)
          if (!product) return null
          return {
            product,
            quantity: item.quantity,
            variations: item.variations || [],
            unit_price: Number(item.unit_price),
            total_price: Number(item.total_price),
            note: item.note || undefined,
            config: item.config,
            combo: item.combo_id && item.combo_selections ? { combo_id: item.combo_id, selections: item.combo_selections } : undefined,
          }
        })
        .filter((l): l is CartLine => l !== null),
    [productById, comboById]
  )

  const quote = useCallback(
    async (payload: OrderItemPayload[]): Promise<{ lines: CartLine[]; removed: number }> => {
      const { data, error } = await supabase.rpc('quote_order_items', { p_establishment_id: establishment.id, p_items: payload })
      if (!error && Array.isArray(data)) return { lines: linesFromServer(data as OrderItem[]), removed: 0 }
      // Algum item não vale mais: confere um a um e descarta só os inválidos.
      const lines: CartLine[] = []
      let removed = 0
      for (const item of payload) {
        const single = await supabase.rpc('quote_order_items', { p_establishment_id: establishment.id, p_items: [item] })
        if (single.error || !Array.isArray(single.data)) removed++
        else lines.push(...linesFromServer(single.data as OrderItem[]))
      }
      return { lines, removed }
    },
    [supabase, establishment.id, linesFromServer]
  )

  // Ao abrir: carrinho salvo é conferido com o cardápio de hoje (preço
  // mudou, produto saiu, opção não existe mais). "Pedir de novo" também
  // entra por aqui.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const reorder = takeReorder<OrderItemPayload>(establishment.id)
      const saved = (getSavedCart<CartLine[]>(establishment.id) || []).filter((l) => l?.product?.id)
      const source: OrderItemPayload[] = reorder && reorder.length > 0 ? reorder : buildOrderItemsPayload(saved.filter((l) => l.config || l.combo || l.variations.length === 0))
      if (source.length === 0) {
        setCartReady(true)
        return
      }
      const { lines, removed } = await quote(source)
      if (cancelled) return
      setCart(lines)
      setCartReady(true)
      if (reorder && reorder.length > 0) {
        setShowCart(true)
        toast.success(removed > 0 ? 'Pedido anterior no carrinho. Alguns itens não estão mais disponíveis.' : 'Pedido anterior de volta no carrinho.')
      } else {
        const priceChanged = lines.some((l) => {
          const old = saved.find((s) => s.product.id === l.product.id && s.quantity === l.quantity)
          return old && Math.abs(old.unit_price - l.unit_price) > 0.009
        })
        if (removed > 0) toast('Alguns itens do seu carrinho não estão mais disponíveis e foram removidos.')
        else if (priceChanged) toast('Atualizamos os preços do seu carrinho.')
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [establishment.id])

  useEffect(() => {
    if (cartReady) saveCart(establishment.id, cart)
  }, [cart, cartReady, establishment.id])

  const addLine = (line: CartLine) => {
    setCart((prev) => {
      const key = cartItemKey(line)
      const idx = prev.findIndex((l) => cartItemKey(l) === key)
      if (idx >= 0) {
        return prev.map((l, i) => (i === idx ? { ...l, quantity: l.quantity + line.quantity, total_price: l.unit_price * (l.quantity + line.quantity) } : l))
      }
      return [...prev, line]
    })
    toast(`${line.quantity > 1 ? `${line.quantity}x ` : ''}${line.product.name} na sacola`, 'success', 2200)
  }

  const openProduct = (product: PublicProduct) => {
    if (!product.in_stock) return
    if (product.pizza_flavor_id) setPizzaProduct(product)
    else setSheetProduct(product)
  }

  const quickAdd = (product: PublicProduct) => {
    if (!canOrder || !product.in_stock) return
    if (product.pizza_flavor_id || (groupsByProduct[product.id] || []).length > 0) {
      openProduct(product)
      return
    }
    const unit = Number(product.price)
    addLine({ product, quantity: 1, variations: [], unit_price: unit, total_price: unit, config: { kind: 'product', product_id: product.id, option_ids: [] } })
  }

  const handleSheetConfirm = (product: PublicProduct, r: ProductSheetResult) => {
    addLine({
      product,
      quantity: r.quantity,
      variations: r.variations,
      unit_price: r.unitPrice,
      total_price: r.unitPrice * r.quantity,
      note: r.note || undefined,
      config: { kind: 'product', product_id: product.id, option_ids: r.optionIds },
    })
    setSheetProduct(null)
  }

  const handlePizzaConfirm = (product: PublicProduct, r: PizzaOrderResult) => {
    addLine({ product, quantity: 1, variations: r.variations, unit_price: r.unitPrice, total_price: r.unitPrice, config: r.config })
    setPizzaProduct(null)
  }

  const handleComboConfirm = (combo: PublicCombo, r: ComboOrderResult) => {
    addLine({
      product: { id: combo.id, establishment_id: combo.establishment_id, name: combo.name, description: combo.description ?? undefined, price: combo.price, image_url: combo.image_url ?? undefined, display_order: combo.display_order, in_stock: true, pizza_flavor_id: null },
      quantity: 1,
      variations: r.variations,
      unit_price: r.unitPrice,
      total_price: r.unitPrice,
      combo: { combo_id: r.comboId, selections: r.selections },
      config: r.config,
    })
    setComboOpen(null)
  }

  const updateQuantity = (index: number, delta: number) => {
    setCart((prev) => prev.map((l, i) => {
      if (i !== index) return l
      const quantity = Math.max(1, Math.min(99, l.quantity + delta))
      return { ...l, quantity, total_price: l.unit_price * quantity }
    }))
  }
  const removeLine = (index: number) => setCart((prev) => prev.filter((_, i) => i !== index))

  const cartSubtotal = cart.reduce((sum, l) => sum + l.total_price, 0)
  const cartCount = cart.reduce((sum, l) => sum + l.quantity, 0)

  // ---------- Cliente ----------
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [profile, setProfile] = useState<CustomerProfile | null>(null)
  const [profileExistsUnverified, setProfileExistsUnverified] = useState(false)
  const [profileLoading, setProfileLoading] = useState(false)
  const phoneDigits = customerPhone.replace(/\D/g, '')

  useEffect(() => {
    const saved = getSavedCustomer()
    if (saved) {
      setCustomerName(saved.name)
      setCustomerPhone(saved.phone)
    }
    const savedAddress = getSavedAddress()
    if (savedAddress) setAddress({ ...EMPTY_ADDRESS, ...savedAddress })
    const last = getSavedLastOrder(establishment.id)
    if (last) setLastOrderId(last)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [establishment.id])

  const lookupProfile = useCallback(async (phone: string) => {
    if (phone.replace(/\D/g, '').length < 10) return
    setProfileLoading(true)
    try {
      const { data, error } = await supabase.rpc('get_customer_profile', {
        p_establishment_id: establishment.id,
        p_phone: phone,
        p_token: getCustomerToken(establishment.id, phone),
      })
      if (error) throw error
      const row = data?.[0]
      if (row?.verified) {
        setProfile({ customer_id: row.customer_id, name: row.name, birth_date: row.birth_date, loyalty_points_balance: row.loyalty_points_balance ?? 0, addresses: row.addresses || [], verified: true })
        setProfileExistsUnverified(false)
        setCustomerName((n) => n.trim() ? n : row.name)
      } else {
        setProfile(null)
        setProfileExistsUnverified(!!row?.has_profile)
      }
    } catch (err) {
      logError('loja', 'erro ao buscar perfil do cliente', err)
    } finally {
      setProfileLoading(false)
    }
  }, [supabase, establishment.id])

  // ---------- Checkout ----------
  const [showCheckout, setShowCheckout] = useState(false)
  const [orderType, setOrderType] = useState<'delivery' | 'pickup'>(offersDelivery ? 'delivery' : 'pickup')
  const [address, setAddress] = useState<SavedAddress>(EMPTY_ADDRESS)
  const [addressMode, setAddressMode] = useState<'new' | 'select'>('new')
  const [selectedAddressId, setSelectedAddressId] = useState('')
  const [addressLabel, setAddressLabel] = useState('')
  const [cepLoading, setCepLoading] = useState(false)
  const useNeighborhoodFee = establishment.use_neighborhood_delivery_fee ?? false
  const [neighborhoods, setNeighborhoods] = useState<PublicDeliveryNeighborhood[]>([])
  const [neighborhoodId, setNeighborhoodId] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [needsChange, setNeedsChange] = useState(false)
  const [changeFor, setChangeFor] = useState('')
  const [notes, setNotes] = useState('')
  const [website, setWebsite] = useState('') // honeypot
  const [formOpenedAt, setFormOpenedAt] = useState(0)
  const [attemptedSubmit, setAttemptedSubmit] = useState(false)
  const [saving, setSaving] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [pixQr, setPixQr] = useState<string | null>(null)
  const [pixCopied, setPixCopied] = useState(false)

  useEffect(() => {
    if (!useNeighborhoodFee) return
    supabase
      .from('public_delivery_neighborhoods')
      .select('*')
      .eq('establishment_id', establishment.id)
      .order('name')
      .then(({ data, error }) => {
        if (error) logError('loja', 'erro ao carregar bairros de entrega', error)
        else setNeighborhoods((data || []) as PublicDeliveryNeighborhood[])
      })
  }, [useNeighborhoodFee, establishment.id, supabase])

  const usingNeighborhoodSelect = useNeighborhoodFee && neighborhoods.length > 0
  const selectedNeighborhood = neighborhoods.find((n) => n.id === neighborhoodId) || null

  const openCheckout = () => {
    setShowCart(false)
    setAttemptedSubmit(false)
    setSubmitError(null)
    setFormOpenedAt(Date.now())
    setShowCheckout(true)
    if (phoneDigits.length >= 10) lookupProfile(customerPhone)
  }

  // Carrinho abandonado (migration 042): rascunho salvo quando o telefone
  // fica válido no checkout.
  useEffect(() => {
    if (isTableMode || !showCheckout || phoneDigits.length < 10 || cart.length === 0) return
    const timer = setTimeout(() => {
      supabase
        .rpc('save_cart_draft', {
          p_establishment_id: establishment.id,
          p_customer_phone: customerPhone,
          p_customer_name: customerName,
          p_cart_snapshot: cart.map((l) => ({ name: l.product.name, quantity: l.quantity, unit_price: l.unit_price })),
          p_cart_total: cartSubtotal,
        })
        .then(({ error }) => {
          if (error) logError('loja', 'erro ao salvar rascunho de carrinho', error)
        })
    }, 1500)
    return () => clearTimeout(timer)
  }, [isTableMode, showCheckout, phoneDigits, customerPhone, customerName, cart, cartSubtotal, establishment.id, supabase])

  const selectSavedAddress = (addr: CustomerAddress) => {
    setSelectedAddressId(addr.id)
    setAddress({ street: addr.street, number: addr.number, neighborhood: addr.neighborhood, complement: addr.complement || '', reference: addr.reference || '', zip_code: addr.zip_code || '' })
    if (useNeighborhoodFee) {
      const match = neighborhoods.find((n) => normalize(n.name) === normalize(addr.neighborhood))
      setNeighborhoodId(match ? match.id : '')
    }
    setAddressMode('select')
  }

  useEffect(() => {
    if (profile?.verified && profile.addresses.length > 0 && !address.street.trim() && orderType === 'delivery') {
      selectSavedAddress(profile.addresses[0])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile])

  const handleCepBlur = async () => {
    const digits = (address.zip_code || '').replace(/\D/g, '')
    if (digits.length !== 8) return
    setCepLoading(true)
    const result = await lookupCep(digits)
    setCepLoading(false)
    if (!result) return
    setAddress((prev) => ({ ...prev, street: result.street || prev.street, neighborhood: result.neighborhood || prev.neighborhood }))
    if (useNeighborhoodFee && result.neighborhood) {
      const match = neighborhoods.find((n) => normalize(n.name) === normalize(result.neighborhood))
      if (match) setNeighborhoodId(match.id)
    }
  }

  const handleDeleteSavedAddress = async (addressId: string) => {
    if (!(await confirmDialog({ title: 'Remover este endereço salvo?', confirmLabel: 'Remover', danger: true }))) return
    const { error } = await supabase.rpc('delete_customer_address', {
      p_establishment_id: establishment.id,
      p_phone: customerPhone,
      p_address_id: addressId,
      p_token: getCustomerToken(establishment.id, customerPhone),
    })
    if (error) {
      toast.error('Não foi possível remover este endereço.')
      return
    }
    setProfile((p) => (p ? { ...p, addresses: p.addresses.filter((a) => a.id !== addressId) } : p))
    if (selectedAddressId === addressId) {
      setSelectedAddressId('')
      setAddress(EMPTY_ADDRESS)
      setAddressMode('new')
    }
  }

  // ---------- Cupom e pontos ----------
  const [couponInput, setCouponInput] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discountType: 'percent' | 'fixed' | 'free_shipping'; discountValue: number } | null>(null)
  const [couponError, setCouponError] = useState<string | null>(null)
  const [couponLoading, setCouponLoading] = useState(false)
  const [loyaltySettings, setLoyaltySettings] = useState<PublicLoyaltySettings | null>(null)
  const [loyaltyRewards, setLoyaltyRewards] = useState<PublicLoyaltyReward[]>([])
  const [selectedRewardId, setSelectedRewardId] = useState('')
  const [appliedReward, setAppliedReward] = useState<{ id: string; name: string; benefitType: LoyaltyBenefitType; benefitValue: number | null; pointsCost: number } | null>(null)
  const [rewardError, setRewardError] = useState<string | null>(null)
  const [rewardLoading, setRewardLoading] = useState(false)

  useEffect(() => {
    if (!hasCompleto) return
    Promise.all([
      supabase.from('public_loyalty_settings').select('*').eq('establishment_id', establishment.id).maybeSingle(),
      supabase.from('public_loyalty_rewards').select('*').eq('establishment_id', establishment.id).order('points_cost', { ascending: true }),
    ]).then(([s, r]) => {
      if (s.data) setLoyaltySettings(s.data as PublicLoyaltySettings)
      if (r.data) setLoyaltyRewards(r.data as PublicLoyaltyReward[])
    })
  }, [establishment.id, hasCompleto, supabase])

  const applyCoupon = async () => {
    if (!couponInput.trim()) return
    setCouponLoading(true)
    setCouponError(null)
    try {
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
      setAppliedCoupon({ code: couponInput.trim().toUpperCase(), discountType: result.discount_type, discountValue: Number(result.discount_value) })
      setAppliedReward(null)
    } catch (err) {
      logError('loja', 'erro ao validar cupom', err)
      setCouponError('Não foi possível validar o cupom. Tente novamente.')
    } finally {
      setCouponLoading(false)
    }
  }

  const applyReward = async (rewardId: string) => {
    if (!rewardId || phoneDigits.length < 10) return
    setRewardLoading(true)
    setRewardError(null)
    try {
      const { data, error } = await supabase.rpc('check_loyalty_redemption', {
        p_establishment_id: establishment.id,
        p_reward_id: rewardId,
        p_customer_phone: customerPhone,
        p_token: getCustomerToken(establishment.id, customerPhone),
      })
      if (error) throw error
      const result = data?.[0]
      if (!result?.valid) {
        setRewardError(result?.message || 'Não foi possível usar essa recompensa.')
        return
      }
      const reward = loyaltyRewards.find((r) => r.id === rewardId)
      setAppliedReward({ id: rewardId, name: reward?.name || 'Recompensa', benefitType: result.benefit_type, benefitValue: result.benefit_value != null ? Number(result.benefit_value) : null, pointsCost: result.points_cost })
      setAppliedCoupon(null)
    } catch (err) {
      logError('loja', 'erro ao validar resgate de pontos', err)
      setRewardError('Não foi possível usar seus pontos agora.')
    } finally {
      setRewardLoading(false)
    }
  }

  // ---------- Totais (prévia) ----------
  const baseDeliveryFee = useNeighborhoodFee && selectedNeighborhood ? Number(selectedNeighborhood.fee) || 0 : Number(establishment.delivery_fee) || 0
  const discountSource: DiscountSource = appliedCoupon
    ? { kind: 'coupon', discountType: appliedCoupon.discountType, value: appliedCoupon.discountValue }
    : appliedReward
      ? { kind: 'loyalty', benefitType: appliedReward.benefitType, value: appliedReward.benefitValue }
      : null
  const totals = computeCartTotals({
    subtotal: cartSubtotal,
    orderType: isTableMode ? 'mesa' : orderType,
    deliveryFee: baseDeliveryFee,
    freeShippingThreshold: establishment.free_shipping_threshold,
    discount: discountSource,
  })
  const minOrder = Number(establishment.min_order_value) || 0
  const belowMinOrder = !isTableMode && minOrder > 0 && cartSubtotal < minOrder

  const belowMpMinimum = totals.total < MERCADOPAGO_MIN_ORDER_TOTAL
  const visiblePaymentMethods = PAYMENT_METHODS.filter((p) => {
    if (p.value === 'mercadopago_pix') return establishment.mercadopago_pix_enabled && !belowMpMinimum
    if (p.value === 'pix') return !establishment.mercadopago_pix_enabled
    return true
  })
  useEffect(() => {
    if (paymentMethod && !visiblePaymentMethods.some((p) => p.value === paymentMethod)) setPaymentMethod('')
  }, [paymentMethod, visiblePaymentMethods])

  const canShowPixQr = paymentMethod === 'pix' && !!establishment.pix_key && !!establishment.pix_city && totals.total > 0
  const pixPayload = canShowPixQr
    ? generatePixPayload({ pixKey: establishment.pix_key!, merchantName: establishment.name, merchantCity: establishment.pix_city!, amount: totals.total })
    : ''
  useEffect(() => {
    if (!pixPayload) {
      setPixQr(null)
      return
    }
    let cancelled = false
    QRCode.toDataURL(pixPayload, { width: 220, margin: 1 })
      .then((url) => { if (!cancelled) setPixQr(url) })
      .catch((err) => logError('loja', 'erro ao gerar QR Code do Pix', err))
    return () => { cancelled = true }
  }, [pixPayload])

  const missingFields = useMemo(() => {
    const missing: { key: string; label: string }[] = []
    if (!customerName.trim()) missing.push({ key: 'name', label: 'Nome' })
    if (!isTableMode) {
      if (phoneDigits.length < 10) missing.push({ key: 'phone', label: 'Telefone com DDD' })
      if (orderType === 'delivery') {
        if (!address.street.trim()) missing.push({ key: 'street', label: 'Rua' })
        if (!address.number.trim()) missing.push({ key: 'number', label: 'Número' })
        if (usingNeighborhoodSelect ? !neighborhoodId : !address.neighborhood.trim()) missing.push({ key: 'neighborhood', label: 'Bairro' })
      }
      if (!paymentMethod) missing.push({ key: 'payment', label: 'Forma de pagamento' })
      if (paymentMethod === 'dinheiro' && needsChange && !(Number(changeFor.replace(',', '.')) > 0)) missing.push({ key: 'change', label: 'Troco para quanto' })
    }
    return missing
  }, [customerName, isTableMode, phoneDigits, orderType, address, usingNeighborhoodSelect, neighborhoodId, paymentMethod, needsChange, changeFor])
  const fieldError = (key: string) => attemptedSubmit && missingFields.some((f) => f.key === key)

  // ---------- Envio ----------
  const [placed, setPlaced] = useState<PlacedOrder | null>(null)
  const [lastOrderId, setLastOrderId] = useState<string | null>(null)
  const [mpCheckout, setMpCheckout] = useState<{ orderId: string; amount: number; qrCode: string; qrCodeBase64: string } | null>(null)
  const [mpFailure, setMpFailure] = useState<{ orderId: string; amount: number; message: string } | null>(null)
  const [mpRetrying, setMpRetrying] = useState(false)

  const tryCreateMercadoPagoPayment = async (orderId: string, amount: number) => {
    try {
      const res = await fetch('/api/mercadopago/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao gerar o Pix')
      setMpFailure(null)
      setMpCheckout({ orderId, amount, qrCode: data.qrCode, qrCodeBase64: data.qrCodeBase64 })
      return true
    } catch (err: any) {
      logError('loja', 'erro ao gerar pagamento Mercado Pago', err)
      setMpFailure({ orderId, amount, message: err.message || 'Erro ao gerar o Pix' })
      return false
    }
  }

  const resetAfterOrder = () => {
    setCart([])
    setShowCheckout(false)
    setShowCart(false)
    setNotes('')
    setCouponInput('')
    setAppliedCoupon(null)
    setAppliedReward(null)
    setSelectedRewardId('')
    setNeedsChange(false)
    setChangeFor('')
  }

  const handleSubmit = async () => {
    if (missingFields.length > 0) {
      setAttemptedSubmit(true)
      return
    }
    if (belowMinOrder) {
      setSubmitError(`O pedido mínimo é ${formatBRL(minOrder)}.`)
      return
    }
    if (website.trim()) {
      setCart([])
      setShowCheckout(false)
      return
    }
    if (Date.now() - formOpenedAt < 1500) return

    const isMp = paymentMethod === 'mercadopago_pix'
    // Abre a aba do WhatsApp AGORA, dentro do clique: depois de um await,
    // Safari e navegadores de app (Instagram) bloqueiam o popup.
    const waWindow = !isTableMode && !isMp ? window.open('', '_blank') : null

    setSaving(true)
    setSubmitError(null)
    log('loja', 'enviando pedido', { itens: cart.length })

    try {
      const payload = {
        establishment_id: establishment.id,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        customer_token: phoneDigits ? getCustomerToken(establishment.id, customerPhone) : null,
        order_type: isTableMode ? 'mesa' : orderType,
        table_id: isTableMode ? tableId : null,
        delivery_address: !isTableMode && orderType === 'delivery'
          ? { ...address, neighborhood: usingNeighborhoodSelect ? selectedNeighborhood?.name || '' : address.neighborhood, neighborhood_id: usingNeighborhoodSelect ? neighborhoodId : null }
          : null,
        save_address: true,
        address_label: addressLabel.trim() || null,
        payment_method: isTableMode ? null : paymentMethod,
        change_for: paymentMethod === 'dinheiro' && needsChange ? Number(changeFor.replace(',', '.')) : null,
        notes: notes.trim() || null,
        coupon_code: appliedCoupon?.code || null,
        reward_id: appliedReward?.id || null,
        use_birthday: Number(establishment.birthday_discount_percent) > 0 && !appliedCoupon && !appliedReward,
        items: buildOrderItemsPayload(cart),
      }

      const { data, error } = await supabase.rpc('place_order', { p_payload: payload })
      if (error) throw new Error(error.message)
      const result = data as ServerOrderResult

      if (result.customer_token && phoneDigits) saveCustomerToken(establishment.id, customerPhone, result.customer_token)
      if (phoneDigits) saveCustomer({ name: customerName.trim(), phone: customerPhone.trim() })
      if (!isTableMode && orderType === 'delivery') saveAddress(address)

      if (isTableMode) {
        resetAfterOrder()
        toast.success(`Pedido enviado! Fica na conta da ${tableLabel}.`)
        return
      }

      setLastOrderId(result.order_id)
      saveLastOrder(establishment.id, result.order_id)
      const trackingUrl = `${window.location.origin}/pedido/${result.order_id}`

      if (isMp) {
        resetAfterOrder()
        await tryCreateMercadoPagoPayment(result.order_id, Number(result.total))
        return
      }

      const message = buildWhatsAppOrderMessage({
        storeName: establishment.name,
        orderId: result.order_id,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        orderType,
        address: orderType === 'delivery' ? { ...address, neighborhood: usingNeighborhoodSelect ? selectedNeighborhood?.name || address.neighborhood : address.neighborhood } : null,
        items: result.items,
        subtotal: Number(result.subtotal),
        discount: Number(result.discount),
        shippingFee: Number(result.shipping_fee),
        total: Number(result.total),
        discountLabel: appliedCoupon?.code || appliedReward?.name || (Number(result.discount) > 0 ? 'aniversário' : null),
        paymentMethod,
        changeFor: payload.change_for,
        notes: notes.trim() || null,
        trackingUrl,
      })
      const whatsappUrl = `https://wa.me/${toWhatsAppNumber(establishment.whatsapp_number)}?text=${encodeURIComponent(message)}`
      if (waWindow) waWindow.location.href = whatsappUrl

      resetAfterOrder()
      setPlaced({ orderId: result.order_id, total: Number(result.total), whatsappUrl })
    } catch (err: any) {
      waWindow?.close()
      logError('loja', 'erro ao enviar pedido', err)
      const message: string = err?.message || 'Não foi possível enviar o pedido.'
      // Erros de regra (loja fechada, estoque, cupom) já vêm escritos para o cliente.
      setSubmitError(message)
      if (!/fechada|esgot|estoque|mínimo|cupom|pontos|telefone|troco|Muitos|disponível|Escolha|Informe/i.test(message)) {
        logCritical('loja:enviar-pedido', message, err, establishment.id)
      }
    } finally {
      setSaving(false)
    }
  }

  // ---------- Drawers ----------
  const [showStoreInfo, setShowStoreInfo] = useState(false)
  useEscapeKey(() => setShowCart(false), showCart)
  useEscapeKey(() => setShowCheckout(false), showCheckout)
  useEscapeKey(() => setShowStoreInfo(false), showStoreInfo)

  const featuredSuggestions = products.filter((p) => p.is_featured && p.in_stock && !cart.some((l) => l.product.id === p.id)).slice(0, 4)
  const deliveryTime = establishment.delivery_time_min || establishment.delivery_time_max
    ? `${establishment.delivery_time_min || establishment.delivery_time_max}${establishment.delivery_time_max && establishment.delivery_time_min && establishment.delivery_time_max !== establishment.delivery_time_min ? `–${establishment.delivery_time_max}` : ''} min`
    : null

  // ---------- Render ----------
  const renderProductCard = (product: PublicProduct) => {
    const disabled = !product.in_stock
    return (
      <div
        key={product.id}
        className={`flex gap-3 bg-white rounded-2xl p-3 border border-gray-100 transition-shadow ${disabled ? 'opacity-55' : 'hover:shadow-md'}`}
      >
        <button type="button" onClick={() => openProduct(product)} disabled={disabled} className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="font-semibold text-gray-900 leading-snug">{product.name}</h3>
            {product.is_bestseller && (
              <span className="text-[10px] font-semibold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded-full">Mais pedido</span>
            )}
          </div>
          {product.description && <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{product.description}</p>}
          <p className="mt-2 font-bold text-gray-900 tabular-nums">
            {product.pizza_flavor_id ? <span className="text-xs font-medium text-gray-500 mr-1">a partir de</span> : null}
            {formatBRL(Number(product.price))}
          </p>
          {disabled && <p className="text-xs font-semibold text-red-500 mt-1">Esgotado</p>}
        </button>
        <div className="relative flex-shrink-0">
          {product.image_url ? (
            <button type="button" onClick={() => openProduct(product)} disabled={disabled} className="relative w-24 h-24 rounded-xl overflow-hidden bg-gray-100 block" aria-label={`Ver ${product.name}`}>
              <SmartImage src={product.image_url} alt={product.name} fill sizes="96px" className="object-cover" />
            </button>
          ) : (
            <div className="w-12 h-24" />
          )}
          {canOrder && !disabled && (
            <button
              type="button"
              onClick={() => quickAdd(product)}
              className="absolute -bottom-1.5 -right-1.5 w-9 h-9 rounded-full bg-primary-500 text-white shadow-md flex items-center justify-center hover:bg-primary-600"
              aria-label={`Adicionar ${product.name}`}
            >
              <Plus size={18} />
            </button>
          )}
        </div>
      </div>
    )
  }

  const renderComboCard = (combo: PublicCombo) => (
    <button
      key={combo.id}
      type="button"
      onClick={() => canOrder && setComboOpen(combo)}
      disabled={!canOrder}
      className="w-full text-left flex gap-3 bg-white rounded-2xl p-3 border border-gray-100 hover:shadow-md disabled:opacity-60"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <h3 className="font-semibold text-gray-900">{combo.name}</h3>
          <span className="text-[10px] font-semibold text-primary-700 bg-primary-100 px-1.5 py-0.5 rounded-full">Combo</span>
        </div>
        {combo.description && <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{combo.description}</p>}
        <p className="mt-2 font-bold text-gray-900 tabular-nums">{formatBRL(Number(combo.price))}</p>
      </div>
      {combo.image_url ? (
        <div className="relative w-24 h-24 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100">
          <SmartImage src={combo.image_url} alt={combo.name} fill sizes="96px" className="object-cover" />
        </div>
      ) : (
        <Layers size={28} className="text-primary-300 self-center flex-shrink-0" />
      )}
    </button>
  )

  return (
    <div className="min-h-screen bg-gray-50" style={themeStyle}>
      {/* Cabeçalho */}
      <header className="bg-white">
        <div className="max-w-2xl mx-auto px-4 pt-4 pb-3">
          <div className="flex items-start gap-3">
            <button type="button" onClick={() => setShowStoreInfo(true)} className="flex items-start gap-3 flex-1 min-w-0 text-left" aria-label="Ver informações da loja">
              {establishment.logo_url ? (
                <div className="relative w-16 h-16 rounded-2xl overflow-hidden flex-shrink-0 border border-gray-100">
                  <SmartImage src={establishment.logo_url} alt={establishment.name} fill sizes="64px" className="object-cover" />
                </div>
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-primary-500 text-white flex items-center justify-center font-display font-extrabold text-2xl flex-shrink-0">
                  {establishment.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h1 className="font-display text-xl font-extrabold text-gray-900 leading-tight truncate">{establishment.name}</h1>
                <p className={`text-sm font-medium mt-0.5 flex items-center gap-1.5 ${availability.open ? 'text-green-700' : 'text-red-600'}`}>
                  <span className={`w-2 h-2 rounded-full ${availability.open ? 'bg-green-500' : 'bg-red-500'}`} aria-hidden="true" />
                  {availability.open ? 'Aberto' : 'Fechado'}
                  {availability.label && <span className="text-gray-500 font-normal">· {availability.label.replace(/^Aberto /, '')}</span>}
                </p>
                <span className="text-xs text-primary-600 font-medium inline-flex items-center gap-0.5 mt-0.5">
                  Ver horários e informações <ChevronRight size={12} />
                </span>
              </div>
            </button>
            <Link href={`/loja/${establishment.slug}/pedidos`} className="p-2.5 bg-gray-100 rounded-xl hover:bg-gray-200 flex-shrink-0" aria-label="Meus pedidos" title="Meus pedidos">
              <ClipboardList size={20} className="text-gray-700" />
            </Link>
          </div>

          {!isTableMode && (
            <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar text-xs">
              {offersDelivery && deliveryTime && <span className="chip"><Bike size={13} /> {deliveryTime}</span>}
              {offersDelivery && (
                <span className="chip">
                  {useNeighborhoodFee ? 'Entrega por bairro' : Number(establishment.delivery_fee) > 0 ? `Entrega ${formatBRL(Number(establishment.delivery_fee))}` : 'Entrega grátis'}
                </span>
              )}
              {Number(establishment.free_shipping_threshold) > 0 && (
                <span className="chip chip-green">Grátis acima de {formatBRL(Number(establishment.free_shipping_threshold))}</span>
              )}
              {minOrder > 0 && <span className="chip">Pedido mínimo {formatBRL(minOrder)}</span>}
              {offersPickup && <span className="chip"><Store size={13} /> Retirada</span>}
            </div>
          )}
        </div>

        <div className="sticky top-0 z-30 bg-white border-b border-gray-100" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
          <div className="max-w-2xl mx-auto px-4 pt-1 pb-2">
            <label className="relative block">
              <span className="sr-only">Buscar no cardápio</span>
              <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar no cardápio"
                className="w-full bg-gray-100 rounded-xl pl-9 pr-9 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary-400"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400" aria-label="Limpar busca">
                  <X size={16} />
                </button>
              )}
            </label>
            {!searchResults && sections.length > 1 && (
              <div ref={tabsRef} className="flex gap-2 mt-2 overflow-x-auto no-scrollbar" role="tablist" aria-label="Categorias">
                {sections.map((s) => (
                  <button
                    key={s.id}
                    data-tab={s.id}
                    role="tab"
                    aria-selected={activeSection === s.id}
                    onClick={() => scrollToSection(s.id)}
                    className={`px-3.5 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                      activeSection === s.id ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      {isTableMode && (
        <div className="bg-primary-500 text-white text-sm font-medium text-center py-2 px-4 flex items-center justify-center gap-2">
          <Table2 size={16} /> {tableLabel} · o pedido vai direto para a cozinha
        </div>
      )}

      <main className="max-w-2xl mx-auto px-4 pt-4 pb-32">
        {lastOrderId && !placed && (
          <div className="bg-white border border-primary-200 rounded-2xl p-4 mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-gray-900">Seu último pedido</p>
              <p className="text-sm text-gray-600">Veja o andamento em tempo real.</p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Link href={`/pedido/${lastOrderId}`} className="btn-primary text-sm py-2 px-3">Acompanhar</Link>
              <button onClick={() => { setLastOrderId(null); clearSavedLastOrder(establishment.id) }} className="p-1.5 text-gray-400" aria-label="Fechar aviso">
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        {!canOrder && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4 flex items-start gap-3">
            <Clock size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-900">Loja fechada agora</p>
              <p className="text-sm text-amber-800">
                {availability.label ? `${availability.label}. ` : ''}Você pode olhar o cardápio e montar a sacola.
              </p>
            </div>
          </div>
        )}

        {searchResults ? (
          <section aria-label="Resultados da busca" className="space-y-3">
            <p className="text-sm text-gray-500">
              {searchResults.products.length + searchResults.combos.length} resultado(s) para &quot;{search.trim()}&quot;
            </p>
            {searchResults.combos.map(renderComboCard)}
            {searchResults.products.map(renderProductCard)}
            {searchResults.products.length + searchResults.combos.length === 0 && (
              <div className="text-center py-12">
                <Search size={40} className="text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">Nada encontrado. Tente outra palavra.</p>
              </div>
            )}
          </section>
        ) : sections.length === 0 ? (
          <div className="text-center py-16">
            <Store size={48} className="text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">O cardápio desta loja ainda está sendo montado.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {sections.map((section) => (
              <section key={section.id} id={`sec-${section.id}`} className="scroll-mt-36" aria-labelledby={`title-${section.id}`}>
                <h2 id={`title-${section.id}`} className="font-display text-lg font-extrabold text-gray-900 mb-3">{section.name}</h2>
                <div className="space-y-3">
                  {section.combos.map(renderComboCard)}
                  {section.products.map(renderProductCard)}
                </div>
              </section>
            ))}
          </div>
        )}

        {!establishment.hide_platform_badge && (
          <a href="/" className="mt-12 flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-gray-600">
            <Logo size={14} className="text-gray-400" dotColor="#D1D5DB" /> pedidos por <strong className="font-semibold">{BRAND.wordmark}</strong>
          </a>
        )}
      </main>

      {/* Barra da sacola */}
      {cartCount > 0 && !showCart && !showCheckout && (
        <div className="fixed inset-x-0 bottom-0 z-20 px-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}>
          <button onClick={() => setShowCart(true)} className="max-w-2xl mx-auto w-full flex items-center justify-between bg-primary-500 hover:bg-primary-600 text-white rounded-2xl px-4 py-3.5 shadow-lg font-semibold">
            <span className="flex items-center gap-2">
              <span className="relative">
                <ShoppingBag size={20} />
                <span className="absolute -top-2 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full bg-white text-primary-600 text-[11px] font-bold flex items-center justify-center">{cartCount}</span>
              </span>
              <span className="ml-1">Ver sacola</span>
            </span>
            <span className="tabular-nums">{formatBRL(totals.total)}</span>
          </button>
        </div>
      )}

      {/* Sacola */}
      {showCart && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="cart-title">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowCart(false)} />
          <div className="fixed inset-x-0 bottom-0 sm:inset-y-0 sm:left-auto sm:right-0 sm:w-full sm:max-w-md bg-white sm:shadow-xl rounded-t-3xl sm:rounded-none max-h-[92vh] sm:max-h-none flex flex-col animate-slide-up sm:animate-slide-in">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 id="cart-title" className="font-display text-lg font-extrabold">Sua sacola</h2>
              <button onClick={() => setShowCart(false)} className="p-1.5 hover:bg-gray-100 rounded-lg" aria-label="Fechar sacola"><X size={20} /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {cart.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <ShoppingBag size={40} className="mx-auto mb-2" />
                  <p>Sua sacola está vazia</p>
                </div>
              ) : (
                cart.map((line, index) => (
                  <div key={`${cartItemKey(line)}-${index}`} className="flex gap-3 pb-3 border-b border-gray-100 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900">{line.product.name}</p>
                      {line.variations.map((v, i) => (
                        <p key={i} className="text-xs text-gray-500">{v.group_name}: {v.option_name}</p>
                      ))}
                      {line.note && <p className="text-xs text-gray-500 italic">&ldquo;{line.note}&rdquo;</p>}
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex items-center border border-gray-200 rounded-lg">
                          <button onClick={() => (line.quantity === 1 ? removeLine(index) : updateQuantity(index, -1))} className="w-8 h-8 flex items-center justify-center text-primary-600" aria-label={line.quantity === 1 ? 'Remover item' : 'Diminuir quantidade'}>
                            {line.quantity === 1 ? <Trash2 size={14} /> : <Minus size={14} />}
                          </button>
                          <span className="w-6 text-center text-sm font-semibold tabular-nums">{line.quantity}</span>
                          <button onClick={() => updateQuantity(index, 1)} className="w-8 h-8 flex items-center justify-center text-primary-600" aria-label="Aumentar quantidade"><Plus size={14} /></button>
                        </div>
                      </div>
                    </div>
                    <p className="font-semibold tabular-nums flex-shrink-0">{formatBRL(line.total_price)}</p>
                  </div>
                ))
              )}

              {cart.length > 0 && featuredSuggestions.length > 0 && (
                <div className="pt-2">
                  <p className="text-sm font-semibold text-gray-900 mb-2">Peça também</p>
                  <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                    {featuredSuggestions.map((p) => (
                      <button key={p.id} onClick={() => quickAdd(p)} className="flex-shrink-0 w-28 text-left bg-gray-50 rounded-xl p-2 border border-gray-100">
                        {p.image_url && (
                          <div className="relative w-full h-16 rounded-lg overflow-hidden mb-1">
                            <SmartImage src={p.image_url} alt={p.name} fill sizes="112px" className="object-cover" />
                          </div>
                        )}
                        <p className="text-xs font-medium text-gray-900 truncate">{p.name}</p>
                        <p className="text-xs font-bold text-primary-600">{formatBRL(Number(p.price))}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {cart.length > 0 && hasCompleto && (
                <div className="pt-2 space-y-2">
                  {appliedCoupon ? (
                    <div className="flex items-center justify-between bg-primary-50 text-primary-800 text-sm px-3 py-2.5 rounded-xl">
                      <span>Cupom <strong>{appliedCoupon.code}</strong> aplicado</span>
                      <button onClick={() => { setAppliedCoupon(null); setCouponInput('') }} aria-label="Remover cupom"><X size={15} /></button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        className="input-field text-sm py-2 uppercase"
                        placeholder="Cupom de desconto"
                        value={couponInput}
                        onChange={(e) => { setCouponInput(e.target.value.toUpperCase()); setCouponError(null) }}
                        aria-label="Cupom de desconto"
                      />
                      <button onClick={applyCoupon} disabled={couponLoading || !couponInput.trim()} className="btn-secondary text-sm py-2 px-3 flex-shrink-0">
                        {couponLoading ? <Loader2 size={14} className="animate-spin" /> : 'Aplicar'}
                      </button>
                    </div>
                  )}
                  {couponError && <p className="text-xs text-red-600">{couponError}</p>}
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <div className="border-t border-gray-100 px-5 pt-3 bg-white" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
                {!isTableMode && orderType === 'delivery' && totals.missingForFreeShipping > 0 && (
                  <div className="mb-3">
                    <p className="text-xs text-gray-600 mb-1">Faltam <strong>{formatBRL(totals.missingForFreeShipping)}</strong> para entrega grátis</p>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-primary-500" style={{ width: `${Math.min(100, (cartSubtotal / Number(establishment.free_shipping_threshold)) * 100)}%` }} />
                    </div>
                  </div>
                )}
                <TotalsRows totals={totals} isDelivery={!isTableMode && orderType === 'delivery'} discountLabel={appliedCoupon?.code || appliedReward?.name} />
                {belowMinOrder && <p className="text-xs text-amber-700 mt-2">Pedido mínimo de {formatBRL(minOrder)}. Faltam {formatBRL(minOrder - cartSubtotal)}.</p>}
                <button onClick={openCheckout} disabled={!canOrder || belowMinOrder} className="btn-primary w-full py-3.5 mt-3 justify-between disabled:opacity-50">
                  <span>{canOrder ? 'Continuar' : 'Loja fechada agora'}</span>
                  <span className="tabular-nums">{formatBRL(totals.total)}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Finalizar */}
      {showCheckout && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowCheckout(false)} />
          <div className="relative bg-white w-full sm:max-w-lg max-h-[94vh] rounded-t-3xl sm:rounded-2xl shadow-xl flex flex-col animate-slide-up sm:animate-fade-in">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 id="checkout-title" className="font-display text-lg font-extrabold">{isTableMode ? `Pedido para a ${tableLabel}` : 'Finalizar pedido'}</h2>
              <button onClick={() => setShowCheckout(false)} className="p-1.5 hover:bg-gray-100 rounded-lg" aria-label="Fechar"><X size={20} /></button>
            </div>

            <div className="absolute -left-[9999px]" aria-hidden="true">
              <label htmlFor="website">Não preencha</label>
              <input id="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
              {/* Você */}
              <fieldset className="space-y-3">
                <legend className="font-semibold text-gray-900 mb-2">Seus dados</legend>
                <div>
                  <label htmlFor="c-name" className="block text-sm text-gray-700 mb-1">Nome</label>
                  <input id="c-name" autoComplete="name" className={`input-field ${fieldError('name') ? 'border-red-400' : ''}`} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Como podemos te chamar?" />
                </div>
                <div>
                  <label htmlFor="c-phone" className="block text-sm text-gray-700 mb-1">
                    WhatsApp {isTableMode && <span className="text-gray-400">(opcional)</span>}
                    {profileLoading && <Loader2 size={12} className="inline-block animate-spin ml-2 text-gray-400" />}
                  </label>
                  <input
                    id="c-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    className={`input-field ${fieldError('phone') ? 'border-red-400' : ''}`}
                    value={customerPhone}
                    onChange={(e) => { setCustomerPhone(formatPhoneNumber(e.target.value)); setProfile(null); setProfileExistsUnverified(false) }}
                    onBlur={() => lookupProfile(customerPhone)}
                    placeholder="(11) 99999-8888"
                  />
                  {profile?.verified && <p className="text-xs text-green-700 mt-1">Olá de novo, {profile.name.split(' ')[0]}! Seus endereços estão aqui.</p>}
                </div>
                {profileExistsUnverified && !profile && (
                  <VerifyPhone establishmentId={establishment.id} phone={customerPhone} compact onVerified={() => lookupProfile(customerPhone)} />
                )}
              </fieldset>

              {/* Como receber */}
              {!isTableMode && (
                <fieldset className="space-y-3">
                  <legend className="font-semibold text-gray-900 mb-2">Como você quer receber?</legend>
                  {offersDelivery && offersPickup && (
                    <div className="grid grid-cols-2 gap-2">
                      {([['delivery', 'Entrega', Bike], ['pickup', 'Retirar', Package]] as const).map(([value, label, Icon]) => (
                        <button key={value} type="button" onClick={() => setOrderType(value)} aria-pressed={orderType === value} className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 text-sm font-semibold ${orderType === value ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600'}`}>
                          <Icon size={17} /> {label}
                        </button>
                      ))}
                    </div>
                  )}

                  {orderType === 'pickup' ? (
                    establishment.address && (
                      <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(establishment.address)}`} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 bg-gray-50 rounded-xl p-3 text-sm text-gray-700">
                        <MapPin size={16} className="text-gray-400 flex-shrink-0 mt-0.5" /> Retire em: {establishment.address}
                      </a>
                    )
                  ) : (
                    <div className="space-y-3">
                      {profile?.verified && profile.addresses.length > 0 && (
                        <div className="space-y-2">
                          {profile.addresses.map((addr) => (
                            <div key={addr.id} className="flex items-center gap-2">
                              <button type="button" onClick={() => selectSavedAddress(addr)} className={`flex-1 text-left p-3 rounded-xl border-2 ${selectedAddressId === addr.id && addressMode === 'select' ? 'border-primary-500 bg-primary-50' : 'border-gray-200'}`}>
                                <p className="text-sm font-semibold text-gray-900">{addr.label}</p>
                                <p className="text-xs text-gray-500 truncate">{addr.street}, {addr.number} · {addr.neighborhood}</p>
                              </button>
                              <button type="button" onClick={() => handleDeleteSavedAddress(addr.id)} className="p-2 text-gray-400 hover:text-red-500" aria-label="Remover endereço salvo"><Trash2 size={16} /></button>
                            </div>
                          ))}
                          <button type="button" onClick={() => { setAddressMode('new'); setSelectedAddressId(''); setAddress(EMPTY_ADDRESS); setNeighborhoodId('') }} className={`w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed rounded-xl text-sm ${addressMode === 'new' ? 'border-primary-400 text-primary-700' : 'border-gray-300 text-gray-600'}`}>
                            <PlusCircle size={16} /> Outro endereço
                          </button>
                        </div>
                      )}

                      {(addressMode === 'new' || !profile?.verified || profile.addresses.length === 0) && (
                        <div className="space-y-3">
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label htmlFor="a-cep" className="block text-xs text-gray-600 mb-1">CEP</label>
                              <div className="relative">
                                <input id="a-cep" inputMode="numeric" autoComplete="postal-code" className="input-field text-sm" value={address.zip_code} onChange={(e) => setAddress({ ...address, zip_code: formatCep(e.target.value) })} onBlur={handleCepBlur} placeholder="00000-000" />
                                {cepLoading && <Loader2 size={14} className="animate-spin text-gray-400 absolute right-2 top-1/2 -translate-y-1/2" />}
                              </div>
                            </div>
                            <div className="col-span-2">
                              <label htmlFor="a-label" className="block text-xs text-gray-600 mb-1">Nome do endereço</label>
                              <input id="a-label" className="input-field text-sm" value={addressLabel} onChange={(e) => setAddressLabel(e.target.value)} placeholder="Casa, Trabalho..." />
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="col-span-2">
                              <label htmlFor="a-street" className="block text-xs text-gray-600 mb-1">Rua</label>
                              <input id="a-street" autoComplete="address-line1" className={`input-field text-sm ${fieldError('street') ? 'border-red-400' : ''}`} value={address.street} onChange={(e) => setAddress({ ...address, street: e.target.value })} />
                            </div>
                            <div>
                              <label htmlFor="a-number" className="block text-xs text-gray-600 mb-1">Número</label>
                              <input id="a-number" className={`input-field text-sm ${fieldError('number') ? 'border-red-400' : ''}`} value={address.number} onChange={(e) => setAddress({ ...address, number: e.target.value })} />
                            </div>
                          </div>
                          <div>
                            <label htmlFor="a-neigh" className="block text-xs text-gray-600 mb-1">Bairro</label>
                            {usingNeighborhoodSelect ? (
                              <select id="a-neigh" className={`input-field text-sm ${fieldError('neighborhood') ? 'border-red-400' : ''}`} value={neighborhoodId} onChange={(e) => setNeighborhoodId(e.target.value)}>
                                <option value="">Selecione o bairro</option>
                                {neighborhoods.map((n) => (
                                  <option key={n.id} value={n.id}>{n.name} · {Number(n.fee) > 0 ? formatBRL(Number(n.fee)) : 'grátis'}</option>
                                ))}
                              </select>
                            ) : (
                              <input id="a-neigh" className={`input-field text-sm ${fieldError('neighborhood') ? 'border-red-400' : ''}`} value={address.neighborhood} onChange={(e) => setAddress({ ...address, neighborhood: e.target.value })} />
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label htmlFor="a-comp" className="block text-xs text-gray-600 mb-1">Complemento</label>
                              <input id="a-comp" className="input-field text-sm" value={address.complement} onChange={(e) => setAddress({ ...address, complement: e.target.value })} placeholder="Apto, bloco" />
                            </div>
                            <div>
                              <label htmlFor="a-ref" className="block text-xs text-gray-600 mb-1">Referência</label>
                              <input id="a-ref" className="input-field text-sm" value={address.reference} onChange={(e) => setAddress({ ...address, reference: e.target.value })} placeholder="Perto de..." />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </fieldset>
              )}

              {/* Pontos */}
              {!appliedCoupon && hasCompleto && loyaltySettings?.is_active && loyaltyRewards.length > 0 && profile?.verified && (
                <fieldset>
                  <legend className="font-semibold text-gray-900 mb-2 flex items-center gap-1.5"><Gift size={16} className="text-primary-600" /> Seus pontos: {profile.loyalty_points_balance}</legend>
                  {appliedReward ? (
                    <div className="flex items-center justify-between bg-primary-50 text-primary-800 text-sm px-3 py-2.5 rounded-xl">
                      <span>{appliedReward.name} (-{appliedReward.pointsCost} pontos)</span>
                      <button onClick={() => { setAppliedReward(null); setSelectedRewardId('') }} aria-label="Remover recompensa"><X size={15} /></button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <select className="input-field text-sm" value={selectedRewardId} onChange={(e) => setSelectedRewardId(e.target.value)} aria-label="Escolher recompensa">
                        <option value="">Usar pontos em...</option>
                        {loyaltyRewards.map((r) => (
                          <option key={r.id} value={r.id} disabled={profile.loyalty_points_balance < r.points_cost}>
                            {r.name} · {r.points_cost} pontos{profile.loyalty_points_balance < r.points_cost ? ` (faltam ${r.points_cost - profile.loyalty_points_balance})` : ''}
                          </option>
                        ))}
                      </select>
                      <button onClick={() => applyReward(selectedRewardId)} disabled={rewardLoading || !selectedRewardId} className="btn-secondary text-sm py-2 px-3 flex-shrink-0">
                        {rewardLoading ? <Loader2 size={14} className="animate-spin" /> : 'Usar'}
                      </button>
                    </div>
                  )}
                  {rewardError && <p className="text-xs text-red-600 mt-1">{rewardError}</p>}
                </fieldset>
              )}

              {/* Pagamento */}
              {!isTableMode && (
                <fieldset>
                  <legend className={`font-semibold mb-2 ${fieldError('payment') ? 'text-red-600' : 'text-gray-900'}`}>Pagamento</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {visiblePaymentMethods.map((p) => (
                      <label key={p.value} className={`flex items-center gap-2 p-3 rounded-xl border-2 text-sm cursor-pointer ${paymentMethod === p.value ? 'border-primary-500 bg-primary-50 text-primary-800 font-semibold' : 'border-gray-200 text-gray-700'}`}>
                        <input type="radio" name="payment" value={p.value} checked={paymentMethod === p.value} onChange={() => setPaymentMethod(p.value)} className="sr-only" />
                        {p.value === 'mercadopago_pix' ? 'Pix (confirmação na hora)' : p.value === 'outro' ? 'Outro (combinar)' : p.label}
                      </label>
                    ))}
                  </div>
                  {paymentMethod === 'dinheiro' && (
                    <div className="mt-3 bg-gray-50 rounded-xl p-3 space-y-2">
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" checked={needsChange} onChange={(e) => setNeedsChange(e.target.checked)} className="rounded text-primary-500" />
                        Preciso de troco
                      </label>
                      {needsChange && (
                        <div>
                          <label htmlFor="change-for" className="block text-xs text-gray-600 mb-1">Troco para quanto?</label>
                          <input id="change-for" inputMode="decimal" className={`input-field text-sm ${fieldError('change') ? 'border-red-400' : ''}`} value={changeFor} onChange={(e) => setChangeFor(e.target.value.replace(/[^\d,.]/g, ''))} placeholder="Ex: 100" />
                        </div>
                      )}
                    </div>
                  )}
                  {paymentMethod === 'pix' && canShowPixQr && (
                    <div className="mt-3 bg-gray-50 rounded-xl p-4 text-center">
                      <p className="text-sm font-medium text-gray-700 mb-2">Pague {formatBRL(totals.total)} com Pix</p>
                      {pixQr && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={pixQr} alt="QR Code Pix" className="mx-auto rounded-lg" width={180} height={180} />
                      )}
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(pixPayload)
                            setPixCopied(true)
                            setTimeout(() => setPixCopied(false), 2000)
                          } catch {
                            toast('Não deu para copiar. Use o QR Code.')
                          }
                        }}
                        className="btn-secondary text-sm mt-3 w-full"
                      >
                        <Copy size={14} /> {pixCopied ? 'Código copiado!' : 'Copiar código Pix'}
                      </button>
                      <p className="text-xs text-gray-500 mt-2">Depois de pagar, envie o pedido. A loja confere o pagamento.</p>
                    </div>
                  )}
                  {paymentMethod === 'mercadopago_pix' && (
                    <p className="text-xs text-gray-600 mt-2 bg-gray-50 rounded-xl p-3">Ao enviar, mostramos o QR Code. Assim que você pagar, a loja recebe o pedido confirmado.</p>
                  )}
                </fieldset>
              )}

              <div>
                <label htmlFor="o-notes" className="block font-semibold text-gray-900 mb-2">Observações do pedido</label>
                <textarea id="o-notes" className="input-field text-sm" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex: interfone quebrado, ligar quando chegar" />
              </div>
            </div>

            <div className="border-t border-gray-100 px-5 pt-3 bg-white" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
              <TotalsRows totals={totals} isDelivery={!isTableMode && orderType === 'delivery'} discountLabel={appliedCoupon?.code || appliedReward?.name} />
              {attemptedSubmit && missingFields.length > 0 && (
                <p className="mt-2 text-sm text-red-600 flex items-start gap-1.5"><AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> Falta: {missingFields.map((f) => f.label).join(', ')}</p>
              )}
              {submitError && (
                <p className="mt-2 text-sm text-red-600 flex items-start gap-1.5" role="alert"><AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> {submitError}</p>
              )}
              <button onClick={handleSubmit} disabled={saving} className="btn-primary w-full py-3.5 mt-3 justify-between">
                {saving ? <Loader2 size={18} className="animate-spin mx-auto" /> : (
                  <>
                    <span className="flex items-center gap-2"><Send size={17} /> {isTableMode ? 'Enviar para a cozinha' : 'Fazer pedido'}</span>
                    <span className="tabular-nums">{formatBRL(totals.total)}</span>
                  </>
                )}
              </button>
              {!isTableMode && <p className="text-[11px] text-gray-500 text-center mt-2">O valor final é confirmado pela loja ao registrar o pedido.</p>}
            </div>
          </div>
        </div>
      )}

      {/* Pedido recebido */}
      {placed && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="placed-title">
          <div className="fixed inset-0 bg-black/50" />
          <div className="relative bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-xl p-6 text-center animate-slide-up sm:animate-fade-in" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}>
            <div className="w-16 h-16 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 size={34} />
            </div>
            <h2 id="placed-title" className="font-display text-2xl font-extrabold text-gray-900">Pedido recebido!</h2>
            <p className="text-sm text-gray-600 mt-1">
              A {establishment.name} já tem seu pedido <span className="font-mono font-semibold">#{placed.orderId.slice(0, 8)}</span> · {formatBRL(placed.total)}
            </p>
            <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-700 mt-4 flex items-start gap-2 text-left">
              <Info size={16} className="text-primary-600 flex-shrink-0 mt-0.5" />
              <span>Se o WhatsApp abriu, toque em <strong>enviar</strong> para avisar a loja mais rápido. Não é obrigatório: o pedido já está registrado.</span>
            </div>
            <div className="grid gap-2 mt-4">
              <Link href={`/pedido/${placed.orderId}`} className="btn-primary w-full py-3">Acompanhar pedido</Link>
              {placed.whatsappUrl && (
                <a href={placed.whatsappUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary w-full py-3">Abrir no WhatsApp</a>
              )}
            </div>
            <div className="mt-4">
              <InstallPrompt storeId={establishment.id} storeName={establishment.name} />
            </div>
            <button onClick={() => setPlaced(null)} className="text-sm text-gray-500 mt-4 underline">Voltar ao cardápio</button>
          </div>
        </div>
      )}

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

      {mpFailure && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="alertdialog" aria-modal="true">
          <div className="fixed inset-0 bg-black/50" />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center animate-fade-in">
            <AlertCircle size={36} className="text-amber-500 mx-auto mb-2" />
            <p className="font-semibold text-gray-900">Não deu para gerar o Pix agora</p>
            <p className="text-sm text-gray-600 mt-1">Seu pedido está salvo ({formatBRL(mpFailure.amount)}). É só tentar de novo.</p>
            <p className="text-xs text-gray-400 mt-1">{mpFailure.message}</p>
            <button
              onClick={() => { setMpRetrying(true); tryCreateMercadoPagoPayment(mpFailure.orderId, mpFailure.amount).finally(() => setMpRetrying(false)) }}
              disabled={mpRetrying}
              className="btn-primary w-full mt-4"
            >
              {mpRetrying ? <Loader2 size={18} className="animate-spin" /> : 'Tentar novamente'}
            </button>
            <Link href={`/pedido/${mpFailure.orderId}`} className="text-xs text-gray-500 underline mt-3 inline-block">Acompanhar esse pedido</Link>
          </div>
        </div>
      )}

      {sheetProduct && (
        <ProductSheet
          product={sheetProduct}
          groups={groupsByProduct[sheetProduct.id] || []}
          canOrder={canOrder}
          onConfirm={(r) => handleSheetConfirm(sheetProduct, r)}
          onClose={() => setSheetProduct(null)}
        />
      )}
      {pizzaProduct && pizzaProduct.pizza_flavor_id && (
        <PizzaOrderModal
          productId={pizzaProduct.id}
          productName={pizzaProduct.name}
          productImageUrl={pizzaProduct.image_url}
          pizzaFlavorId={pizzaProduct.pizza_flavor_id}
          establishmentId={establishment.id}
          onConfirm={(r) => handlePizzaConfirm(pizzaProduct, r)}
          onClose={() => setPizzaProduct(null)}
        />
      )}
      {comboOpen && (
        <ComboOrderModal
          comboId={comboOpen.id}
          comboName={comboOpen.name}
          comboImageUrl={comboOpen.image_url}
          comboPrice={comboOpen.price}
          establishmentId={establishment.id}
          onConfirm={(r) => handleComboConfirm(comboOpen, r)}
          onClose={() => setComboOpen(null)}
        />
      )}

      {/* Sobre a loja */}
      {showStoreInfo && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="store-info-title">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowStoreInfo(false)} />
          <div className="fixed inset-x-0 bottom-0 sm:inset-y-0 sm:left-auto sm:right-0 sm:w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-none max-h-[90vh] sm:max-h-none overflow-y-auto animate-slide-up sm:animate-slide-in">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
              <h2 id="store-info-title" className="font-display text-lg font-extrabold">{establishment.name}</h2>
              <button onClick={() => setShowStoreInfo(false)} className="p-1.5 hover:bg-gray-100 rounded-lg" aria-label="Fechar"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-5">
              {establishment.description && <p className="text-sm text-gray-600">{establishment.description}</p>}
              {establishment.address && (
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(establishment.address)}`} target="_blank" rel="noopener noreferrer" className="flex items-start gap-3 text-sm text-gray-700">
                  <MapPin size={18} className="text-gray-400 flex-shrink-0 mt-0.5" />
                  <span>{establishment.address}<br /><span className="text-xs text-primary-600">Ver no mapa</span></span>
                </a>
              )}
              <a href={`https://wa.me/${toWhatsAppNumber(establishment.whatsapp_number)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-sm text-gray-700">
                <Send size={18} className="text-gray-400 flex-shrink-0" /> {formatPhoneNumber(establishment.whatsapp_number)}
              </a>
              {establishment.instagram_url && (
                <a href={establishment.instagram_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-sm text-gray-700">
                  <Instagram size={18} className="text-gray-400 flex-shrink-0" /> Instagram
                </a>
              )}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-1.5"><Clock size={16} className="text-gray-400" /> Horário de funcionamento</h3>
                <div className="space-y-1">
                  {getWeeklyHours(establishment.opening_hours, now, establishment.timezone || undefined).map((day) => (
                    <div key={day.key} className={`flex justify-between text-sm ${day.isToday ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
                      <span>{day.label}</span>
                      <span className="tabular-nums">{day.hours ? `${day.hours.open} - ${day.hours.close}` : 'Fechado'}</span>
                    </div>
                  ))}
                </div>
              </div>
              {hasCompleto && loyaltySettings?.is_active && (
                <div className="bg-primary-50 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-primary-800 flex items-center gap-1.5"><Gift size={16} /> Programa de pontos</h3>
                  <p className="text-sm text-primary-800 mt-1">
                    Cada R$ 1 em pedidos vale {Number(loyaltySettings.points_per_currency)} ponto(s). Troque por recompensas na hora de pedir.
                  </p>
                  {profile?.verified && <p className="text-sm font-semibold text-primary-900 mt-2">Você tem {profile.loyalty_points_balance} pontos.</p>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TotalsRows({ totals, isDelivery, discountLabel }: { totals: ReturnType<typeof computeCartTotals>; isDelivery: boolean; discountLabel?: string }) {
  return (
    <div className="space-y-1 text-sm">
      <div className="flex justify-between text-gray-600"><span>Subtotal</span><span className="tabular-nums">{formatBRL(totals.subtotal)}</span></div>
      {totals.discount > 0 && (
        <div className="flex justify-between text-green-700"><span>Desconto{discountLabel ? ` (${discountLabel})` : ''}</span><span className="tabular-nums">-{formatBRL(totals.discount)}</span></div>
      )}
      {isDelivery && (
        <div className="flex justify-between text-gray-600">
          <span>Entrega</span>
          <span className="tabular-nums">{totals.deliveryFee > 0 ? formatBRL(totals.deliveryFee) : <span className="text-green-700">Grátis</span>}</span>
        </div>
      )}
      <div className="flex justify-between font-bold text-base text-gray-900 pt-1"><span>Total</span><span className="tabular-nums">{formatBRL(totals.total)}</span></div>
    </div>
  )
}
