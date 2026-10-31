import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@izone/database'
import { apiSuccess, apiError } from '@izone/shared'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'

const CustomerUpdateSchema = z.object({
  name: z.string().min(1, 'Name is required').optional(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})

// GET /api/customers/[id] — Full details of a customer and all their past sales bills
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
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        sales: {
          orderBy: { saleAt: 'desc' },
          include: {
            user: { select: { id: true, name: true } },
            payments: true,
            items: {
              include: {
                product: {
                  select: { id: true, name: true, sku: true, images: true },
                },
              },
            },
          },
        },
      },
    })

    if (!customer) {
      return NextResponse.json(apiError('Customer not found', 'NOT_FOUND'), { status: 404 })
    }

    const totalSpent = customer.sales.reduce((sum, s) => sum + s.totalAmount, 0)

    return NextResponse.json(
      apiSuccess({
        ...customer,
        totalSpent,
        totalOrders: customer.sales.length,
      })
    )
  } catch (err: any) {
    console.error('GET /api/customers/[id] error:', err)
    return NextResponse.json(apiError('Failed to fetch customer details'), { status: 500 })
  }
}

// PUT /api/customers/[id] — Update customer contact info or notes
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json(apiError('Unauthorized', 'UNAUTHORIZED'), { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const parsed = CustomerUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(apiError(parsed.error.errors[0]?.message ?? 'Invalid customer data'), { status: 400 })
    }

    const data = parsed.data

    if (data.phone?.trim()) {
      const existing = await prisma.customer.findFirst({
        where: {
          phone: data.phone.trim(),
          NOT: { id },
        },
      })
      if (existing) {
        return NextResponse.json(apiError('This phone number is already registered to another customer', 'PHONE_EXISTS'), { status: 400 })
      }
    }

    const updated = await prisma.customer.update({
      where: { id },
      data: {
        name: data.name?.trim(),
        phone: data.phone !== undefined ? (data.phone?.trim() || null) : undefined,
        email: data.email !== undefined ? (data.email?.trim() || null) : undefined,
        address: data.address !== undefined ? (data.address?.trim() || null) : undefined,
        notes: data.notes !== undefined ? (data.notes?.trim() || null) : undefined,
      },
    })

    return NextResponse.json(apiSuccess(updated, 'Customer updated successfully'))
  } catch (err: any) {
    console.error('PUT /api/customers/[id] error:', err)
    return NextResponse.json(apiError('Failed to update customer'), { status: 500 })
  }
}
