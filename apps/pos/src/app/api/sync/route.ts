import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@izone/database'
import { CreateSaleSchema, apiSuccess, apiError } from '@izone/shared'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// POST /api/sync — Process sync operations from offline devices
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(apiError('Unauthorized: Authentication required', 'AUTH_REQUIRED'), { status: 401 })
    }

    if (session.user.role !== 'OWNER' && session.user.role !== 'CASHIER') {
      return NextResponse.json(apiError('Forbidden: Only authorized personnel can sync operations', 'FORBIDDEN'), { status: 403 })
    }

    const body = await request.json()

    // Support both single operation and bulk array
    const operations = Array.isArray(body) ? body : body.operations ? body.operations : [body]

    const results: Array<{ id: string; status: 'SYNCED' | 'FAILED' | 'CONFLICT'; data?: unknown; error?: string }> = []

    for (const op of operations) {
      const id = op.id || op.operationId
      const type = op.type
      let payload = op.payload

      if (!id || !type || !payload) {
        results.push({ id: id ?? 'unknown', status: 'FAILED', error: 'Missing required fields' })
        continue
      }

      // If sale payload is missing offlineOpId, assign operation id
      if (type === 'SALE' && typeof payload === 'object' && payload !== null) {
        if (!(payload as any).offlineOpId) {
          payload = { ...(payload as any), offlineOpId: id }
        }
      }

      // Check idempotency — already processed?
      const existing = await prisma.syncOperation.findUnique({ where: { id } })
      if (existing?.status === 'SYNCED') {
        const existingSale = await prisma.sale.findUnique({
          where: { offlineOpId: id },
          select: { id: true, saleNumber: true },
        })
        results.push({
          id,
          status: 'SYNCED',
          data: { processed: true, duplicate: true, saleId: existingSale?.id, saleNumber: existingSale?.saleNumber },
        })
        continue
      }

      // Create/update sync operation record
      await prisma.syncOperation.upsert({
        where: { id },
        create: {
          id,
          deviceId: op.deviceId,
          type,
          payload,
          status: 'PROCESSING',
          attempts: 1,
        },
        update: {
          status: 'PROCESSING',
          attempts: { increment: 1 },
        },
      })

      try {
        let resultData: any = null

        switch (type) {
          case 'SALE': {
            const parsed = CreateSaleSchema.safeParse(payload)
            if (!parsed.success) {
              throw new Error(`Validation error: ${parsed.error.errors[0]?.message}`)
            }
            resultData = await processSaleSync(parsed.data, session.user.id)
            break
          }

          case 'RETURN': {
            resultData = await processReturnSync(payload as any, session.user.id)
            break
          }

          case 'STOCK_ADJUSTMENT': {
            resultData = await processAdjustmentSync(payload as any, session.user.id)
            break
          }

          case 'PRODUCT_UPDATE': {
            resultData = { queued: true }
            break
          }

          default:
            throw new Error(`Unknown operation type: ${type}`)
        }

        if (resultData?.conflict) {
          await prisma.syncOperation.update({
            where: { id },
            data: {
              status: 'CONFLICT',
              errorMsg: resultData.conflictReason,
              processedAt: new Date(),
            },
          })
          results.push({
            id,
            status: 'CONFLICT',
            data: resultData,
            error: resultData.conflictReason,
          })
        } else {
          await prisma.syncOperation.update({
            where: { id },
            data: { status: 'SYNCED', processedAt: new Date(), errorMsg: null },
          })
          results.push({ id, status: 'SYNCED', data: resultData })
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Processing failed'
        const isConflict = errMsg.includes('Insufficient stock') || errMsg.includes('CONFLICT')

        await prisma.syncOperation.update({
          where: { id },
          data: {
            status: isConflict ? 'CONFLICT' : 'FAILED',
            errorMsg: errMsg,
          },
        })

        results.push({
          id,
          status: isConflict ? 'CONFLICT' : 'FAILED',
          error: errMsg,
        })
      }
    }

    const anyFailed = results.some(r => r.status === 'FAILED' || r.status === 'CONFLICT')

    return NextResponse.json(
      apiSuccess({
        processed: results.length,
        synced: results.filter(r => r.status === 'SYNCED').length,
        failed: results.filter(r => r.status === 'FAILED').length,
        conflicts: results.filter(r => r.status === 'CONFLICT').length,
        results,
      }),
      { status: anyFailed ? 207 : 200 } // 207 Multi-Status for partial results
    )
  } catch (err) {
    console.error('POST /api/sync error:', err)
    return NextResponse.json(apiError('Internal server error'), { status: 500 })
  }
}

// GET /api/sync — Query sync operations, history, and conflicts
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(apiError('Unauthorized'), { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const deviceId = searchParams.get('deviceId')
    const status = searchParams.get('status')
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 100)

    const where: Record<string, unknown> = {}
    if (deviceId) where['deviceId'] = deviceId
    if (status && status !== 'all') where['status'] = status

    const [ops, totalPending, totalConflicts] = await Promise.all([
      prisma.syncOperation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      prisma.syncOperation.count({ where: { status: 'PENDING' } }),
      prisma.syncOperation.count({ where: { status: 'CONFLICT' } }),
    ])

    return NextResponse.json(
      apiSuccess({
        operations: ops,
        summary: {
          total: ops.length,
          pending: totalPending,
          conflicts: totalConflicts,
        },
      })
    )
  } catch (err) {
    console.error('GET /api/sync error:', err)
    return NextResponse.json(apiError('Internal server error'), { status: 500 })
  }
}

// ── Sale Sync Processor with Conflict Reconciliation ───────────────────────
async function processSaleSync(
  data: import('@izone/shared').CreateSaleInput,
  userId: string
) {
  // 1. Idempotency Check
  const existing = await prisma.sale.findUnique({
    where: { offlineOpId: data.offlineOpId },
    select: { id: true, saleNumber: true },
  })
  if (existing) {
    return { saleId: existing.id, saleNumber: existing.saleNumber, duplicate: true }
  }

  // 2. Conflict Detection (Insufficient central stock)
  let hasStockConflict = false
  const conflictDetails: string[] = []

  for (const item of data.items) {
    if (item.variantId) {
      const v = await prisma.productVariant.findUnique({
        where: { id: item.variantId },
        select: { quantity: true, name: true },
      })
      if (!v || v.quantity < item.quantity) {
        hasStockConflict = true
        conflictDetails.push(
          `Variant "${v?.name ?? item.variantId}" oversold: sold ${item.quantity}, central stock was ${v?.quantity ?? 0}`
        )
      }
    } else {
      const p = await prisma.product.findUnique({
        where: { id: item.productId },
        select: { quantity: true, name: true },
      })
      if (!p || p.quantity < item.quantity) {
        hasStockConflict = true
        conflictDetails.push(
          `Product "${p?.name ?? item.productId}" oversold: sold ${item.quantity}, central stock was ${p?.quantity ?? 0}`
        )
      }
    }
  }

  // 3. Generate authoritative invoice identifier
  const saleCount = await prisma.sale.count()
  const saleNumber = `INV-${new Date().getFullYear()}-${(saleCount + 1).toString().padStart(5, '0')}`
  const subtotal = data.items.reduce((s, i) => s + i.unitPrice * i.quantity - i.discountAmount, 0)
  const totalAmount = Math.max(0, subtotal - data.discountAmount + data.taxAmount)

  // 4. Transactional Execution: Preserve customer sale & apply atomic movements
  const sale = await prisma.$transaction(async (tx) => {
    // Look up authentic server costs for profit snapshot
    const itemDataWithCosts = await Promise.all(
      data.items.map(async (i) => {
        let authenticCost = 0
        if (i.variantId) {
          const v = await tx.productVariant.findUnique({
            where: { id: i.variantId },
            select: { purchasePrice: true },
          })
          authenticCost = v?.purchasePrice ?? 0
        } else {
          const p = await tx.product.findUnique({
            where: { id: i.productId },
            select: { purchasePrice: true },
          })
          authenticCost = p?.purchasePrice ?? 0
        }

        return {
          productId: i.productId,
          variantId: i.variantId,
          productName: i.productName,
          sku: i.sku,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          unitCost: authenticCost > 0 ? authenticCost : (i.unitCost ?? 0),
          discountAmount: i.discountAmount,
          totalAmount: i.unitPrice * i.quantity - i.discountAmount,
          imei: i.imei,
          serialNumber: i.serialNumber,
        }
      })
    )

    // Create Sale Record (preserves the original offline transaction & customer payment)
    const sale = await tx.sale.create({
      data: {
        saleNumber,
        userId,
        customerId: data.customerId,
        offlineOpId: data.offlineOpId,
        subtotal,
        discountAmount: data.discountAmount,
        taxAmount: data.taxAmount,
        totalAmount,
        notes: hasStockConflict
          ? `[STOCK CONFLICT DETECTED]: ${conflictDetails.join('; ')}. ${data.notes || ''}`
          : data.notes,
        saleAt: data.saleAt ? new Date(data.saleAt) : new Date(),
        syncedAt: new Date(),
        status: 'COMPLETED',
        items: {
          create: itemDataWithCosts,
        },
        payments: {
          create: data.payments.map((p) => ({
            method: p.method as any,
            amount: p.amount,
            reference: p.reference,
          })),
        },
      },
    })

    // Apply inventory movements transactionally (never blind overwrite)
    for (const item of data.items) {
      const p = await tx.product.update({
        where: { id: item.productId },
        data: { quantity: { decrement: item.quantity } },
      })

      if (item.variantId) {
        const v = await tx.productVariant.update({
          where: { id: item.variantId },
          data: { quantity: { decrement: item.quantity } },
        })

        await tx.inventoryMovement.create({
          data: {
            productId: item.productId,
            variantId: item.variantId,
            type: 'SALE',
            quantity: -item.quantity,
            balanceBefore: v.quantity + item.quantity,
            balanceAfter: v.quantity,
            referenceId: sale.id,
            referenceType: 'Sale',
            reason: `Synced Sale: ${saleNumber} (Variant: ${item.productName})`,
            imei: item.imei,
            serialNumber: item.serialNumber,
            createdBy: userId,
          },
        })
      } else {
        await tx.inventoryMovement.create({
          data: {
            productId: item.productId,
            variantId: item.variantId,
            type: 'SALE',
            quantity: -item.quantity,
            balanceBefore: p.quantity + item.quantity,
            balanceAfter: p.quantity,
            referenceId: sale.id,
            referenceType: 'Sale',
            reason: `Synced Sale: ${saleNumber} (${item.productName})`,
            imei: item.imei,
            serialNumber: item.serialNumber,
            createdBy: userId,
          },
        })
      }
    }

    // If conflict detected, record in audit log for owner review
    if (hasStockConflict) {
      await tx.auditLog.create({
        data: {
          userId,
          action: 'STOCK_CONFLICT_FLAGGED',
          entityType: 'Sale',
          entityId: sale.id,
          after: {
            saleNumber,
            offlineOpId: data.offlineOpId,
            conflicts: conflictDetails,
          },
        },
      })
    }

    return sale
  }, {
    maxWait: 15000,
    timeout: 45000,
  })

  return {
    saleId: sale.id,
    saleNumber: sale.saleNumber,
    conflict: hasStockConflict,
    conflictReason: hasStockConflict ? conflictDetails.join('. ') : undefined,
  }
}

// ── Return sync processor ──────────────────────────────────────────────────
async function processReturnSync(
  payload: {
    saleId: string
    items: Array<{ productId: string; variantId?: string; quantity: number; unitPrice: number; productName: string }>
    reason: string
    totalAmount: number
    refundMethod: string
  },
  userId: string
) {
  const sale = await prisma.sale.findUnique({ where: { id: payload.saleId } })
  if (!sale) throw new Error(`Sale not found: ${payload.saleId}`)

  const ret = await prisma.$transaction(async (tx) => {
    const ret = await tx.return.create({
      data: {
        saleId: payload.saleId,
        reason: payload.reason,
        totalAmount: payload.totalAmount,
        refundMethod: payload.refundMethod as any,
        createdBy: userId,
        items: {
          create: payload.items.map((i) => ({
            productId: i.productId,
            variantId: i.variantId,
            productName: i.productName,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            totalAmount: i.unitPrice * i.quantity,
          })),
        },
      },
    })
    for (const item of payload.items) {
      const p = await tx.product.update({
        where: { id: item.productId },
        data: { quantity: { increment: item.quantity } },
      })
      if (item.variantId) {
        await tx.productVariant.update({
          where: { id: item.variantId },
          data: { quantity: { increment: item.quantity } },
        })
      }
      await tx.inventoryMovement.create({
        data: {
          productId: item.productId,
          variantId: item.variantId,
          type: 'RETURN',
          quantity: item.quantity,
          balanceBefore: p.quantity - item.quantity,
          balanceAfter: p.quantity,
          referenceId: ret.id,
          referenceType: 'Return',
          createdBy: userId,
        },
      })
    }
    return ret
  }, {
    maxWait: 15000,
    timeout: 45000,
  })

  return { returnId: ret.id }
}

// ── Adjustment sync processor ──────────────────────────────────────────────
async function processAdjustmentSync(
  payload: { productId: string; variantId?: string; quantity: number; reason: string; type: string },
  userId: string
) {
  const product = await prisma.product.findUnique({
    where: { id: payload.productId },
    select: { quantity: true },
  })
  if (!product) throw new Error(`Product not found: ${payload.productId}`)

  const newQty = Math.max(0, product.quantity + payload.quantity)

  await prisma.$transaction(async (tx) => {
    await tx.product.update({ where: { id: payload.productId }, data: { quantity: newQty } })
    if (payload.variantId) {
      const v = await tx.productVariant.findUnique({
        where: { id: payload.variantId },
        select: { quantity: true },
      })
      if (v) {
        await tx.productVariant.update({
          where: { id: payload.variantId },
          data: { quantity: Math.max(0, v.quantity + payload.quantity) },
        })
      }
    }
    await tx.inventoryMovement.create({
      data: {
        productId: payload.productId,
        variantId: payload.variantId,
        type: payload.type as any,
        quantity: payload.quantity,
        balanceBefore: product.quantity,
        balanceAfter: newQty,
        reason: payload.reason,
        referenceType: 'Manual',
        createdBy: userId,
      },
    })
  }, {
    maxWait: 15000,
    timeout: 45000,
  })

  return { newQuantity: newQty }
}
