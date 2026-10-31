import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@izone/database'
import { apiSuccess, apiError } from '@izone/shared'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { MovementType } from '@prisma/client'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(apiError('Unauthorized: Authentication required', 'AUTH_REQUIRED'), { status: 401 })
    }
    if (session.user.role !== 'OWNER' && session.user.role !== 'CASHIER') {
      return NextResponse.json(apiError('Forbidden: Only authorized personnel can record inventory movements', 'FORBIDDEN'), { status: 403 })
    }
    const userId = session.user.id

    const body = await request.json()
    const {
      productId,
      variantId,
      type, // 'PURCHASE' | 'ADJUSTMENT' | 'DAMAGE' | 'SALE_RETURN'
      direction, // 'IN' | 'OUT'
      quantity,
      unitCost,
      reason,
      referenceType,
      referenceId,
    } = body

    if (!productId) {
      return NextResponse.json(apiError('productId is required'), { status: 400 })
    }

    const parsedQty = parseInt(quantity)
    if (!parsedQty || parsedQty <= 0) {
      return NextResponse.json(apiError('Quantity must be a positive integer'), { status: 400 })
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { variants: variantId ? { where: { id: variantId } } : false },
    })

    if (!product) {
      return NextResponse.json(apiError('Product not found'), { status: 404 })
    }

    // Determine movement direction & type
    const isOut = direction === 'OUT' || type === 'DAMAGE'
    const qtyChange = isOut ? -parsedQty : parsedQty

    if (isOut && product.quantity < parsedQty) {
      return NextResponse.json(
        apiError(`Insufficient stock. Current product quantity: ${product.quantity}, requested: ${parsedQty}`),
        { status: 400 }
      )
    }

    let movementType: MovementType = isOut ? MovementType.STOCK_OUT : MovementType.STOCK_IN
    if (type === 'PURCHASE') movementType = MovementType.PURCHASE_RECEIVED
    else if (type === 'DAMAGE' || type === 'DAMAGED') movementType = MovementType.DAMAGED
    else if (type === 'RETURN' || type === 'SALE_RETURN') movementType = MovementType.RETURN
    else if (type === 'ADJUSTMENT') movementType = MovementType.ADJUSTMENT

    // Execute atomic transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Update product quantity
      const updatedProduct = await tx.product.update({
        where: { id: productId },
        data: {
          quantity: {
            increment: qtyChange,
          },
        },
      })

      // 2. If variant provided, update variant quantity
      let updatedVariant = null
      if (variantId) {
        updatedVariant = await tx.productVariant.update({
          where: { id: variantId },
          data: {
            quantity: {
              increment: qtyChange,
            },
          },
        })
      }

      const balanceBefore = product.quantity
      const balanceAfter = product.quantity + qtyChange

      // 3. Create inventory movement record
      const movement = await tx.inventoryMovement.create({
        data: {
          productId,
          variantId,
          type: movementType,
          quantity: qtyChange, // positive for intake, negative for deduction
          balanceBefore,
          balanceAfter,
          reason: reason || (isOut ? 'Stock reduction / manual adjustment' : 'Stock intake / purchase restock'),
          referenceType: referenceType || 'Manual',
          referenceId: referenceId || `adj_${Date.now()}`,
          createdBy: userId,
        },
      })

      // 4. Record audit log
      await tx.auditLog.create({
        data: {
          userId,
          action: isOut ? 'STOCK_OUT' : 'STOCK_IN',
          entityType: 'InventoryMovement',
          entityId: movement.id,
          after: {
            productId,
            variantId,
            qtyChange,
            newQuantity: updatedProduct.quantity,
            reason,
          },
        },
      })

      return {
        product: updatedProduct,
        variant: updatedVariant,
        movement,
      }
    })

    return NextResponse.json(apiSuccess(result), { status: 201 })
  } catch (err: any) {
    console.error('POST /api/inventory/movement error:', err)
    return NextResponse.json(apiError(err.message ?? 'Internal server error'), { status: 500 })
  }
}
