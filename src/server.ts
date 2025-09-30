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
  getTransactionsByAssetSymbol,
  // calculateAllACBs,
  updateTransaction
} from './db';
import { AssetType, Transaction, TransactionType } from './types';

const app = express();
const PORT = 3000;
const DB_PATH = `${__dirname}/db/app_db.sqlite`;

// Serve static files from 'public'
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());

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
  res.json(await getTransactions());
});

app.post('/api/transaction', async (req, res) => {
  // Backend validation for required fields
  try { 
    validateTransaction(req.body);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return res.status(400).json({ error: msg });
  }

  res.json(await addTransaction(req.body));
});

app.put('/api/transaction/:id', async (req, res) => {
  try { 
    validateTransaction(req.body);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return res.status(400).json({ error: msg });
  }

  res.json(await updateTransaction(Number(req.params.id), req.body));
});

app.delete('/api/transaction/:id', async (req, res) => {
  res.json(await deleteTransaction(Number(req.params.id)));
});

function validateTransaction(transaction: Transaction) {
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
}

// ==============
// ACB API
// ==============
app.get('/api/acb', async (req, res) => {
  // const result = await calculateAllACBs();
  // console.log(result);
  // res.json(result);
  try {
    const assets = await getAssets();
    if (assets instanceof Error) return res.status(500).json({ error: assets.message });
    const results = [];
    for (const asset of assets) {
      if (asset.asset_type === AssetType.FIAT) continue;
      const acbResult = await calculateACB(asset.symbol);
      if (acbResult instanceof Error) {
        results.push({ symbol: asset.symbol, acb: null, error: acbResult.message });
      } else {
        results.push({ 
          symbol: asset.symbol,
          acb: acbResult.acb,
          totalUnits: acbResult.totalUnits,
          avgCostPerUnit: acbResult.avgCostPerUnit,
          totalProceeds: acbResult.totalProceeds,
          totalCosts: acbResult.totalCosts,
          totalOutlays: acbResult.totalOutlays,
          totalGainLoss: acbResult.totalGainLoss,
          superficialLosses: acbResult.superficialLosses,
        });
      }
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