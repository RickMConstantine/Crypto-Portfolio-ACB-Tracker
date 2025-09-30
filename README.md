# Crypto Portfolio & ACB Tracker

## Overview

This application is a full-stack web app for tracking your cryptocurrency asset portfolio, including price history, transactions, Adjusted Cost Base (ACB), and superficial loss (as required by CRA + Canadian Gov't). It allows you to manage assets, record transactions (buy, sell, trade, send, receive), and view historical price data for your holdings.

## Features

- Add and manage fiat currencies and blockchain assets.
- Record transactions with support for buy, sell, trade, send, and receive types.
- Track asset balances and prices over time.
- View and delete assets and transactions.
- All data is stored locally in a SQLite database.

## Tech Stack

- **Backend:** Node.js, Express, SQLite3, TypeScript
- **Frontend:** HTML, CSS, JavaScript (vanilla)
- **APIs:** CryptoCompare (for price history), Coindesk (for asset info)

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
   - Add your API key to the `API_KEY` variable in `src/db.ts`.

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

- **Add Price:**  
  Manually add price data for an asset (if needed).

- **Add Transaction:**  
  Fill out the transaction form, selecting the type (Buy, Sell, Trade, Send, Receive). Required fields will change based on the type.

- **Delete Assets/Transactions:**  
  Hover over a row in the assets or transactions table and click to delete.

## API Endpoints

- `GET /api/assets` — List all assets
- `GET /api/assets/:type` — List assets by type (`blockchain` or `fiat`)
- `POST /api/asset-by-symbol-and-type` — Add asset by symbol and type
- `DELETE /api/asset/:symbol` — Delete asset
- `GET /api/prices` — List all prices
- `POST /api/prices` — Add price
- `GET /api/transactions` — List all transactions
- `POST /api/transaction` — Add transaction
- `DELETE /api/transaction/:id` — Delete transaction

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
