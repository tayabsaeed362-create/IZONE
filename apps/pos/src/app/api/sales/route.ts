import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@izone/database'
import { CreateSaleSchema, apiSuccess, apiError } from '@izone/shared'
import { getSaleNumber } from '@izone/shared'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// ── POST /api/sales — Create a new sale (online or sync) ───────────────────
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(apiError('Unauthorized: Authentication required', 'AUTH_REQUIRED'), { status: 401 })
    }

    if (session.user.role !== 'OWNER' && session.user.role !== 'CASHIER') {
      return NextResponse.json(
        apiError('Forbidden: Only store owners and cashiers can process sales', 'FORBIDDEN'),
        { status: 403 }
      )
    }

    const body = await request.json()
    const parsed = CreateSaleSchema.safeParse(body)
    
    if (!parsed.success) {
      return NextResponse.json(
        apiError(`Validation error: ${parsed.error.errors[0]?.message}`, 'VALIDATION_ERROR'),
        { status: 400 }
      )
    }

    const data = parsed.data

    // ── 1. Idempotency Check ──────────────────────────────────
    const existing = await prisma.sale.findUnique({
      where: { offlineOpId: data.offlineOpId },
      include: {
        user: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true, phone: true } },
        items: true,
        payments: true,
      },
    })
    
    if (existing) {
      // Already processed — return the existing sale without re-decrementing inventory
      return NextResponse.json(
        apiSuccess(
          {
            saleId: existing.id,
            saleNumber: existing.saleNumber,
            invoice: existing,
            alreadyProcessed: true,
          },
          'Sale already processed (idempotent replay)'
        ),
        { status: 200 }
      )
    }

    const isOwner = session.user.role === 'OWNER'

    // ── 2. Validate Products, Prices, & Stock (Server-Side) ────
    interface ValidatedItem {
      productId: string
      variantId?: string
      productName: string
      sku: string
      quantity: number
      unitPrice: number
      unitCost: number // Genuine server snapshot
      thresholdPrice: number
      discountAmount: number
      totalAmount: number
      imei?: string
      serialNumber?: string
      currentStock: number
    }

    const validatedItems: ValidatedItem[] = []

    for (const item of data.items) {
      if (item.variantId) {
        const variant = await prisma.productVariant.findUnique({
          where: { id: item.variantId },
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                status: true,
                purchasePrice: true,
                sellingPrice: true,
                minSellingPrice: true,
              },
            },
          },
        })

        if (!variant || !variant.isActive || variant.product.status !== 'ACTIVE') {
          return NextResponse.json(
            apiError(`Product variant "${item.variantId}" is inactive or does not exist`, 'BAD_REQUEST'),
            { status: 400 }
          )
        }

        if (variant.quantity < item.quantity) {
          return NextResponse.json(
            apiError(
              `Insufficient stock for "${variant.name}". Available: ${variant.quantity}, Requested: ${item.quantity}`,
              'INSUFFICIENT_STOCK'
            ),
            { status: 409 }
          )
        }

        // Snapshot genuine server prices
        const unitPrice = item.unitPrice > 0 ? item.unitPrice : (variant.sellingPrice || variant.product.sellingPrice)
        const unitCost = variant.purchasePrice > 0 ? variant.purchasePrice : variant.product.purchasePrice
        const thresholdPrice = (variant.minSellingPrice > 0) ? variant.minSellingPrice : (variant.product.minSellingPrice || 0)
        const lineTotal = unitPrice * item.quantity - (item.discountAmount ?? 0)
        const effectiveUnit = item.quantity > 0 ? (lineTotal / item.quantity) : unitPrice

        if (!isOwner && thresholdPrice > 0 && effectiveUnit < thresholdPrice - 0.01) {
          return NextResponse.json(
            apiError(
              `Cannot sell "${variant.product.name} (${variant.name})" below threshold price of Rs ${thresholdPrice.toLocaleString()} (Attempted: Rs ${Math.round(effectiveUnit).toLocaleString()}). Seller floor limit enforced.`,
              'BELOW_THRESHOLD_PRICE'
            ),
            { status: 400 }
          )
        }

        validatedItems.push({
          productId: variant.productId,
          variantId: variant.id,
          productName: `${variant.product.name} (${variant.name})`,
          sku: variant.sku,
          quantity: item.quantity,
          unitPrice,
          unitCost,
          thresholdPrice,
          discountAmount: item.discountAmount ?? 0,
          totalAmount: Math.max(0, lineTotal),
          imei: item.imei,
          serialNumber: item.serialNumber,
          currentStock: variant.quantity,
        })
      } else {
        const product = await prisma.product.findUnique({
          where: { id: item.productId },
          select: {
            id: true,
            name: true,
            sku: true,
            quantity: true,
            sellingPrice: true,
            purchasePrice: true,
            minSellingPrice: true,
            status: true,
          },
        })

        if (!product || product.status !== 'ACTIVE') {
          return NextResponse.json(
            apiError(`Product "${item.productId}" is inactive or does not exist`, 'BAD_REQUEST'),
            { status: 400 }
          )
        }

        if (product.quantity < item.quantity) {
          return NextResponse.json(
            apiError(
              `Insufficient stock for "${product.name}". Available: ${product.quantity}, Requested: ${item.quantity}`,
              'INSUFFICIENT_STOCK'
            ),
            { status: 409 }
          )
        }

        const unitPrice = item.unitPrice > 0 ? item.unitPrice : product.sellingPrice
        const unitCost = product.purchasePrice
        const thresholdPrice = product.minSellingPrice || 0
        const lineTotal = unitPrice * item.quantity - (item.discountAmount ?? 0)
        const effectiveUnit = item.quantity > 0 ? (lineTotal / item.quantity) : unitPrice

        if (!isOwner && thresholdPrice > 0 && effectiveUnit < thresholdPrice - 0.01) {
          return NextResponse.json(
            apiError(
              `Cannot sell "${product.name}" below threshold price of Rs ${thresholdPrice.toLocaleString()} (Attempted: Rs ${Math.round(effectiveUnit).toLocaleString()}). Seller floor limit enforced.`,
              'BELOW_THRESHOLD_PRICE'
            ),
            { status: 400 }
          )
        }

        validatedItems.push({
          productId: product.id,
          variantId: undefined,
          productName: product.name,
          sku: product.sku,
          quantity: item.quantity,
          unitPrice,
          unitCost,
          thresholdPrice,
          discountAmount: item.discountAmount ?? 0,
          totalAmount: Math.max(0, lineTotal),
          imei: item.imei,
          serialNumber: item.serialNumber,
          currentStock: product.quantity,
        })
      }
    }

    // Check that order-level discount does not push seller items below threshold price
    if (!isOwner && data.discountAmount > 0) {
      const grossSubtotal = validatedItems.reduce((s, i) => s + i.totalAmount, 0)
      if (grossSubtotal > 0) {
        const netRatio = Math.max(0, (grossSubtotal - data.discountAmount) / grossSubtotal)
        for (const item of validatedItems) {
          if (item.thresholdPrice > 0) {
            const finalUnitAfterOrderDiscount = (item.totalAmount * netRatio) / item.quantity
            if (finalUnitAfterOrderDiscount < item.thresholdPrice - 0.01) {
              return NextResponse.json(
                apiError(
                  `Order discount reduces "${item.productName}" to Rs ${Math.round(finalUnitAfterOrderDiscount).toLocaleString()} per unit, which is below its threshold price of Rs ${item.thresholdPrice.toLocaleString()}. Reduce order discount.`,
                  'BELOW_THRESHOLD_PRICE'
                ),
                { status: 400 }
              )
            }
          }
        }
      }
    }

    // ── 3. Calculate Totals ────────────────────────────────────
    const subtotal = validatedItems.reduce((sum, i) => sum + i.totalAmount, 0)
    const totalAmount = Math.max(0, subtotal - data.discountAmount + data.taxAmount)

    // Verify payments cover total
    const totalPaid = data.payments.reduce((sum, p) => sum + p.amount, 0)
    if (totalPaid < totalAmount - 0.01) { // 1 paisa tolerance for rounding
      return NextResponse.json(
        apiError(`Total payment (₨${totalPaid}) is less than total amount due (₨${totalAmount})`, 'INSUFFICIENT_PAYMENT'),
        { status: 400 }
      )
    }

    // Generate next human-readable invoice identifier
    const saleCount = await prisma.sale.count()
    const saleNumber = getSaleNumber(saleCount + 1)

    // Resolve or automatically create customer if phone/name provided
    let resolvedCustomerId = data.customerId
    if (!resolvedCustomerId && (data.customerPhone?.trim() || data.customerName?.trim())) {
      const phone = data.customerPhone?.trim() || null
      const name = data.customerName?.trim() || 'Walk-in Customer'

      if (phone) {
        const existingCust = await prisma.customer.findUnique({
          where: { phone },
        })
        if (existingCust) {
          resolvedCustomerId = existingCust.id
          if (data.customerName?.trim() && existingCust.name === 'Walk-in Customer') {
            await prisma.customer.update({
              where: { id: existingCust.id },
              data: { name: data.customerName.trim() },
            })
          }
        } else {
          const newCust = await prisma.customer.create({
            data: {
              name,
              phone,
            },
          })
          resolvedCustomerId = newCust.id
        }
      } else if (data.customerName?.trim()) {
        const newCust = await prisma.customer.create({
          data: {
            name,
          },
        })
        resolvedCustomerId = newCust.id
      }
    }

    // ── 4. Atomic Prisma Transaction ──────────────────────────
    const sale = await prisma.$transaction(
      async (tx) => {
        // Create Sale Record
        const createdSale = await tx.sale.create({
          data: {
            saleNumber,
            userId: session.user.id,
            customerId: resolvedCustomerId,
            offlineOpId: data.offlineOpId,
            subtotal,
            discountAmount: data.discountAmount,
            taxAmount: data.taxAmount,
            totalAmount,
            notes: data.notes,
            saleAt: data.saleAt ? new Date(data.saleAt) : new Date(),
            syncedAt: new Date(),
            status: 'COMPLETED',
            items: {
              create: validatedItems.map(item => ({
                productId: item.productId,
                variantId: item.variantId,
                productName: item.productName,
                sku: item.sku,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                unitCost: item.unitCost, // Genuine server cost snapshot
                discountAmount: item.discountAmount,
                totalAmount: item.totalAmount,
                imei: item.imei,
                serialNumber: item.serialNumber,
              })),
            },
            payments: {
              create: data.payments.map(p => ({
                method: p.method as any,
                amount: p.amount,
                reference: p.reference,
              })),
            },
          },
          include: {
            user: { select: { id: true, name: true } },
            customer: { select: { id: true, name: true, phone: true } },
            items: true,
            payments: true,
          },
        })

        // Update Stock Balances & Record Auditable Inventory Movements
        for (const item of validatedItems) {
          if (item.variantId) {
            // Decrement variant stock
            const updatedVariant = await tx.productVariant.update({
              where: { id: item.variantId },
              data: { quantity: { decrement: item.quantity } },
            })

            // Decrement parent product stock
            const updatedProduct = await tx.product.update({
              where: { id: item.productId },
              data: { quantity: { decrement: item.quantity } },
            })

            // Auditable Inventory Movement for Variant
            await tx.inventoryMovement.create({
              data: {
                productId: item.productId,
                variantId: item.variantId,
                type: 'SALE',
                quantity: -item.quantity,
                balanceBefore: updatedVariant.quantity + item.quantity,
                balanceAfter: updatedVariant.quantity,
                reason: `POS Sale: ${saleNumber} (${item.productName})`,
                referenceId: createdSale.id,
                referenceType: 'Sale',
                imei: item.imei,
                serialNumber: item.serialNumber,
                createdBy: session.user.id,
              },
            })
          } else {
            // Decrement product stock
            const updatedProduct = await tx.product.update({
              where: { id: item.productId },
              data: { quantity: { decrement: item.quantity } },
            })

            // Auditable Inventory Movement for Standalone Product
            await tx.inventoryMovement.create({
              data: {
                productId: item.productId,
                type: 'SALE',
                quantity: -item.quantity,
                balanceBefore: updatedProduct.quantity + item.quantity,
                balanceAfter: updatedProduct.quantity,
                reason: `POS Sale: ${saleNumber} (${item.productName})`,
                referenceId: createdSale.id,
                referenceType: 'Sale',
                imei: item.imei,
                serialNumber: item.serialNumber,
                createdBy: session.user.id,
              },
            })
          }
        }

        // Record Audit Log
        await tx.auditLog.create({
          data: {
            userId: session.user.id,
            action: 'SALE_COMPLETED',
            entityType: 'Sale',
            entityId: createdSale.id,
            after: {
              saleNumber,
              totalAmount,
              itemCount: validatedItems.length,
              offlineOpId: data.offlineOpId,
            },
          },
        })

        return createdSale
      },
      {
        maxWait: 15000,
        timeout: 45000,
      }
    )

    const changeDue = Math.max(0, totalPaid - totalAmount)

    return NextResponse.json(
      apiSuccess({
        saleId: sale.id,
        saleNumber: sale.saleNumber,
        subtotal: sale.subtotal,
        discountAmount: sale.discountAmount,
        taxAmount: sale.taxAmount,
        totalAmount: sale.totalAmount,
        totalPaid,
        changeDue,
        invoice: sale,
      }, 'Sale completed successfully'),
      { status: 201 }
    )
  } catch (err: any) {
    console.error('POST /api/sales error:', err)
    return NextResponse.json(
      apiError(err.message ?? 'Internal server error', 'SERVER_ERROR'),
      { status: 500 }
    )
  }
}

// ── GET /api/sales — List sales or fetch single sale for receipt ───────────
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(apiError('Unauthorized', 'AUTH_REQUIRED'), { status: 401 })
    }

    const isOwner = session.user.role === 'OWNER'
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    // Single sale lookup for receipt printing
    if (id) {
      const sale = await prisma.sale.findUnique({
        where: { id },
        include: {
          user: { select: { id: true, name: true } },
          customer: { select: { id: true, name: true, phone: true, address: true } },
          items: true,
          payments: true,
        },
      })

      if (!sale) {
        return NextResponse.json(apiError('Sale not found', 'NOT_FOUND'), { status: 404 })
      }

      const safeSale = {
        ...sale,
        items: sale.items.map(item => {
          if (!isOwner) {
            const { unitCost: _cost, ...safeItem } = item
            return safeItem
          }
          return item
        }),
      }

      return NextResponse.json(apiSuccess(safeSale))
    }

    const page = parseInt(searchParams.get('page') ?? '1')
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 100)
    const startDate = searchParams.get('start')
    const endDate = searchParams.get('end')
    const status = searchParams.get('status')
    const query = searchParams.get('q') || searchParams.get('search')

    const where: Record<string, unknown> = {}
    if (startDate || endDate) {
      where['saleAt'] = {
        ...(startDate ? { gte: new Date(startDate) } : {}),
        ...(endDate ? { lte: new Date(endDate) } : {}),
      }
    }
    if (status) where['status'] = status
    if (query?.trim()) {
      where['OR'] = [
        { saleNumber: { contains: query.trim(), mode: 'insensitive' } },
        { customer: { name: { contains: query.trim(), mode: 'insensitive' } } },
        { customer: { phone: { contains: query.trim() } } },
      ]
    }

    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        include: {
          user: { select: { name: true } },
          customer: { select: { name: true, phone: true } },
          items: {
            select: {
              id: true,
              productName: true,
              sku: true,
              quantity: true,
              unitPrice: true,
              ...(isOwner ? { unitCost: true } : {}),
              discountAmount: true,
              totalAmount: true,
            },
          },
          payments: true,
        },
        orderBy: { saleAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.sale.count({ where }),
    ])

    return NextResponse.json(
      apiSuccess({
        sales,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      })
    )
  } catch (err) {
    console.error('GET /api/sales error:', err)
    return NextResponse.json(apiError('Internal server error'), { status: 500 })
  }
}
