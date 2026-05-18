# Crypto Portfolio & ACB Tracker

## Overview

This application is a full-stack web app for tracking your cryptocurrency asset portfolio, including price history, transactions, wallet management, Adjusted Cost Base (ACB), and superficial loss (as required by CRA + Canadian Gov't). It allows you to manage assets, record transactions (buy, sell, trade, send, receive), track which wallets hold your funds, and view historical price data for your holdings.

## Features

- Add and manage fiat currencies and blockchain assets.
- Add or import price history from CoinDesk APIs or manually.
- Filter prices by asset, fiat, and date range.
- Record transactions with support for buy, sell, trade, send, receive, and transfer types.
- Associate transactions with source (from) and destination (to) wallets.
- Filter transactions by asset, type, and date range.
- Paginate through large prices and transactions tables.
- Import transactions from CSV.
- View, edit, and delete assets, transactions, prices, and wallets.
- Manage wallets with per-wallet asset balance tracking.
- Track asset balances and prices over time.
- View ACB and superficial loss calculations per asset and per year.
- All data is stored locally in a SQLite database.

## Tech Stack

- **Backend:** Node.js, Express, SQLite3, TypeScript
- **Frontend:** HTML, CSS, TypeScript (vanilla)
- **APIs:** CryptoCompare/CoinDesk

## Development Note

This app was developed with the assistance of [GitHub Copilot](https://github.com/features/copilot) and [Kiro](https://kiro.dev).

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) (v20 or newer recommended; `npm start` uses `--env-file-if-exists` which requires Node 20+)
- [npm](https://www.npmjs.com/) (comes with Node.js)
- [Git](https://git-scm.com/) (optional, for cloning)

### Steps

1. **Clone the repository:**
   ```sh
   git clone https://github.com/RickMConstantine/Crypto-Portfolio-ACB-Tracker
   cd Crypto-Portfolio-ACB-Tracker
   ```

2. **Install dependencies:**
   ```sh
   npm install
   ```

3. **(Optional) Set up your CoinDesk API key:**
   - Register at [cryptocompare.com](https://cryptocompare.com) for a free API key.
   - Create a `.env` file in the project root with:
     ```
     COIN_DESK_API_KEY=your_api_key_here
     ```

## Building & Running the Application

1. **Transpile TypeScript to JavaScript:**
   ```sh
   npm run build
   ```
   This will compile the TypeScript source files in `src/` to JavaScript in the `dist/` directory.

2. **Start the server:**
   ```sh
   npm start
   ```
   Or, if you want to run directly:
   ```sh
   node dist/server.js
   ```

3. **Access the app:**
   - Open your browser and go to [http://localhost:3000](http://localhost:3000)

## Usage

- **Set Fiat Currency:**  
  Enter a fiat symbol (e.g., CAD, USD) and click "Set Fiat". This will set the base currency for price tracking.

- **Add Blockchain Asset:**  
  Enter the asset symbol (e.g., BTC, ETH) and click "Add Asset". The app will fetch asset info and price history.

- **Add/Edit/Delete Price:**  
  Click "Add Price" to open a modal for adding a price. Click any row in the prices table to edit or delete a price. You can filter prices by asset, fiat, and date range using the controls above the prices table.

- **Add/Import Transaction:**  
  Click "Add/Import Transaction" to open a modal where you can add a transaction or import from CSV. Wallet dropdowns show based on transaction type: dispositions (Sell, Send, Trade) show a "From Wallet" dropdown, acquisitions (Buy, Receive) show a "To Wallet" dropdown, and Transfer shows both (required). You can filter transactions by asset, type, and date range using the controls above the transactions table.

- **Manage Wallets:**  
  Navigate to the "Wallets" tab to create, edit, or delete wallets. Each wallet row displays an expandable list of asset balances calculated from associated transactions. Balances are computed by summing incoming (to_wallet) and outgoing (from_wallet) transaction quantities.

## API Endpoints

### Assets
- `GET /api/assets` — List all assets (supports filtering by `names`, `symbols`, `asset_types` as query params)
- `POST /api/asset` — Add asset; will also insert price history when `asset_type = blockchain` and `symbol` provided
- `PUT /api/asset/:symbol` — Update asset
- `DELETE /api/asset/:symbol` — Delete asset
- `POST /api/asset/:symbol/refresh-prices` — Refresh price history for the chosen asset from CoinDesk

### Prices
- `GET /api/prices` — List all prices (supports filtering by `asset_symbol`, `fiat_symbol`, `date_from`, `date_to` as query params). Add `limit` (and optional `offset`) to return a paginated `{ items, total }` envelope.
- `POST /api/price` — Add price
- `PUT /api/price` — Update price (by `unix_timestamp`, `asset_symbol`, `fiat_symbol`)
- `DELETE /api/price` — Delete price (by `unix_timestamp`, `asset_symbol`, `fiat_symbol`)

### Transactions
- `GET /api/transactions` — List all transactions (supports filtering by `asset`, `type`, `date_from`, `date_to` as query params). Add `limit` (and optional `offset`) to return a paginated `{ items, total }` envelope.
- `POST /api/transaction` — Add transaction
- `PUT /api/transaction/:id` — Update transaction
- `DELETE /api/transaction/:id` — Delete transaction
- `POST /api/import-transactions` — Import transactions from CSV
- `GET /api/transaction-types` — List all transaction types

### Wallets
- `GET /api/wallets` — List all wallets (supports filtering by `names` as a query param)
- `POST /api/wallet` — Add wallet (requires `name`)
- `PUT /api/wallet/:name` — Rename wallet (cascades the new name to referencing transactions)
- `DELETE /api/wallet/:name` — Delete wallet (clears wallet references from transactions)
- `GET /api/wallet/:name/balances` — Get per-asset balances for a wallet (calculated from transactions)

### Tax + ACB
- `GET /api/acb` — Get proceeds, costs, outlays, ACB, and superficial loss for all assets (yearly and total breakdown)

### Other
- `GET /api/ping` — Health check

## Examples Directory

The `examples` directory contains sample SQLite databases for testing and demonstration:

- **acb_example.sqlite** — Based on the example from [How to Calculate Adjusted Cost Base (ACB) and Capital Gains](https://www.adjustedcostbase.ca/blog/how-to-calculate-adjusted-cost-base-acb-and-capital-gains/).
- **superficial_loss_example_1.sqlite** — Based on Example #1 from [What is the Superficial Loss Rule?](https://www.adjustedcostbase.ca/blog/what-is-the-superficial-loss-rule/).
- **superficial_loss_example_2.sqlite** — Based on Example #2 from [What is the Superficial Loss Rule?](https://www.adjustedcostbase.ca/blog/what-is-the-superficial-loss-rule/).

You can use these files to experiment with the app and verify ACB and superficial loss calculations.

It also contains helper scripts for converting third-party CSV exports into the internal transactions format and POSTing them to `/api/import-transactions`:

- **import_koinly.mjs** — Transforms a Koinly-style report. Run with `node examples/import_koinly.mjs <input.csv> [serverUrl]` (defaults to `http://localhost:3030`).

## Development

- Source code is in the `src/` directory.
- Static frontend files are in `src/static/`.
- Tests are in the `tests/` directory (run with `npm test`).

## License

GNU GPLv3

## Author

RickM
