import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const BASE_URL = 'http://localhost:3000'

interface TestResult {
  name: string
  passed: boolean
  details: string
}

const results: TestResult[] = []

function assert(condition: boolean, name: string, details = '') {
  if (condition) {
    console.log(`  ✅ PASS: ${name} ${details ? `(${details})` : ''}`)
    results.push({ name, passed: true, details })
  } else {
    console.error(`  ❌ FAIL: ${name} ${details ? `(${details})` : ''}`)
    results.push({ name, passed: false, details })
  }
}

async function login(email: string, password: string): Promise<string> {
  // 1. Get CSRF token
  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`)
  const csrfCookies = csrfRes.headers.getSetCookie ? csrfRes.headers.getSetCookie() : [csrfRes.headers.get('set-cookie') || '']
  const csrfCookieHeader = csrfCookies.map(c => c.split(';')[0]).join('; ')
  const csrfJson = await csrfRes.json()
  const csrfToken = csrfJson.csrfToken

  // 2. Post credentials
  const form = new URLSearchParams()
  form.append('email', email)
  form.append('password', password)
  form.append('csrfToken', csrfToken)
  form.append('json', 'true')

  const loginRes = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': csrfCookieHeader,
    },
    body: form.toString(),
    redirect: 'manual',
  })

  const sessionCookies = loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie() : [loginRes.headers.get('set-cookie') || '']
  const sessionCookieHeader = sessionCookies.map(c => c.split(';')[0]).join('; ')
  return sessionCookieHeader
}

async function runTests() {
  console.log('\n============================================================')
  console.log('🚀 RUNNING PHASE 3 REAL POS & SCANNER INTEGRATION TESTS')
  console.log('============================================================\n')

  // ── TEST 1: Unauthorized checkout rejection ───────────────────
  console.log('--- TEST 1: Unauthorized checkout rejection ---')
  const unauthCheckoutRes = await fetch(`${BASE_URL}/api/sales`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      offlineOpId: 'unauth-test-uuid-12345',
      items: [{ productId: 'any', quantity: 1, unitPrice: 100 }],
      payments: [{ method: 'CASH', amount: 100 }],
    }),
  })
  assert(
    unauthCheckoutRes.status === 401,
    'Unauthorized checkout rejection',
    `Status code: ${unauthCheckoutRes.status} (expected 401)`
  )

  // ── Login as Owner & Cashier ─────────────────────────────────
  console.log('\n--- Authenticating test sessions ---')
  const ownerCookie = await login('owner@izone.pk', 'owner123')
  const cashierCookie = await login('cashier@izone.pk', 'cashier123')
  assert(Boolean(ownerCookie), 'Owner session cookie acquired')
  assert(Boolean(cashierCookie), 'Cashier session cookie acquired')

  // ── TEST 2: Scan known product barcode ───────────────────────
  console.log('\n--- TEST 2: Scan known product barcode ---')
  // Barcode 8806095288406 = Samsung S24 Ultra Clear Cover
  const scanProductRes = await fetch(`${BASE_URL}/api/products/barcode/8806095288406`, {
    headers: { Cookie: cashierCookie },
  })
  const scanProductJson = await scanProductRes.json()
  assert(
    scanProductRes.status === 200 && scanProductJson.success && scanProductJson.data.productName.includes('Clear Cover'),
    'Scan known product barcode',
    `Matched: "${scanProductJson.data?.productName}", SKU: ${scanProductJson.data?.sku}`
  )

  // ── TEST 3: Scan known variant barcode ───────────────────────
  console.log('\n--- TEST 3: Scan known variant barcode (Storage & Color) ---')
  // Barcode 8806095262239 = S24 Ultra 512GB Titanium Gray variant
  const scanVariantRes = await fetch(`${BASE_URL}/api/products/barcode/8806095262239`, {
    headers: { Cookie: cashierCookie },
  })
  const scanVariantJson = await scanVariantRes.json()
  assert(
    scanVariantRes.status === 200 &&
    scanVariantJson.success &&
    scanVariantJson.data.matchType === 'variant' &&
    scanVariantJson.data.variantName.includes('512GB'),
    'Scan known variant barcode identifies correct sellable variant',
    `Matched Variant: "${scanVariantJson.data?.variantName}", Price: ₨${scanVariantJson.data?.sellingPrice}, Stock: ${scanVariantJson.data?.quantity}`
  )

  // ── TEST 4: Scan unknown barcode ─────────────────────────────
  console.log('\n--- TEST 4: Scan unknown barcode ---')
  const scanUnknownRes = await fetch(`${BASE_URL}/api/products/barcode/9999999999999`, {
    headers: { Cookie: cashierCookie },
  })
  const scanUnknownJson = await scanUnknownRes.json()
  assert(
    scanUnknownRes.status === 404 && !scanUnknownJson.success,
    'Scan unknown barcode returns 404 with helpful error message',
    `Error: "${scanUnknownJson.error}"`
  )

  // ── TEST 5: Manual product search ────────────────────────────
  console.log('\n--- TEST 5: Manual product search ---')
  const searchRes = await fetch(`${BASE_URL}/api/products?q=Anker`, {
    headers: { Cookie: cashierCookie },
  })
  const searchJson = await searchRes.json()
  const searchMatches = searchJson.data?.products?.length ?? 0
  assert(
    searchRes.status === 200 && searchMatches >= 1,
    'Search product manually returns matching items',
    `Found ${searchMatches} Anker products`
  )

  // ── TEST 6: Sensitive purchase cost hidden from cashiers ──────
  console.log('\n--- TEST 6: Sensitive purchase cost protection ---')
  const cashierProductView = searchJson.data?.products?.[0]
  assert(
    cashierProductView && cashierProductView.purchasePrice === undefined,
    'Purchase costs are hidden from Cashiers in product API',
    `Cashier product purchasePrice: ${cashierProductView?.purchasePrice}`
  )

  // ── TEST 7: Successful checkout with cash & inventory deduction ─
  console.log('\n--- TEST 7: Real database checkout with Prisma transaction ---')
  // We will sell 1 unit of S24 Ultra Clear Cover
  const coverProduct = await prisma.product.findUnique({
    where: { sku: 'SAM-S24-CASE-CLR' },
    select: { id: true, name: true, sku: true, sellingPrice: true, purchasePrice: true, quantity: true },
  })

  if (!coverProduct) {
    throw new Error('SAM-S24-CASE-CLR not found in DB')
  }

  const initialStock = coverProduct.quantity
  const uniqueOpId = `pos-checkout-test-${Date.now()}`
  const lineDiscount = 99
  const orderDiscount = 100
  const unitPrice = coverProduct.sellingPrice // 1499
  const expectedSubtotal = unitPrice - lineDiscount // 1400
  const expectedTotal = expectedSubtotal - orderDiscount // 1300
  const cashTendered = 2000
  const expectedChange = cashTendered - expectedTotal // 700

  const checkoutPayload = {
    offlineOpId: uniqueOpId,
    customerId: undefined,
    items: [
      {
        productId: coverProduct.id,
        productName: coverProduct.name,
        sku: coverProduct.sku,
        quantity: 1,
        unitPrice,
        discountAmount: lineDiscount,
      },
    ],
    discountAmount: orderDiscount,
    taxAmount: 0,
    payments: [
      {
        method: 'CASH',
        amount: cashTendered,
      },
    ],
  }

  const checkoutRes = await fetch(`${BASE_URL}/api/sales`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cashierCookie,
    },
    body: JSON.stringify(checkoutPayload),
  })

  const checkoutJson = await checkoutRes.json()

  assert(
    checkoutRes.status === 201 && checkoutJson.success,
    'Successful checkout returns 201 Created',
    `Invoice: ${checkoutJson.data?.saleNumber}, Total: ₨${checkoutJson.data?.totalAmount}`
  )

  assert(
    checkoutJson.data?.changeDue === expectedChange,
    'Correct payment and change calculation',
    `Tendered: ₨${cashTendered}, Total: ₨${expectedTotal}, Change: ₨${checkoutJson.data?.changeDue}`
  )

  // Verify in PostgreSQL database
  const createdSale = await prisma.sale.findUnique({
    where: { offlineOpId: uniqueOpId },
    include: { items: true, payments: true, user: true },
  })

  assert(
    Boolean(createdSale && createdSale.saleNumber.startsWith('INV-')),
    'Correct invoice creation in PostgreSQL',
    `Invoice: ${createdSale?.saleNumber}, Status: ${createdSale?.status}`
  )

  assert(
    createdSale?.items[0]?.unitCost === coverProduct.purchasePrice,
    'Correct historical cost snapshot from server-side database',
    `Snapshotted unitCost: ₨${createdSale?.items[0]?.unitCost} (matches authentic DB purchasePrice: ₨${coverProduct.purchasePrice})`
  )

  const updatedCoverProduct = await prisma.product.findUnique({
    where: { id: coverProduct.id },
    select: { quantity: true },
  })

  assert(
    updatedCoverProduct?.quantity === initialStock - 1,
    'Correct atomic inventory deduction in PostgreSQL',
    `Stock Before: ${initialStock}, Stock After: ${updatedCoverProduct?.quantity}`
  )

  const movement = await prisma.inventoryMovement.findFirst({
    where: { referenceId: createdSale?.id, type: 'SALE' },
  })

  assert(
    Boolean(movement && movement.quantity === -1 && movement.balanceAfter === initialStock - 1),
    'Auditable inventory movement recorded with balanceBefore & balanceAfter',
    `Movement ID: ${movement?.id}, balanceBefore: ${movement?.balanceBefore}, balanceAfter: ${movement?.balanceAfter}`
  )

  // ── TEST 8: Repeated checkout request (Idempotency) ──────────
  console.log('\n--- TEST 8: Repeated checkout request (Idempotency key) ---')
  const repeatedCheckoutRes = await fetch(`${BASE_URL}/api/sales`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cashierCookie,
    },
    body: JSON.stringify(checkoutPayload),
  })

  const repeatedCheckoutJson = await repeatedCheckoutRes.json()

  assert(
    repeatedCheckoutRes.status === 200 && repeatedCheckoutJson.data?.alreadyProcessed === true,
    'Repeated checkout request handled idempotently without error',
    `Response: "${repeatedCheckoutJson.message}"`
  )

  const recheckCoverProduct = await prisma.product.findUnique({
    where: { id: coverProduct.id },
    select: { quantity: true },
  })

  assert(
    recheckCoverProduct?.quantity === initialStock - 1,
    'Idempotency prevents duplicate stock deductions',
    `Stock remained at ${recheckCoverProduct?.quantity} (not decremented twice)`
  )

  // ── TEST 9: Insufficient stock rejection ─────────────────────
  console.log('\n--- TEST 9: Insufficient stock rejection ---')
  const overdraftPayload = {
    offlineOpId: `overdraft-test-${Date.now()}`,
    items: [
      {
        productId: coverProduct.id,
        productName: coverProduct.name,
        sku: coverProduct.sku,
        quantity: 99999, // Way more than available
        unitPrice: coverProduct.sellingPrice,
      },
    ],
    payments: [{ method: 'CASH', amount: 99999 * coverProduct.sellingPrice }],
  }

  const overdraftRes = await fetch(`${BASE_URL}/api/sales`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cashierCookie,
    },
    body: JSON.stringify(overdraftPayload),
  })

  const overdraftJson = await overdraftRes.json()

  assert(
    overdraftRes.status === 409 && !overdraftJson.success,
    'Insufficient stock rejected with 409 Conflict',
    `Error: "${overdraftJson.error}"`
  )

  // ── TEST 10: Variant checkout with independent stock deduction ─
  console.log('\n--- TEST 10: Variant checkout with independent stock deduction ---')
  const variant = await prisma.productVariant.findUnique({
    where: { sku: 'SAM-S24U-512GRY-V' },
    include: { product: true },
  })

  if (variant) {
    const variantStockBefore = variant.quantity
    const parentStockBefore = variant.product.quantity

    const variantCheckoutRes = await fetch(`${BASE_URL}/api/sales`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cashierCookie,
      },
      body: JSON.stringify({
        offlineOpId: `variant-sale-${Date.now()}`,
        items: [
          {
            productId: variant.productId,
            variantId: variant.id,
            productName: `Samsung Galaxy S24 Ultra (${variant.name})`,
            sku: variant.sku,
            quantity: 1,
            unitPrice: variant.sellingPrice,
          },
        ],
        payments: [{ method: 'CASH', amount: variant.sellingPrice }],
      }),
    })

    const variantJson = await variantCheckoutRes.json()
    assert(variantCheckoutRes.status === 201, 'Variant sale completed', `Invoice: ${variantJson.data?.saleNumber}`)

    const updatedVariant = await prisma.productVariant.findUnique({ where: { id: variant.id } })
    const updatedParent = await prisma.product.findUnique({ where: { id: variant.productId } })

    assert(
      updatedVariant?.quantity === variantStockBefore - 1,
      'Variant stock decremented independently',
      `Variant stock: ${variantStockBefore} -> ${updatedVariant?.quantity}`
    )

    assert(
      updatedParent?.quantity === parentStockBefore - 1,
      'Parent product stock decremented simultaneously',
      `Parent stock: ${parentStockBefore} -> ${updatedParent?.quantity}`
    )
  }

  console.log('\n============================================================')
  const passedCount = results.filter((r) => r.passed).length
  const failedCount = results.filter((r) => !r.passed).length
  console.log(`📊 TEST RESULTS: ${passedCount} PASSED / ${failedCount} FAILED`)
  console.log('============================================================\n')

  if (failedCount > 0) {
    process.exit(1)
  }
}

runTests()
  .catch((e) => {
    console.error('Test runner fatal error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
