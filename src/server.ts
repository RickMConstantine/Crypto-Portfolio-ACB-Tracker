import express from 'express';
import path from 'path';
import {
  initDb,
  addAsset,
  getAssets,
  addPrice,
  getPrices,
  addTransaction,
  getTransactions,
  addAssetBySymbol,
  deleteAsset,
  deleteTransaction,
  calculateACB,
  updateTransaction
} from './db';
import { AssetType, Transaction, TransactionInput, TransactionType } from './types';
import Papa from 'papaparse';

const app = express();
const PORT = 3000;
const DB_PATH = `${__dirname}/db/app_db.sqlite`;

// Serve static files from 'public'
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());
app.use(express.text({ type: 'text/csv', limit: '2mb' }));

// ==============
// Ping
// ==============
app.get('/api/ping', (req, res) => {
  res.json({ message: 'pong' });
});

// ==============
// Assets
// ==============
app.get('/api/assets', async (req, res) => {
  res.json(await getAssets());
});

app.get('/api/assets/:asset_type', async (req, res) => {
  res.json(await getAssets(req.params.asset_type as AssetType));
});

app.post('/api/asset', async (req, res) => {
  const { name, symbol, asset_type, logo_url } = req.body;
  res.json(await addAsset({name, symbol, asset_type, logo_url}));
});

app.post('/api/asset-by-symbol-and-type', async (req, res) => {
  const { symbol, asset_type } = req.body;
  res.json(await addAssetBySymbol(symbol, asset_type));
});

app.delete('/api/asset/:symbol', async (req, res) => {
  res.json(await deleteAsset(req.params.symbol))
});

// ==============
// Prices
// ==============
app.get('/api/prices', async (req, res) => {
  res.json(await getPrices());
});

app.post('/api/price', async (req, res) => {
  const { unix_timestamp, price, asset_symbol, fiat_symbol } = req.body;
  res.json(await addPrice({unix_timestamp, price, asset_symbol, fiat_symbol}));
});

// ==============
// Transactions
// ==============
app.get('/api/transactions', async (req, res) => {
  const { asset, type, date_from, date_to } = req.query;
  res.json(await getTransactions({
    asset: asset as string | undefined,
    type: type as string | undefined,
    date_from: date_from ? Number(date_from) : undefined,
    date_to: date_to ? Number(date_to) : undefined
  }));
});

app.post('/api/transaction', async (req, res) => {
  // Backend validation for required fields
  try { 
    await validateTransaction(req.body);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return res.status(400).json({ error: msg });
  }

  res.json(await addTransaction(req.body));
});

app.put('/api/transaction/:id', async (req, res) => {
  try { 
    await validateTransaction(req.body);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return res.status(400).json({ error: msg });
  }

  res.json(await updateTransaction(Number(req.params.id), req.body));
});

app.delete('/api/transaction/:id', async (req, res) => {
  res.json(await deleteTransaction(Number(req.params.id)));
});

app.post('/api/import-transactions', express.text({ type: 'text/csv', limit: '2mb' }), async (req, res) => {
  try {
    const csv = req.body;
    if (!csv) return res.status(400).json({ error: 'No CSV data received' });
    const parsed = Papa.parse(csv, { header: true });
    if (parsed.errors.length) return res.status(400).json({ error: parsed.errors[0].message });
    const transactions: any[] = parsed.data;
    // Map and insert transactions
    let inserted = 0;
    for (let i = 0; i < transactions.length; i++) {
      const row = transactions[i];
      let unix_timestamp = row.unix_timestamp || row.date || row.timestamp;
      if (unix_timestamp && isNaN(Number(unix_timestamp))) {
        unix_timestamp = Date.parse(unix_timestamp);
      } else {
        unix_timestamp = Number(unix_timestamp);
      }
      const tx = {
        unix_timestamp,
        type: TransactionType[row.type?.toUpperCase() as keyof typeof TransactionType],
        send_asset_symbol: row.send_asset_symbol,
        send_asset_quantity: row.send_asset_quantity ? Number(row.send_asset_quantity) : undefined,
        receive_asset_symbol: row.receive_asset_symbol,
        receive_asset_quantity: row.receive_asset_quantity ? Number(row.receive_asset_quantity) : undefined,
        fee_asset_symbol: row.fee_asset_symbol,
        fee_asset_quantity: row.fee_asset_quantity ? Number(row.fee_asset_quantity) : undefined,
        is_income: row.is_income === true || row.is_income === 'true' || row.is_income === 1 || row.is_income === '1',
        notes: row.notes || ''
      };
      try { 
        await validateTransaction(tx);
      } catch (error: any) {
        // skip invalid rows
        console.log(`Skipping invalid transaction row #${i}: ${JSON.stringify(row)} - ${error instanceof Error ? error.message : 'Unknown error'}`);
        continue;
      }
      try {
        await addTransaction(tx);
        inserted++;
      } catch (e) {
        // skip invalid rows
        console.log(`Skipping invalid transaction row #${i}: ${JSON.stringify(row)}`);
        continue;
      }
    }
    res.json({ success: true, inserted });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

async function validateTransaction(transaction: Transaction | TransactionInput) {
  if (!Object.values(TransactionType).includes(transaction.type)) {
    throw new Error(`Invalid transaction type. Allowed: ${Object.values(TransactionType).join(', ')}`);
  }

  if ([TransactionType.BUY, TransactionType.SELL, TransactionType.TRADE].includes(transaction.type)) {
    if (!transaction.send_asset_symbol || !transaction.send_asset_quantity || !transaction.receive_asset_symbol || !transaction.receive_asset_quantity) {
      throw new Error('Send and Receive asset/symbol and quantity are required for Buy, Sell, or Trade.');
    }
  } else if (transaction.type === TransactionType.SEND) {
    if (!transaction.send_asset_symbol || !transaction.send_asset_quantity || transaction.receive_asset_symbol || transaction.receive_asset_quantity) {
      throw new Error('Send asset/symbol and quantity are required for Send.');
    }
  } else if (transaction.type === TransactionType.RECEIVE) {
    if (transaction.send_asset_symbol || transaction.send_asset_quantity || !transaction.receive_asset_symbol || !transaction.receive_asset_quantity) {
      throw new Error('Receive asset/symbol and quantity are required for Receive.');
    }
  }

  if (transaction.fee_asset_symbol && !transaction.fee_asset_quantity || !transaction.fee_asset_symbol && transaction.fee_asset_quantity) {
    throw new Error('Fee asset/symbol and quantity must be provided together.');
  }

  const assets = await getAssets();
  if (assets instanceof Error) {
    throw new Error('Failed to fetch assets for validation.');
  }
  const assetSymbols = new Set(assets.map((a: any) => a.symbol));
  if (transaction.send_asset_symbol && !assetSymbols.has(transaction.send_asset_symbol)) {
    throw new Error(`Send asset symbol '${transaction.send_asset_symbol}' does not exist in assets.`);
  }
  if (transaction.receive_asset_symbol && !assetSymbols.has(transaction.receive_asset_symbol)) {
    throw new Error(`Receive asset symbol '${transaction.receive_asset_symbol}' does not exist in assets.`);
  }
  if (transaction.fee_asset_symbol && !assetSymbols.has(transaction.fee_asset_symbol)) {
    throw new Error(`Fee asset symbol '${transaction.fee_asset_symbol}' does not exist in assets.`);
  }
}

// ==============
// ACB API
// ==============
app.get('/api/acb', async (req, res) => {
  try {
    const assets = await getAssets();
    if (assets instanceof Error) return res.status(500).json({ error: assets.message });
    const results: Record<string, any> = {};
    for (const asset of assets) {
      if (asset.asset_type === AssetType.FIAT) continue;
      results[asset.symbol] = await calculateACB(asset.symbol) ;
    }
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==============
// Transaction Types API
// ==============
app.get('/api/transaction-types', (req, res) => {
  res.json(Object.values(TransactionType));
});

// Initialize DB and start server
initDb(DB_PATH).then(
  (db) => {
    // TODO - better way to identify test execution?
    if (!db) {
      console.log('DB not initialized - are you testing?');
      return;
    }
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  },
  (err) => {
    console.log(`Failed to initialize DB -> ${err.message}`);
  }
);

// For testing purposes, export the app
export default app;