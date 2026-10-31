# iZone by Haider — Phase 4: Reliable Offline POS & Automatic Synchronization

## Architecture Overview

iZone by Haider employs an **Offline-First Architecture** designed specifically for high-reliability mobile phone and retail operations. The system functions autonomously during complete internet outages, network fluctuations, or server downtime, guaranteeing zero lost sales, zero duplicate billing, and conflict-aware reconciliation.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            iZone POS Client Browser                        │
│                                                                             │
│  ┌───────────────────────┐   ┌──────────────────────┐   ┌─────────────────┐ │
│  │   Camera Barcode      │   │     Offline POS      │   │   Sync Center   │ │
│  │   Scanner (ZXing)     │   │   Terminal Checkout  │   │   Queue & Admin │ │
│  └───────────┬───────────┘   └──────────┬───────────┘   └────────┬────────┘ │
│              │                          │                        │          │
│              ▼                          ▼                        ▼          │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                  useSyncManager & Offline Engine                       │ │
│  │  - Online/Offline Event Listeners  - Exponential Backoff Auto-Retry   │ │
│  │  - Visibility Lifecycle Trigger    - 15s Request Timeout Control       │ │
│  │  - 30s Periodic Heartbeat Sync     - Conflict Detection & Badge State │ │
│  └──────────────────────────────────┬─────────────────────────────────────┘ │
│                                     │                                       │
│                                     ▼                                       │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                  Dexie.js IndexedDB Engine (v2)                        │ │
│  │  • products            • variants             • barcodes (O(1))        │ │
│  │  • stockSnapshots      • sales (local status) • receipts (LOCAL-*)     │ │
│  │  • inventoryMovements  • syncQueue            • settings & timestamps  │ │
│  └──────────────────────────────────┬─────────────────────────────────────┘ │
└─────────────────────────────────────┼───────────────────────────────────────┘
                                      │ HTTP / HTTPS (Auth Session)
                                      │ POST /api/sync
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Cloud PostgreSQL Server                          │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                     POST /api/sync Engine                              │ │
│  │  - Session Authentication & Shop Scope Isolation                      │ │
│  │  - Idempotency via offlineOpId                                         │ │
│  │  - Non-Overwriting Delta Stock Decrements                              │ │
│  │  - Central Stock Conflict Flagging (Preserves Sale & Customer Payment)│ │
│  │  - AuditLog Recording (STOCK_CONFLICT_FLAGGED)                         │ │
│  │  - Server Invoice Association (INV-2026-XXXXX)                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                     │                                       │
│                                     ▼                                       │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                  Authoritative PostgreSQL Tables                       │ │
│  │  • products       • product_variants    • sales & sale_items           │ │
│  │  • invoices       • inventory_movements • sync_operations • audit_logs │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. IndexedDB Schema (Dexie Version 2)

The client database is named `iZoneDB` and managed via `IZoneDatabase` in [`apps/pos/src/lib/db.ts`](file:///d:/alihaider/izone/apps/pos/src/lib/db.ts):

| Store Name | Primary Key & Indexes | Purpose & Structure |
|---|---|---|
| `products` | `id, sku, *barcodes, categoryId, updatedAt` | Cached product catalog with nested variants and image URLs. |
| `categories` | `id, slug` | Local category taxonomy for catalog filter navigation. |
| `barcodes` | `barcode, productId, variantId, sku` | Flattened O(1) direct barcode lookup for instantaneous scanner resolution. |
| `stockSnapshots` | `id, productId, variantId, updatedAt` | Projected quantity and server quantity tracking. |
| `sales` | `id, syncStatus, saleAt` | Full local sale records; `syncStatus: 'LOCAL' \| 'SYNCING' \| 'SYNCED' \| 'FAILED' \| 'CONFLICT'`. |
| `receipts` | `id, saleId, receiptNumber, createdAt, syncStatus` | Customer receipts with temporary (`LOCAL-YYYY-XXXXX`) or confirmed invoice numbers. |
| `inventoryMovements`| `id, productId, variantId, type, referenceId, createdAt` | Local inventory movement ledger ensuring every offline deduction is auditable. |
| `syncQueue` | `id, status, type, createdAt` | FIFO persistent operations queue for automatic synchronization. |
| `settings` | `key` | Metadata: `initialSyncCompleted`, `lastProductSyncAt`, `offlineProductCount`. |

---

## 2. Queue Lifecycle & Synchronization Protocol

### A. Initial Data Hydration
1. Cashier logs into the POS application online.
2. The POS queries `GET /api/products?limit=100` and `GET /api/categories`.
3. `downloadAndStoreProducts()` flattens standalone and variant barcodes into the `barcodes` table and seeds `stockSnapshots`.
4. Only after hydration completes is `initialSyncCompleted: true` set and the indicator displays **"Offline Ready"**.

### B. Offline Checkout Flow
1. Cashier scans barcodes or selects items; prices and stock are validated against local Dexie tables.
2. A unique client operation ID (`offlineOpId` UUIDv4) is generated.
3. The checkout transaction executes atomically in Dexie:
   - Decrements local projected product stock.
   - Updates variant quantities and stock snapshot rows.
   - Creates an `inventoryMovements` row (`type: 'SALE'`, `quantity: -qty`, `synced: false`).
   - Generates a temporary local receipt number (`LOCAL-2026-XXXXX`).
   - Inserts the transaction into `syncQueue` with `status: 'PENDING'`.
4. The receipt modal pops up with watermark banner: **"OFFLINE SALE — PENDING SYNC"**. Cashier can print thermal or digital receipts immediately.

### C. Automatic Synchronization Protocol
Sync automatically triggers on:
- Window `online` event (reconnection).
- Document `visibilitychange` (app returning to foreground).
- Application launch.
- Periodic 30-second interval timer.
- Manual trigger in the **Sync Center** (`/sync`).

Protocol steps:
1. `useSyncManager` queries pending queue items sorted by `createdAt`.
2. Assembles batch payload and posts to `POST /api/sync` with a **15-second AbortController timeout**.
3. **Idempotency Verification**: Server inspects `offlineOpId`. If already recorded, returns the authoritative invoice immediately without duplicate deduction.
4. **Server Confirmation**:
   - `status: 'SYNCED'`: Server creates `Sale`, `SaleItem`, `Invoice`, and `InventoryMovement` rows in PostgreSQL.
   - Client updates local receipt with official invoice number (`INV-2026-XXXXX`), transitions `syncStatus: 'SYNCED'`, and removes from pending queue.
5. **Backoff**: If network drops mid-flight or server times out, items remain in `PENDING` state and retry with exponential backoff without data loss.

---

## 3. Stock Conflict Management

### Principle: Sales are Sacred
When disconnected mobile devices sell items concurrently and total offline sales exceed available central warehouse stock:
1. **Never Silently Discard Sales**: A customer paid real money and walked out of the store with the product. Discarding the transaction creates financial discrepancies.
2. **Never Blindly Overwrite Central Stock**: Do not overwrite central count with local snapshot. Decrement transactionally using Prisma `{ decrement: quantity }`.
3. **Detect Central Stock Depletion**: If central stock is insufficient:
   - Apply the sale and deduct central stock (which may drop below zero to reflect physical reality).
   - Flag the operation as `status: 'CONFLICT'`.
   - Record an authoritative `AuditLog` entry: `action: 'STOCK_CONFLICT_FLAGGED'`.
   - Display a high-visibility alert in the **Sync Center** (`/sync`) displaying the exact conflict reason, oversold quantity, and affected product/variant.
   - Provide the owner with reconciliation actions: record incoming stock delivery, adjust inventory, or inspect physical counts.

---

## 4. Mobile Offline Experience & Sync Center

A dedicated **Sync Center** is available at [`/sync`](file:///d:/alihaider/izone/apps/pos/src/app/sync/page.tsx):
- **Live Terminal KPIs**:
  - Connection state (Online / Offline).
  - Sync status (Synced, Pending, Conflicts).
  - IndexedDB storage quota utilization.
- **Controls**:
  - **Sync Now**: Forces immediate queue processing.
  - **Retry Failed**: Re-enqueues failed operations.
  - **Re-download Catalog**: Performs clean hydration from cloud.
  - **Export JSON Backup**: Immediate disaster recovery export of all local Dexie tables to a downloadable JSON file.
- **Conflict Inspector Modal**: View detailed conflict explanations and resolve oversell flags.
- **Header Badge Indicator**: Dynamic indicator across all POS views showing real-time states:
  - `Online` (Emerald)
  - `Offline Ready` (Sky blue)
  - `3 Pending` (Pulsing blue)
  - `Syncing...` (Primary pulse)
  - `1 Conflict` (Pulsing amber warning)

---

## 5. Integration Test Results (26 / 26 PASSED)

The automated integration test suite is located at [`apps/pos/src/test-offline-sync.ts`](file:///d:/alihaider/izone/apps/pos/src/test-offline-sync.ts) and executes against the running PostgreSQL database and mock IndexedDB environment (`fake-indexeddb`):

```bash
npm run test:offline-sync --workspace=@izone/pos
```

### Verified Test Scenarios

| Test # | Scenario | Result | Details |
|---|---|---|---|
| **0** | Owner Authentication Session | ✅ PASS | Acquired owner cookie via NextAuth credentials |
| **1** | Initial Online Product Catalog Download | ✅ PASS | 13 products, 22 indexed barcodes, 23 snapshots hydrated |
| **2** | Offline Catalog Search Without Network | ✅ PASS | Filtered queries matched in local Dexie DB in <2ms |
| **3** | Offline Standalone Barcode Lookup | ✅ PASS | Barcode `8806095288406` resolved Samsung S24 Clear Cover |
| **3** | Offline Variant Barcode Lookup | ✅ PASS | Barcode `8806095262239` resolved S24 Ultra 512GB Gray variant |
| **4** | Offline Cart Management & Price Calculation | ✅ PASS | Item & order discounts calculated accurately (₨2848) |
| **5** | Offline Checkout with Atomic Persistence | ✅ PASS | Generated local receipt `LOCAL-2026-XXXXX` |
| **6** | Local Stock Deduction & Balance Verification | ✅ PASS | Standalone product local quantity decremented from 26 to 24 |
| **6** | Local Inventory Movement Recording | ✅ PASS | Generated `type: 'SALE'` movement with reference to offline sale |
| **7** | IndexedDB Persistence After Simulated Restart | ✅ PASS | Reopened database retained sales, receipts, and queue items |
| **8** | Multiple Offline Sales Queued | ✅ PASS | 3 sequential offline sales queued in syncQueue |
| **9** | Network Reconnection & Payload Assembly | ✅ PASS | Assembled FIFO batch payload for cloud sync |
| **10** | Server Sync Batch Execution (POST /api/sync) | ✅ PASS | Batch processed, PostgreSQL sales & movements created |
| **10** | Local Confirmation & Invoice Association | ✅ PASS | Linked temporary receipt `LOCAL-*` to server `INV-2026-00017` |
| **11** | Idempotent Sync Retry | ✅ PASS | Duplicate operation detected; returned same invoice |
| **11** | No Duplicate Records in PostgreSQL | ✅ PASS | Verified exactly 1 sale row exists for `offlineOpId` |
| **12** | Network Interruption / Abort Safety | ✅ PASS | Aborted request left queue items in `PENDING` state safely |
| **13** | Server Validation Error Handling | ✅ PASS | Malformed payload marked `FAILED` with error message |
| **14** | Multi-Device Stock Conflict Handling | ✅ PASS | Oversell flagged `CONFLICT`, sale preserved, AuditLog created |
| **15** | Website Storefront Stock Consistency | ✅ PASS | Storefront central database reflects accurate decremented stock |
| **16** | Local Receipt Retrieval | ✅ PASS | Retrieved local receipt record with confirmed invoice association |
| **17** | Session Expiration Handling | ✅ PASS | Expired NextAuth token rejected with HTTP 401 |
| **18** | Disaster Recovery JSON Backup Export | ✅ PASS | Exported complete database snapshot to valid JSON |
| **19** | Safe Schema Migration with Pending Sales | ✅ PASS | Pending queue items preserved across schema upgrades |
| **20** | Unauthorized Sync Rejection | ✅ PASS | Unauthenticated call to `POST /api/sync` rejected with 401 |

---

## 6. Known Limitations & Device-Specific Verification

1. **Camera Scanner Hardware**:
   - The HTML5 camera scanner (`@zxing/browser`) was validated in browser environments with video media stream emulation.
   - Physical phone camera tests depend on user hardware, rear autofocus, and camera permissions over secure origin (`https://` or `localhost`).
2. **Designated Primary Device**:
   - Optimized for a designated primary offline checkout terminal per shop location.
   - Central stock reconciliation flags conflicts for manual owner review when two devices sell overlapping inventory while disconnected.
3. **Storage Quotas**:
   - Browser IndexedDB storage is subject to device storage constraints (typically up to 60% of free disk space in modern Chrome/Safari). The disaster recovery export in Sync Center mitigates browser eviction risks.
