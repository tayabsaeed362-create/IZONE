import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function clearInventory() {
  console.log('🔄 Starting inventory and transaction cleanup...')

  const results = await prisma.$transaction(async (tx) => {
    const returnItems = await tx.returnItem.deleteMany({})
    const returns = await tx.return.deleteMany({})
    const payments = await tx.payment.deleteMany({})
    const saleItems = await tx.saleItem.deleteMany({})
    const sales = await tx.sale.deleteMany({})
    const purchaseItems = await tx.purchaseItem.deleteMany({})
    const purchases = await tx.purchase.deleteMany({})
    const movements = await tx.inventoryMovement.deleteMany({})
    const barcodes = await tx.productBarcode.deleteMany({})
    const variants = await tx.productVariant.deleteMany({})
    const products = await tx.product.deleteMany({})
    const expenses = await tx.expense.deleteMany({})
    const customers = await tx.customer.deleteMany({})
    const syncOps = await tx.syncOperation.deleteMany({})
    const auditLogs = await tx.auditLog.deleteMany({})

    return {
      returnItems: returnItems.count,
      returns: returns.count,
      payments: payments.count,
      saleItems: saleItems.count,
      sales: sales.count,
      purchaseItems: purchaseItems.count,
      purchases: purchases.count,
      movements: movements.count,
      barcodes: barcodes.count,
      variants: variants.count,
      products: products.count,
      expenses: expenses.count,
      customers: customers.count,
      syncOps: syncOps.count,
      auditLogs: auditLogs.count,
    }
  })

  console.log('✅ Inventory & transaction data cleared successfully:')
  console.log(JSON.stringify(results, null, 2))

  const remaining = {
    shops: await prisma.shop.count(),
    users: await prisma.user.count(),
    categories: await prisma.category.count(),
    brands: await prisma.brand.count(),
    suppliers: await prisma.supplier.count(),
    customers: await prisma.customer.count(),
    products: await prisma.product.count(),
  }

  console.log('\n📊 Preserved database counts:')
  console.log(JSON.stringify(remaining, null, 2))

  await prisma.$disconnect()
}

clearInventory().catch(async (e) => {
  console.error('❌ Error clearing inventory:', e)
  await prisma.$disconnect()
  process.exit(1)
})
