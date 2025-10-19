# Crypto Portfolio & ACB Tracker

## Overview

This application is a full-stack web app for tracking your cryptocurrency asset portfolio, including price history, transactions, Adjusted Cost Base (ACB), and superficial loss (as required by CRA + Canadian Gov't). It allows you to manage assets, record transactions (buy, sell, trade, send, receive), and view historical price data for your holdings.

## Features

- Add and manage fiat currencies and blockchain assets.
- Add or import price history from CoinDesk & Finage apis or manually
- Filter prices by asset, fiat, and date range.
- Record transactions with support for buy, sell, trade, send, and receive types.
- Filter transactions by asset, type, and date range.
- Import transactions from CSV.
- View, edit, and delete assets, transactions, and prices.
- Track asset balances and prices over time.
- View ACB and superficial loss calculations per asset and per year.
- All data is stored locally in a SQLite database.

## Tech Stack

- **Backend:** Node.js, Express, SQLite3, TypeScript
- **Frontend:** HTML, CSS, JavaScript (vanilla)
- **APIs:** CryptoCompare/Coindesk, Finage

## Development Note

This app was developed with the assistance of [GitHub Copilot](https://github.com/features/copilot).

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or newer recommended)
- [npm](https://www.npmjs.com/) (comes with Node.js)
- [Git](https://git-scm.com/) (optional, for cloning)

### Steps

1. **Clone the repository:**
   ```sh
   git clone https://github.com/RickMConstantine/Crypto-Portfolio-ACB-Tracker
   cd Crypto Portfolio Tracker App
   ```

2. **Install dependencies:**
   ```sh
   npm install
   ```

3. **(Optional) Set up your CryptoCompare API key:**
   - Register at [cryptocompare.com](https://cryptocompare.com) for a free API key.
   - Open `src/server.ts` and set the `COIN_DESK_API_KEY` const

   **(Optional) Enable Finage:**
   - Register at https://finage.co.uk and copy your API key.
   - Open `src/server.ts` and set the `FINAGE_API_KEY` const

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
  Enter the asset symbol (e.g., BTC, ETH) and click "Add Asset". The app will fetch asset info and price history. If CoinDesk's historical coverage is insufficient, the Finage integration (if enabled) will supplement historical USD prices and convert them to the configured fiat.

- **Add/Edit/Delete Price:**  
  Click "Add Price" to open a modal for adding a price. Click any row in the prices table to edit or delete a price. You can filter prices by asset, fiat, and date range using the controls above the prices table.

- **Add/Import Transaction:**  
  Click "Add/Import Transaction" to open a modal where you can add a transaction or import from CSV. You can filter transactions by asset, type, and date range using the controls above the transactions table.

## API Endpoints

### Assets
- `GET /api/assets` — List all assets (supports filtering by `name`, `symbol`, `asset_type` as query params)
- `POST /api/asset` — Add asset; will also insert price history when `asset_type = blockchain` and `symbol` provided
- `DELETE /api/asset/:symbol` — Delete asset

### Prices
- `GET /api/prices` — List all prices (supports filtering by `asset_symbol`, `fiat_symbol`, `date_from`, `date_to` as query params)
- `POST /api/price` — Add price
- `PUT /api/price` — Update price (by `unix_timestamp`, `asset_symbol`, `fiat_symbol`)
- `DELETE /api/price` — Delete price (by `unix_timestamp`, `asset_symbol`, `fiat_symbol`)
- `POST /api/asset/:symbol/refresh-prices` - Refresh prices history for the chosen asset from CoinDesk/Finage

### Transactions
- `GET /api/transactions` — List all transactions (supports filtering by `asset`, `type`, `date_from`, `date_to` as query params)
- `POST /api/transaction` — Add transaction
- `PUT /api/transaction/:id` — Update transaction
- `DELETE /api/transaction/:id` — Delete transaction
- `POST /api/import-transactions` — Import transactions from CSV

### Tax + ACB
- `GET /api/acb` — Get proceeds, costs, outlays, ACB, and superficial loss for all assets (yearly and total breakdown)
- `GET /api/transaction-types` — List all transaction types

## Examples Directory

The `examples` directory contains sample SQLite databases for testing and demonstration:

- **acb_example.sqlite** — This database is based on the example from [How to Calculate Adjusted Cost Base (ACB) and Capital Gains](https://www.adjustedcostbase.ca/blog/how-to-calculate-adjusted-cost-base-acb-and-capital-gains/).
- **superficial_loss_example_1.sqlite** — This database is based on Example #1 from [What is the Superficial Loss Rule?](https://www.adjustedcostbase.ca/blog/what-is-the-superficial-loss-rule/).
- **superficial_loss_example_2.sqlite** — This database is based on Example #2 from [What is the Superficial Loss Rule?](https://www.adjustedcostbase.ca/blog/what-is-the-superficial-loss-rule/).

You can use these files to experiment with the app and verify ACB and superficial loss calculations.

## Development

- Source code is in the `src` directory.
- Static frontend files are in the `public` directory.
- Tests are in the `tests` directory (run with `npm test`).

## License

GNU GPLv3

## Author

RickM
