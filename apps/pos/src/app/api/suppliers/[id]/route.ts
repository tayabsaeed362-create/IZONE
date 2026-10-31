import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@izone/database'
import { apiSuccess, apiError } from '@izone/shared'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'

const SupplierUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  contactName: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
})

// GET /api/suppliers/[id] — Fetch supplier details with supplied products and purchase history
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json(apiError('Unauthorized', 'UNAUTHORIZED'), { status: 401 })
    }

    const { id } = await params
    const supplier = await prisma.supplier.findUnique({
      where: { id },
      include: {
        products: {
          select: {
            id: true,
            sku: true,
            name: true,
            sellingPrice: true,
            quantity: true,
          },
        },
        purchases: {
          orderBy: { purchasedAt: 'desc' },
          take: 10,
          include: {
            items: {
              include: {
                product: { select: { name: true, sku: true } },
              },
            },
          },
        },
      },
    })

    if (!supplier) {
      return NextResponse.json(apiError('Supplier not found', 'NOT_FOUND'), { status: 404 })
    }

    return NextResponse.json(apiSuccess(supplier))
  } catch (err) {
    console.error('GET /api/suppliers/[id] error:', err)
    return NextResponse.json(apiError('Failed to fetch supplier details'), { status: 500 })
  }
}

// PUT /api/suppliers/[id] — Update supplier
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json(apiError('Unauthorized', 'UNAUTHORIZED'), { status: 401 })
    }

    if (session.user.role !== 'OWNER') {
      return NextResponse.json(apiError('Forbidden: Only store owners can modify suppliers', 'FORBIDDEN'), { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const parsed = SupplierUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(apiError(parsed.error.errors[0]?.message ?? 'Invalid update data'), { status: 400 })
    }

    const updated = await prisma.supplier.update({
      where: { id },
      data: parsed.data,
    })

    return NextResponse.json(apiSuccess(updated, 'Supplier updated successfully'))
  } catch (err) {
    console.error('PUT /api/suppliers/[id] error:', err)
    return NextResponse.json(apiError('Failed to update supplier'), { status: 500 })
  }
}

// DELETE /api/suppliers/[id] — Soft-delete supplier
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json(apiError('Unauthorized', 'UNAUTHORIZED'), { status: 401 })
    }

    if (session.user.role !== 'OWNER') {
      return NextResponse.json(apiError('Forbidden: Only store owners can delete suppliers', 'FORBIDDEN'), { status: 403 })
    }

    const { id } = await params
    const deactivated = await prisma.supplier.update({
      where: { id },
      data: { isActive: false },
    })

    return NextResponse.json(apiSuccess(deactivated, 'Supplier deactivated successfully'))
  } catch (err) {
    console.error('DELETE /api/suppliers/[id] error:', err)
    return NextResponse.json(apiError('Failed to deactivate supplier'), { status: 500 })
  }
}
