import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@izone/database'
import { apiSuccess, apiError } from '@izone/shared'
import { getDateRange } from '@izone/shared'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// GET /api/reports/dashboard — Dashboard summary stats
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const period = (searchParams.get('period') ?? 'today') as 'today' | 'week' | 'month' | 'year'
    const { start, end } = getDateRange(period)

    const [
      salesStats,
      todaySaleCount,
      totalProducts,
      lowStockProducts,
      totalCustomers,
      expenses,
      topProducts,
      salesTrend,
      categoryBreakdown,
    ] = await Promise.all([
      // Sales revenue + profit for period
      prisma.saleItem.aggregate({
        where: {
          sale: {
            status: 'COMPLETED',
            saleAt: { gte: start, lte: end },
          },
        },
        _sum: {
          totalAmount: true,
          unitCost: true,
        },
        _count: { id: true },
      }),

      // Transaction count
      prisma.sale.count({
        where: {
          status: 'COMPLETED',
          saleAt: { gte: start, lte: end },
        },
      }),

      // Total active products
      prisma.product.count({ where: { status: 'ACTIVE' } }),

      // Low stock products
      prisma.product.count({
        where: {
          status: 'ACTIVE',
          quantity: { gt: 0 },
          // Products where quantity <= minStockLevel
        },
      }),

      // Customer count
      prisma.customer.count({ where: { isActive: true } }),

      // Expenses for period
      prisma.expense.aggregate({
        where: { expenseAt: { gte: start, lte: end } },
        _sum: { amount: true },
      }),

      // Top selling products
      prisma.saleItem.groupBy({
        by: ['productId', 'productName'],
        where: {
          sale: { status: 'COMPLETED', saleAt: { gte: start, lte: end } },
        },
        _sum: { quantity: true, totalAmount: true },
        orderBy: { _sum: { totalAmount: 'desc' } },
        take: 5,
      }),

      // Daily sales trend (last 7 days)
      prisma.$queryRaw<Array<{ date: string; revenue: number; count: number }>>`
        SELECT 
          DATE_TRUNC('day', "saleAt")::date::text as date,
          COALESCE(SUM("totalAmount"), 0)::float as revenue,
          COUNT(*)::int as count
        FROM sales
        WHERE status = 'COMPLETED'
          AND "saleAt" >= ${start}
          AND "saleAt" <= ${end}
        GROUP BY DATE_TRUNC('day', "saleAt")
        ORDER BY date ASC
      `,

      // Sales by category
      prisma.saleItem.groupBy({
        by: ['productId'],
        where: {
          sale: { status: 'COMPLETED', saleAt: { gte: start, lte: end } },
        },
        _sum: { totalAmount: true },
        orderBy: {
          _sum: {
            totalAmount: 'desc',
          },
        },
        take: 20,
      }),
    ])

    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

    // Calculate monthly sales & expenses for net profit comparison
    const [
      monthlySales,
      monthlyExpensesData,
      inventoryValuation,
      pendingSync,
      recentSales,
      lowStockWatchlist,
      categoryDistribution,
    ] = await Promise.all([
      prisma.saleItem.aggregate({
        where: {
          sale: {
            status: 'COMPLETED',
            saleAt: { gte: monthStart, lte: monthEnd },
          },
        },
        _sum: { totalAmount: true, unitCost: true },
        _count: { id: true },
      }),
      prisma.expense.aggregate({
        where: { expenseAt: { gte: monthStart, lte: monthEnd } },
        _sum: { amount: true },
      }),
      prisma.$queryRaw<[{ totalValue: string | null }]>`
        SELECT COALESCE(SUM(quantity * "purchasePrice"), 0)::text as "totalValue"
        FROM products
        WHERE status = 'ACTIVE'
      `,
      prisma.syncOperation.count({
        where: { status: { in: ['PENDING', 'PROCESSING', 'FAILED'] } },
      }),
      prisma.sale.findMany({
        where: { status: 'COMPLETED' },
        orderBy: { saleAt: 'desc' },
        take: 5,
        include: {
          customer: { select: { name: true } },
          payments: { select: { method: true, amount: true } },
          _count: { select: { items: true } },
        },
      }),
      prisma.product.findMany({
        where: { status: 'ACTIVE', quantity: { lte: 5 } },
        orderBy: { quantity: 'asc' },
        take: 5,
        select: {
          id: true,
          name: true,
          sku: true,
          quantity: true,
          minStockLevel: true,
          sellingPrice: true,
          purchasePrice: true,
        },
      }),
      prisma.$queryRaw<Array<{ name: string; revenue: number; count: number }>>`
        SELECT 
          COALESCE(c.name, 'Accessories') as name,
          COALESCE(SUM(si."totalAmount"), 0)::float as revenue,
          COUNT(si.id)::int as count
        FROM sale_items si
        JOIN sales s ON s.id = si."saleId"
        JOIN products p ON p.id = si."productId"
        LEFT JOIN categories c ON c.id = p."categoryId"
        WHERE s.status = 'COMPLETED'
        GROUP BY c.name
        ORDER BY revenue DESC
        LIMIT 5
      `,
    ])

    const totalRevenue = salesStats._sum.totalAmount ?? 0
    const totalCost = salesStats._sum.unitCost ?? 0
    const grossProfit = totalRevenue - totalCost
    const periodExpenses = expenses._sum.amount ?? 0
    const estimatedNetProfit = grossProfit - periodExpenses

    const monthlyRevenue = monthlySales._sum.totalAmount ?? 0
    const monthlyCost = monthlySales._sum.unitCost ?? 0
    const monthlyGrossProfit = monthlyRevenue - monthlyCost
    const monthlyExpenses = monthlyExpensesData._sum.amount ?? 0
    const monthlyNetProfit = monthlyGrossProfit - monthlyExpenses
    const totalInventoryValue = parseFloat(inventoryValuation[0]?.totalValue ?? '0')

    // Low stock count (manual calculation since Prisma doesn't support cross-column comparison)
    const lowStockCount = await prisma.$queryRaw<[{ count: string }]>`
      SELECT COUNT(*)::text as count FROM products 
      WHERE status = 'ACTIVE' AND quantity <= "minStockLevel" AND quantity > 0
    `
    const outOfStockCount = await prisma.product.count({
      where: { status: 'ACTIVE', quantity: 0 },
    })

    const session = await getServerSession(authOptions)
    const isOwner = session?.user?.role === 'OWNER'

    return NextResponse.json(
      apiSuccess({
        period,
        dateRange: { start: start.toISOString(), end: end.toISOString() },
        summary: {
          totalRevenue,
          totalCost: isOwner ? totalCost : 0,
          grossProfit: isOwner ? grossProfit : 0,
          grossMarginPercent: isOwner ? (totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0) : 0,
          totalExpenses: isOwner ? periodExpenses : 0,
          estimatedNetProfit: isOwner ? estimatedNetProfit : 0,
          transactionCount: todaySaleCount,
          averageOrderValue: todaySaleCount > 0 ? totalRevenue / todaySaleCount : 0,
        },
        monthly: isOwner ? {
          revenue: monthlyRevenue,
          expenses: monthlyExpenses,
          grossProfit: monthlyGrossProfit,
          netProfit: monthlyNetProfit,
        } : null,
        inventory: {
          totalProducts,
          totalValue: isOwner ? totalInventoryValue : 0,
          lowStockCount: parseInt(lowStockCount[0]?.count ?? '0'),
          outOfStockCount,
          totalCustomers,
          pendingSyncCount: pendingSync,
        },
        topProducts: topProducts.map(p => ({
          productId: p.productId,
          name: p.productName,
          unitsSold: p._sum.quantity ?? 0,
          revenue: p._sum.totalAmount ?? 0,
        })),
        salesTrend,
        recentSales: recentSales.map(s => ({
          id: s.id,
          saleNumber: s.saleNumber,
          totalAmount: s.totalAmount,
          saleAt: s.saleAt.toISOString(),
          customerName: s.customer?.name ?? 'Walk-in Customer',
          itemCount: s._count.items,
          paymentMethod: s.payments[0]?.method ?? 'CASH',
        })),
        lowStockWatchlist: lowStockWatchlist.map(p => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          quantity: p.quantity,
          minStockLevel: p.minStockLevel,
          sellingPrice: p.sellingPrice,
        })),
        categoryDistribution,
      })
    )
  } catch (err) {
    console.error('GET /api/reports/dashboard error:', err)
    return NextResponse.json(apiError('Internal server error'), { status: 500 })
  }
}
