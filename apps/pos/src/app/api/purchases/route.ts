import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@izone/database'
import { apiSuccess, apiError } from '@izone/shared'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'

const PurchaseItemInputSchema = z.object({
  productId: z.string().min(1, 'Product is required'),
  variantId: z.string().optional().nullable(),
  quantity: z.number().int().positive('Quantity must be greater than 0'),
  unitCost: z.number().nonnegative('Unit cost must be non-negative').optional().default(0),
  imeiList: z.array(z.string()).optional().default([]),
})

const CreatePurchaseSchema = z.object({
  supplierId: z.string().optional().nullable(),
  invoiceNo: z.string().optional().nullable(),
  status: z.enum(['DRAFT', 'ORDERED', 'RECEIVED', 'PARTIAL', 'CANCELLED']).default('RECEIVED'),
  paidAmount: z.number().nonnegative().optional().default(0),
  notes: z.string().optional().nullable(),
  items: z.array(PurchaseItemInputSchema).min(1, 'At least one purchase item is required'),
})

// GET /api/purchases — List purchases with supplier info and totals
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json(apiError('Unauthorized', 'UNAUTHORIZED'), { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const supplierId = searchParams.get('supplierId')
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') ?? '50', 10)
    const page = parseInt(searchParams.get('page') ?? '1', 10)

    const where: any = {}
    if (supplierId) where.supplierId = supplierId
    if (status) where.status = status

    const [purchases, totalCount] = await Promise.all([
      prisma.purchase.findMany({
        where,
        orderBy: { purchasedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          supplier: {
            select: { id: true, name: true, phone: true },
          },
          user: {
            select: { id: true, name: true },
          },
          items: {
            include: {
              product: {
                select: { id: true, name: true, sku: true },
              },
            },
          },
        },
      }),
      prisma.purchase.count({ where }),
    ])

    return NextResponse.json(
      apiSuccess({
        purchases,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      })
    )
  } catch (err) {
    console.error('GET /api/purchases error:', err)
    return NextResponse.json(apiError('Failed to fetch purchases'), { status: 500 })
  }
}

// POST /api/purchases — Record a purchase and atomically intake stock (or submit for owner approval if cashier)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json(apiError('Unauthorized', 'UNAUTHORIZED'), { status: 401 })
    }

    const isOwner = session.user.role === 'OWNER'
    const isCashier = session.user.role === 'CASHIER'

    if (!isOwner && !isCashier) {
      return NextResponse.json(apiError('Forbidden: Access denied', 'FORBIDDEN'), { status: 403 })
    }

    const body = await request.json()
    const parsed = CreatePurchaseSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(apiError(parsed.error.errors[0]?.message ?? 'Invalid purchase data'), { status: 400 })
    }

    const data = parsed.data
    const totalAmount = data.items.reduce((sum, item) => sum + item.quantity * (item.unitCost ?? 0), 0)

    // If Owner: status can be RECEIVED (intake immediately) and isApproved = true
    // If Cashier: status is ORDERED and isApproved = false (pending owner review)
    const effectiveStatus = isOwner ? (data.status || 'RECEIVED') : 'ORDERED'
    const isApproved = isOwner

    // Execute atomic transaction for purchase creation
    const result = await prisma.$transaction(async tx => {
      // 1. Create Purchase record
      const purchase = await tx.purchase.create({
        data: {
          supplierId: data.supplierId || null,
          userId: session.user.id,
          invoiceNo: data.invoiceNo?.trim() || `PUR-${Date.now().toString().slice(-6)}`,
          status: effectiveStatus,
          isApproved,
          totalAmount,
          paidAmount: isOwner ? (data.paidAmount ?? totalAmount) : 0,
          notes: data.notes?.trim() || null,
          items: {
            create: data.items.map(item => ({
              productId: item.productId,
              variantId: item.variantId || null,
              quantity: item.quantity,
              unitCost: item.unitCost ?? 0,
              totalCost: item.quantity * (item.unitCost ?? 0),
              imeiList: item.imeiList ?? [],
            })),
          },
        },
        include: {
          items: true,
          supplier: true,
        },
      })

      // 2. Only intake stock if OWNER and status is RECEIVED
      if (isOwner && effectiveStatus === 'RECEIVED') {
        for (const item of data.items) {
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

          // Update product stock and optionally update last purchase price
          await tx.product.update({
            where: { id: item.productId },
            data: {
              quantity: { increment: item.quantity },
              purchasePrice: (item.unitCost ?? 0) > 0 ? item.unitCost : undefined,
            },
          })

          // If variant specified, increment variant quantity too
          if (item.variantId) {
            await tx.productVariant.update({
              where: { id: item.variantId },
              data: {
                quantity: { increment: item.quantity },
                purchasePrice: (item.unitCost ?? 0) > 0 ? item.unitCost : undefined,
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
              reason: `Purchase intake: ${purchase.invoiceNo}`,
              referenceId: purchase.id,
              referenceType: 'Purchase',
              notes: item.imeiList?.length ? `IMEIs: ${item.imeiList.join(', ')}` : null,
              createdBy: session.user.id,
            },
          })
        }
      }

      return purchase
    }, {
      maxWait: 15000,
      timeout: 45000,
    })

    const msg = isOwner
      ? (effectiveStatus === 'RECEIVED' ? 'Purchase and stock intake completed successfully' : 'Purchase order created successfully')
      : 'Purchase order submitted for Owner approval. Stock will be intaken once approved.'

    return NextResponse.json(apiSuccess(result, msg), { status: 201 })
  } catch (err: any) {
    console.error('POST /api/purchases error:', err)
    return NextResponse.json(apiError(err?.message ?? 'Failed to process purchase'), { status: 500 })
  }
}
