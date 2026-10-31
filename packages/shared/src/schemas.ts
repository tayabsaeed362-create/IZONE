import { z } from 'zod'

// ============================================================
// PRODUCT SCHEMAS
// ============================================================

export const ProductStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'DISCONTINUED'])
export const BarcodeTypeSchema = z.enum(['EAN13', 'UPC_A', 'CODE128', 'QR', 'INTERNAL'])
export const MovementTypeSchema = z.enum([
  'STOCK_IN', 'STOCK_OUT', 'SALE', 'RETURN', 'DAMAGED', 'ADJUSTMENT', 'PURCHASE_RECEIVED', 'INITIAL'
])

export const CreateProductSchema = z.object({
  sku: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(255).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().optional(),
  categoryId: z.string().optional(),
  brandId: z.string().optional(),
  supplierId: z.string().optional(),
  purchasePrice: z.number().min(0).default(0),
  sellingPrice: z.number().min(0).default(0),
  minSellingPrice: z.number().min(0).default(0),
  discountAmount: z.number().min(0).default(0),
  discountPercent: z.number().min(0).max(100).default(0),
  quantity: z.number().int().min(0).default(0),
  initialStock: z.number().int().min(0).default(0),
  minStockLevel: z.number().int().min(0).default(5),
  warrantyPeriodDays: z.number().int().positive().optional(),
  hasImei: z.boolean().default(false),
  imei1: z.string().trim().regex(/^\d{15}$/, 'IMEI 1 must contain 15 digits').optional(),
  imei2: z.string().trim().regex(/^\d{15}$/, 'IMEI 2 must contain 15 digits').optional(),
  imeiCycle: z.number().int().min(1).default(1),
  status: ProductStatusSchema.default('ACTIVE'),
  isApproved: z.boolean().default(true),
  images: z.array(z.string()).default([]),
  isPublished: z.boolean().default(false),
  isFeatured: z.boolean().default(false),
  onlineDescription: z.string().optional(),
  onlinePrice: z.number().min(0).optional(),
  barcode: z.string().optional(),
})

export const UpdateProductSchema = CreateProductSchema.partial()

export const ProductVariantSchema = z.object({
  name: z.string().min(1),
  sku: z.string().min(1),
  attributes: z.record(z.string()),
  purchasePrice: z.number().min(0),
  sellingPrice: z.number().min(0),
  minSellingPrice: z.number().min(0).default(0),
  quantity: z.number().int().min(0).default(0),
  imageUrl: z.string().url().optional(),
})

// ============================================================
// SALE SCHEMAS
// ============================================================

export const PaymentMethodSchema = z.enum(['CASH', 'CARD', 'MOBILE_WALLET', 'BANK_TRANSFER', 'CREDIT', 'OTHER'])
export const SaleStatusSchema = z.enum(['COMPLETED', 'CANCELLED', 'REFUNDED', 'PARTIAL_REFUND'])

export const SaleItemSchema = z.object({
  productId: z.string(),
  variantId: z.string().optional(),
  productName: z.string(),
  sku: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().min(0),
  unitCost: z.number().min(0).optional(),
  discountAmount: z.number().min(0).default(0),
  imei: z.string().optional(),
  serialNumber: z.string().optional(),
})

export const CreateSaleSchema = z.object({
  offlineOpId: z.string().min(8).max(128),  // Idempotency key (UUID or client-generated op ID)
  customerId: z.string().optional(),
  items: z.array(SaleItemSchema).min(1),
  discountAmount: z.number().min(0).default(0),
  taxAmount: z.number().min(0).default(0),
  payments: z.array(z.object({
    method: PaymentMethodSchema,
    amount: z.number().positive(),
    reference: z.string().optional(),
  })).min(1),
  notes: z.string().optional(),
  saleAt: z.string().datetime().optional(),
})

// ============================================================
// SYNC SCHEMAS
// ============================================================

export const SyncOperationTypeSchema = z.enum([
  'SALE', 'RETURN', 'STOCK_ADJUSTMENT', 'PRODUCT_UPDATE', 'CATALOG_UPDATE'
])

export const SyncOperationSchema = z.object({
  id: z.string().uuid(),  // Client-generated idempotency key
  type: SyncOperationTypeSchema,
  payload: z.unknown(),
  deviceId: z.string().optional(),
  createdAt: z.string().datetime(),
})

export const BulkSyncSchema = z.object({
  operations: z.array(SyncOperationSchema).min(1).max(100),
  deviceId: z.string(),
})

// ============================================================
// INVENTORY SCHEMAS
// ============================================================

export const StockAdjustmentSchema = z.object({
  productId: z.string(),
  variantId: z.string().optional(),
  quantity: z.number().int().refine(v => v !== 0, 'Quantity cannot be zero'),
  reason: z.string().min(1),
  type: z.enum(['ADJUSTMENT', 'DAMAGED', 'STOCK_IN', 'STOCK_OUT']),
  notes: z.string().optional(),
})

// ============================================================
// EXPENSE SCHEMA
// ============================================================

export const CreateExpenseSchema = z.object({
  category: z.string().min(1),
  amount: z.number().positive(),
  description: z.string().optional(),
  expenseAt: z.string().datetime(),
})

// ============================================================
// CUSTOMER SCHEMA
// ============================================================

export const CreateCustomerSchema = z.object({
  name: z.string().min(1).max(255),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
})

// ============================================================
// SUPPLIER SCHEMA
// ============================================================

export const CreateSupplierSchema = z.object({
  name: z.string().min(1),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
})

// ============================================================
// PURCHASE SCHEMA
// ============================================================

export const PurchaseStatusSchema = z.enum(['DRAFT', 'ORDERED', 'RECEIVED', 'PARTIAL', 'CANCELLED'])

export const CreatePurchaseSchema = z.object({
  supplierId: z.string().optional(),
  invoiceNo: z.string().optional(),
  status: PurchaseStatusSchema.default('RECEIVED'),
  notes: z.string().optional(),
  purchasedAt: z.string().datetime(),
  items: z.array(z.object({
    productId: z.string(),
    variantId: z.string().optional(),
    quantity: z.number().int().positive(),
    unitCost: z.number().min(0),
    imeiList: z.array(z.string()).default([]),
  })).min(1),
})

// ============================================================
// AUTH SCHEMAS
// ============================================================

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(6),
  newPassword: z.string().min(8),
})

// ============================================================
// CATALOG SETTINGS SCHEMA
// ============================================================

export const UpdateCatalogSettingsSchema = z.object({
  shopName: z.string().min(1).optional(),
  tagline: z.string().optional(),
  bannerText: z.string().optional(),
  whatsappNumber: z.string().optional(),
  showPrices: z.boolean().optional(),
  allowOrders: z.boolean().optional(),
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
})

// ============================================================
// UTILITY TYPES
// ============================================================

export type CreateProductInput = z.infer<typeof CreateProductSchema>
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>
export type CreateSaleInput = z.infer<typeof CreateSaleSchema>
export type SaleItemInput = z.infer<typeof SaleItemSchema>
export type StockAdjustmentInput = z.infer<typeof StockAdjustmentSchema>
export type CreateExpenseInput = z.infer<typeof CreateExpenseSchema>
export type CreateCustomerInput = z.infer<typeof CreateCustomerSchema>
export type CreateSupplierInput = z.infer<typeof CreateSupplierSchema>
export type CreatePurchaseInput = z.infer<typeof CreatePurchaseSchema>
export type LoginInput = z.infer<typeof LoginSchema>
export type BulkSyncInput = z.infer<typeof BulkSyncSchema>
export type SyncOperationInput = z.infer<typeof SyncOperationSchema>
