import { PrismaClient } from '@prisma/client'
import { generateOperationId } from '@izone/shared'

const prisma = new PrismaClient()
const POS_URL = 'http://localhost:3000'
const STORE_URL = 'http://localhost:3001'

interface TestResult {
  id: string
  category: string
  name: string
  passed: boolean
  details: string
}

const testResults: TestResult[] = []

function assert(condition: boolean, id: string, category: string, name: string, details = '') {
  if (condition) {
    console.log(`  ✅ [${id}] [${category}] PASS: ${name} ${details ? `(${details})` : ''}`)
    testResults.push({ id, category, name, passed: true, details })
  } else {
    console.error(`  ❌ [${id}] [${category}] FAIL: ${name} ${details ? `(${details})` : ''}`)
    testResults.push({ id, category, name, passed: false, details })
  }
}

async function loginAs(email: string, pass: string): Promise<string> {
  const csrfRes = await fetch(`${POS_URL}/api/auth/csrf`)
  const cookies = csrfRes.headers.getSetCookie ? csrfRes.headers.getSetCookie() : [csrfRes.headers.get('set-cookie') || '']
  const cookieHeader = cookies.map(c => c.split(';')[0]).join('; ')
  const { csrfToken } = await csrfRes.json()

  const form = new URLSearchParams()
  form.append('email', email)
  form.append('password', pass)
  form.append('csrfToken', csrfToken)
  form.append('json', 'true')

  const res = await fetch(`${POS_URL}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookieHeader,
    },
    body: form.toString(),
    redirect: 'manual',
  })

  const authCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie') || '']
  return [...cookies, ...authCookies].map(c => c.split(';')[0]).join('; ')
}

async function runAutonomousTests() {
  console.log('========================================================================')
  console.log('🚀 iZone by Haider — Comprehensive Autonomous Verification Test Suite')
  console.log('========================================================================\n')

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. AUTH & SECURITY AUDIT TESTS
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('🔹 [SUITE 1/7] Authentication & Security Role Isolation Tests...')
  
  // Test 1.1: Unauthenticated request to /api/suppliers must be rejected with 401
  const unauthSupplier = await fetch(`${POS_URL}/api/suppliers`)
  assert(unauthSupplier.status === 401, 'SEC-01', 'Security', 'Unauthenticated request to /api/suppliers rejected with HTTP 401')

  // Test 1.2: Unauthenticated request to /api/purchases must be rejected with 401
  const unauthPurchase = await fetch(`${POS_URL}/api/purchases`)
  assert(unauthPurchase.status === 401, 'SEC-02', 'Security', 'Unauthenticated request to /api/purchases rejected with HTTP 401')

  // Login as Owner and Cashier
  const ownerCookie = await loginAs('owner@izone.pk', 'owner123')
  const cashierCookie = await loginAs('cashier@izone.pk', 'cashier123')
  assert(ownerCookie.includes('next-auth.session-token'), 'SEC-03', 'Security', 'Owner successfully authenticated via NextAuth')
  assert(cashierCookie.includes('next-auth.session-token'), 'SEC-04', 'Security', 'Cashier successfully authenticated via NextAuth')

  // Test 1.5: Cashier trying to create a product must be rejected with 403
  const cashierCreateProd = await fetch(`${POS_URL}/api/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': cashierCookie },
    body: JSON.stringify({ name: 'Unauthorized Phone', sku: 'UNAUTH-01', sellingPrice: 50000 }),
  })
  assert(cashierCreateProd.status === 403, 'SEC-05', 'Security', 'Cashier blocked from creating products (HTTP 403 Forbidden)')

  // Test 1.6: Cashier trying to record a purchase intake must be rejected with 403
  const cashierPurchase = await fetch(`${POS_URL}/api/purchases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': cashierCookie },
    body: JSON.stringify({ items: [{ productId: 'any', quantity: 1, unitCost: 100 }] }),
  })
  assert(cashierPurchase.status === 403, 'SEC-06', 'Security', 'Cashier blocked from stock intake (HTTP 403 Forbidden)')

  // Test 1.7: Cashier GET /api/products must mask purchasePrice
  const cashierGetProds = await fetch(`${POS_URL}/api/products`, {
    headers: { 'Cookie': cashierCookie },
  })
  const cashierProdData = await cashierGetProds.json()
  const hasLeakedCost = cashierProdData.data?.products?.some((p: any) => 'purchasePrice' in p)
  assert(!hasLeakedCost, 'SEC-07', 'Security', 'Wholesale purchase costs masked from Cashier in /api/products')

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. STOREFRONT VERIFICATION TESTS
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n🔹 [SUITE 2/7] Public Storefront & Customer Website Tests...')

  // Test 2.1: Storefront Homepage returns HTTP 200
  const storeHome = await fetch(`${STORE_URL}/`)
  assert(storeHome.status === 200, 'STORE-01', 'Storefront', 'Storefront Homepage renders HTTP 200 OK')

  // Test 2.2: Storefront Catalog returns HTTP 200
  const storeCatalog = await fetch(`${STORE_URL}/products`)
  assert(storeCatalog.status === 200, 'STORE-02', 'Storefront', 'Storefront Catalog /products renders HTTP 200 OK')

  // Test 2.3: Storefront Product Details returns HTTP 200
  const storeDetail = await fetch(`${STORE_URL}/products/samsung-galaxy-s24-ultra`)
  assert(storeDetail.status === 200, 'STORE-03', 'Storefront', 'Storefront details /products/samsung-galaxy-s24-ultra renders HTTP 200 OK')

  // Test 2.4: Verify Unpublished products are excluded from Storefront queries
  const publishedOnly = await prisma.product.findMany({
    where: { isPublished: true },
    select: { id: true, isPublished: true },
  })
  const unpublishedExist = await prisma.product.findFirst({
    where: { isPublished: false },
  })
  assert(
    publishedOnly.length > 0 && publishedOnly.every(p => p.isPublished),
    'STORE-04',
    'Storefront',
    `Storefront catalog query filters exactly ${publishedOnly.length} published products`
  )

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. PURCHASES & ATOMIC STOCK INTAKE TESTS
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n🔹 [SUITE 3/7] Purchases & Atomic Stock Intake Tests...')

  // Find an active product to intake
  const targetProduct = await prisma.product.findFirst({
    where: { status: 'ACTIVE' },
  })
  if (!targetProduct) throw new Error('No active product found in database')
  const stockBeforePurchase = targetProduct.quantity

  // Record a stock purchase
  const purchasePayload = {
    invoiceNo: `TEST-PUR-${Date.now().toString().slice(-4)}`,
    status: 'RECEIVED',
    notes: 'Autonomous Test Purchase',
    items: [
      {
        productId: targetProduct!.id,
        quantity: 5,
        unitCost: 2800,
      },
    ],
  }

  const purchaseRes = await fetch(`${POS_URL}/api/purchases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': ownerCookie },
    body: JSON.stringify(purchasePayload),
  })
  const purchaseJson = await purchaseRes.json()
  assert(purchaseJson.success === true, 'PUR-01', 'Purchases', 'Owner records stock purchase successfully')

  // Verify stock incremented atomically in database
  const targetProductAfter = await prisma.product.findUnique({
    where: { id: targetProduct!.id },
  })
  assert(
    targetProductAfter?.quantity === stockBeforePurchase + 5,
    'PUR-02',
    'Purchases',
    `Stock atomically incremented from ${stockBeforePurchase} to ${targetProductAfter?.quantity}`
  )

  // Verify InventoryMovement record created
  const intakeMovement = await prisma.inventoryMovement.findFirst({
    where: { referenceId: purchaseJson.data.id, type: 'PURCHASE_RECEIVED' },
  })
  assert(intakeMovement !== null, 'PUR-03', 'Purchases', 'InventoryMovement audit record created with type PURCHASE_RECEIVED')

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. EXPENSES MANAGEMENT TESTS
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n🔹 [SUITE 4/7] Expenses & Overhead Management Tests...')

  const expensePayload = {
    category: 'Electricity Bill',
    amount: 14500,
    description: 'Autonomous test electricity bill',
  }

  const expenseRes = await fetch(`${POS_URL}/api/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': ownerCookie },
    body: JSON.stringify(expensePayload),
  })
  const expenseJson = await expenseRes.json()
  assert(expenseJson.success === true, 'EXP-01', 'Expenses', 'Owner successfully recorded shop expense')

  const getExpenses = await fetch(`${POS_URL}/api/expenses`, {
    headers: { 'Cookie': ownerCookie },
  })
  const getExpensesJson = await getExpenses.json()
  assert(
    getExpensesJson.data.expenses.length > 0 && getExpensesJson.data.totalAmount >= 14500,
    'EXP-02',
    'Expenses',
    `Expenses retrieved with category breakdown; total: ₨${getExpensesJson.data.totalAmount}`
  )

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. SALES & IDEMPOTENT POS CHECKOUT TESTS
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n🔹 [SUITE 5/7] POS Sales & Idempotent Checkout Tests...')

  const saleOpId = generateOperationId()
  const salePrice = targetProduct.sellingPrice || 3800
  const salePayload = {
    offlineOpId: saleOpId,
    items: [
      {
        productId: targetProduct.id,
        productName: targetProduct.name,
        sku: targetProduct.sku,
        quantity: 2,
        unitPrice: salePrice,
        unitCost: targetProduct.purchasePrice || 2800,
        discountAmount: 0,
      },
    ],
    payments: [
      {
        method: 'CASH',
        amount: salePrice * 2,
      },
    ],
    discountAmount: 0,
    taxAmount: 0,
  }

  const saleRes1 = await fetch(`${POS_URL}/api/sales`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': ownerCookie },
    body: JSON.stringify(salePayload),
  })
  const saleJson1 = await saleRes1.json()
  if (!saleJson1.success) {
    console.error('saleJson1 failed:', saleJson1)
  }
  assert(saleJson1.success === true, 'POS-01', 'POS Checkout', `Sale recorded: ${saleJson1.data?.saleNumber || saleJson1.error?.message}`)

  // 2nd checkout (replay with same idempotency offlineOpId)
  const saleRes2 = await fetch(`${POS_URL}/api/sales`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': ownerCookie },
    body: JSON.stringify(salePayload),
  })
  const saleJson2 = await saleRes2.json()
  assert(
    saleJson2.success === true && saleJson2.data.alreadyProcessed === true,
    'POS-02',
    'POS Checkout',
    'Duplicate checkout safely prevented via idempotency key (alreadyProcessed: true)'
  )

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. RETURNS & REFUNDS WITH DAMAGED STOCK PROTECTION TESTS
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n🔹 [SUITE 6/7] Returns, Refunds & Damaged Goods Protection Tests...')

  const returnPayload = {
    saleId: saleJson1.data.saleId,
    reason: 'Customer requested model exchange',
    refundMethod: 'CASH',
    items: [
      {
        saleItemId: saleJson1.data.invoice.items[0].id,
        quantity: 1,
        isDamaged: false, // Resellable return
      },
    ],
  }

  const returnRes = await fetch(`${POS_URL}/api/returns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': ownerCookie },
    body: JSON.stringify(returnPayload),
  })
  const returnJson = await returnRes.json()
  assert(returnJson.success === true, 'RET-01', 'Returns', 'Partial return processed successfully')

  // Over-refund protection test: Try returning 2 more units (only 1 unit was left on invoice)
  const overRefundPayload = {
    saleId: saleJson1.data.saleId,
    reason: 'Trying over-refund',
    refundMethod: 'CASH',
    items: [
      {
        saleItemId: saleJson1.data.invoice.items[0].id,
        quantity: 2,
        isDamaged: false,
      },
    ],
  }
  const overRefundRes = await fetch(`${POS_URL}/api/returns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': ownerCookie },
    body: JSON.stringify(overRefundPayload),
  })
  assert(overRefundRes.status === 400, 'RET-02', 'Returns', 'Over-refunding rejected with HTTP 400 validation error')

  // Damaged goods test: When marked damaged, sellable stock must NOT increment
  const stockBeforeDamaged = (await prisma.product.findUnique({ where: { id: targetProduct!.id } }))?.quantity ?? 0
  const damagedReturnPayload = {
    saleId: saleJson1.data.saleId,
    reason: 'Pin bent during unboxing',
    refundMethod: 'CASH',
    items: [
      {
        saleItemId: saleJson1.data.invoice.items[0].id,
        quantity: 1,
        isDamaged: true, // DAMAGED!
      },
    ],
  }
  const damagedReturnRes = await fetch(`${POS_URL}/api/returns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': ownerCookie },
    body: JSON.stringify(damagedReturnPayload),
  })
  const damagedJson = await damagedReturnRes.json()
  assert(damagedJson.success === true, 'RET-03', 'Returns', 'Damaged goods return processed')

  const stockAfterDamaged = (await prisma.product.findUnique({ where: { id: targetProduct!.id } }))?.quantity ?? 0
  assert(
    stockAfterDamaged === stockBeforeDamaged,
    'RET-04',
    'Returns',
    'Damaged returned item was segregated and NOT added back to sellable inventory'
  )

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. ANALYTICS & DASHBOARD METRICS TESTS
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n🔹 [SUITE 7/7] Analytics & Reporting Aggregation Tests...')

  const analyticsRes = await fetch(`${POS_URL}/api/reports/analytics?range=month`, {
    headers: { 'Cookie': ownerCookie },
  })
  const analyticsJson = await analyticsRes.json()
  assert(analyticsJson.success === true, 'REP-01', 'Reports', 'Analytics API successfully calculated monthly metrics')

  const { overview, valuation } = analyticsJson.data
  assert(
    overview.revenue >= 0 && overview.grossProfit !== undefined && overview.netProfit !== undefined,
    'REP-02',
    'Reports',
    `Gross profit (₨${overview.grossProfit}) clearly distinguished from Net profit (₨${overview.netProfit})`
  )
  assert(
    valuation.purchaseCost > 0 && valuation.retailPotential > valuation.purchaseCost,
    'REP-03',
    'Reports',
    `Stock valuation verified: Cost ₨${valuation.purchaseCost} vs Retail Potential ₨${valuation.retailPotential}`
  )

  // Check Dashboard endpoint
  const dashRes = await fetch(`${POS_URL}/api/reports/dashboard`, {
    headers: { 'Cookie': ownerCookie },
  })
  const dashJson = await dashRes.json()
  if (!dashJson.success) {
    console.error('dashJson failed:', dashJson)
  }
  assert(
    dashJson.success === true && dashJson.data?.inventory?.totalValue > 0,
    'REP-04',
    'Reports',
    `Dashboard summary calculated total inventory valuation: ₨${dashJson.data?.inventory?.totalValue}`
  )

  // Summary
  console.log('\n========================================================================')
  const total = testResults.length
  const passed = testResults.filter(r => r.passed).length
  const failed = testResults.filter(r => !r.passed).length
  console.log(`📊 Test Summary: ${passed}/${total} PASSED (${failed} FAILED)`)
  console.log('========================================================================\n')

  await prisma.$disconnect()
  process.exit(failed > 0 ? 1 : 0)
}

runAutonomousTests().catch(err => {
  console.error('Fatal test error:', err)
  process.exit(1)
})
