export { PrismaClient } from '@prisma/client'
export type {
  Shop,
  User,
  Device,
  Category,
  Brand,
  Supplier,
  Product,
  ProductVariant,
  ProductBarcode,
  InventoryMovement,
  Purchase,
  PurchaseItem,
  Customer,
  Sale,
  SaleItem,
  Payment,
  Return,
  ReturnItem,
  Expense,
  CatalogSettings,
  SyncOperation,
  AuditLog,
  Role,
  ProductStatus,
  BarcodeType,
  MovementType,
  PurchaseStatus,
  SaleStatus,
  PaymentMethod,
  SyncStatus,
} from '@prisma/client'

// Re-export a singleton client for server use
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
