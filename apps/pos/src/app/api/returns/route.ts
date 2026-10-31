import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@izone/database'
import { apiSuccess, apiError } from '@izone/shared'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'

const ReturnItemInputSchema = z.object({
  saleItemId: z.string().min(1, 'Sale item ID is required'),
  quantity: z.number().int().positive('Return quantity must be greater than 0'),
  isDamaged: z.boolean().default(false),
})

const CreateReturnSchema = z.object({
  saleId: z.string().min(1, 'Sale ID or Invoice Number is required'),
  reason: z.string().min(2, 'Return reason is required'),
  refundMethod: z.enum(['CASH', 'CARD', 'MOBILE_WALLET', 'BANK_TRANSFER', 'CREDIT', 'OTHER']).default('CASH'),
  deductionAmount: z.number().min(0).default(0),
  items: z.array(ReturnItemInputSchema).min(1, 'At least one item must be returned'),
})

// GET /api/returns — List processed returns
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json(apiError('Unauthorized', 'UNAUTHORIZED'), { status: 401 })
    }

    if (session.user.role !== 'OWNER' && session.user.role !== 'CASHIER') {
      return NextResponse.json(apiError('Forbidden: Access denied', 'FORBIDDEN'), { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') ?? '50', 10)
    const page = parseInt(searchParams.get('page') ?? '1', 10)

    const [returns, totalCount] = await Promise.all([
      prisma.return.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          sale: {
            select: {
              id: true,
              saleNumber: true,
              totalAmount: true,
              saleAt: true,
              customer: { select: { name: true, phone: true } },
            },
          },
          items: true,
        },
      }),
      prisma.return.count(),
    ])

    return NextResponse.json(
      apiSuccess({
        returns,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      })
    )
  } catch (err) {
    console.error('GET /api/returns error:', err)
    return NextResponse.json(apiError('Failed to fetch returns'), { status: 500 })
  }
}

// POST /api/returns — Process return & refund with damaged stock protection
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json(apiError('Unauthorized', 'UNAUTHORIZED'), { status: 401 })
    }

    if (session.user.role !== 'OWNER' && session.user.role !== 'CASHIER') {
      return NextResponse.json(apiError('Forbidden: Access denied', 'FORBIDDEN'), { status: 403 })
    }

    const body = await request.json()
    const parsed = CreateReturnSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(apiError(parsed.error.errors[0]?.message ?? 'Invalid return data'), { status: 400 })
    }

    const data = parsed.data

    // 1. Lookup the sale by ID or by saleNumber
    const sale = await prisma.sale.findFirst({
      where: {
        OR: [
          { id: data.saleId },
          { saleNumber: data.saleId },
        ],
      },
      include: {
        items: true,
        returns: {
          include: { items: true },
        },
      },
    })

    if (!sale) {
      return NextResponse.json(apiError('Sale invoice not found', 'NOT_FOUND'), { status: 404 })
    }

    if (sale.status === 'CANCELLED') {
      return NextResponse.json(apiError('Cannot refund a cancelled sale', 'INVALID_STATUS'), { status: 400 })
    }

    // 2. Validate returned quantities to prevent duplicate/over-refunding
    let totalRefundAmount = 0
    const returnItemsToCreate: Array<{
      productId: string
      variantId: string | null
      productName: string
      quantity: number
      unitPrice: number
      totalAmount: number
      isDamaged: boolean
    }> = []

    for (const reqItem of data.items) {
      const saleItem = sale.items.find(i => i.id === reqItem.saleItemId || i.productId === reqItem.saleItemId)
      if (!saleItem) {
        return NextResponse.json(
          apiError(`Item ${reqItem.saleItemId} does not belong to this sale`),
          { status: 400 }
        )
      }

      // Calculate previously returned quantity for this item
      const previouslyReturned = sale.returns.reduce((sum, ret) => {
        const matchingRetItem = ret.items.find(ri => ri.productId === saleItem.productId && ri.variantId === saleItem.variantId)
        return sum + (matchingRetItem?.quantity ?? 0)
      }, 0)

      const availableForReturn = saleItem.quantity - previouslyReturned
      if (reqItem.quantity > availableForReturn) {
        return NextResponse.json(
          apiError(
            `Cannot return ${reqItem.quantity} units of "${saleItem.productName}". Only ${availableForReturn} unit(s) eligible for return.`,
            'OVER_REFUND_ERROR'
          ),
          { status: 400 }
        )
      }

      const itemRefund = reqItem.quantity * saleItem.unitPrice
      totalRefundAmount += itemRefund

      returnItemsToCreate.push({
        productId: saleItem.productId,
        variantId: saleItem.variantId,
        productName: saleItem.productName,
        quantity: reqItem.quantity,
        unitPrice: saleItem.unitPrice,
        totalAmount: itemRefund,
        isDamaged: reqItem.isDamaged,
      })
    }

    // Apply Deduction Amount (Katoti / restocking fee)
    const grossRefundAmount = totalRefundAmount
    const deduction = Math.min(grossRefundAmount, Math.max(0, data.deductionAmount || 0))
    const netRefundAmount = Math.max(0, grossRefundAmount - deduction)
    const finalReason = deduction > 0
      ? `${data.reason.trim()} [Deduction: ₨${deduction.toLocaleString()}]`
      : data.reason.trim()

    // 3. Execute atomic return transaction
    const returnRecord = await prisma.$transaction(async tx => {
      // Create Return record
      const createdReturn = await tx.return.create({
        data: {
          saleId: sale.id,
          reason: finalReason,
          totalAmount: netRefundAmount,
          refundMethod: data.refundMethod,
          createdBy: session.user.id,
          items: {
            create: returnItemsToCreate.map(item => ({
              productId: item.productId,
              variantId: item.variantId,
              productName: item.productName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalAmount: item.totalAmount,
            })),
          },
        },
        include: { items: true },
      })

      // Update inventory and movement logs based on damage status
      for (const item of returnItemsToCreate) {
        const currentProd = await tx.product.findUnique({
          where: { id: item.productId },
          select: { quantity: true },
        })

        const balanceBefore = currentProd?.quantity ?? 0

        if (item.isDamaged) {
          // DAMAGED ITEM: DO NOT ADD TO SELLABLE STOCK!
          // Record DAMAGED movement for inventory auditing
          await tx.inventoryMovement.create({
            data: {
              productId: item.productId,
              variantId: item.variantId,
              type: 'DAMAGED',
              quantity: -item.quantity,
              balanceBefore,
              balanceAfter: balanceBefore, // Sellable stock remains unchanged
              reason: `Returned as damaged: ${data.reason}`,
              referenceId: createdReturn.id,
              referenceType: 'Return',
              notes: 'Damaged item segregated; not returned to sellable inventory',
              createdBy: session.user.id,
            },
          })
        } else {
          // RESELLABLE ITEM: RESTORE TO SELLABLE INVENTORY
          const balanceAfter = balanceBefore + item.quantity

          await tx.product.update({
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
              balanceBefore,
              balanceAfter,
              reason: `Customer return restocked: ${data.reason}`,
              referenceId: createdReturn.id,
              referenceType: 'Return',
              createdBy: session.user.id,
            },
          })
        }
      }

      // Check if all items in the original sale have now been returned
      const allReturnedAfterThis = sale.items.every(saleItem => {
        const prevReturned = sale.returns.reduce((sum, r) => {
          const match = r.items.find(ri => ri.productId === saleItem.productId && ri.variantId === saleItem.variantId)
          return sum + (match?.quantity ?? 0)
        }, 0)
        const currentReturnQty = returnItemsToCreate.find(ri => ri.productId === saleItem.productId && ri.variantId === saleItem.variantId)?.quantity ?? 0
        return prevReturned + currentReturnQty >= saleItem.quantity
      })

      await tx.sale.update({
        where: { id: sale.id },
        data: {
          status: allReturnedAfterThis ? 'REFUNDED' : 'PARTIAL_REFUND',
        },
      })

      // Audit Log entry
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: allReturnedAfterThis ? 'FULL_RETURN_PROCESSED' : 'PARTIAL_RETURN_PROCESSED',
          entityType: 'Return',
          entityId: createdReturn.id,
          after: {
            saleId: sale.id,
            saleNumber: sale.saleNumber,
            grossAmount: grossRefundAmount,
            deductionAmount: deduction,
            refundAmount: netRefundAmount,
            reason: finalReason,
          },
        },
      })

      return createdReturn
    }, {
      maxWait: 15000,
      timeout: 45000,
    })

    return NextResponse.json(
      apiSuccess(returnRecord, `Return of ₨${netRefundAmount.toLocaleString()} processed successfully`),
      { status: 201 }
    )
  } catch (err: any) {
    console.error('POST /api/returns error:', err)
    return NextResponse.json(apiError(err?.message ?? 'Failed to process return'), { status: 500 })
  }
}
