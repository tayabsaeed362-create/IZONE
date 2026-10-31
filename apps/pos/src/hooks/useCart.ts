'use client'

import { useState, useCallback, useRef } from 'react'
import type { OfflineProduct, OfflineVariant, OfflineSaleItem } from '@izone/shared'
import { findProductByBarcode, searchProducts, decrementStock, addToSyncQueue, getDb } from '@/lib/db'
import { generateOperationId } from '@izone/shared'

export type CartItem = {
  productId: string
  variantId?: string
  productName: string
  variantName?: string
  sku: string
  unitPrice: number
  unitCost: number
  minSellingPrice?: number
  quantity: number
  discountAmount: number
  imei?: string
  imageUrl?: string
  maxStock: number
}

export type CartState = {
  items: CartItem[]
  customerId?: string
  customerName?: string
  discountAmount: number
  taxPercent: number
  notes: string
}

function calcSubtotal(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + (i.unitPrice - i.discountAmount / i.quantity) * i.quantity, 0)
}

export function useCart() {
  const [cart, setCart] = useState<CartState>({
    items: [],
    discountAmount: 0,
    taxPercent: 0,
    notes: '',
  })
  const [isCheckingOut, setIsCheckingOut] = useState(false)
  const [lastSaleId, setLastSaleId] = useState<string | null>(null)
  const lastScannedRef = useRef<{ barcode: string; time: number } | null>(null)

  // ── Add product to cart ────────────────────────────────────
  const addProduct = useCallback((product: OfflineProduct, variant?: OfflineVariant) => {
    setCart(prev => {
      const productId = product.id
      const variantId = variant?.id
      const existingIndex = prev.items.findIndex(
        i => (variantId ? i.variantId === variantId : i.productId === productId && !i.variantId)
      )
      
      const unitPrice = variant?.sellingPrice ?? product.sellingPrice
      const unitCost = variant?.purchasePrice ?? product.purchasePrice
      const minSellingPrice = variant?.minSellingPrice ?? product.minSellingPrice ?? 0
      const maxStock = variant?.quantity ?? product.quantity

      if (existingIndex >= 0) {
        const existing = prev.items[existingIndex]!
        if (existing.quantity >= maxStock) return prev // don't exceed stock
        const updated = [...prev.items]
        updated[existingIndex] = { ...existing, quantity: existing.quantity + 1 }
        return { ...prev, items: updated }
      }

      const newItem: CartItem = {
        productId,
        variantId,
        productName: product.name,
        variantName: variant?.name,
        sku: variant?.sku ?? product.sku,
        unitPrice,
        unitCost,
        minSellingPrice,
        quantity: 1,
        discountAmount: 0,
        imageUrl: variant?.imageUrl ?? product.images[0],
        maxStock,
      }
      return { ...prev, items: [...prev.items, newItem] }
    })
  }, [])

  // ── Add by barcode ─────────────────────────────────────────
  const addByBarcode = useCallback(async (barcode: string): Promise<{ found: boolean; product?: OfflineProduct }> => {
    // Prevent duplicate scans within 1.5 seconds
    const now = Date.now()
    if (lastScannedRef.current?.barcode === barcode && now - lastScannedRef.current.time < 1500) {
      return { found: true } // silently ignore
    }
    lastScannedRef.current = { barcode, time: now }

    const product = await findProductByBarcode(barcode)
    if (!product) return { found: false }

    addProduct(product)
    return { found: true, product }
  }, [addProduct])


  // ── Update quantity ────────────────────────────────────────
  const updateQuantity = useCallback((productId: string, variantId: string | undefined, qty: number) => {
    setCart(prev => ({
      ...prev,
      items: prev.items
        .map(i => {
          if (i.productId !== productId || i.variantId !== variantId) return i
          return qty <= 0 ? null : { ...i, quantity: Math.min(qty, i.maxStock) }
        })
        .filter(Boolean) as CartItem[],
    }))
  }, [])

  // ── Remove item ────────────────────────────────────────────
  const removeItem = useCallback((productId: string, variantId: string | undefined) => {
    setCart(prev => ({
      ...prev,
      items: prev.items.filter(i => !(i.productId === productId && i.variantId === variantId)),
    }))
  }, [])

  // ── Set item discount ──────────────────────────────────────
  const setItemDiscount = useCallback((productId: string, variantId: string | undefined, discount: number) => {
    setCart(prev => ({
      ...prev,
      items: prev.items.map(i =>
        i.productId === productId && i.variantId === variantId ? { ...i, discountAmount: discount } : i
      ),
    }))
  }, [])

  // ── Set item IMEI ──────────────────────────────────────────
  const setItemImei = useCallback((productId: string, variantId: string | undefined, imei: string) => {
    setCart(prev => ({
      ...prev,
      items: prev.items.map(i =>
        i.productId === productId && i.variantId === variantId ? { ...i, imei } : i
      ),
    }))
  }, [])

  // ── Cart totals ────────────────────────────────────────────
  const subtotal = calcSubtotal(cart.items)
  const itemDiscounts = cart.items.reduce((sum, i) => sum + i.discountAmount, 0)
  const totalDiscount = itemDiscounts + cart.discountAmount
  const afterDiscount = Math.max(0, subtotal - cart.discountAmount)
  const taxAmount = (afterDiscount * cart.taxPercent) / 100
  const total = afterDiscount + taxAmount

  // ── Checkout ───────────────────────────────────────────────
  const checkout = useCallback(
    async (payments: Array<{ method: string; amount: number; reference?: string }>) => {
      if (cart.items.length === 0 || isCheckingOut) return null
      setIsCheckingOut(true)

      const opId = generateOperationId()
      const now = new Date().toISOString()

      const saleItems: OfflineSaleItem[] = cart.items.map(i => ({
        productId: i.productId,
        variantId: i.variantId,
        productName: i.productName,
        sku: i.sku,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        unitCost: i.unitCost,
        discountAmount: i.discountAmount,
        imei: i.imei,
      }))

      const offlineSale = {
        id: opId,
        items: saleItems,
        customerId: cart.customerId,
        customerName: cart.customerName,
        subtotal,
        discountAmount: totalDiscount,
        taxAmount,
        totalAmount: total,
        payments,
        notes: cart.notes,
        saleAt: now,
        syncStatus: 'LOCAL' as const,
      }

      try {
        const db = getDb()
        
        // Atomic: save sale + decrement stock + enqueue sync
        await db.transaction('rw', [db.sales, db.products, db.syncQueue], async () => {
          // Save offline sale record
          await db.sales.put(offlineSale)
          
          // Decrement local stock optimistically
          for (const item of cart.items) {
            await decrementStock(item.productId, item.variantId, item.quantity)
          }
          
          // Add to sync queue
          await addToSyncQueue({
            id: opId,
            type: 'SALE',
            payload: {
              offlineOpId: opId,
              customerId: cart.customerId,
              items: saleItems,
              discountAmount: totalDiscount,
              taxAmount,
              payments,
              notes: cart.notes,
              saleAt: now,
            },
            createdAt: now,
          })
        })

        setLastSaleId(opId)
        setCart({ items: [], discountAmount: 0, taxPercent: 0, notes: '' })
        setIsCheckingOut(false)
        return opId
      } catch (err) {
        console.error('Checkout failed:', err)
        setIsCheckingOut(false)
        return null
      }
    },
    [cart, subtotal, totalDiscount, taxAmount, total, isCheckingOut]
  )

  const clearCart = useCallback(() => {
    setCart({ items: [], discountAmount: 0, taxPercent: 0, notes: '' })
  }, [])

  return {
    cart,
    setCart,
    addProduct,
    addByBarcode,
    searchProducts,
    updateQuantity,
    removeItem,
    setItemDiscount,
    setItemImei,
    checkout,
    clearCart,
    isCheckingOut,
    lastSaleId,
    // Totals
    subtotal,
    totalDiscount,
    taxAmount,
    total,
  }
}
