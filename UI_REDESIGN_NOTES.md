# iZone by Haider — UI/UX Redesign Documentation

## Overview
The iZone by Haider POS Admin Dashboard has been redesigned and transformed into a modern, retail-focused management interface tailored for mobile phones and electronics accessories.

---

## 1. Design System & Aesthetics
- **Theme**: Luxury Obsidian & Dark Charcoal Base (`#060913`, `#0A0F1D`, `#0F172A`).
- **Accent Palette**:
  - **Electric Blue** (`#3B82F6`): Primary action triggers, barcode scanner badges, and active navigation indicators.
  - **Emerald Green** (`#10B981`): Gross margin %, profitable revenue highlights, online sync status.
  - **Rose / Red** (`#EF4444`, `#F87171`): Critical stock alerts, out-of-stock items, expenses.
  - **Amber / Gold** (`#F59E0B`, `#FBBF24`): Inventory valuation and #1 best-seller badges.
- **Glassmorphism**:
  - Custom classes `.glass-card`, `.glass-card-hover`, `.glass-surface` with `backdrop-filter: blur(14px)` and subtle `rgba(255, 255, 255, 0.08)` borders.
- **Typography**:
  - `Plus Jakarta Sans` for headers and UI copy.
  - `JetBrains Mono` for currency numbers, SKUs, and transaction IDs.

---

## 2. Key Modules & Screens Redesigned

### A. Top Executive Header
- **Branding**: iZone by Haider with `PRO` status chip.
- **Live Pakistan Standard Time**: Real-time updating clock with hydration-safe rendering.
- **Cloud Sync Status**: Status pill with pulsing LED, pending operations counter, and 1-click sync trigger.
- **Quick Search**: Desktop `Ctrl+K` search bar for products, SKUs, and sales.
- **Storefront Link**: Direct link to the public e-commerce store (`http://localhost:3001`).

### B. Retail Technology Hero Showcase
- Features custom 3D flagship retail illustration (`/images/dashboard-hero.jpg`) with ambient neon glowing overlays.
- High-visibility action triggers:
  - **Launch POS Scanner** (Electric blue gradient button with camera barcode badge).
  - **Stock Intake** (Direct supplier restock shortcut).
- Feature highlights: Thermal receipt printing, Dexie IndexedDB offline caching, and IMEI serial tracking.

### C. 6 Executive KPI Cards
1. **Total Sales**: Period-scoped revenue with completed orders count.
2. **Transactions**: Volume with average order value (AOV).
3. **Gross Margin**: Profit in PKR with return-on-sale percentage.
4. **Inventory Value**: Total wholesale stock valuation and active catalog SKU count.
5. **Cloud Sync**: Offline queue status and last sync timestamp.
6. **Stock Health Alert**: Low stock items count and out-of-stock warnings.

### D. 10 Core Shop Action Cards
1. **Scan to Sell** (`/pos?scan=1`)
2. **Add Stock** (`/inventory?action=restock`)
3. **New Product** (`/inventory/new`)
4. **Inventory Catalog** (`/inventory`)
5. **Sales History** (`/sales`)
6. **Expenses** (`/expenses`)
7. **Purchases** (`/purchases`)
8. **Storefront** (`http://localhost:3001`)
9. **Reports** (`/reports`)
10. **Sync Center** (`/sync`)

### E. Visual Analytics & Charts
- **Sales & Profit Trajectory AreaChart (Recharts)**: 7-day dual-fill area chart showing Revenue vs Gross Profit with custom dark tooltip.
- **Category Distribution**: Breakdown for Fast Chargers, Earbuds, Cables, Cases, and Smartwatches with visual progress meters.

### F. Operational Feeds
- **Top 5 Best-Selling Items**: Ranked with Gold, Silver, and Bronze badges, units sold, and revenue.
- **Low Stock Watchlist**: Products with `quantity <= 5`, displaying stock levels and 1-click restock actions.
- **Live Transactions Feed**: Recent 5 sales with invoice ID, customer name, payment method tag, and relative time.

### G. Mobile-First Optimization
- **Floating Mobile Dock** (`.mobile-nav-dock`): Fixed bottom bar with Home, POS, Stock, Sales, and Reports.
- **Touch-Friendly Targets**: Minimum 44px tap targets for mobile usability.
- **Responsive Layout**: Seamless transition from multi-column desktop grid to single-column phone view.

---

## 3. Real Data Integration
- Connects directly to `/api/reports/dashboard` backed by PostgreSQL.
- Casts raw PostgreSQL counts and sums (`COUNT(*)::int`, `SUM::float`) to prevent BigInt serialization issues.
- Hydration-safe state handling for client-side dates and sync state.
