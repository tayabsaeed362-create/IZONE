import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@izone/database'
import { apiSuccess, apiError } from '@izone/shared'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json(apiError('Unauthorized', 'UNAUTHORIZED'), { status: 401 })
    }

    if (session.user.role !== 'OWNER') {
      return NextResponse.json(apiError('Forbidden: Only store owner can access analytics and profit reports', 'FORBIDDEN'), { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const range = searchParams.get('range') ?? 'month' // 'today' | 'week' | 'month' | 'year'

    const now = new Date()
    const startDate = new Date()
    if (range === 'today') {
      startDate.setHours(0, 0, 0, 0)
    } else if (range === 'week') {
      startDate.setDate(now.getDate() - 7)
    } else if (range === 'month') {
      startDate.setDate(now.getDate() - 30)
    } else if (range === 'year') {
      startDate.setFullYear(now.getFullYear() - 1)
    }

    // 1. Fetch Sales Aggregates
    const [salesAggregate, salesTrend, paymentMethods, cashierStats, expensesAggregate, returnStats] = await Promise.all([
      prisma.saleItem.aggregate({
        where: {
          sale: {
            status: { in: ['COMPLETED', 'PARTIAL_REFUND'] },
            saleAt: { gte: startDate },
          },
        },
        _sum: { totalAmount: true, unitCost: true, quantity: true },
        _count: { id: true },
      }),

      // Daily Trend
      prisma.$queryRaw<Array<{ date: string; revenue: number; profit: number; count: number }>>`
        SELECT 
          DATE_TRUNC('day', s."saleAt")::date::text as date,
          COALESCE(SUM(si."totalAmount"), 0)::float as revenue,
          COALESCE(SUM(si."totalAmount" - (si."unitCost" * si.quantity)), 0)::float as profit,
          COUNT(DISTINCT s.id)::int as count
        FROM sales s
        JOIN sale_items si ON si."saleId" = s.id
        WHERE s.status IN ('COMPLETED', 'PARTIAL_REFUND')
          AND s."saleAt" >= ${startDate}
        GROUP BY DATE_TRUNC('day', s."saleAt")
        ORDER BY date ASC
      `,

      // Payment Methods
      prisma.payment.groupBy({
        by: ['method'],
        where: {
          sale: {
            status: { in: ['COMPLETED', 'PARTIAL_REFUND'] },
            saleAt: { gte: startDate },
          },
        },
        _sum: { amount: true },
        _count: { id: true },
      }),

      // Cashier Performance
      prisma.sale.groupBy({
        by: ['userId'],
        where: {
          status: { in: ['COMPLETED', 'PARTIAL_REFUND'] },
          saleAt: { gte: startDate },
        },
        _sum: { totalAmount: true },
        _count: { id: true },
      }),

      // Expenses in Period
      prisma.expense.aggregate({
        where: { expenseAt: { gte: startDate } },
        _sum: { amount: true },
      }),

      // Returns in Period
      prisma.return.aggregate({
        where: { createdAt: { gte: startDate } },
        _sum: { totalAmount: true },
        _count: { id: true },
      }),
    ])

    // Fetch user names for cashier performance
    const userIds = cashierStats.map(c => c.userId)
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, role: true },
    })

    const cashierPerformance = cashierStats.map(c => {
      const u = users.find(user => user.id === c.userId)
      return {
        userId: c.userId,
        name: u?.name ?? 'Unknown Cashier',
        role: u?.role ?? 'CASHIER',
        totalRevenue: c._sum.totalAmount ?? 0,
        transactionCount: c._count.id,
      }
    })

    // 2. Best-Selling Products
    const bestSellingRaw = await prisma.saleItem.groupBy({
      by: ['productId', 'productName', 'sku'],
      where: {
        sale: {
          status: { in: ['COMPLETED', 'PARTIAL_REFUND'] },
          saleAt: { gte: startDate },
        },
      },
      _sum: { quantity: true, totalAmount: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 8,
    })

    // 3. Slow-Moving / Zero-Sales Products (products with high stock but 0 or minimal sales)
    const activeProducts = await prisma.product.findMany({
      where: { status: 'ACTIVE', quantity: { gt: 0 } },
      select: { id: true, name: true, sku: true, quantity: true, purchasePrice: true, sellingPrice: true },
      orderBy: { quantity: 'desc' },
      take: 20,
    })

    const soldProductIds = new Set(bestSellingRaw.map(b => b.productId))
    const slowMoving = activeProducts
      .filter(p => !soldProductIds.has(p.id))
      .slice(0, 6)

    // 4. Stock Valuation
    const stockValuationRaw = await prisma.$queryRaw<[{ totalPurchaseValue: string; totalRetailValue: string }]>`
      SELECT 
        COALESCE(SUM(quantity * "purchasePrice"), 0)::text as "totalPurchaseValue",
        COALESCE(SUM(quantity * "sellingPrice"), 0)::text as "totalRetailValue"
      FROM products
      WHERE status = 'ACTIVE'
    `

    // 5. Sales by Category
    const categorySalesRaw = await prisma.$queryRaw<Array<{ categoryName: string; revenue: number; count: number }>>`
      SELECT 
        COALESCE(c.name, 'Uncategorized') as "categoryName",
        COALESCE(SUM(si."totalAmount"), 0)::float as revenue,
        COUNT(si.id)::int as count
      FROM sale_items si
      JOIN sales s ON s.id = si."saleId"
      JOIN products p ON p.id = si."productId"
      LEFT JOIN categories c ON c.id = p."categoryId"
      WHERE s.status IN ('COMPLETED', 'PARTIAL_REFUND')
        AND s."saleAt" >= ${startDate}
      GROUP BY c.name
      ORDER BY revenue DESC
    `

    const revenue = salesAggregate._sum.totalAmount ?? 0
    const cost = salesAggregate._sum.unitCost ?? 0
    const grossProfit = revenue - cost
    const totalExpenses = expensesAggregate._sum.amount ?? 0
    const netProfit = grossProfit - totalExpenses

    return NextResponse.json(
      apiSuccess({
        range,
        overview: {
          revenue,
          grossProfit,
          grossMarginPercent: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
          totalExpenses,
          netProfit,
          totalUnitsSold: salesAggregate._sum.quantity ?? 0,
          totalTransactions: salesTrend.reduce((sum, d) => sum + d.count, 0),
          totalReturnsAmount: returnStats._sum.totalAmount ?? 0,
          totalReturnsCount: returnStats._count.id,
        },
        valuation: {
          purchaseCost: parseFloat(stockValuationRaw[0]?.totalPurchaseValue ?? '0'),
          retailPotential: parseFloat(stockValuationRaw[0]?.totalRetailValue ?? '0'),
        },
        salesTrend,
        categorySales: categorySalesRaw,
        paymentMethods: paymentMethods.map(pm => ({
          method: pm.method,
          amount: pm._sum.amount ?? 0,
          count: pm._count.id,
        })),
        cashierPerformance,
        bestSelling: bestSellingRaw.map(b => ({
          productId: b.productId,
          name: b.productName,
          sku: b.sku,
          quantity: b._sum.quantity ?? 0,
          revenue: b._sum.totalAmount ?? 0,
        })),
        slowMoving: slowMoving.map(s => ({
          id: s.id,
          name: s.name,
          sku: s.sku,
          quantity: s.quantity,
          tiedUpCapital: s.quantity * s.purchasePrice,
        })),
      })
    )
  } catch (err) {
    console.error('GET /api/reports/analytics error:', err)
    return NextResponse.json(apiError('Failed to generate analytics report'), { status: 500 })
  }
}
