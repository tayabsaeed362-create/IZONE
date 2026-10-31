'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import {
  formatCurrency,
  formatDateTime,
  generateOperationId,
} from '@izone/shared'
import { toast } from 'sonner'
import { BarcodeScannerModal, ScannedProductItem } from '@/components/pos/BarcodeScannerModal'
import { ReceiptModal, ReceiptData } from '@/components/pos/ReceiptModal'
import { getDb, saveOfflineSaleAtomic, findBarcodeOffline } from '@/lib/db'
import { useSyncManager } from '@/hooks/useSyncManager'

// ── Types ────────────────────────────────────────────────────────
interface POSProduct {
  id: string
  name: string
  sku: string
  sellingPrice: number
  minSellingPrice?: number
  quantity: number
  images: string[]
  hasImei: boolean
  imei1?: string | null
  imei2?: string | null
  imeiCycle?: number
  categoryId?: string | null
  category?: { id: string; name: string } | null
  barcodes: Array<{ id: string; barcode: string; type: string }>
  variants: Array<{
    id: string
    name: string
    sku: string
    sellingPrice: number
    minSellingPrice?: number
    quantity: number
    attributes: Record<string, string>
    barcodes: Array<{ barcode: string }>
  }>
}

interface CartItem {
  clientId: string
  productId: string
  variantId?: string | null
  productName: string
  variantName?: string | null
  displayName: string
  sku: string
  unitPrice: number
  minSellingPrice?: number
  quantity: number
  availableStock: number
  discountAmount: number
  totalAmount: number
  imei?: string
  image?: string
}

interface RecentSale {
  id: string
  saleNumber: string
  saleAt: string
  totalAmount: number
  status: string
  customer?: { name: string; phone?: string | null } | null
  user: { name: string }
  items: Array<{
    id: string
    productName: string
    sku: string
    quantity: number
    unitPrice: number
    discountAmount: number
    totalAmount: number
  }>
  payments: Array<{ method: string; amount: number }>
}

export default function POSTerminalPage() {
  const { data: session } = useSession()
  const sync = useSyncManager()

  // ── State ────────────────────────────────────────────────────
  const [products, setProducts] = useState<POSProduct[]>([])
  const [isLoadingProducts, setIsLoadingProducts] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<'smartphones' | 'accessories' | 'out-of-stock'>('smartphones')
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([])

  const catalogRequest = useRef(0)

  // Cart
  const [cart, setCart] = useState<CartItem[]>([])
  const [orderDiscount, setOrderDiscount] = useState<number>(0)
  const [taxRate, setTaxRate] = useState<number>(0) // 0% default in PKR mobile shops

  // Modals
  const [isScannerOpen, setIsScannerOpen] = useState(false)
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false)
  const [isReceiptOpen, setIsReceiptOpen] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [activeReceipt, setActiveReceipt] = useState<ReceiptData | null>(null)

  // Checkout inputs
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'MOBILE_WALLET' | 'CREDIT'>('CASH')
  const [tenderAmount, setTenderAmount] = useState<string>('')
  const [customerName, setCustomerName] = useState<string>('')
  const [customerPhone, setCustomerPhone] = useState<string>('')
  const [saleNotes, setSaleNotes] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState<false | true>(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)

  // Recent sales
  const [recentSales, setRecentSales] = useState<RecentSale[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  // Variant selector modal
  const [variantSelectorProduct, setVariantSelectorProduct] = useState<POSProduct | null>(null)

  // ── Fetch Products & Categories (Online API or Offline IndexedDB) ─
  const loadCatalog = useCallback(async (quiet = false) => {
    const request = ++catalogRequest.current
    if (!quiet) setIsLoadingProducts(true)
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true

    if (isOnline) {
      try {
        const [prodRes, catRes] = await Promise.all([
          fetch('/api/products?limit=100', { cache: 'no-store' }),
          fetch('/api/categories'),
        ])

        const [prodData, catData] = await Promise.all([prodRes.json(), catRes.json()])

        if (!prodRes.ok || !prodData.success) throw new Error('Catalog unavailable')
        const allProducts: POSProduct[] = [...prodData.data.products]
        for (let page = 2; page <= (prodData.data.pagination?.pages ?? 1); page++) {
          const response = await fetch(`/api/products?limit=100&page=${page}`, { cache: 'no-store' })
          const result = await response.json()
          if (!response.ok || !result.success) throw new Error('Catalog page unavailable')
          allProducts.push(...result.data.products)
        }
        if (request !== catalogRequest.current) return
        setProducts(allProducts)
        if (catData.success) {
          setCategories(catData.data)
        }
        setIsLoadingProducts(false)
        return
      } catch (err) {
        console.warn('Online catalog fetch failed, falling back to IndexedDB:', err)
      }
    }

    // Offline / Local IndexedDB Fallback
    try {
      const db = getDb()
      const [offlineProds, offlineCats] = await Promise.all([
        db.products.toArray(),
        db.categories.toArray(),
      ])

      if (request !== catalogRequest.current) return
      if (offlineProds.length > 0) {
        setProducts(offlineProds as any)
      }
      if (offlineCats.length > 0) {
        setCategories(offlineCats)
      }
    } catch (dbErr) {
      console.error('Error loading offline catalog from IndexedDB:', dbErr)
    } finally {
      if (request === catalogRequest.current) setIsLoadingProducts(false)
    }
  }, [])

  useEffect(() => {
    loadCatalog()
  }, [loadCatalog])

  // Keep stock views current after restocking elsewhere, without resetting the cart.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') void loadCatalog(true)
    }
    const timer = window.setInterval(refresh, 15000)
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('online', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [loadCatalog])

  // ── Fetch Recent Sales ───────────────────────────────────────
  const loadRecentSales = useCallback(async () => {
    setIsLoadingHistory(true)
    try {
      const res = await fetch('/api/sales?limit=15')
      const json = await res.json()
      if (json.success) {
        setRecentSales(json.data.sales)
      }
    } catch (err) {
      console.error('Error fetching sales history:', err)
    } finally {
      setIsLoadingHistory(false)
    }
  }, [])

  // ── Cart Calculations ────────────────────────────────────────
  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.unitPrice * item.quantity - item.discountAmount, 0)
  }, [cart])

  const calculatedTax = useMemo(() => {
    return Math.round((subtotal - orderDiscount) * (taxRate / 100))
  }, [subtotal, orderDiscount, taxRate])

  const grandTotal = useMemo(() => {
    return Math.max(0, subtotal - orderDiscount + calculatedTax)
  }, [subtotal, orderDiscount, calculatedTax])

  const parsedTender = parseFloat(tenderAmount) || 0
  const changeDue = Math.max(0, parsedTender - grandTotal)

  // ── Add Item to Cart ─────────────────────────────────────────
  const addToCart = useCallback(
    (product: POSProduct, variantId?: string) => {
      let variant = null
      if (variantId) {
        variant = product.variants.find((v) => v.id === variantId)
      } else if (product.variants.length > 0) {
        // If has multiple variants, open variant selector modal
        setVariantSelectorProduct(product)
        return
      }

      const clientKey = variant ? `${product.id}_${variant.id}` : product.id
      const sellingPrice = variant ? (variant.sellingPrice || product.sellingPrice) : product.sellingPrice
      const minSellingPrice = variant ? (variant.minSellingPrice || product.minSellingPrice || 0) : (product.minSellingPrice || 0)
      const stock = variant ? variant.quantity : product.quantity
      const displayName = variant ? `${product.name} (${variant.name})` : product.name
      const sku = variant ? variant.sku : product.sku

      setCart((prevCart) => {
        const existingIdx = prevCart.findIndex((i) => i.clientId === clientKey)
        if (existingIdx >= 0) {
          const existing = prevCart[existingIdx]
          if (existing.quantity >= stock) {
            alert(`Cannot add more than available stock (${stock} units)`)
            return prevCart
          }
          const updated = [...prevCart]
          const newQty = existing.quantity + 1
          updated[existingIdx] = {
            ...existing,
            quantity: newQty,
            totalAmount: existing.unitPrice * newQty - existing.discountAmount,
          }
          return updated
        }

        if (stock <= 0) {
          alert(`Item is currently out of stock (${product.name})`)
          return prevCart
        }

        const newItem: CartItem = {
          clientId: clientKey,
          productId: product.id,
          variantId: variant ? variant.id : null,
          productName: product.name,
          variantName: variant ? variant.name : null,
          displayName,
          sku,
          unitPrice: sellingPrice,
          minSellingPrice,
          quantity: 1,
          availableStock: stock,
          discountAmount: 0,
          totalAmount: sellingPrice,
          image: product.images[0],
        }
        return [...prevCart, newItem]
      })
    },
    []
  )

  // ── Add Scanned Barcode Product to Cart ──────────────────────
  const handleScannedProduct = useCallback((item: ScannedProductItem) => {
    const clientKey = item.variantId ? `${item.productId}_${item.variantId}` : item.productId

    setCart((prevCart) => {
      const existingIdx = prevCart.findIndex((i) => i.clientId === clientKey)
      if (existingIdx >= 0) {
        const existing = prevCart[existingIdx]
        if (existing.quantity >= item.quantity) {
          alert(`Cannot add more than available stock (${item.quantity} units)`)
          return prevCart
        }
        const updated = [...prevCart]
        const newQty = existing.quantity + 1
        updated[existingIdx] = {
          ...existing,
          quantity: newQty,
          totalAmount: existing.unitPrice * newQty - existing.discountAmount,
        }
        return updated
      }

      if (item.quantity <= 0) {
        alert(`Scanned item is currently out of stock (${item.displayName})`)
        return prevCart
      }

      const newItem: CartItem = {
        clientId: clientKey,
        productId: item.productId,
        variantId: item.variantId || null,
        productName: item.productName,
        variantName: item.variantName || null,
        displayName: item.displayName,
        sku: item.sku,
        unitPrice: item.sellingPrice,
        minSellingPrice: item.minSellingPrice || 0,
        quantity: 1,
        availableStock: item.quantity,
        discountAmount: item.discountAmount ?? 0,
        totalAmount: item.sellingPrice - (item.discountAmount ?? 0),
        image: item.images?.[0],
      }
      return [...prevCart, newItem]
    })
  }, [])

  // ── Lookup barcode / SKU / IMEI and add to cart (Hardware & Search) ───
  const scanAndAddToCart = useCallback(
    async (codeToScan: string) => {
      const clean = codeToScan.trim()
      if (!clean) return

      // 1. Check in-memory products
      const cleanLower = clean.toLowerCase()
      const inMemoryMatch = products.find((p) => {
        const matchesSku = p.sku.toLowerCase() === cleanLower
        const matchesBarcode = p.barcodes.some((b) => b.barcode === clean)
        const matchesImei = p.imei1 === clean || p.imei2 === clean
        const matchesVariant = p.variants.some(
          (v) => v.sku.toLowerCase() === cleanLower || v.barcodes.some((b) => b.barcode === clean)
        )
        return matchesSku || matchesBarcode || matchesImei || matchesVariant
      })

      if (inMemoryMatch) {
        const matchedVariant = inMemoryMatch.variants.find(
          (v) => v.sku.toLowerCase() === cleanLower || v.barcodes.some((b) => b.barcode === clean)
        )
        handleScannedProduct({
          matchType: matchedVariant ? 'variant' : 'product',
          productId: inMemoryMatch.id,
          variantId: matchedVariant?.id || null,
          productName: inMemoryMatch.name,
          variantName: matchedVariant?.name || null,
          displayName: matchedVariant ? `${inMemoryMatch.name} (${matchedVariant.name})` : inMemoryMatch.name,
          sku: matchedVariant ? matchedVariant.sku : inMemoryMatch.sku,
          sellingPrice: matchedVariant ? (matchedVariant.sellingPrice || inMemoryMatch.sellingPrice) : inMemoryMatch.sellingPrice,
          minSellingPrice: matchedVariant ? (matchedVariant.minSellingPrice || inMemoryMatch.minSellingPrice || 0) : (inMemoryMatch.minSellingPrice || 0),
          quantity: matchedVariant ? matchedVariant.quantity : inMemoryMatch.quantity,
          images: inMemoryMatch.images,
          hasImei: inMemoryMatch.hasImei,
          barcode: clean,
        })
        toast.success(`Scanned: ${inMemoryMatch.name}`)
        setSearchQuery('')
        return
      }

      // 2. Fetch from online barcode API
      try {
        const res = await fetch(`/api/products/barcode/${encodeURIComponent(clean)}`)
        const json = await res.json()
        if (res.ok && json.success && json.data) {
          handleScannedProduct(json.data)
          toast.success(`Scanned: ${json.data.displayName}`)
          setSearchQuery('')
          return
        }
      } catch (err) {
        console.warn('Barcode online lookup error:', err)
      }

      // 3. Fallback: local IndexedDB offline lookup
      try {
        const localMatch = await findBarcodeOffline(clean)
        if (localMatch) {
          handleScannedProduct({
            matchType: localMatch.variantId ? 'variant' : 'product',
            productId: localMatch.productId,
            variantId: localMatch.variantId || null,
            productName: localMatch.productName,
            variantName: localMatch.variantName || null,
            displayName: localMatch.displayName,
            sku: localMatch.sku,
            sellingPrice: localMatch.sellingPrice,
            minSellingPrice: localMatch.minSellingPrice || 0,
            quantity: localMatch.quantity,
            images: localMatch.images,
            hasImei: localMatch.hasImei,
            categoryName: localMatch.categoryName,
            barcode: localMatch.barcode,
          })
          toast.success(`Scanned: ${localMatch.displayName}`)
          setSearchQuery('')
          return
        }
      } catch {}

      toast.error(`Barcode / IMEI "${clean}" catalog mein nahi mila. Pehle Inventory se product add karein.`)
    },
    [products, handleScannedProduct]
  )

  // ── Global Hardware Barcode Scanner Listener ───────────────────
  useEffect(() => {
    let buffer = ''
    let lastKeyTime = 0

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement as HTMLElement | null
      const isInput = activeEl?.tagName === 'INPUT' || activeEl?.tagName === 'TEXTAREA'

      // Allow typing in checkout inputs or modals without interference
      if (isInput && activeEl?.getAttribute('data-barcode-search') !== 'true') {
        return
      }

      const now = Date.now()

      if (e.key === 'Enter') {
        if (buffer.length >= 3 && now - lastKeyTime < 300) {
          e.preventDefault()
          const code = buffer.trim()
          buffer = ''
          scanAndAddToCart(code)
        } else {
          buffer = ''
        }
        return
      }

      if (e.key.length > 1) return

      // Reset buffer if delay between keystrokes is too long (human typing)
      if (now - lastKeyTime > 150) {
        buffer = ''
      }

      buffer += e.key
      lastKeyTime = now
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [scanAndAddToCart])

  // ── Cart Manipulations ───────────────────────────────────────
  const updateQuantity = (clientId: string, delta: number) => {
    setCart((prevCart) =>
      prevCart
        .map((item) => {
          if (item.clientId === clientId) {
            const nextQty = item.quantity + delta
            if (nextQty <= 0) return null
            if (nextQty > item.availableStock) {
              alert(`Only ${item.availableStock} units available in inventory`)
              return item
            }
            return {
              ...item,
              quantity: nextQty,
              totalAmount: item.unitPrice * nextQty - item.discountAmount,
            }
          }
          return item
        })
        .filter((item): item is CartItem => item !== null)
    )
  }

  const updateLineDiscount = (clientId: string, discount: number) => {
    const isOwner = session?.user?.role === 'OWNER'
    setCart((prevCart) =>
      prevCart.map((item) => {
        if (item.clientId === clientId) {
          let reqDiscount = Math.max(0, discount)
          const maxAllowedTotal = item.unitPrice * item.quantity
          if (!isOwner && item.minSellingPrice && item.minSellingPrice > 0) {
            const maxSellerDiscount = Math.max(0, (item.unitPrice - item.minSellingPrice) * item.quantity)
            if (reqDiscount > maxSellerDiscount) {
              alert(`Cannot sell "${item.displayName}" below threshold price of Rs ${item.minSellingPrice.toLocaleString()} per unit (Maximum seller discount: Rs ${Math.round(maxSellerDiscount).toLocaleString()})`)
              reqDiscount = maxSellerDiscount
            }
          }
          const validDisc = Math.min(maxAllowedTotal, reqDiscount)
          return {
            ...item,
            discountAmount: validDisc,
            totalAmount: item.unitPrice * item.quantity - validDisc,
          }
        }
        return item
      })
    )
  }

  const removeItem = (clientId: string) => {
    setCart((prevCart) => prevCart.filter((item) => item.clientId !== clientId))
  }

  const clearCart = () => {
    if (cart.length > 0 && confirm('Clear current cart?')) {
      setCart([])
      setOrderDiscount(0)
    }
  }

  // ── Checkout Execution ───────────────────────────────────────
  const validateSellerThresholdLimits = useCallback((): string | null => {
    const isOwner = session?.user?.role === 'OWNER'
    if (isOwner) return null
    const grossSubtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity - item.discountAmount, 0)
    const netRatio = grossSubtotal > 0 ? Math.max(0, (grossSubtotal - orderDiscount) / grossSubtotal) : 1
    for (const item of cart) {
      if (item.minSellingPrice && item.minSellingPrice > 0) {
        const finalUnitPrice = (item.totalAmount * netRatio) / item.quantity
        if (finalUnitPrice < item.minSellingPrice - 0.01) {
          return `Cannot sell "${item.displayName}" below minimum threshold price of Rs ${item.minSellingPrice.toLocaleString()} (Attempted Rs ${Math.round(finalUnitPrice).toLocaleString()}). Only Store Owner can override floor pricing.`
        }
      }
    }
    return null
  }, [session?.user?.role, cart, orderDiscount])

  const handleProceedToCheckout = () => {
    if (cart.length === 0) return
    const thresholdViolation = validateSellerThresholdLimits()
    if (thresholdViolation) {
      alert(thresholdViolation)
      return
    }
    setTenderAmount(grandTotal.toString())
    setCheckoutError(null)
    setIsCheckoutOpen(true)
  }

  const executeCheckout = async () => {
    if (cart.length === 0 || isSubmitting) return

    const thresholdViolation = validateSellerThresholdLimits()
    if (thresholdViolation) {
      setCheckoutError(thresholdViolation)
      return
    }

    if (paymentMethod === 'CASH' && parsedTender < grandTotal) {
      setCheckoutError(`Tender amount (₨${parsedTender}) must be at least total due (₨${grandTotal})`)
      return
    }

    setIsSubmitting(true)
    setCheckoutError(null)

    // Generate unique client operation ID for idempotency & offline audit
    const offlineOpId = generateOperationId()
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true

    // ── Direct Offline Checkout when offline ────────────────────
    if (!isOnline) {
      try {
        const offlineResult = await saveOfflineSaleAtomic({
          offlineOpId,
          customerName: customerName || undefined,
          cashierName: session?.user?.name ?? 'Cashier',
          items: cart.map((i) => ({
            productId: i.productId,
            variantId: i.variantId || undefined,
            productName: i.displayName,
            sku: i.sku,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            discountAmount: i.discountAmount,
            imei: i.imei,
          })),
          subtotal,
          discountAmount: orderDiscount,
          taxAmount: calculatedTax,
          totalAmount: grandTotal,
          payments: [
            {
              method: paymentMethod,
              amount: paymentMethod === 'CASH' ? parsedTender : grandTotal,
              reference: saleNotes || undefined,
            },
          ],
          notes: saleNotes || undefined,
        })

        const receiptDetails: ReceiptData = {
          saleNumber: offlineResult.receiptNumber,
          saleAt: offlineResult.receipt.saleAt,
          cashierName: offlineResult.receipt.cashierName,
          customer: customerName ? { name: customerName, phone: customerPhone } : null,
          items: cart.map((i) => ({
            productName: i.displayName,
            sku: i.sku,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            discountAmount: i.discountAmount,
            totalAmount: i.totalAmount,
          })),
          subtotal,
          discountAmount: orderDiscount,
          taxAmount: calculatedTax,
          totalAmount: grandTotal,
          payments: [{ method: paymentMethod, amount: paymentMethod === 'CASH' ? parsedTender : grandTotal }],
          totalPaid: paymentMethod === 'CASH' ? parsedTender : grandTotal,
          changeDue: paymentMethod === 'CASH' ? Math.max(0, parsedTender - grandTotal) : 0,
          notes: saleNotes,
          isOffline: true,
          syncStatus: 'LOCAL',
        }

        setActiveReceipt(receiptDetails)
        setIsCheckoutOpen(false)
        setIsReceiptOpen(true)

        sync.refreshCounts()
        loadCatalog()
        return
      } catch (offlineErr: unknown) {
        const msg = offlineErr instanceof Error ? offlineErr.message : 'Offline checkout save failed'
        setCheckoutError(msg)
        return
      } finally {
        setIsSubmitting(false)
      }
    }

    // ── Online Checkout Flow ─────────────────────────────────────
    const payload = {
      offlineOpId,
      items: cart.map((i) => ({
        productId: i.productId,
        variantId: i.variantId || undefined,
        productName: i.displayName,
        sku: i.sku,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        discountAmount: i.discountAmount,
      })),
      discountAmount: orderDiscount,
      taxAmount: calculatedTax,
      payments: [
        {
          method: paymentMethod,
          amount: paymentMethod === 'CASH' ? parsedTender : grandTotal,
          reference: saleNotes || undefined,
        },
      ],
      customerName: customerName.trim() || undefined,
      customerPhone: customerPhone.trim() || undefined,
      notes: saleNotes || undefined,
    }

    try {
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const json = await res.json()

      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Checkout failed')
      }

      const saleData = json.data
      const invoice = saleData.invoice

      // Save to local Dexie database for offline archive
      try {
        const db = getDb()
        await db.sales.put({
          id: offlineOpId,
          items: cart.map((i) => ({
            productId: i.productId,
            variantId: i.variantId || undefined,
            productName: i.displayName,
            sku: i.sku,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            unitCost: 0,
            discountAmount: i.discountAmount,
          })),
          subtotal,
          discountAmount: orderDiscount,
          taxAmount: calculatedTax,
          totalAmount: grandTotal,
          payments: [{ method: paymentMethod, amount: paymentMethod === 'CASH' ? parsedTender : grandTotal }],
          notes: saleNotes,
          saleAt: new Date().toISOString(),
          syncStatus: 'SYNCED',
          serverSaleId: saleData.saleId,
          serverSaleNumber: saleData.saleNumber,
        })
      } catch (dexieErr) {
        console.warn('Local Dexie archive notice:', dexieErr)
      }

      // Prepare receipt
      const receiptDetails: ReceiptData = {
        saleNumber: saleData.saleNumber,
        saleAt: invoice?.saleAt ?? new Date().toISOString(),
        cashierName: session?.user?.name ?? 'Cashier',
        customer: customerName ? { name: customerName, phone: customerPhone } : null,
        items: cart.map((i) => ({
          productName: i.displayName,
          sku: i.sku,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          discountAmount: i.discountAmount,
          totalAmount: i.totalAmount,
        })),
        subtotal,
        discountAmount: orderDiscount,
        taxAmount: calculatedTax,
        totalAmount: grandTotal,
        payments: [{ method: paymentMethod, amount: paymentMethod === 'CASH' ? parsedTender : grandTotal }],
        totalPaid: paymentMethod === 'CASH' ? parsedTender : grandTotal,
        changeDue: saleData.changeDue ?? changeDue,
        notes: saleNotes,
        isOffline: false,
        syncStatus: 'SYNCED',
      }

      setActiveReceipt(receiptDetails)
      setIsCheckoutOpen(false)
      setIsReceiptOpen(true)

      // Refresh inventory counts & catalog in background
      loadCatalog()
    } catch (err: unknown) {
      // If network failure during checkout, save atomically offline so sale is never lost!
      const isNetworkError =
        (err instanceof TypeError && err.message.toLowerCase().includes('fetch')) ||
        (typeof navigator !== 'undefined' && !navigator.onLine)

      if (isNetworkError) {
        try {
          const offlineResult = await saveOfflineSaleAtomic({
            offlineOpId,
            customerName: customerName || undefined,
            cashierName: session?.user?.name ?? 'Cashier',
            items: cart.map((i) => ({
              productId: i.productId,
              variantId: i.variantId || undefined,
              productName: i.displayName,
              sku: i.sku,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              discountAmount: i.discountAmount,
              imei: i.imei,
            })),
            subtotal,
            discountAmount: orderDiscount,
            taxAmount: calculatedTax,
            totalAmount: grandTotal,
            payments: [
              {
                method: paymentMethod,
                amount: paymentMethod === 'CASH' ? parsedTender : grandTotal,
                reference: saleNotes || undefined,
              },
            ],
            notes: saleNotes || undefined,
          })

          const receiptDetails: ReceiptData = {
            saleNumber: offlineResult.receiptNumber,
            saleAt: offlineResult.receipt.saleAt,
            cashierName: offlineResult.receipt.cashierName,
            customer: customerName ? { name: customerName, phone: customerPhone } : null,
            items: cart.map((i) => ({
              productName: i.displayName,
              sku: i.sku,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              discountAmount: i.discountAmount,
              totalAmount: i.totalAmount,
            })),
            subtotal,
            discountAmount: orderDiscount,
            taxAmount: calculatedTax,
            totalAmount: grandTotal,
            payments: [{ method: paymentMethod, amount: paymentMethod === 'CASH' ? parsedTender : grandTotal }],
            totalPaid: paymentMethod === 'CASH' ? parsedTender : grandTotal,
            changeDue: paymentMethod === 'CASH' ? Math.max(0, parsedTender - grandTotal) : 0,
            notes: saleNotes,
            isOffline: true,
            syncStatus: 'LOCAL',
          }

          setActiveReceipt(receiptDetails)
          setIsCheckoutOpen(false)
          setIsReceiptOpen(true)

          sync.refreshCounts()
          loadCatalog()
          return
        } catch (dexieSaveErr: unknown) {
          const msg = dexieSaveErr instanceof Error ? dexieSaveErr.message : 'Offline save failed'
          setCheckoutError(msg)
          return
        }
      }

      const msg = err instanceof Error ? err.message : 'Checkout transaction failed'
      setCheckoutError(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Reset for New Sale ───────────────────────────────────────
  const startNewSale = () => {
    setCart([])
    setOrderDiscount(0)
    setTenderAmount('')
    setCustomerName('')
    setCustomerPhone('')
    setSaleNotes('')
    setCheckoutError(null)
    setActiveReceipt(null)
  }

  // ── Filtered Products for Catalog Grid ───────────────────────
  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    const matching = products.filter((p) => {
      const categoryName = p.category?.name ?? categories.find(cat => cat.id === p.categoryId)?.name ?? ''
      const isSmartphone = /^(smart\s*phones?|mobile\s*phones?)$/i.test(categoryName.trim())
      const matchesCategory = selectedCategory === 'smartphones' ? isSmartphone : !isSmartphone
      if (!matchesCategory) return false
      // The out-of-stock register is accessories-only; smartphones simply disappear.
      if (selectedCategory === 'out-of-stock' ? p.quantity > 0 : p.quantity <= 0) return false

      if (!q) return true
      const matchesName = p.name.toLowerCase().includes(q)
      const matchesSku = p.sku.toLowerCase().includes(q)
      const matchesBarcode = p.barcodes.some((b) => b.barcode.includes(q))
      const matchesImei = (p.imei1 && p.imei1.includes(q)) || (p.imei2 && p.imei2.includes(q))
      const matchesVariant = p.variants.some(
        (v) => v.name.toLowerCase().includes(q) || v.sku.toLowerCase().includes(q)
      )
      return matchesName || matchesSku || matchesBarcode || matchesImei || matchesVariant
    })

    // If same IMEI was bought & sold in multiple cycles, prioritize the LATEST IN-STOCK cycle!
    const seenImeis = new Set<string>()
    const deduplicated: POSProduct[] = []
    
    // Sort so in-stock items with highest cycle appear first
    const sorted = [...matching].sort((a, b) => {
      if (a.quantity > 0 && b.quantity <= 0) return -1
      if (b.quantity > 0 && a.quantity <= 0) return 1
      return (b.imeiCycle || 1) - (a.imeiCycle || 1)
    })

    for (const p of sorted) {
      if (p.imei1) {
        if (seenImeis.has(p.imei1)) continue
        seenImeis.add(p.imei1)
      }
      deduplicated.push(p)
    }

    return deduplicated
  }, [products, categories, searchQuery, selectedCategory])

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col antialiased">
      {/* ── Top Navigation / Terminal Bar ────────────────────────── */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-2 group text-slate-500 hover:text-blue-700 transition"
          >
            <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center text-white font-black text-sm shadow-md">
              iZ
            </div>
            <div>
              <span className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
                iZone POS
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-400 font-semibold uppercase">
                  Terminal
                </span>
              </span>
              <p className="text-[11px] text-slate-500">Shop #12, Mobile Market</p>
            </div>
          </Link>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Recent Sales History Button */}
          <button
            onClick={() => {
              loadRecentSales()
              setIsHistoryOpen(true)
            }}
            className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium flex items-center gap-1.5 border border-slate-200 transition"
          >
            <span>📜</span>
            <span className="hidden sm:inline">Recent Sales</span>
          </button>

          {/* Sync Center Status Indicator */}
          <Link
            href="/sync"
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition ${
              sync.conflictCount > 0
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
                : sync.pendingCount > 0
                ? 'bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20'
                : sync.isSyncing
                ? 'bg-primary-500/10 border-primary-500/30 text-primary-400'
                : sync.isOnline
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                : sync.initialSyncCompleted
                ? 'bg-sky-500/10 border-sky-500/30 text-sky-400 hover:bg-sky-500/20'
                : 'bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200'
            }`}
            title="Open Sync Center"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                sync.conflictCount > 0
                  ? 'bg-amber-500 animate-pulse'
                  : sync.pendingCount > 0
                  ? 'bg-blue-500 animate-pulse'
                  : sync.isSyncing
                  ? 'bg-primary-400 animate-ping'
                  : sync.isOnline
                  ? 'bg-emerald-500'
                  : sync.initialSyncCompleted
                  ? 'bg-sky-400'
                  : 'bg-zinc-500'
              }`}
            />
            <span className="hidden md:inline font-mono">
              {sync.conflictCount > 0
                ? `${sync.conflictCount} Conflict`
                : sync.isSyncing
                ? 'Syncing...'
                : sync.pendingCount > 0
                ? `${sync.pendingCount} Pending`
                : sync.isOnline
                ? 'Online'
                : sync.initialSyncCompleted
                ? 'Offline Ready'
                : 'Offline Not Ready'}
            </span>
            <span className="md:hidden font-mono text-[11px]">
              {sync.conflictCount > 0
                ? `!${sync.conflictCount}`
                : sync.pendingCount > 0
                ? `${sync.pendingCount}`
                : sync.isOnline
                ? 'ON'
                : 'OFF'}
            </span>
          </Link>

          {/* Cashier Badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100/80 border border-slate-200 text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-slate-500 hidden sm:inline">Cashier:</span>
            <span className="font-semibold text-slate-900">
              {session?.user?.name ?? 'Ali Haider'}
            </span>
          </div>

          <Link
            href="/inventory"
            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-700 hover:bg-slate-100 transition"
            title="Open Inventory"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </Link>
        </div>
      </header>

      {/* ── Main Layout: Catalog (Left) + Cart Terminal (Right) ───── */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* ── LEFT: Catalog & Quick Scan Area ────────────────────── */}
        <div className="flex-1 flex flex-col border-b lg:border-b-0 lg:border-r border-slate-200 overflow-y-auto">
          {/* Action Row: Large Scan Button & Search */}
          <div className="p-3 sm:p-4 bg-white/40 border-b border-slate-200 space-y-3">
            <div className="flex flex-col sm:flex-row gap-2.5">
              {/* Prominent Mobile-First Camera Scan Button */}
              <button
                onClick={() => setIsScannerOpen(true)}
                className="w-full sm:w-auto px-5 py-3 rounded-xl bg-gradient-to-r from-primary-600 via-primary-500 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 text-white font-bold text-sm shadow-lg shadow-primary-900/30 flex items-center justify-center gap-2.5 transition active:scale-[0.98]"
              >
                <svg className="w-5 h-5 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
                <span>SCAN PRODUCT (CAMERA)</span>
              </button>

              {/* Reactive Search Bar */}
              <div className="flex-1 relative">
                <input
                  type="text"
                  data-barcode-search="true"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      if (searchQuery.trim()) {
                        scanAndAddToCart(searchQuery.trim())
                      }
                    }
                  }}
                  placeholder="Scan Barcode / IMEI with scanner gun or type Name..."
                  className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-900 placeholder-zinc-500 focus:outline-none focus:border-primary-500 transition"
                />
                <svg
                  className="w-5 h-5 absolute left-3 top-3.5 text-slate-500 pointer-events-none"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-3.5 text-slate-500 hover:text-blue-700"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {([
                { id: 'smartphones', name: 'Smartphones' },
                { id: 'accessories', name: 'Accessories' },
                { id: 'out-of-stock', name: 'Out of Stock' },
              ] as const).map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  aria-pressed={selectedCategory === cat.id}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                    selectedCategory === cat.id
                      ? 'bg-primary-600 text-white font-semibold'
                      : 'bg-slate-100/80 text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {selectedCategory === 'out-of-stock' && (
            <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 text-xs text-amber-800">
              Accessories awaiting restock. Items return to Accessories automatically when stock is added.
            </div>
          )}

          {/* Product Catalog Cards Grid */}
          <div className="p-3 sm:p-4 flex-1">
            {isLoadingProducts ? (
              <div className="h-64 flex flex-col items-center justify-center text-slate-500 gap-2">
                <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs">Loading store catalog...</span>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-slate-500 text-center p-4">
                <span className="text-3xl mb-2">📦</span>
                <p className="text-sm font-semibold text-slate-700">{selectedCategory === 'out-of-stock' ? 'No out-of-stock accessories found' : 'No matching items found'}</p>
                <p className="text-xs text-slate-500 mt-1">{selectedCategory === 'out-of-stock' ? 'Only accessories with zero or negative stock appear here.' : 'Try another search term or scan a barcode.'}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3">
                {filteredProducts.map((prod) => {
                  const hasVariants = prod.variants.length > 0
                  const isOutOfStock = prod.quantity <= 0

                  return (
                    <div
                      key={prod.id}
                      onClick={() => !isOutOfStock && addToCart(prod)}
                      className={`relative group bg-white/70 border border-slate-200 rounded-xl p-3 flex flex-col justify-between transition cursor-pointer select-none ${
                        isOutOfStock
                          ? 'opacity-50 cursor-not-allowed'
                          : 'hover:border-primary-500/60 hover:bg-white active:scale-[0.98]'
                      }`}
                    >
                      <div>
                        {/* Top indicators */}
                        <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                          <span className="font-mono truncate max-w-[100px]">{prod.sku}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded font-semibold ${
                              isOutOfStock
                                ? 'bg-red-500/20 text-red-400'
                                : prod.quantity <= 5
                                ? 'bg-amber-500/20 text-amber-400'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {isOutOfStock ? 'OUT' : `${prod.quantity} in stock`}
                          </span>
                        </div>

                        {/* Title */}
                        <div className="flex items-start justify-between gap-1">
                          <h4 className="text-xs font-semibold text-slate-800 line-clamp-2 leading-snug group-hover:text-primary-600 transition">
                            {prod.name}
                          </h4>
                          {prod.imeiCycle && prod.imeiCycle > 1 ? (
                            <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold bg-sky-100 text-sky-800 border border-sky-300" title={`Cycle #${prod.imeiCycle}`}>
                              #{prod.imeiCycle}
                            </span>
                          ) : null}
                        </div>

                        {prod.imei1 && (
                          <div className="mt-1 text-[10px] font-mono text-slate-500 truncate" title={`IMEI: ${prod.imei1}`}>
                            📱 {prod.imei1}
                          </div>
                        )}

                        {/* Variants badge if available */}
                        {hasVariants && (
                          <div className="mt-1">
                            <span className="text-[10px] text-indigo-400 bg-indigo-950/60 border border-indigo-800/40 px-1.5 py-0.5 rounded">
                              {prod.variants.length} Variants
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Price & Action */}
                      <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between">
                        <span className="text-xs sm:text-sm font-bold text-slate-900">
                          {formatCurrency(prod.sellingPrice)}
                        </span>
                        <span className="w-6 h-6 rounded-md bg-slate-100 group-hover:bg-primary-600 text-slate-500 group-hover:text-blue-700 flex items-center justify-center text-xs transition">
                          ➕
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Shopping Cart & Checkout ─────────────────────── */}
        <div className="w-full lg:w-[420px] xl:w-[460px] bg-white/80 flex flex-col justify-between border-t lg:border-t-0">
          {/* Cart Header */}
          <div className="p-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-2">
              <span className="text-base">🛒</span>
              <h3 className="text-sm font-bold text-slate-900">Current Order</h3>
              <span className="px-2 py-0.5 rounded-full bg-primary-600/20 text-primary-400 text-xs font-bold">
                {cart.reduce((sum, i) => sum + i.quantity, 0)} items
              </span>
            </div>
            {cart.length > 0 && (
              <button
                onClick={clearCart}
                className="text-[11px] text-slate-500 hover:text-red-400 transition"
              >
                Clear Cart
              </button>
            )}
          </div>

          {/* Cart Items List */}
          <div className="p-3 flex-1 overflow-y-auto space-y-2.5 max-h-[46vh] lg:max-h-none">
            {cart.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-slate-500 text-center p-4">
                <span className="text-3xl mb-2 opacity-40">🛍️</span>
                <p className="text-sm font-medium text-slate-500">Cart is empty</p>
                <p className="text-xs text-slate-500 mt-1 max-w-[220px]">
                  Scan items with camera or click products from the catalog to start billing.
                </p>
              </div>
            ) : (
              cart.map((item) => (
                <div
                  key={item.clientId}
                  className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h5 className="text-xs font-semibold text-slate-900 truncate">
                        {item.displayName}
                      </h5>
                      <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                        <span>SKU: {item.sku}</span>
                        <span>•</span>
                        <span>{formatCurrency(item.unitPrice)} each</span>
                        {item.minSellingPrice && item.minSellingPrice > 0 ? (
                          <>
                            <span>•</span>
                            <span className="text-amber-800 font-semibold bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                              Min Floor: {formatCurrency(item.minSellingPrice)}
                            </span>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <button
                      onClick={() => removeItem(item.clientId)}
                      className="text-slate-500 hover:text-red-400 p-1"
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Quantity & Line Total */}
                  <div className="flex items-center justify-between pt-1">
                    {/* Quantity controls */}
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5">
                        <button
                          onClick={() => updateQuantity(item.clientId, -1)}
                          className="w-7 h-7 rounded bg-slate-100 hover:bg-slate-200 text-slate-900 flex items-center justify-center text-sm font-bold active:scale-95 transition"
                        >
                          -
                        </button>
                        <span className="w-8 text-center text-xs font-bold text-slate-900">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(item.clientId, 1)}
                          className="w-7 h-7 rounded bg-slate-100 hover:bg-slate-200 text-slate-900 flex items-center justify-center text-sm font-bold active:scale-95 transition"
                        >
                          +
                        </button>
                      </div>

                      {/* Line discount mini-input */}
                      <div className="flex items-center gap-1 text-[10px] text-slate-500">
                        <span>Disc:</span>
                        <input
                          type="number"
                          min="0"
                          value={item.discountAmount || ''}
                          onChange={(e) => updateLineDiscount(item.clientId, Number(e.target.value) || 0)}
                          placeholder="₨ 0"
                          className="w-14 bg-white border border-slate-200 rounded px-1.5 py-1 text-[11px] text-slate-900 focus:outline-none focus:border-primary-500"
                        />
                      </div>
                    </div>

                    {/* Item Total */}
                    <div className="text-right">
                      <div className="text-xs font-bold text-slate-900">
                        {formatCurrency(item.totalAmount)}
                      </div>
                      {item.discountAmount > 0 && (
                        <div className="text-[10px] text-emerald-400">
                          Disc: -{formatCurrency(item.discountAmount)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Cart Bottom Summary & Checkout Trigger */}
          <div className="p-4 border-t border-slate-200 bg-slate-50/90 space-y-3">
            {/* Discount & Tax Row */}
            <div className="flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-1.5 flex-1">
                <span className="text-slate-500">Order Disc:</span>
                <input
                  type="number"
                  min="0"
                  value={orderDiscount || ''}
                  onChange={(e) => setOrderDiscount(Math.max(0, Number(e.target.value)))}
                  placeholder="₨ 0"
                  className="w-20 bg-white border border-slate-200 rounded px-2 py-1 text-xs text-slate-900 focus:outline-none focus:border-primary-500"
                />
              </div>

              <div className="flex items-center justify-end gap-1.5 text-slate-500">
                <span>Tax:</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={taxRate || ''}
                  onChange={(e) => setTaxRate(Math.max(0, Number(e.target.value)))}
                  placeholder="0%"
                  className="w-12 bg-white border border-slate-200 rounded px-1.5 py-1 text-xs text-slate-900 text-center focus:outline-none focus:border-primary-500"
                />
                <span className="text-slate-900 font-mono">({formatCurrency(calculatedTax)})</span>
              </div>
            </div>

            {/* Totals Breakdown */}
            <div className="space-y-1 text-xs border-t border-slate-200/80 pt-2">
              <div className="flex justify-between text-slate-500">
                <span>Subtotal</span>
                <span className="font-mono text-slate-800">{formatCurrency(subtotal)}</span>
              </div>
              {orderDiscount > 0 && (
                <div className="flex justify-between text-emerald-400 font-medium">
                  <span>Discount</span>
                  <span>-{formatCurrency(orderDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between items-baseline pt-1 border-t border-slate-200 text-base font-extrabold text-slate-900">
                <span>NET TOTAL</span>
                <span className="text-lg text-emerald-400 font-mono">
                  {formatCurrency(grandTotal)}
                </span>
              </div>
            </div>

            {/* Big Checkout Button */}
            <button
              onClick={handleProceedToCheckout}
              disabled={cart.length === 0}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2 transition active:scale-[0.98]"
            >
              <span>💳</span>
              <span>CHECKOUT & BILL ({formatCurrency(grandTotal)})</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Modal 1: Smart Barcode Camera Scanner ────────────────── */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onProductScanned={handleScannedProduct}
        autoAdd={true}
      />

      {/* ── Modal 2: Variant Selector ────────────────────────────── */}
      {variantSelectorProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">{variantSelectorProduct.name}</h3>
                <p className="text-xs text-slate-500">Select variant to add</p>
              </div>
              <button
                onClick={() => setVariantSelectorProduct(null)}
                className="text-slate-500 hover:text-blue-700"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              {variantSelectorProduct.variants.map((v) => (
                <button
                  key={v.id}
                  disabled={v.quantity <= 0}
                  onClick={() => {
                    addToCart(variantSelectorProduct, v.id)
                    setVariantSelectorProduct(null)
                  }}
                  className={`w-full p-3 rounded-xl border flex items-center justify-between text-left transition ${
                    v.quantity <= 0
                      ? 'border-slate-200/50 bg-slate-50/40 opacity-50 cursor-not-allowed'
                      : 'border-slate-200 bg-slate-50 hover:border-primary-500 hover:bg-zinc-850'
                  }`}
                >
                  <div>
                    <div className="text-xs font-semibold text-slate-900">{v.name}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">SKU: {v.sku}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold text-emerald-400">
                      {formatCurrency(v.sellingPrice || variantSelectorProduct.sellingPrice)}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {v.quantity <= 0 ? 'Out of stock' : `${v.quantity} in stock`}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal 3: Checkout Tender & Confirmation ──────────────── */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            {/* Checkout Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50/70">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>💰</span>
                <span>Payment & Checkout</span>
              </h3>
              <button
                onClick={() => setIsCheckoutOpen(false)}
                className="text-slate-500 hover:text-blue-700 p-1"
              >
                ✕
              </button>
            </div>

            {/* Checkout Body */}
            <div className="p-5 space-y-4">
              {/* Grand Total Display */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-950/50 to-zinc-900 border border-emerald-800/40 text-center space-y-1">
                <span className="text-xs font-medium text-emerald-300">Total Payable Amount</span>
                <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-mono">
                  {formatCurrency(grandTotal)}
                </div>
              </div>

              {/* Payment Method Selector */}
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">
                  Payment Method
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: 'CASH', label: 'Cash', icon: '💵' },
                    { id: 'CARD', label: 'Card', icon: '💳' },
                    { id: 'MOBILE_WALLET', label: 'Wallet', icon: '📱' },
                    { id: 'CREDIT', label: 'Credit', icon: '📝' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPaymentMethod(m.id as 'CASH' | 'CARD' | 'MOBILE_WALLET' | 'CREDIT')}
                      className={`p-2.5 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1 transition ${
                        paymentMethod === m.id
                          ? 'bg-primary-600 border-primary-500 text-white'
                          : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-blue-700 hover:bg-zinc-850'
                      }`}
                    >
                      <span>{m.icon}</span>
                      <span>{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Cash Tender & Change Section (if Cash) */}
              {paymentMethod === 'CASH' && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-medium text-slate-500">Cash Received (PKR)</label>
                    <span className="text-slate-500">Change Due: <b className="text-emerald-400 font-mono text-sm">{formatCurrency(changeDue)}</b></span>
                  </div>

                  <input
                    type="number"
                    value={tenderAmount}
                    onChange={(e) => setTenderAmount(e.target.value)}
                    placeholder="Enter cash given"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-base font-bold text-slate-900 font-mono focus:outline-none focus:border-emerald-500"
                  />

                  {/* Cash Preset Chips */}
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { label: 'Exact', val: grandTotal },
                      { label: '₨ 500', val: 500 },
                      { label: '₨ 1,000', val: 1000 },
                      { label: '₨ 2,000', val: 2000 },
                      { label: '₨ 5,000', val: 5000 },
                      { label: '₨ 10,000', val: 10000 },
                    ].map((chip, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setTenderAmount(chip.val.toString())}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs text-slate-700 font-medium transition"
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Customer Info (Optional) */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Customer Name (Optional)</label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Walk-in Customer"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 placeholder-zinc-600 focus:outline-none focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Customer Phone (Optional)</label>
                  <input
                    type="text"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="0300-1234567"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 placeholder-zinc-600 focus:outline-none focus:border-primary-500"
                  />
                </div>
              </div>

              {/* Error Message */}
              {checkoutError && (
                <div className="p-3 rounded-xl bg-red-950/50 border border-red-800/60 text-xs text-red-300">
                  {checkoutError}
                </div>
              )}
            </div>

            {/* Confirm Checkout Button */}
            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50/70 flex gap-2">
              <button
                type="button"
                onClick={() => setIsCheckoutOpen(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 transition"
              >
                Back
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={executeCheckout}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg transition flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Processing Sale...</span>
                  </>
                ) : (
                  <>
                    <span>✅</span>
                    <span>CONFIRM & PRINT RECEIPT</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal 4: Receipt Modal ──────────────────────────────── */}
      <ReceiptModal
        isOpen={isReceiptOpen}
        onClose={() => setIsReceiptOpen(false)}
        receipt={activeReceipt}
        onNewSale={startNewSale}
      />

      {/* ── Drawer: Recent Sales History ────────────────────────── */}
      {isHistoryOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-white border-l border-slate-200 h-full flex flex-col">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/60">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>📜</span>
                <span>Recent Transactions</span>
              </h3>
              <button
                onClick={() => setIsHistoryOpen(false)}
                className="text-slate-500 hover:text-blue-700 p-1"
              >
                ✕
              </button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto space-y-3">
              {isLoadingHistory ? (
                <div className="h-48 flex items-center justify-center text-xs text-slate-500">
                  Loading sales history...
                </div>
              ) : recentSales.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-xs text-slate-500">
                  No sales recorded yet.
                </div>
              ) : (
                recentSales.map((s) => (
                  <div
                    key={s.id}
                    className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-900 font-mono">{s.saleNumber}</span>
                      <span className="text-[11px] text-slate-500">{formatDateTime(s.saleAt)}</span>
                    </div>

                    <div className="text-xs text-slate-700">
                      {s.items.length} items • Cashier: {s.user.name}
                      {s.customer && ` • Customer: ${s.customer.name}`}
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                      <span className="text-sm font-extrabold text-emerald-400 font-mono">
                        {formatCurrency(s.totalAmount)}
                      </span>
                      <button
                        onClick={async () => {
                          // Fetch full receipt details
                          const res = await fetch(`/api/sales?id=${s.id}`)
                          const json = await res.json()
                          if (json.success) {
                            const sale = json.data
                            const receiptData: ReceiptData = {
                              saleNumber: sale.saleNumber,
                              saleAt: sale.saleAt,
                              cashierName: sale.user.name,
                              customer: sale.customer,
                              items: sale.items,
                              subtotal: sale.subtotal,
                              discountAmount: sale.discountAmount,
                              taxAmount: sale.taxAmount,
                              totalAmount: sale.totalAmount,
                              payments: sale.payments,
                              totalPaid: sale.payments.reduce((sum: number, p: { amount: number }) => sum + p.amount, 0),
                              changeDue: 0,
                              notes: sale.notes,
                            }
                            setActiveReceipt(receiptData)
                            setIsReceiptOpen(true)
                          }
                        }}
                        className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-[11px] text-slate-700 transition"
                      >
                        🖨️ View Receipt
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
