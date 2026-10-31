import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@izone/database'
import { apiSuccess, apiError } from '@izone/shared'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)
    const isOwner = session?.user?.role === 'OWNER'

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        brand: true,
        supplier: true,
        barcodes: true,
        variants: {
          include: { barcodes: true },
        },
        inventoryMovements: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    })

    if (!product) {
      return NextResponse.json(apiError('Product not found'), { status: 404 })
    }

    if (!isOwner) {
      const { purchasePrice: _cost, ...safeProduct } = product
      const safeVariants = safeProduct.variants.map((v) => {
        const { purchasePrice: _vCost, ...safeV } = v
        return safeV
      })
      return NextResponse.json(apiSuccess({ ...safeProduct, variants: safeVariants }))
    }

    return NextResponse.json(apiSuccess(product))
  } catch (err: any) {
    console.error('GET /api/products/[id] error:', err)
    return NextResponse.json(apiError(err.message ?? 'Internal server error'), { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(apiError('Unauthorized: Authentication required', 'AUTH_REQUIRED'), { status: 401 })
    }
    if (session.user.role !== 'OWNER') {
      return NextResponse.json(apiError('Forbidden: Only store owners can update products', 'FORBIDDEN'), { status: 403 })
    }
    const userId = session.user.id

    const body = await request.json()
    const {
      name,
      description,
      categoryId,
      brandId,
      supplierId,
      purchasePrice,
      sellingPrice,
      minSellingPrice,
      discountAmount,
      minStockLevel,
      status,
      barcode,
      images,
    } = body

    const existing = await prisma.product.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(apiError('Product not found'), { status: 404 })
    }

    const effectiveSellingPrice = sellingPrice !== undefined ? Number(sellingPrice) : existing.sellingPrice
    const effectiveMinSellingPrice = minSellingPrice !== undefined ? Number(minSellingPrice) : existing.minSellingPrice
    if (effectiveMinSellingPrice > 0 && effectiveSellingPrice > 0 && effectiveMinSellingPrice > effectiveSellingPrice) {
      return NextResponse.json(apiError('Threshold selling price cannot be greater than regular selling price'), { status: 400 })
    }

    const updated = await prisma.$transaction(async (tx) => {
      const prod = await tx.product.update({
        where: { id },
        data: {
          ...(name ? { name } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(categoryId ? { categoryId } : {}),
          ...(brandId !== undefined ? { brandId } : {}),
          ...(supplierId !== undefined ? { supplierId } : {}),
          ...(purchasePrice !== undefined ? { purchasePrice: Number(purchasePrice) } : {}),
          ...(sellingPrice !== undefined ? { sellingPrice: Number(sellingPrice) } : {}),
          ...(minSellingPrice !== undefined ? { minSellingPrice: Number(minSellingPrice) } : {}),
          ...(discountAmount !== undefined ? { discountAmount: Number(discountAmount) } : {}),
          ...(minStockLevel !== undefined ? { minStockLevel: Number(minStockLevel) } : {}),
          ...(status ? { status } : {}),
          ...(images ? { images } : {}),
          ...(body.isPublished !== undefined ? { isPublished: Boolean(body.isPublished) } : {}),
          ...(body.isFeatured !== undefined ? { isFeatured: Boolean(body.isFeatured) } : {}),
          ...(body.onlineDescription !== undefined ? { onlineDescription: body.onlineDescription } : {}),
          ...(body.onlinePrice !== undefined ? { onlinePrice: body.onlinePrice ? Number(body.onlinePrice) : null } : {}),
        },
      })

      // If a barcode was provided, upsert barcode
      if (barcode && barcode.trim()) {
        const existingBarcode = await tx.productBarcode.findFirst({
          where: { productId: id },
        })
        if (existingBarcode) {
          await tx.productBarcode.update({
            where: { id: existingBarcode.id },
            data: { barcode: barcode.trim() },
          })
        } else {
          await tx.productBarcode.create({
            data: {
              productId: id,
              barcode: barcode.trim(),
              type: 'CODE128',
            },
          })
        }
      }

      if (userId) {
        await tx.auditLog.create({
          data: {
            userId,
            action: 'PRODUCT_UPDATED',
            entityType: 'Product',
            entityId: id,
            before: JSON.parse(JSON.stringify(existing)),
            after: JSON.parse(JSON.stringify(prod)),
          },
        })
      }

      return prod
    })

    return NextResponse.json(apiSuccess(updated))
  } catch (err: any) {
    console.error('PUT /api/products/[id] error:', err)
    return NextResponse.json(apiError(err.message ?? 'Internal server error'), { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(apiError('Unauthorized: Authentication required', 'AUTH_REQUIRED'), { status: 401 })
    }
    if (session.user.role !== 'OWNER') {
      return NextResponse.json(apiError('Forbidden: Only store owners can archive products', 'FORBIDDEN'), { status: 403 })
    }
    const userId = session.user.id

    const existing = await prisma.product.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(apiError('Product not found'), { status: 404 })
    }

    // Soft delete by setting status to DISCONTINUED
    const archived = await prisma.product.update({
      where: { id },
      data: { status: 'DISCONTINUED' },
    })

    if (userId) {
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'PRODUCT_ARCHIVED',
          entityType: 'Product',
          entityId: id,
          before: JSON.parse(JSON.stringify(existing)),
          after: JSON.parse(JSON.stringify(archived)),
        },
      })
    }

    return NextResponse.json(apiSuccess({ message: 'Product archived successfully', product: archived }))
  } catch (err: any) {
    console.error('DELETE /api/products/[id] error:', err)
    return NextResponse.json(apiError(err.message ?? 'Internal server error'), { status: 500 })
  }
}
