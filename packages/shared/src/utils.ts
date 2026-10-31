// ============================================================
// FORMATTING UTILITIES
// ============================================================

export function formatCurrency(amount: number, currency = 'PKR'): string {
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat('en-PK', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date))
}

export function formatDateTime(date: Date | string): string {
  return new Intl.DateTimeFormat('en-PK', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

// ============================================================
// PRODUCT UTILITIES
// ============================================================

export function generateSKU(brandCode: string, productCode: string): string {
  const brand = brandCode.toUpperCase().slice(0, 4)
  const product = productCode.toUpperCase().replace(/\s+/g, '-').slice(0, 12)
  const suffix = Math.random().toString(36).substring(2, 5).toUpperCase()
  return `${brand}-${product}-${suffix}`
}

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

export function generateInternalBarcode(): string {
  const prefix = 'IZ'
  const timestamp = Date.now().toString().slice(-8)
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
  return `${prefix}-${timestamp}-${random}`
}

export function getSaleNumber(counter: number): string {
  const year = new Date().getFullYear()
  return `INV-${year}-${counter.toString().padStart(5, '0')}`
}

// ============================================================
// PROFIT CALCULATIONS
// ============================================================

export function calculateItemProfit(unitPrice: number, unitCost: number, quantity: number, discount = 0): number {
  const revenue = (unitPrice - discount / quantity) * quantity
  const cost = unitCost * quantity
  return revenue - cost
}

export function calculateMarginPercent(sellingPrice: number, costPrice: number): number {
  if (costPrice === 0) return 0
  return ((sellingPrice - costPrice) / sellingPrice) * 100
}

export function calculateMarkupPercent(sellingPrice: number, costPrice: number): number {
  if (costPrice === 0) return 0
  return ((sellingPrice - costPrice) / costPrice) * 100
}

// ============================================================
// STOCK UTILITIES
// ============================================================

export function getStockStatus(quantity: number, minLevel: number): 'OK' | 'LOW' | 'OUT' {
  if (quantity === 0) return 'OUT'
  if (quantity <= minLevel) return 'LOW'
  return 'OK'
}

// ============================================================
// SYNC UTILITIES
// ============================================================

export function generateOperationId(): string {
  // Use crypto.randomUUID() if available, fallback
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

// ============================================================
// DATE RANGE UTILITIES
// ============================================================

export function getDateRange(period: 'today' | 'week' | 'month' | 'year'): { start: Date; end: Date } {
  const now = new Date()
  const start = new Date(now)
  const end = new Date(now)

  switch (period) {
    case 'today':
      start.setHours(0, 0, 0, 0)
      end.setHours(23, 59, 59, 999)
      break
    case 'week':
      start.setDate(now.getDate() - 7)
      start.setHours(0, 0, 0, 0)
      end.setHours(23, 59, 59, 999)
      break
    case 'month':
      start.setDate(1)
      start.setHours(0, 0, 0, 0)
      end.setHours(23, 59, 59, 999)
      break
    case 'year':
      start.setMonth(0, 1)
      start.setHours(0, 0, 0, 0)
      end.setHours(23, 59, 59, 999)
      break
  }
  return { start, end }
}

// ============================================================
// API RESPONSE TYPES
// ============================================================

export type ApiResponse<T> = {
  success: true
  data: T
  message?: string
} | {
  success: false
  error: string
  code?: string
}

export function apiSuccess<T>(data: T, message?: string): ApiResponse<T> {
  return { success: true, data, message }
}

export function apiError(error: string, code?: string): ApiResponse<never> {
  return { success: false, error, code }
}

// ============================================================
// OFFLINE / DEXIE TYPES
// ============================================================

export type OfflineProduct = {
  id: string
  sku: string
  name: string
  slug: string
  categoryId: string | null
  categoryName: string | null
  brandName: string | null
  purchasePrice: number
  sellingPrice: number
  minSellingPrice?: number
  discountAmount: number
  quantity: number
  minStockLevel: number
  hasImei: boolean
  imei1?: string | null
  imei2?: string | null
  imeiCycle?: number
  images: string[]
  barcodes: string[]
  variants: OfflineVariant[]
  updatedAt: string
}

export type OfflineVariant = {
  id: string
  name: string
  sku: string
  attributes: Record<string, string>
  purchasePrice: number
  sellingPrice: number
  minSellingPrice?: number
  quantity: number
  imageUrl: string | null
  barcodes: string[]
}

export type SyncQueueItem = {
  id: string           // UUID — idempotency key
  type: string
  payload: unknown
  status: 'PENDING' | 'PROCESSING' | 'SYNCED' | 'FAILED' | 'CONFLICT'
  attempts: number
  errorMsg?: string
  createdAt: string
  updatedAt: string
}

export type OfflineSaleItem = {
  productId: string
  variantId?: string
  productName: string
  sku: string
  quantity: number
  unitPrice: number
  unitCost: number
  discountAmount: number
  imei?: string
  serialNumber?: string
}

export type OfflineSale = {
  id: string           // UUID
  items: OfflineSaleItem[]
  customerId?: string
  customerName?: string
  subtotal: number
  discountAmount: number
  taxAmount: number
  totalAmount: number
  payments: Array<{ method: string; amount: number; reference?: string }>
  notes?: string
  saleAt: string
  syncStatus: 'LOCAL' | 'SYNCING' | 'SYNCED' | 'FAILED'
  serverSaleId?: string
  serverSaleNumber?: string
}
