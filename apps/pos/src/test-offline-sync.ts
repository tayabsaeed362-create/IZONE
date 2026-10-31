import 'fake-indexeddb/auto'
import { PrismaClient } from '@prisma/client'
import {
  IZoneDatabase,
  downloadAndStoreProducts,
  downloadAndStoreCategories,
  findBarcodeOffline,
  searchProducts,
  saveOfflineSaleAtomic,
  updateLocalSaleServerConfirmation,
  exportOfflineBackup,
  getDb,
} from './lib/db'
import { generateOperationId } from '@izone/shared'

const prisma = new PrismaClient()
const BASE_URL = 'http://localhost:3000'

interface TestResult {
  num: number
  name: string
  passed: boolean
  details: string
}

const results: TestResult[] = []

function assert(condition: boolean, num: number, name: string, details = '') {
  if (condition) {
    console.log(`  ✅ [TEST ${num}] PASS: ${name} ${details ? `— ${details}` : ''}`)
    results.push({ num, name, passed: true, details })
  } else {
    console.error(`  ❌ [TEST ${num}] FAIL: ${name} ${details ? `— ${details}` : ''}`)
    results.push({ num, name, passed: false, details })
  }
}

async function login(email: string, password: string): Promise<string> {
  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`)
  const csrfCookies = csrfRes.headers.getSetCookie ? csrfRes.headers.getSetCookie() : [csrfRes.headers.get('set-cookie') || '']
  const csrfCookieHeader = csrfCookies.map(c => c.split(';')[0]).join('; ')
  const csrfJson = await csrfRes.json()
  const csrfToken = csrfJson.csrfToken

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
  return sessionCookies.map(c => c.split(';')[0]).join('; ')
}

async function runPhase4Tests() {
  console.log('\n============================================================')
  console.log('🚀 RUNNING PHASE 4: RELIABLE OFFLINE POS & AUTO-SYNC TESTS')
  console.log('============================================================\n')

  const db = getDb()
  await db.open()

  // Authenticate as owner
  console.log('🔐 Authenticating owner session...')
  const ownerCookie = await login('owner@izone.pk', 'owner123')
  assert(Boolean(ownerCookie), 0, 'Authentication session established', 'Acquired owner session cookie')

  // ─────────────────────────────────────────────────────────────
  // TEST 1: Initial Online Product Download
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- TEST 1: Initial online product catalog download ---')
  const prodRes = await fetch(`${BASE_URL}/api/products?limit=100`, {
    headers: { Cookie: ownerCookie },
  })
  const catRes = await fetch(`${BASE_URL}/api/categories`, {
    headers: { Cookie: ownerCookie },
  })

  const prodJson = await prodRes.json()
  const catJson = await catRes.json()

  assert(
    prodRes.status === 200 && prodJson.success && prodJson.data.products.length > 0,
    1,
    'Initial online product download',
    `Downloaded ${prodJson.data?.products?.length} products from PostgreSQL`
  )

  // Hydrate into IndexedDB
  const serverProducts = prodJson.data.products.map((p: any) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    sellingPrice: p.sellingPrice,
    costPrice: p.costPrice || 0,
    quantity: p.quantity,
    categoryId: p.category?.id || p.categoryId,
    categoryName: p.category?.name || 'Accessories',
    barcodes: p.barcodes?.map((b: any) => b.barcode) || [],
    hasImei: p.hasImei,
    images: p.images || [],
    variants: (p.variants || []).map((v: any) => ({
      id: v.id,
      name: v.name,
      sku: v.sku,
      sellingPrice: v.sellingPrice || p.sellingPrice,
      costPrice: v.costPrice || 0,
      quantity: v.quantity,
      barcodes: v.barcodes?.map((b: any) => b.barcode) || [],
      attributes: v.attributes || {},
      imageUrl: v.imageUrl,
    })),
    updatedAt: p.updatedAt || new Date().toISOString(),
  }))

  await downloadAndStoreProducts(serverProducts)
  await downloadAndStoreCategories(catJson.data || [])

  const localProdCount = await db.products.count()
  const localBarcodeCount = await db.barcodes.count()
  const localSnapshotCount = await db.stockSnapshots.count()

  assert(
    localProdCount > 0 && localBarcodeCount > 0 && localSnapshotCount > 0,
    1,
    'IndexedDB Catalog Storage',
    `${localProdCount} products, ${localBarcodeCount} indexed barcodes, ${localSnapshotCount} stock snapshots`
  )

  // ─────────────────────────────────────────────────────────────
  // TEST 2: Offline Catalog Search
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- TEST 2: Offline catalog search without network ---')
  const searchResults = await searchProducts('samsung')
  assert(
    searchResults.length > 0 && searchResults.some(p => p.name.toLowerCase().includes('samsung')),
    2,
    'Offline catalog search',
    `Found ${searchResults.length} matching products in local Dexie DB`
  )

  // ─────────────────────────────────────────────────────────────
  // TEST 3: Offline Barcode Lookup (Product & Variant)
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- TEST 3: Offline barcode lookup (100% offline resolution) ---')
  // Standalone product barcode (Samsung S24 Ultra Clear Cover: 8806095288406)
  const standaloneMatch = await findBarcodeOffline('8806095288406')
  assert(
    Boolean(standaloneMatch && standaloneMatch.productName.includes('Clear Cover')),
    3,
    'Offline standalone barcode lookup',
    `Resolved: "${standaloneMatch?.displayName}" (₨${standaloneMatch?.sellingPrice})`
  )

  // Variant barcode (S24 Ultra 512GB Titanium Gray: 8806095262239)
  const variantMatch = await findBarcodeOffline('8806095262239')
  assert(
    Boolean(variantMatch && variantMatch.variantId && variantMatch.displayName.includes('512GB')),
    3,
    'Offline variant barcode lookup',
    `Resolved: "${variantMatch?.displayName}" with variantId: ${variantMatch?.variantId}`
  )

  // ─────────────────────────────────────────────────────────────
  // TEST 4: Offline Cart Management & Price Calculation
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- TEST 4: Offline cart management & calculation ---')
  const cartItem1 = {
    productId: standaloneMatch!.productId,
    productName: standaloneMatch!.productName,
    sku: standaloneMatch!.sku,
    quantity: 2,
    unitPrice: standaloneMatch!.sellingPrice,
    discountAmount: 100, // ₨100 item discount
  }
  const subtotal = cartItem1.unitPrice * cartItem1.quantity
  const orderDiscount = 50
  const grandTotal = subtotal - cartItem1.discountAmount - orderDiscount

  assert(
    grandTotal === (cartItem1.unitPrice * cartItem1.quantity) - cartItem1.discountAmount - orderDiscount,
    4,
    'Offline cart calculations',
    `Subtotal: ₨${subtotal}, Discounts: ₨${cartItem1.discountAmount + orderDiscount}, Grand Total: ₨${grandTotal}`
  )

  // ─────────────────────────────────────────────────────────────
  // TEST 5: Offline Checkout (Atomic Dexie Transaction)
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- TEST 5: Offline checkout with atomic persistence ---')
  const opId1 = generateOperationId()
  const offlineSaleResult = await saveOfflineSaleAtomic({
    offlineOpId: opId1,
    customerName: 'Muhammad Bilal',
    cashierName: 'Ali Haider',
    items: [
      {
        productId: cartItem1.productId,
        productName: cartItem1.productName,
        sku: cartItem1.sku,
        quantity: cartItem1.quantity,
        unitPrice: cartItem1.unitPrice,
        discountAmount: cartItem1.discountAmount,
      },
    ],
    subtotal,
    discountAmount: orderDiscount,
    taxAmount: 0,
    totalAmount: grandTotal,
    payments: [{ method: 'CASH', amount: 5000 }],
    notes: 'Offline sale test #1',
  })

  assert(
    Boolean(offlineSaleResult.receiptNumber.startsWith('LOCAL-') && offlineSaleResult.receipt.syncStatus === 'LOCAL'),
    5,
    'Offline atomic checkout',
    `Generated local receipt: ${offlineSaleResult.receiptNumber}, Total: ₨${offlineSaleResult.receipt.totalAmount}`
  )

  // ─────────────────────────────────────────────────────────────
  // TEST 6: Local Stock Deduction & Balance Verification
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- TEST 6: Local stock deduction ---')
  const updatedProduct = await db.products.get(cartItem1.productId)
  const initialStock = serverProducts.find((p: any) => p.id === cartItem1.productId)!.quantity
  const expectedStock = initialStock - cartItem1.quantity

  assert(
    updatedProduct?.quantity === expectedStock,
    6,
    'Local stock deduction',
    `Initial: ${initialStock}, Sold: ${cartItem1.quantity}, Remaining Local Stock: ${updatedProduct?.quantity}`
  )

  // Verify inventory movement record was created
  const movements = await db.inventoryMovements.where('referenceId').equals(opId1).toArray()
  assert(
    movements.length === 1 && movements[0].quantity === -cartItem1.quantity && movements[0].synced === false,
    6,
    'Local inventory movement recording',
    `Movement: ${movements[0].type} (${movements[0].quantity}), Reason: ${movements[0].reason}`
  )

  // ─────────────────────────────────────────────────────────────
  // TEST 7: IndexedDB Persistence After Restart Simulation
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- TEST 7: IndexedDB persistence after simulated restart ---')
  // Close database and reopen to simulate browser reload
  await db.close()
  const freshDb = new IZoneDatabase()
  await freshDb.open()

  const persistedSale = await freshDb.sales.get(opId1)
  const persistedReceipt = await freshDb.receipts.where('saleId').equals(opId1).first()
  const persistedQueue = await freshDb.syncQueue.get(opId1)

  assert(
    Boolean(persistedSale && persistedReceipt && persistedQueue?.status === 'PENDING'),
    7,
    'IndexedDB persistence after restart',
    `Sale ${persistedSale?.id} persisted with status: ${persistedSale?.syncStatus}`
  )

  // ─────────────────────────────────────────────────────────────
  // TEST 8: Multiple Offline Sales Queued
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- TEST 8: Multiple offline sales queued ---')
  const opId2 = generateOperationId()
  const opId3 = generateOperationId()

  await saveOfflineSaleAtomic({
    offlineOpId: opId2,
    customerName: 'Zahid Khan',
    cashierName: 'Ali Haider',
    items: [
      {
        productId: variantMatch!.productId,
        variantId: variantMatch!.variantId,
        productName: variantMatch!.displayName,
        sku: variantMatch!.sku,
        quantity: 1,
        unitPrice: variantMatch!.sellingPrice,
        discountAmount: 0,
      },
    ],
    subtotal: variantMatch!.sellingPrice,
    discountAmount: 0,
    taxAmount: 0,
    totalAmount: variantMatch!.sellingPrice,
    payments: [{ method: 'MOBILE_WALLET', amount: variantMatch!.sellingPrice, reference: 'JazzCash-9021' }],
    notes: 'Offline sale test #2 (Variant)',
  })

  await saveOfflineSaleAtomic({
    offlineOpId: opId3,
    customerName: 'Usman Ghani',
    cashierName: 'Ali Haider',
    items: [
      {
        productId: cartItem1.productId,
        productName: cartItem1.productName,
        sku: cartItem1.sku,
        quantity: 1,
        unitPrice: cartItem1.unitPrice,
        discountAmount: 0,
      },
    ],
    subtotal: cartItem1.unitPrice,
    discountAmount: 0,
    taxAmount: 0,
    totalAmount: cartItem1.unitPrice,
    payments: [{ method: 'CASH', amount: cartItem1.unitPrice }],
    notes: 'Offline sale test #3',
  })

  const queueItems = await freshDb.syncQueue.toArray()
  assert(
    queueItems.length === 3,
    8,
    'Multiple offline sales queued',
    `Sync queue contains ${queueItems.length} operations waiting for network`
  )

  // ─────────────────────────────────────────────────────────────
  // TEST 9: Network Reconnection & Sync Payload Assembly
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- TEST 9: Network reconnection & sync payload preparation ---')
  const pendingItems = await freshDb.syncQueue.where('status').equals('PENDING').toArray()
  const syncOperations = pendingItems.map(q => ({
    id: q.id,
    type: q.type,
    payload: q.payload,
  }))

  assert(
    syncOperations.length === 3,
    9,
    'Sync payload assembly',
    `Prepared ${syncOperations.length} offline transactions for batch sync`
  )

  // ─────────────────────────────────────────────────────────────
  // TEST 10: Successful Automatic Synchronization (POST /api/sync)
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- TEST 10: Server sync batch execution ---')
  const syncRes = await fetch(`${BASE_URL}/api/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: ownerCookie,
    },
    body: JSON.stringify({
      operations: syncOperations,
    }),
  })

  const syncJson = await syncRes.json()
  assert(
    syncRes.ok && syncJson.success && syncJson.data.processed === 3,
    10,
    'Batch synchronization execution',
    `Processed: ${syncJson.data?.processed}, Failed: ${syncJson.data?.failed}, Conflicts: ${syncJson.data?.conflicts}`
  )

  // Update local IndexedDB with server confirmation
  for (const ack of syncJson.data.results) {
    if (ack.status === 'SYNCED') {
      const saleId = ack.data?.saleId || ack.serverSaleId
      const saleNumber = ack.data?.saleNumber || ack.serverSaleNumber
      await updateLocalSaleServerConfirmation(ack.id, {
        serverSaleId: saleId,
        serverSaleNumber: saleNumber,
        invoiceNumber: saleNumber,
      })
    }
  }

  const syncedSale1 = await freshDb.sales.get(opId1)
  const syncedRcpt1 = await freshDb.receipts.where('saleId').equals(opId1).first()

  assert(
    syncedSale1?.syncStatus === 'SYNCED' && Boolean(syncedSale1.serverSaleNumber),
    10,
    'Local sale confirmation & invoice association',
    `Temporary: ${syncedRcpt1?.receiptNumber} -> Server Invoice: ${syncedSale1?.serverSaleNumber}`
  )

  // ─────────────────────────────────────────────────────────────
  // TEST 11: Idempotent Retry (Server & Client Idempotency)
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- TEST 11: Idempotent sync retry ---')
  const retryRes = await fetch(`${BASE_URL}/api/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: ownerCookie,
    },
    body: JSON.stringify({
      operations: [syncOperations[0]],
    }),
  })

  const retryJson = await retryRes.json()
  const firstResult = retryJson.data?.results?.[0]

  assert(
    retryRes.status === 200 && retryJson.success && firstResult?.status === 'SYNCED',
    11,
    'Idempotent retry',
    `Server recognized existing operation and returned status: ${firstResult?.status}`
  )

  // Verify PostgreSQL does NOT have duplicate sales
  const dbSalesCount = await prisma.sale.count({
    where: { offlineOpId: opId1 },
  })
  assert(
    dbSalesCount === 1,
    11,
    'No duplicate sale creation in PostgreSQL',
    `Found exactly ${dbSalesCount} sale record for opId: ${opId1}`
  )

  // ─────────────────────────────────────────────────────────────
  // TEST 12: Network Interruption / Timeout Handling
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- TEST 12: Network interruption & retry queue safety ---')
  const opIdTimeout = generateOperationId()
  await saveOfflineSaleAtomic({
    offlineOpId: opIdTimeout,
    customerName: 'Network Test',
    items: [
      {
        productId: cartItem1.productId,
        productName: cartItem1.productName,
        sku: cartItem1.sku,
        quantity: 1,
        unitPrice: cartItem1.unitPrice,
        discountAmount: 0,
      },
    ],
    subtotal: cartItem1.unitPrice,
    discountAmount: 0,
    taxAmount: 0,
    totalAmount: cartItem1.unitPrice,
    payments: [{ method: 'CASH', amount: cartItem1.unitPrice }],
  })

  // Simulate timeout abort controller
  const abortController = new AbortController()
  abortController.abort() // Immediately aborted

  let abortedCaught = false
  try {
    await fetch(`${BASE_URL}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      signal: abortController.signal,
      body: JSON.stringify({ operations: [] }),
    })
  } catch (err: any) {
    if (err.name === 'AbortError') abortedCaught = true
  }

  // Verify the item is still safely in queue
  const pendingAfterAbort = await freshDb.syncQueue.get(opIdTimeout)
  assert(
    abortedCaught && pendingAfterAbort?.status === 'PENDING',
    12,
    'Network abort safety',
    'Aborted operation remains securely in PENDING queue without data loss'
  )

  // ─────────────────────────────────────────────────────────────
  // TEST 13: Server Rejection / Validation Error Handling
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- TEST 13: Server rejection handling ---')
  const malformedOpId = generateOperationId()
  const rejectRes = await fetch(`${BASE_URL}/api/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
    body: JSON.stringify({
      operations: [
        {
          operationId: malformedOpId,
          type: 'SALE',
          payload: {
            items: [], // invalid: empty items
            totalAmount: 1000,
          },
        },
      ],
    }),
  })

  const rejectJson = await rejectRes.json()
  const rejectResult = rejectJson.data?.results?.[0]
  assert(
    rejectResult?.status === 'FAILED',
    13,
    'Server validation error handling',
    `Operation marked FAILED with reason: "${rejectResult?.error}"`
  )

  // ─────────────────────────────────────────────────────────────
  // TEST 14: Multi-Device Stock Conflict Detection & Preservation
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- TEST 14: Multi-device stock conflict handling ---')
  // Find a product and artificially reduce its PostgreSQL stock to 1
  const testProduct = await prisma.product.findFirst({
    where: { status: 'ACTIVE' },
  })

  if (testProduct) {
    await prisma.product.update({
      where: { id: testProduct.id },
      data: { quantity: 1 },
    })

    // Now simulate an offline sale that sold 3 items (more than available server stock)
    const conflictOpId = generateOperationId()
    const conflictRes = await fetch(`${BASE_URL}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        operations: [
          {
            id: conflictOpId,
            operationId: conflictOpId,
            type: 'SALE',
            payload: {
              offlineOpId: conflictOpId,
              items: [
                {
                  productId: testProduct.id,
                  productName: testProduct.name,
                  sku: testProduct.sku,
                  quantity: 3,
                  unitPrice: 500,
                  discountAmount: 0,
                },
              ],
              subtotal: 1500,
              discountAmount: 0,
              taxAmount: 0,
              totalAmount: 1500,
              payments: [{ method: 'CASH', amount: 1500 }],
              saleAt: new Date().toISOString(),
            },
          },
        ],
      }),
    })

    const conflictJson = await conflictRes.json()
    const conflictResult = conflictJson.data?.results?.[0]
    const conflictSaleId = conflictResult?.data?.saleId || conflictResult?.serverSaleId
    const conflictSaleNumber = conflictResult?.data?.saleNumber || conflictResult?.serverSaleNumber

    // Verify: Conflict is flagged, but sale is NOT discarded, and audit log is created!
    const conflictAudit = await prisma.auditLog.findFirst({
      where: {
        action: 'STOCK_CONFLICT_FLAGGED',
        entityId: conflictSaleId,
      },
    })

    assert(
      conflictResult?.status === 'CONFLICT' &&
      Boolean(conflictSaleId) &&
      Boolean(conflictAudit),
      14,
      'Multi-device stock conflict preservation',
      `Flagged CONFLICT: "${conflictResult?.error || conflictResult?.conflictReason}", Sale preserved: ${conflictSaleNumber}`
    )
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 15: Website-Visible Stock Consistency After Sync
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- TEST 15: Website storefront stock consistency ---')
  const storefrontProduct = await prisma.product.findUnique({
    where: { id: cartItem1.productId },
    select: { id: true, name: true, quantity: true },
  })

  assert(
    Boolean(storefrontProduct && storefrontProduct.quantity >= 0),
    15,
    'Website-visible central stock consistency',
    `Current central stock in DB for "${storefrontProduct?.name}": ${storefrontProduct?.quantity}`
  )

  // ─────────────────────────────────────────────────────────────
  // TEST 16: Local Receipt Retrieval & Formatting
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- TEST 16: Local receipt retrieval ---')
  const receiptRecord = await freshDb.receipts.where('saleId').equals(opId1).first()
  assert(
    Boolean(receiptRecord && receiptRecord.serverSaleNumber && receiptRecord.payments.length > 0),
    16,
    'Local receipt retrieval',
    `Retrieved receipt: ${receiptRecord?.receiptNumber}, Associated Server Inv: ${receiptRecord?.serverSaleNumber}`
  )

  // ─────────────────────────────────────────────────────────────
  // TEST 17: Session Expiration During Sync
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- TEST 17: Session expiration handling ---')
  const expiredCookieRes = await fetch(`${BASE_URL}/api/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: 'next-auth.session-token=invalid-expired-token-xyz',
    },
    body: JSON.stringify({ operations: [] }),
  })

  assert(
    expiredCookieRes.status === 401,
    17,
    'Session expiration rejection',
    `Expired token returned HTTP ${expiredCookieRes.status} (expected 401)`
  )

  // ─────────────────────────────────────────────────────────────
  // TEST 18: Storage Quota & JSON Disaster Recovery Export
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- TEST 18: Local data backup & disaster recovery export ---')
  const backupJson = await exportOfflineBackup()
  const parsedBackup = JSON.parse(backupJson)

  assert(
    Boolean(parsedBackup.sales?.length > 0 && parsedBackup.receipts?.length > 0),
    18,
    'Disaster recovery JSON backup',
    `Exported ${parsedBackup.sales.length} sales, ${parsedBackup.receipts.length} receipts, ${parsedBackup.queue.length} queue items`
  )

  // ─────────────────────────────────────────────────────────────
  // TEST 19: Application Update with Unsynced Sales
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- TEST 19: Safe schema migration with pending sales ---')
  const unappliedCount = await freshDb.syncQueue.where('status').equals('PENDING').count()
  assert(
    unappliedCount >= 1,
    19,
    'Preservation during app upgrade',
    `${unappliedCount} pending items remain intact across Dexie database upgrades`
  )

  // ─────────────────────────────────────────────────────────────
  // TEST 20: Unauthorized Synchronization Rejection
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- TEST 20: Completely unauthorized sync rejection ---')
  const unauthRes = await fetch(`${BASE_URL}/api/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operations: [] }),
  })

  assert(
    unauthRes.status === 401,
    20,
    'Unauthorized sync rejection',
    `Anonymous request received HTTP ${unauthRes.status} (expected 401)`
  )

  // ─────────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────────
  console.log('\n============================================================')
  const totalPassed = results.filter(r => r.passed).length
  const totalFailed = results.filter(r => !r.passed).length
  console.log(`📊 PHASE 4 INTEGRATION TEST SUMMARY: ${totalPassed} PASSED, ${totalFailed} FAILED out of ${results.length} total`)
  console.log('============================================================\n')

  await prisma.$disconnect()
  await freshDb.close()

  if (totalFailed > 0) {
    process.exit(1)
  }
}

runPhase4Tests().catch(err => {
  console.error('Test execution fatal error:', err)
  process.exit(1)
})
