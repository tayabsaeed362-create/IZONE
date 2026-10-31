import Dexie, { type Table } from 'dexie'
import type { OfflineProduct, OfflineVariant, OfflineSale, SyncQueueItem } from '@izone/shared'
export type { SyncQueueItem, OfflineProduct, OfflineVariant, OfflineSale }

// ============================================================
// OFFLINE DATABASE INTERFACES
// ============================================================

export interface OfflineCategory {
  id: string
  name: string
  slug: string
  imageUrl: string | null
  sortOrder: number
}

export interface OfflineSettings {
  key: string
  value: unknown
}

export interface OfflineBarcode {
  barcode: string
  productId: string
  variantId?: string | null
  productName: string
  variantName?: string | null
  displayName: string
  sku: string
  sellingPrice: number
  minSellingPrice?: number
  quantity: number // projected quantity
  type?: string
  images?: string[]
  hasImei?: boolean
  imei1?: string | null
  imei2?: string | null
  imeiCycle?: number
  categoryName?: string | null
  attributes?: Record<string, string>
}

export interface LocalReceipt {
  id: string
  saleId: string // client operation ID
  receiptNumber: string // e.g. "LOCAL-2026-10492" or server "INV-2026-00001"
  saleAt: string
  cashierName: string
  customer?: { name: string; phone?: string | null } | null
  items: Array<{
    productId: string
    variantId?: string | null
    productName: string
    sku: string
    quantity: number
    unitPrice: number
    discountAmount: number
    totalAmount: number
    imei?: string | null
  }>
  subtotal: number
  discountAmount: number
  taxAmount: number
  totalAmount: number
  payments: Array<{ method: string; amount: number; reference?: string | null }>
  totalPaid: number
  changeDue: number
  notes?: string | null
  syncStatus: 'LOCAL' | 'SYNCING' | 'SYNCED' | 'FAILED' | 'CONFLICT'
  serverSaleId?: string
  serverSaleNumber?: string
  createdAt: string
}

export interface OfflineInventoryMovement {
  id: string
  productId: string
  variantId?: string | null
  type: 'SALE' | 'STOCK_IN' | 'STOCK_OUT' | 'RETURN' | 'ADJUSTMENT'
  quantity: number // negative for sales
  balanceBefore: number
  balanceAfter: number
  referenceId: string // saleId
  referenceType: string
  reason?: string
  createdAt: string
  synced: boolean
}

export interface OfflineStockSnapshot {
  id: string // `${productId}` or `${productId}_${variantId}`
  productId: string
  variantId?: string | null
  serverQuantity: number
  projectedQuantity: number
  updatedAt: string
}

export interface PendingReturn {
  id: string
  saleId: string
  serverSaleId?: string
  items: Array<{
    productId: string
    variantId?: string
    productName: string
    quantity: number
    unitPrice: number
  }>
  reason: string
  totalAmount: number
  refundMethod: string
  createdAt: string
  syncStatus: 'LOCAL' | 'SYNCING' | 'SYNCED' | 'FAILED'
}

export interface OfflineExpense {
  id: string
  category: string
  amount: number
  description?: string
  expenseAt: string
  syncStatus: 'LOCAL' | 'SYNCING' | 'SYNCED' | 'FAILED'
}

// ============================================================
// DEXIE DATABASE CLASS
// ============================================================

export class IZoneDatabase extends Dexie {
  // Core catalog tables
  products!: Table<OfflineProduct>
  categories!: Table<OfflineCategory>
  barcodes!: Table<OfflineBarcode>
  stockSnapshots!: Table<OfflineStockSnapshot>

  // Local operations & receipts
  sales!: Table<OfflineSale>
  receipts!: Table<LocalReceipt>
  returns!: Table<PendingReturn>
  expenses!: Table<OfflineExpense>
  inventoryMovements!: Table<OfflineInventoryMovement>

  // Synchronization
  syncQueue!: Table<SyncQueueItem>
  settings!: Table<OfflineSettings>

  constructor() {
    super('iZoneDB')

    // Version 1 (Legacy baseline)
    this.version(1).stores({
      products: 'id, sku, *barcodes, categoryId, updatedAt',
      categories: 'id, slug',
      sales: 'id, syncStatus, saleAt',
      returns: 'id, saleId, syncStatus, createdAt',
      expenses: 'id, syncStatus, expenseAt',
      syncQueue: 'id, status, type, createdAt',
      settings: 'key',
    })

    // Version 2: Complete Phase 4 Offline-First Engine
    this.version(2).stores({
      products: 'id, sku, *barcodes, categoryId, updatedAt',
      categories: 'id, slug',
      barcodes: 'barcode, productId, variantId, sku',
      stockSnapshots: 'id, productId, variantId, updatedAt',
      sales: 'id, syncStatus, saleAt',
      receipts: 'id, saleId, receiptNumber, createdAt, syncStatus',
      returns: 'id, saleId, syncStatus, createdAt',
      expenses: 'id, syncStatus, expenseAt',
      inventoryMovements: 'id, productId, variantId, type, referenceId, createdAt',
      syncQueue: 'id, status, type, createdAt',
      settings: 'key',
    })
  }
}

// Singleton instance
let _db: IZoneDatabase | null = null

export function getDb(): IZoneDatabase {
  if (!_db || !_db.isOpen()) {
    _db = new IZoneDatabase()
  }
  return _db
}

// ============================================================
// SETTINGS & METADATA HELPERS
// ============================================================

export async function getSetting<T>(key: string, defaultValue?: T): Promise<T | undefined> {
  const db = getDb()
  const row = await db.settings.get(key)
  return (row?.value as T) ?? defaultValue
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const db = getDb()
  await db.settings.put({ key, value })
}

// ============================================================
// OFFLINE BARCODE & CATALOG SEARCH
// ============================================================

export async function findBarcodeOffline(code: string): Promise<OfflineBarcode | undefined> {
  const db = getDb()
  const clean = code.trim()

  // 1. Direct O(1) barcode lookup
  const exact = await db.barcodes.get(clean)
  if (exact) return exact

  // 2. Direct SKU lookup in barcodes
  const bySku = await db.barcodes.where('sku').equalsIgnoreCase(clean).first()
  if (bySku) return bySku

  // 3. Fallback to products table
  const prod = await db.products.where('sku').equalsIgnoreCase(clean).first()
  if (prod) {
    return {
      barcode: prod.barcodes[0] || prod.sku,
      productId: prod.id,
      variantId: null,
      productName: prod.name,
      variantName: null,
      displayName: prod.name,
      sku: prod.sku,
      sellingPrice: prod.sellingPrice,
      minSellingPrice: prod.minSellingPrice || 0,
      quantity: prod.quantity,
      images: prod.images,
      hasImei: prod.hasImei,
      categoryName: prod.categoryName,
    }
  }

  // 4. Check product variants
  const allProds = await db.products.toArray()
  for (const p of allProds) {
    const vMatch = p.variants.find(
      v => v.barcodes.includes(clean) || v.sku.toLowerCase() === clean.toLowerCase()
    )
    if (vMatch) {
      return {
        barcode: clean,
        productId: p.id,
        variantId: vMatch.id,
        productName: p.name,
        variantName: vMatch.name,
        displayName: `${p.name} (${vMatch.name})`,
        sku: vMatch.sku,
        sellingPrice: vMatch.sellingPrice || p.sellingPrice,
        minSellingPrice: vMatch.minSellingPrice || p.minSellingPrice || 0,
        quantity: vMatch.quantity,
        images: vMatch.imageUrl ? [vMatch.imageUrl] : p.images,
        hasImei: p.hasImei,
        categoryName: p.categoryName,
        attributes: vMatch.attributes,
      }
    }
  }

  // 5. Lookup by IMEI 1 or IMEI 2 (for phones without barcode or scanned by IMEI)
  // Prioritizes the latest in-stock cycle instance so historical records remain untouched
  const imeiMatches = allProds.filter(
    p => p.imei1 === clean || p.imei2 === clean
  )
  if (imeiMatches.length > 0) {
    imeiMatches.sort((a, b) => {
      if (a.quantity > 0 && b.quantity <= 0) return -1
      if (b.quantity > 0 && a.quantity <= 0) return 1
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
    const best = imeiMatches[0]
    return {
      barcode: clean,
      productId: best.id,
      variantId: null,
      productName: best.name,
      variantName: null,
      displayName: best.imeiCycle && best.imeiCycle > 1 ? `${best.name} [Cycle #${best.imeiCycle}]` : best.name,
      sku: best.sku,
      sellingPrice: best.sellingPrice,
      minSellingPrice: best.minSellingPrice || 0,
      quantity: best.quantity,
      images: best.images,
      hasImei: true,
      imei1: best.imei1,
      imei2: best.imei2,
      imeiCycle: best.imeiCycle || 1,
      categoryName: best.categoryName,
    }
  }

  return undefined
}

export async function findProductByBarcode(barcode: string): Promise<OfflineProduct | undefined> {
  const db = getDb()
  const clean = barcode.trim()
  const byBarcode = await db.products.where('barcodes').equals(clean).first()
  if (byBarcode) return byBarcode

  // Match by IMEI 1 or IMEI 2, prioritizing latest in-stock
  const imeiMatches = await db.products
    .filter(p => p.imei1 === clean || p.imei2 === clean)
    .toArray()
  if (imeiMatches.length > 0) {
    imeiMatches.sort((a, b) => {
      if (a.quantity > 0 && b.quantity <= 0) return -1
      if (b.quantity > 0 && a.quantity <= 0) return 1
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
    return imeiMatches[0]
  }
  return undefined
}

export async function searchProducts(query: string, limit = 50): Promise<OfflineProduct[]> {
  const db = getDb()
  const q = query.toLowerCase().trim()

  if (!q) return db.products.limit(limit).toArray()

  return db.products
    .filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.imei1 ? p.imei1.includes(q) : false) ||
      (p.imei2 ? p.imei2.includes(q) : false) ||
      p.barcodes.some(b => b.includes(q)) ||
      p.variants.some(v => v.name.toLowerCase().includes(q) || v.sku.toLowerCase().includes(q))
    )
    .limit(limit)
    .toArray()
}

// ============================================================
// DATA DOWNLOAD & INITIAL OFFLINE HYDRATION
// ============================================================

export async function downloadAndStoreProducts(products: OfflineProduct[]): Promise<void> {
  const db = getDb()
  const now = new Date().toISOString()

  // Flatten into barcodes table & stock snapshots
  const barcodeRows: OfflineBarcode[] = []
  const snapshotRows: OfflineStockSnapshot[] = []

  for (const p of products) {
    // 1. Standalone product barcodes
    for (const b of p.barcodes) {
      barcodeRows.push({
        barcode: b,
        productId: p.id,
        variantId: null,
        productName: p.name,
        variantName: null,
        displayName: p.name,
        sku: p.sku,
        sellingPrice: p.sellingPrice,
        quantity: p.quantity,
        images: p.images,
        hasImei: p.hasImei,
        categoryName: p.categoryName,
      })
    }

    snapshotRows.push({
      id: p.id,
      productId: p.id,
      variantId: null,
      serverQuantity: p.quantity,
      projectedQuantity: p.quantity,
      updatedAt: now,
    })

    // 2. Variant barcodes
    for (const v of p.variants) {
      for (const vb of v.barcodes) {
        barcodeRows.push({
          barcode: vb,
          productId: p.id,
          variantId: v.id,
          productName: p.name,
          variantName: v.name,
          displayName: `${p.name} (${v.name})`,
          sku: v.sku,
          sellingPrice: v.sellingPrice || p.sellingPrice,
          quantity: v.quantity,
          images: v.imageUrl ? [v.imageUrl] : p.images,
          hasImei: p.hasImei,
          categoryName: p.categoryName,
          attributes: v.attributes,
        })
      }

      snapshotRows.push({
        id: `${p.id}_${v.id}`,
        productId: p.id,
        variantId: v.id,
        serverQuantity: v.quantity,
        projectedQuantity: v.quantity,
        updatedAt: now,
      })
    }
  }

  // Atomic batch put
  await db.transaction('rw', [db.products, db.barcodes, db.stockSnapshots], async () => {
    await db.products.bulkPut(products)
    if (barcodeRows.length > 0) {
      await db.barcodes.bulkPut(barcodeRows)
    }
    if (snapshotRows.length > 0) {
      await db.stockSnapshots.bulkPut(snapshotRows)
    }
  })

  await setSetting('lastProductSyncAt', now)
  await setSetting('initialSyncCompleted', true)
  await setSetting('offlineProductCount', products.length)
}

export async function downloadAndStoreCategories(categories: OfflineCategory[]): Promise<void> {
  const db = getDb()
  await db.transaction('rw', db.categories, async () => {
    await db.categories.bulkPut(categories)
  })
}

// ============================================================
// ATOMIC OFFLINE SALE CHECKOUT
// ============================================================

export interface SaveOfflineSaleParams {
  offlineOpId: string
  customerId?: string
  customerName?: string
  cashierName?: string
  items: Array<{
    productId: string
    variantId?: string | null
    productName: string
    sku: string
    quantity: number
    unitPrice: number
    unitCost?: number
    discountAmount: number
    imei?: string
    serialNumber?: string
  }>
  subtotal: number
  discountAmount: number
  taxAmount: number
  totalAmount: number
  payments: Array<{ method: string; amount: number; reference?: string }>
  notes?: string
  saleAt?: string
}

export async function saveOfflineSaleAtomic(params: SaveOfflineSaleParams): Promise<{
  saleId: string
  receiptNumber: string
  receipt: LocalReceipt
}> {
  const db = getDb()
  const now = params.saleAt || new Date().toISOString()
  const year = new Date(now).getFullYear()
  const randomSuffix = Math.floor(10000 + Math.random() * 90000).toString()
  const tempReceiptNumber = `LOCAL-${year}-${randomSuffix}`

  // Check idempotency in local database
  const existingSale = await db.sales.get(params.offlineOpId)
  if (existingSale) {
    const existingReceipt = await db.receipts.where('saleId').equals(params.offlineOpId).first()
    return {
      saleId: existingSale.id,
      receiptNumber: existingReceipt?.receiptNumber || tempReceiptNumber,
      receipt: existingReceipt!,
    }
  }

  const offlineSale: OfflineSale = {
    id: params.offlineOpId,
    items: params.items.map(i => ({
      productId: i.productId,
      variantId: i.variantId || undefined,
      productName: i.productName,
      sku: i.sku,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      unitCost: i.unitCost ?? 0,
      discountAmount: i.discountAmount,
      imei: i.imei,
      serialNumber: i.serialNumber,
    })),
    customerId: params.customerId,
    customerName: params.customerName,
    subtotal: params.subtotal,
    discountAmount: params.discountAmount,
    taxAmount: params.taxAmount,
    totalAmount: params.totalAmount,
    payments: params.payments,
    notes: params.notes,
    saleAt: now,
    syncStatus: 'LOCAL',
  }

  const localReceipt: LocalReceipt = {
    id: `rcpt_${params.offlineOpId}`,
    saleId: params.offlineOpId,
    receiptNumber: tempReceiptNumber,
    saleAt: now,
    cashierName: params.cashierName || 'Cashier',
    customer: params.customerName ? { name: params.customerName } : null,
    items: params.items.map(i => ({
      productId: i.productId,
      variantId: i.variantId || null,
      productName: i.productName,
      sku: i.sku,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      discountAmount: i.discountAmount,
      totalAmount: i.unitPrice * i.quantity - i.discountAmount,
      imei: i.imei || null,
    })),
    subtotal: params.subtotal,
    discountAmount: params.discountAmount,
    taxAmount: params.taxAmount,
    totalAmount: params.totalAmount,
    payments: params.payments,
    totalPaid: params.payments.reduce((s, p) => s + p.amount, 0),
    changeDue: Math.max(0, params.payments.reduce((s, p) => s + p.amount, 0) - params.totalAmount),
    notes: params.notes || null,
    syncStatus: 'LOCAL',
    createdAt: now,
  }

  // Execute all operations atomically in Dexie IndexedDB
  await db.transaction(
    'rw',
    [
      db.sales,
      db.receipts,
      db.products,
      db.barcodes,
      db.stockSnapshots,
      db.inventoryMovements,
      db.syncQueue,
    ],
    async () => {
      // 1. Save local sale
      await db.sales.put(offlineSale)

      // 2. Save local receipt
      await db.receipts.put(localReceipt)

      // 3. Update projected stock & record movements
      for (const item of params.items) {
        const product = await db.products.get(item.productId)
        if (product) {
          const balanceBefore = product.quantity
          const balanceAfter = Math.max(0, product.quantity - item.quantity)

          if (item.variantId) {
            // Variant decrement
            const updatedVariants = product.variants.map(v =>
              v.id === item.variantId
                ? { ...v, quantity: Math.max(0, v.quantity - item.quantity) }
                : v
            )
            const parentAfter = Math.max(0, product.quantity - item.quantity)
            await db.products.update(item.productId, {
              quantity: parentAfter,
              variants: updatedVariants,
            })

            // Update barcode record quantity
            await db.barcodes
              .where('variantId')
              .equals(item.variantId)
              .modify({ quantity: Math.max(0, balanceBefore - item.quantity) })

            // Update snapshot
            const snapId = `${item.productId}_${item.variantId}`
            const snap = await db.stockSnapshots.get(snapId)
            if (snap) {
              await db.stockSnapshots.update(snapId, {
                projectedQuantity: Math.max(0, snap.projectedQuantity - item.quantity),
                updatedAt: now,
              })
            }
          } else {
            // Standalone product decrement
            await db.products.update(item.productId, { quantity: balanceAfter })

            await db.barcodes
              .where('productId')
              .equals(item.productId)
              .filter(b => !b.variantId)
              .modify({ quantity: balanceAfter })

            const snap = await db.stockSnapshots.get(item.productId)
            if (snap) {
              await db.stockSnapshots.update(item.productId, {
                projectedQuantity: Math.max(0, snap.projectedQuantity - item.quantity),
                updatedAt: now,
              })
            }
          }

          // Record local inventory movement
          await db.inventoryMovements.put({
            id: `mov_${params.offlineOpId}_${item.productId}_${item.variantId || 'base'}`,
            productId: item.productId,
            variantId: item.variantId || null,
            type: 'SALE',
            quantity: -item.quantity,
            balanceBefore,
            balanceAfter,
            referenceId: params.offlineOpId,
            referenceType: 'OfflineSale',
            reason: `Local Sale: ${tempReceiptNumber} (${item.productName})`,
            createdAt: now,
            synced: false,
          })
        }
      }

      // 4. Enqueue to sync queue
      await db.syncQueue.put({
        id: params.offlineOpId,
        type: 'SALE',
        payload: {
          offlineOpId: params.offlineOpId,
          customerId: params.customerId,
          items: params.items.map(i => ({
            productId: i.productId,
            variantId: i.variantId || undefined,
            productName: i.productName,
            sku: i.sku,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            unitCost: i.unitCost ?? 0,
            discountAmount: i.discountAmount,
            imei: i.imei,
            serialNumber: i.serialNumber,
          })),
          discountAmount: params.discountAmount,
          taxAmount: params.taxAmount,
          payments: params.payments,
          notes: params.notes,
          saleAt: now,
        },
        status: 'PENDING',
        attempts: 0,
        createdAt: now,
        updatedAt: now,
      })
    }
  )

  return {
    saleId: params.offlineOpId,
    receiptNumber: tempReceiptNumber,
    receipt: localReceipt,
  }
}

// ============================================================
// STOCK UPDATE HELPERS
// ============================================================

export async function decrementStock(productId: string, variantId: string | undefined, qty: number): Promise<void> {
  const db = getDb()
  const product = await db.products.get(productId)
  if (!product) return

  if (variantId) {
    const updated = product.variants.map(v =>
      v.id === variantId ? { ...v, quantity: Math.max(0, v.quantity - qty) } : v
    )
    await db.products.update(productId, {
      quantity: Math.max(0, product.quantity - qty),
      variants: updated,
    })
  } else {
    await db.products.update(productId, { quantity: Math.max(0, product.quantity - qty) })
  }
}

// ============================================================
// SYNC QUEUE HELPERS
// ============================================================

export async function addToSyncQueue(item: Omit<SyncQueueItem, 'attempts' | 'status' | 'updatedAt'>): Promise<void> {
  const db = getDb()
  await db.syncQueue.put({
    ...item,
    status: 'PENDING',
    attempts: 0,
    updatedAt: new Date().toISOString(),
  })
}

export async function getPendingSyncItems(): Promise<SyncQueueItem[]> {
  const db = getDb()
  return db.syncQueue
    .where('status')
    .anyOf(['PENDING', 'FAILED'])
    .filter(item => item.attempts < 5)
    .sortBy('createdAt')
}

export async function markSyncItemStatus(
  id: string,
  status: SyncQueueItem['status'],
  errorMsg?: string
): Promise<void> {
  const db = getDb()
  const item = await db.syncQueue.get(id)
  if (!item) return
  await db.syncQueue.update(id, {
    status,
    attempts: item.attempts + 1,
    errorMsg,
    updatedAt: new Date().toISOString(),
  })
}

export async function updateLocalSaleServerConfirmation(
  offlineOpId: string,
  serverSaleIdOrObj: string | { serverSaleId?: string; serverSaleNumber?: string; invoiceNumber?: string },
  serverSaleNumberParam?: string
): Promise<void> {
  const db = getDb()
  const serverSaleId = typeof serverSaleIdOrObj === 'string' ? serverSaleIdOrObj : (serverSaleIdOrObj.serverSaleId || '')
  const serverSaleNumber = typeof serverSaleIdOrObj === 'string' ? (serverSaleNumberParam || '') : (serverSaleIdOrObj.serverSaleNumber || serverSaleIdOrObj.invoiceNumber || '')

  await db.transaction('rw', [db.sales, db.receipts, db.syncQueue], async () => {
    // 1. Update sale
    await db.sales.where('id').equals(offlineOpId).modify({
      syncStatus: 'SYNCED',
      serverSaleId,
      serverSaleNumber,
    })

    // 2. Update receipt with authoritative server invoice number
    await db.receipts.where('saleId').equals(offlineOpId).modify({
      syncStatus: 'SYNCED',
      serverSaleId,
      serverSaleNumber,
    })

    // 3. Mark sync queue item
    await db.syncQueue.where('id').equals(offlineOpId).modify({
      status: 'SYNCED',
      updatedAt: new Date().toISOString(),
    })
  })
}

// ============================================================
// LOCAL DATA EXPORT & RECOVERY BACKUP
// ============================================================

export async function exportOfflineBackup(): Promise<string> {
  const db = getDb()
  const [sales, receipts, queue, movements, snapshots] = await Promise.all([
    db.sales.toArray(),
    db.receipts.toArray(),
    db.syncQueue.toArray(),
    db.inventoryMovements.toArray(),
    db.stockSnapshots.toArray(),
  ])

  const backup = {
    exportedAt: new Date().toISOString(),
    appVersion: '1.0.0',
    summary: {
      totalSales: sales.length,
      unsyncedSales: sales.filter(s => s.syncStatus === 'LOCAL').length,
      queuePending: queue.filter(q => q.status === 'PENDING').length,
      conflicts: queue.filter(q => q.status === 'CONFLICT').length,
    },
    sales,
    receipts,
    queue,
    movements,
    snapshots,
  }

  return JSON.stringify(backup, null, 2)
}

// ============================================================
// STORAGE ESTIMATE
// ============================================================

export async function getStorageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (typeof navigator === 'undefined') return null
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate()
    return {
      usage: estimate.usage ?? 0,
      quota: estimate.quota ?? 0,
    }
  }
  return null
}
