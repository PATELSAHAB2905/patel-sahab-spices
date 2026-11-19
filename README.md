# PATEL SAHAB SPICES – PRODUCTION & INVENTORY MANAGEMENT SYSTEM

A complete, production-grade, mobile-first Production & Inventory Management Application built for **PATEL SAHAB SPICES**.

> **Note on System Scope**: This application is strictly an **Industrial Production and Inventory Management System**. It manages Godown Raw Material Inward, Multi-Round Processing & Grinding losses, Multi-Pack Retail Packaging, and Finished Stock Sales (with FIFO allocation). It does **NOT** contain pricing, sales rates, billing, or financial ledger accounting.

---

## 🌟 Key Features

### 1. Mobile-First & PWA Enabled
- Optimized for factory employees using Android smartphones, tablets, or desktop terminals.
- Installable Progressive Web App (PWA) with Service Worker and Web Manifest.
- Full offline capability: works seamlessly in godowns with no network coverage. All records are stored immediately in browser IndexedDB and automatically synced to Google Sheets when connection is restored.

### 2. User & Authentication Architecture
- **Shared Factory Login**: Factory devices remain logged in; shift employees select their name from a touch modal before creating entries.
- **Traceability**: Every entry automatically stamps the Employee Name, Inward/Transaction Date, and exact ISO Timestamp.
- **Admin Security**: Secure Admin Panel protected by SHA-256 hashed PIN (Default PIN: `1234`). Admin can manage staff, product prefixes, manage Google Sheets sync, and record traceable reversals.

### 3. Factory Production Modules
- **Module 1 – Raw Material Inward**:
  - Automatically generates permanent, sequential, non-reusable Batch IDs based on product prefix (e.g. `HAL-001`, `HAL-002`, `MIR-001`, `DHA-001`).
  - Records Inward Date, Supplier Name, Invoice/Challan No, Quantity Received (KG), and Remarks.
  - Links all future processing, packaging, and sales to this original batch.
- **Module 2 – Processing / Cleaning / Grinding**:
  - Multi-round processing on the **same original Batch ID** (e.g., Round 1 = 300 KG, Round 2 = 400 KG, Round 3 = 300 KG).
  - Material name locked from original batch.
  - Automatically calculates:
    - $\text{Cleaning Waste} = \text{Gross Raw} - \text{Net Raw}$
    - $\text{Grinding Loss} = \text{Net Raw} - \text{Net Powder}$
    - $\text{Total Loss} = \text{Gross Raw} - \text{Net Powder}$
  - Real-time stock validations prevent over-processing raw material.
- **Module 3 – Packaging**:
  - Converts available powder into retail packets.
  - Available pack sizes: `10 GM`, `24 GM`, `50 GM`, `100 GM`, `200 GM`, `500 GM`.
  - Supports **multiple pack sizes in a single transaction** under one common `Transaction_ID`.
  - Atomically deducts powder stock and increases finished goods packet inventory.
- **Module 4 – Order / Sale (Stock Dispatch)**:
  - **Strictly Stock Tracking**: No sales rates or billing amounts.
  - **Direct KG Input**: Employees enter sold quantity directly in KG.
  - **Whole Packet Validation**: System calculates $\text{Equivalent Packets} = \frac{\text{KG Sold} \times 1000}{\text{Pack Size in GM}}$. Rejects fractional packets with helpful multiples.
  - **Multiple Products in One Order**: Support for adding unlimited products and pack sizes with an `ADD PRODUCT` button. Atomic validation rejects the complete order if any line has insufficient stock.
  - **Sale Methods**:
    - **Method A (Batch-Wise)**: Manual selection of eligible batch.
    - **Method B (Product-Wise FIFO)**: System automatically allocates dispatch from oldest available batches first.

### 4. 14 Comprehensive Factory Reports
1. Raw Material Inward Report
2. Raw Material Remaining Stock
3. Processing History
4. Processing Round Report
5. Powder Production Report
6. Powder Remaining Stock
7. Packaging Production Report
8. Finished Product Stock (Batch & Size-wise)
9. Product-wise Consolidated Stock
10. Batch-wise Stock Report
11. Daily Production Report
12. Daily Sales Report
13. Complete Batch Lifecycle Report (Full End-to-End Traceability)
14. Employee-wise Entry Report
- Filter by Date Range, Product Name, Batch ID, and Employee Name.
- One-click CSV Export for any report.

### 5. Google Sheets Integration & Offline Sync
- **Backend**: Google Apps Script Web App API (`google-apps-script/Code.gs`).
- **4 Google Spreadsheet Tabs**:
  - `RAW_MATERIAL`
  - `PROCESSING`
  - `PACKAGING`
  - `ORDER_SALE`
- Lock service and duplicate prevention ensure high data integrity even with multiple factory devices uploading concurrently.
- Queue-based offline sync triggers when network returns or when tapping **Sync Now**.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- npm or pnpm

### Installation
```bash
git clone <repo-url>
cd "INVENTORY APP"
npm install
```

### Run Locally in Development
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser or mobile device on the local network.

### Build for Production
```bash
npm run build
```
The optimized bundle will be created in the `dist/` directory.

---

## 📱 PWA Installation Guide (Android & Desktop)

### On Android (Chrome):
1. Open the app URL in Chrome.
2. Tap the three dots (menu) at top right.
3. Tap **"Install app"** or **"Add to Home screen"**.
4. The **Patel Spices** icon will appear on your app launcher with full-screen standalone capability.

### On Desktop (Chrome / Edge):
1. Look for the install icon in the address bar.
2. Click **Install Patel Sahab Spices**.

---

## 📑 Google Sheets & Apps Script Setup

Please refer to the detailed step-by-step setup guide in [`google-apps-script/README.md`](google-apps-script/README.md):
1. Create a blank Google Spreadsheet named `PATEL SAHAB SPICES - PRODUCTION & INVENTORY`.
2. Open **Extensions** > **Apps Script**.
3. Paste code from [`google-apps-script/Code.gs`](google-apps-script/Code.gs).
4. Deploy as **Web App** with access set to **Anyone**.
5. Copy the Web App URL and paste it into the app under **Admin Panel** > **Google Sheets Sync**.
6. Click **Test Connection (Ping)**.

---

## 🧪 Testing Results & Verification Scenario

An automated test script verifying the exact master test scenario (Section 19) is included:
```bash
node tests/test_scenario.js
```

### Verified Assertions:
- ✅ KG to Packet Whole-Number Conversion (`10 KG` of 100g = 100 packets; `20 KG` of 500g = 40 packets; fractional `0.15 KG` rejected).
- ✅ Multi-Round Processing on same batch (`HAL-001` with 300kg, 400kg, 300kg rounds = 1000kg processed, 900kg powder produced, 100kg total loss).
- ✅ Multi-Pack Packaging (10g, 24g, 50g, 100g, 200g, 500g powder consumption = 257kg, remaining powder = 643kg).
- ✅ Multi-Product Order Dispatch (Haldi + Mirchi + Dhaniya = 45kg total, finished packets deducted without touching powder balance).
- ✅ FIFO Allocation (consuming oldest batch first before advancing).
- ✅ Reversal / Correction ledger audit trail.

---

## 🛡️ License & Compliance
Proprietary software developed for **PATEL SAHAB SPICES**. All production and inventory calculations adhere to industrial traceability standards.
