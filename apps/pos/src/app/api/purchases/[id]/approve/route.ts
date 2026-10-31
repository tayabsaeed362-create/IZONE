import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@izone/database'
import { apiSuccess, apiError } from '@izone/shared'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'

const ApprovePurchaseSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    unitCost: z.number().nonnegative(),
  })).optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json(apiError('Unauthorized', 'UNAUTHORIZED'), { status: 401 })
    }

    if (session.user.role !== 'OWNER') {
      return NextResponse.json(apiError('Forbidden: Only the store owner can approve purchase orders and intake stock', 'FORBIDDEN'), { status: 403 })
    }

    const { id: purchaseId } = await params
    const body = await request.json().catch(() => ({}))
    const parsed = ApprovePurchaseSchema.safeParse(body)
    const costOverrides = new Map(parsed.success && parsed.data.items ? parsed.data.items.map(i => [i.id, i.unitCost]) : [])

    const purchase = await prisma.purchase.findUnique({
      where: { id: purchaseId },
      include: {
        items: true,
        supplier: true,
      },
    })

    if (!purchase) {
      return NextResponse.json(apiError('Purchase not found', 'NOT_FOUND'), { status: 404 })
    }

    if (purchase.isApproved && purchase.status === 'RECEIVED') {
      return NextResponse.json(apiError('This purchase is already approved and intaken into inventory', 'ALREADY_APPROVED'), { status: 400 })
    }

    // Atomic transaction: update purchase status, update item costs, and intake inventory
    const approved = await prisma.$transaction(async tx => {
      let recalculatedTotal = 0

      // 1. Process items and update stock
      for (const item of purchase.items) {
        const finalUnitCost = costOverrides.has(item.id) ? costOverrides.get(item.id)! : item.unitCost
        const lineTotal = item.quantity * finalUnitCost
        recalculatedTotal += lineTotal

        // Update purchase item cost if changed
        if (costOverrides.has(item.id)) {
          await tx.purchaseItem.update({
            where: { id: item.id },
            data: {
              unitCost: finalUnitCost,
              totalCost: lineTotal,
            },
          })
        }

        // Fetch current product stock
        const currentProd = await tx.product.findUnique({
          where: { id: item.productId },
          select: { id: true, quantity: true, purchasePrice: true },
        })

        if (!currentProd) {
          throw new Error(`Product ${item.productId} not found for stock intake`)
        }

        const balanceBefore = currentProd.quantity
        const balanceAfter = balanceBefore + item.quantity

        // Increment product stock and update purchase price if unit cost is positive
        await tx.product.update({
          where: { id: item.productId },
          data: {
            quantity: { increment: item.quantity },
            purchasePrice: finalUnitCost > 0 ? finalUnitCost : undefined,
          },
        })

        // If variant specified, increment variant quantity too
        if (item.variantId) {
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: {
              quantity: { increment: item.quantity },
              purchasePrice: finalUnitCost > 0 ? finalUnitCost : undefined,
            },
          })
        }

        // Create inventory movement record
        await tx.inventoryMovement.create({
          data: {
            productId: item.productId,
            variantId: item.variantId || null,
            type: 'PURCHASE_RECEIVED',
            quantity: item.quantity,
            balanceBefore,
            balanceAfter,
            reason: `Purchase intake approved by Owner: ${purchase.invoiceNo}`,
            referenceId: purchase.id,
            referenceType: 'Purchase',
            notes: item.imeiList?.length ? `IMEIs: ${item.imeiList.join(', ')}` : null,
            createdBy: session.user.id,
          },
        })
      }

      // 2. Mark purchase as approved and RECEIVED
      const updatedPurchase = await tx.purchase.update({
        where: { id: purchaseId },
        data: {
          isApproved: true,
          status: 'RECEIVED',
          totalAmount: recalculatedTotal > 0 ? recalculatedTotal : purchase.totalAmount,
          paidAmount: recalculatedTotal > 0 ? recalculatedTotal : purchase.totalAmount,
        },
        include: {
          items: {
            include: {
              product: {
                select: { id: true, name: true, sku: true },
              },
            },
          },
          supplier: true,
          user: {
            select: { id: true, name: true },
          },
        },
      })

      return updatedPurchase
    }, {
      maxWait: 15000,
      timeout: 45000,
    })

    return NextResponse.json(apiSuccess(approved, 'Purchase order approved successfully! Inventory stock has been intaken.'), { status: 200 })
  } catch (err: any) {
    console.error('POST /api/purchases/[id]/approve error:', err)
    return NextResponse.json(apiError(err?.message ?? 'Failed to approve purchase'), { status: 500 })
  }
}
