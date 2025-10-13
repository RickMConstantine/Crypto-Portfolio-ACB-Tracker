import express from 'express';
import path from 'path';
import {
  initDb,
  addAsset,
  addPrice,
  addPrices,
  addTransaction,
  getAssets,
  getPrices,
  getLatestPrice,
  getTransactions,
  updateAsset,
  updatePrice,
  updateTransaction,
  deleteAsset,
  deleteAllAssets,
  deletePrice,
  deleteTransaction,
} from './db';
import { 
  Asset,
  AssetType,
  FinageAggregatesResponse,
  InsertionType,
  Price,
  Transaction,
  TransactionInput,
  TransactionType
} from './types';
import Papa from 'papaparse';

const app = express();
const PORT = 3000;
const DB_PATH = `${__dirname}/db/app_db.sqlite`;
// For fetching historical price data, create a free API key at https://cryptocompare.com or https://data-api.coindesk.com
const COIN_DESK_API_KEY = "";
// for fetching historical price data, create a free API key at https://finage.co.uk
const FINAGE_API_KEY = "";

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
// Create
app.post('/api/asset', async (req, res) => {
  const { name, symbol, asset_type, launch_date, logo_url } = req.body;
  if (symbol && asset_type && !name && !launch_date && !logo_url) {
    res.json(await addAssetBySymbolAndType(symbol, asset_type));
  } else {
    res.json(await addAsset({ name, symbol, asset_type, launch_date, logo_url }));
  }
});

// Retrieve
app.get('/api/assets', async (req, res) => {
  const { name, symbol, asset_type, logo_url } = req.query;
  res.json(await getAssets({
    name: name as string | undefined,
    symbol: symbol as string | undefined,
    asset_type: asset_type as AssetType | undefined,
  }));
});

// Update
app.put('/api/asset/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const { name, asset_type, launch_date, logo_url } = req.body;
  res.json(await updateAsset(symbol, name, asset_type, launch_date, logo_url));
});

// Delete
app.delete('/api/asset/:symbol', async (req, res) => {
  res.json(await deleteAsset(req.params.symbol))
});

// Assets Helper Functions
async function addAssetBySymbolAndType(symbol: string, assetType: AssetType): Promise<Asset | Error> {
  let assetAdded: any;
  try {
    if (!symbol) throw new Error('Symbol is required');
    if (!assetType) throw new Error('AssetType is required');
    if (!(Object.values(AssetType)).includes(assetType)) throw new Error(`Invalid AssetType: ${assetType}`);

    // Check if asset already registered
    const currAsset = await getAssets({ symbol });
    if (currAsset instanceof Error) throw currAsset;
    if (!!currAsset.length) {
      console.log(`Asset already exists for symbol: ${symbol}, skipping addition.`);
      return currAsset[0];
    }

    // Get Asset Summary
    // https://developers.coindesk.com/documentation/data-api/asset_v1_summary_list
    const urlSearchParams = new URLSearchParams();
    urlSearchParams.append('asset_lookup_priority', 'SYMBOL');
    urlSearchParams.append('assets', symbol);
    urlSearchParams.append('assetType', assetType);
    if (COIN_DESK_API_KEY) {
      urlSearchParams.append('api_key', COIN_DESK_API_KEY);
    }
    const assetUrl = `https://data-api.coindesk.com/asset/v1/summary/list?${urlSearchParams.toString()}`;
    const assetResponse = await fetch(assetUrl);
    const assetJson = await assetResponse.json();
    if (assetJson.Err.message) {
      throw new Error(`Invalid API response: ${assetJson.Err.message}`);
    }
    if (!assetJson.Data || !Array.isArray(assetJson.Data.LIST) || assetJson.Data.LIST.length !== 1) {
      throw new Error(`Invalid API response: ${JSON.stringify(assetJson)}`);
    }

    const asset = assetJson.Data.LIST[0];
    if ((assetType === AssetType.FIAT && asset.ASSET_TYPE !== AssetType.FIAT.toUpperCase()) ||
        (assetType === AssetType.BLOCKCHAIN && asset.ASSET_TYPE !== AssetType.BLOCKCHAIN.toUpperCase() && asset.ASSET_TYPE !== 'TOKEN')) {
      throw new Error(`Asset type mismatch: ${assetType.toUpperCase()} !== ${asset.ASSET_TYPE}`);
    }

    switch (assetType) {
      case AssetType.FIAT:
        // If the user adds a new fiat asset, delete all existing blockchain assets
        // instead of refreshing entire price history
        await deleteAllAssets();
        assetAdded = await addAsset({name: asset.NAME, symbol: asset.SYMBOL, asset_type: assetType, launch_date: asset.LAUNCH_DATE*1000, logo_url: asset.LOGO_URL});
        if (assetAdded instanceof Error) throw assetAdded;
        break;
      case AssetType.BLOCKCHAIN:
        // Populate price data for the new blockchain fiat pair
        assetAdded = await addAsset({name: asset.NAME, symbol: asset.SYMBOL, asset_type: assetType, launch_date: asset.LAUNCH_DATE*1000, logo_url: asset.LOGO_URL});
        if (assetAdded instanceof Error) throw assetAdded;
        if (!assetAdded.length) throw new Error('Failed to add asset');
        await insertHistoricalPrices(assetAdded[0]);
        break;
    }

    if (!assetAdded || !assetAdded.length) {
      throw new Error(`Failed to insert new ${assetType} asset: ${asset.NAME} (${asset.SYMBOL})`);
    }

    return assetAdded[0];
  } catch (err) {
    if (assetAdded && assetAdded.length) {
      deleteAsset(assetAdded[0].symbol);
    }
    throw err;
  }
}

// ==============
// Prices
// ==============
// Create
app.post('/api/price', async (req, res) => {
  const { unix_timestamp, price, asset_symbol, fiat_symbol } = req.body;
  res.json(await addPrice({unix_timestamp, price, asset_symbol, fiat_symbol}));
});

// Retrieve
app.get('/api/prices', async (req, res) => {
  const { asset_symbol, fiat_symbol, date_from, date_to } = req.query;
  res.json(await getPrices({
    asset_symbol: asset_symbol as string | undefined,
    fiat_symbol: fiat_symbol as string | undefined,
    date_from: date_from ? Number(date_from) : undefined,
    date_to: date_to ? Number(date_to) : undefined
  }));
});

// Update
app.put('/api/price', async (req, res) => {
  const { unix_timestamp, asset_symbol, fiat_symbol, price } = req.body;
  res.json(await updatePrice({ unix_timestamp, asset_symbol, fiat_symbol, price }));
});

// Delete
app.delete('/api/price', async (req, res) => {
  const { unix_timestamp, asset_symbol, fiat_symbol } = req.body;
  res.json(await deletePrice({ unix_timestamp, asset_symbol, fiat_symbol }));
});

// Refresh price history for an asset (calls insertHistoricalPrices)
app.post('/api/asset/:symbol/refresh-prices', async (req, res) => {
  try {
    const { symbol } = req.params;
    if (!symbol) return res.status(400).json({ error: 'Missing asset symbol' });

    const assets = await getAssets({ symbol });
    if (assets instanceof Error) return res.status(500).json({ error: assets.message });
    if (!assets.length) return res.status(404).json({ error: 'Asset not found' });

    const asset = assets[0];

    // Optionally allow only blockchain assets to refresh historical prices:
    if (asset.asset_type !== AssetType.BLOCKCHAIN) {
      return res.status(400).json({ error: 'Price history refresh is intended for blockchain assets' });
    }

    // Call helper to insert historical prices (may be async and make external API calls)
    try {
      return res.json(await insertHistoricalPrices(asset));
    } catch (err: any) {
      return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  } catch (err: any) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

// Prices Helper Functions
async function insertHistoricalPrices(asset: Asset): Promise<Price[] | Error> {
  // Insert historical prices using CoinDesk (CryptoCompare)
  let coinDeskPrices: Price[] | Error | null = null;
  try {
    coinDeskPrices = await insertHistoricalPricesUsingCoinDesk(asset.symbol);
  } catch (err: any) {
    console.error('CoinDesk price fetch error:', err);
  }
  // Try Finage as a fallback (if API key provided)
  let finagePrices: Price[] | Error | null = null;
  try {
    if (FINAGE_API_KEY && asset.launch_date) {
      const startDate = new Date(asset.launch_date);
      let endDate = new Date();
      if (coinDeskPrices && !(coinDeskPrices instanceof Error)) {
        const oldestValidPrice = coinDeskPrices.find(p => p.price > 0);
        if (oldestValidPrice && oldestValidPrice.unix_timestamp > asset.launch_date) {
          endDate = new Date(oldestValidPrice.unix_timestamp);
          endDate.setDate(endDate.getDate() - 1); // Finage end date is inclusive, so subtract 1 day to avoid duplicate price
        }
      }
      finagePrices = await insertHistoricalPricesUsingFinage(asset.symbol, startDate, endDate);
    }
  } catch (err: any) {
    console.error('Finage price fetch error:', err);
  }
  // If not prices were inserted, throw an error
  if (coinDeskPrices instanceof Error && finagePrices === null || coinDeskPrices instanceof Error && finagePrices instanceof Error) {
    throw new Error(`Failed to fetch historical prices for ${asset.symbol}. CoinDesk: ${coinDeskPrices.message}; ${(finagePrices instanceof Error) ? `Finage: ${finagePrices.message}` :''}`);
  }
  const results: Price[] = [];
  if (coinDeskPrices && !(coinDeskPrices instanceof Error)) results.push(...coinDeskPrices);
  if (finagePrices && !(finagePrices instanceof Error)) results.push(...finagePrices);
  return results;
}

async function insertHistoricalPricesUsingCoinDesk(symbol: string): Promise<Price[] | Error> {
  console.log("insertHistoricalPricesUsingCoinDesk", symbol);
  try {
    if (!symbol) throw new Error('Symbol is required');
    const fiat = await getAssets({ asset_type: AssetType.FIAT });
    if (fiat instanceof Error) throw fiat;
    if (!fiat.length || !fiat[0].symbol) throw new Error('No fiat currency set. Please set a fiat currency before adding assets.');
    
    // https://developers.coindesk.com/documentation/legacy/Historical/dataHistoday
    const urlSearchParams = new URLSearchParams();
    urlSearchParams.append('fsym', symbol);
    urlSearchParams.append('tsym', fiat[0].symbol);
    urlSearchParams.append('allData', 'true');
    if (COIN_DESK_API_KEY) {
      urlSearchParams.append('api_key', COIN_DESK_API_KEY);
    }
    const pricesUrl = `https://min-api.cryptocompare.com/data/v2/histoday?${urlSearchParams.toString()}`;
    console.log("CoinDesk Prices URL:", pricesUrl);
    const pricesResponse = await fetch(pricesUrl);
    const pricesJson = await pricesResponse.json();
    if (pricesJson.Response !== "Success" || !pricesJson.Data || !Array.isArray(pricesJson.Data.Data)) {
      throw new Error('Invalid API response');
    }

    const prices = pricesJson.Data.Data.map((entry: any) => ({
      unix_timestamp: entry.time * 1000,
      price: entry.close,
      asset_symbol: symbol,
      fiat_symbol: fiat[0].symbol
    }));

    if (prices.length === 0) {
      throw new Error('No valid prices to insert');
    }

    return await addPrices(prices, InsertionType.UPSERT);
  } catch (err) {
    throw err;
  }
}

async function insertHistoricalPricesUsingFinage(symbol: string, startDate: Date, endDate: Date): Promise<Price[] | Error> {
  console.log("insertHistoricalPricesUsingFinage", symbol, startDate, endDate);
  try {
    if (!symbol) throw new Error('Symbol is required');
    const fiat = await getAssets({ asset_type: AssetType.FIAT });
    if (fiat instanceof Error) throw fiat;
    if (!fiat.length || !fiat[0].symbol) throw new Error('No fiat currency set. Please set a fiat currency before adding assets.');
    
    // https://finage.co.uk/docs/api/crypto/crypto-aggregates-api
    let urlSearchParams = new URLSearchParams();
    urlSearchParams.append('limit', '30000');
    urlSearchParams.append('apikey', FINAGE_API_KEY);
    const usdPricesUrl = `https://api.finage.co.uk/agg/crypto/${symbol}USD/1/day/${startDate.toISOString().slice(0, 10)}/${endDate.toISOString().slice(0, 10)}?${urlSearchParams.toString()}`;
    console.log("Finage Crypto->USD Prices URL:", usdPricesUrl);
    const usdPricesResponse = await fetch(usdPricesUrl);
    const usdPricesJson = await usdPricesResponse.json();
    if (!usdPricesJson.results || !Array.isArray(usdPricesJson.results)) {
      throw new Error('Invalid API response');
    }
    const usdPricesArray = usdPricesJson.results as FinageAggregatesResponse[];

    // https://finage.co.uk/docs/api/forex/forex-aggregates
    const fiatPricesUrl = `https://api.finage.co.uk/agg/forex/USD${fiat[0].symbol}/1/day/${startDate.toISOString().slice(0, 10)}/${endDate.toISOString().slice(0, 10)}?${urlSearchParams.toString()}`;
    console.log("Finage USD->Fiat Prices URL:", fiatPricesUrl);
    const fiatPricesResponse = await fetch(fiatPricesUrl);
    const fiatPricesJson = await fiatPricesResponse.json();
    if (!fiatPricesJson.results || !Array.isArray(fiatPricesJson.results)) {
      throw new Error('Invalid API response');
    }
    const fiatPricesArray = fiatPricesJson.results as FinageAggregatesResponse[];
    const fiatPricesMap = fiatPricesArray.reduce((acc: Record<number, FinageAggregatesResponse>, value) => {
      acc[value.t] = value;
      return acc;
    }, {});

    // Helper: find nearest prior fiatPricesMap entry within 1 week (since fiat markets may be closed on weekends/holidays)
    function findNearestFiatEntry(ts: number, map: Record<number, FinageAggregatesResponse>, lookbackHours = 168): FinageAggregatesResponse {
      if (map[ts]) return map[ts];
      for (let h = 1; h <= lookbackHours; h++) {
        const candidate = new Date(ts);
        candidate.setUTCHours(candidate.getUTCHours() - h);
        const candTs = candidate.getTime();
        if (map[candTs]) return map[candTs];
      }
      throw new Error(`No matching fiat price found for timestamp ${ts}`);
    }

    const finalPrices: Price[] = [];
    usdPricesArray.forEach((usdPrice: FinageAggregatesResponse) => {
      try {
        const ts = usdPrice.t;
        const fiatEntry = findNearestFiatEntry(ts, fiatPricesMap);
        finalPrices.push({
          unix_timestamp: usdPrice.t,
          price: usdPrice.c * fiatEntry.c,
          asset_symbol: symbol,
          fiat_symbol: fiat[0].symbol
        });
      } catch (error) {
        console.error('Error processing USD price:', error, '\n', usdPrice);
      }
    });

    if (finalPrices.length === 0) {
      throw new Error('No valid prices to insert');
    }

    return await addPrices(finalPrices, InsertionType.UPSERT);
  } catch (err) {
    throw err;
  }
}

// ==============
// Transactions
// ==============
// Create
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

// Retrieve
app.get('/api/transactions', async (req, res) => {
  const { asset, type, date_from, date_to } = req.query;
  res.json(await getTransactions({
    asset: asset as string | undefined,
    type: type as string | undefined,
    date_from: date_from ? Number(date_from) : undefined,
    date_to: date_to ? Number(date_to) : undefined
  }));
});

// Update
app.put('/api/transaction/:id', async (req, res) => {
  try { 
    await validateTransaction(req.body);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return res.status(400).json({ error: msg });
  }

  res.json(await updateTransaction(Number(req.params.id), req.body));
});

// Delete
app.delete('/api/transaction/:id', async (req, res) => {
  res.json(await deleteTransaction(Number(req.params.id)));
});

// Transaction Helper Functions
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
// Retrieve
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

// ACB Helper Functions
// Helper to check for superficial loss
// Assuming txs are sorted by unix_timestamp ascending
function isSuperficialLoss(tx: Transaction, txs: Transaction[], i: number, asset_symbol: string): boolean {
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
  // Find repurchase within 30 days after disposition
  for (let j = i + 1; j < txs.length; j++) {
    const nextTx = txs[j];
    if (nextTx.unix_timestamp > tx.unix_timestamp + THIRTY_DAYS) break;
    if (
      [TransactionType.BUY, TransactionType.RECEIVE, TransactionType.TRADE].includes(nextTx.type) &&
      nextTx.receive_asset_symbol === asset_symbol &&
      nextTx.receive_asset_quantity &&
      nextTx.unix_timestamp > tx.unix_timestamp &&
      nextTx.unix_timestamp <= tx.unix_timestamp + THIRTY_DAYS
    ) {
      return true;
    }
  }
  // Also check for repurchase within 30 days before disposition
  for (let j = i - 1; j >= 0; j--) {
    const prevTx = txs[j];
    if (prevTx.unix_timestamp < tx.unix_timestamp - THIRTY_DAYS) break;
    if (
      [TransactionType.BUY, TransactionType.RECEIVE, TransactionType.TRADE].includes(prevTx.type) &&
      prevTx.receive_asset_symbol === asset_symbol &&
      prevTx.receive_asset_quantity &&
      prevTx.unix_timestamp < tx.unix_timestamp &&
      prevTx.unix_timestamp >= tx.unix_timestamp - THIRTY_DAYS
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Calculate Adjusted Cost Base (ACB) for a given asset symbol.
 * Returns yearly totals: { [year]: { acb, totalUnits, avgCostPerUnit, ... } }
 */
async function calculateACB(asset_symbol: string): Promise<
  Record<string, {
    acb: number,
    totalUnits: number,
    avgCostPerUnit: number,
    totalProceeds: number,
    totalCosts: number,
    totalOutlays: number,
    totalGainLoss: number,
    superficialLosses: number,
    totalIncome: number,
  }>
> {
  try {
    if (!asset_symbol) throw new Error('Asset symbol is required');

    // Fetch fiat symbol (assume only one fiat asset)
    const fiatAssets = await getAssets({ asset_type: AssetType.FIAT });
    if (fiatAssets instanceof Error) throw fiatAssets;
    if (!fiatAssets.length) throw new Error('No fiat asset set');
    const fiat_symbol = fiatAssets[0].symbol;

    // Fetch all transactions where asset is send, receive, or fee asset, ordered by date
    const txs = await getTransactions({ asset: asset_symbol });
    if (txs instanceof Error) throw txs;

    let acb = 0;
    let totalUnits = 0;
    let totalProceeds = 0;
    let totalCosts = 0;
    let totalOutlays = 0;
    let totalGainLoss = 0;
    let superficialLosses = 0;
    let totalIncome = 0;
    
    // Per-year aggregates
    const yearlyTotals: Record<string, any> = {};

    for (let i = 0; i < txs.length; i++) {
      const tx = txs[i];
      const year = new Date(tx.unix_timestamp).getFullYear().toString();
      if (!yearlyTotals[year]) {
        yearlyTotals[year] = {
          acb,
          totalUnits,
          totalProceeds: 0,
          totalCosts: 0,
          totalOutlays: 0,
          totalGainLoss: 0,
          superficialLosses: 0,
          totalIncome: 0,
        };
      }

      const priceCache: Record<string, Price> = {};
      for (const symbol of [tx.send_asset_symbol, tx.receive_asset_symbol, tx.fee_asset_symbol]) {
        if (!symbol || symbol === fiat_symbol || priceCache[symbol]) continue;
        const assetprice = await getLatestPrice(symbol, fiat_symbol, tx.unix_timestamp);
        if (assetprice instanceof Error) throw assetprice;
        if (!assetprice || !assetprice.price) throw new Error(`No valid price found for asset_symbol ${asset_symbol} and transaction ${tx.id} of type ${tx.type}`);
        priceCache[symbol] = assetprice;
      };

      // --- Sell/Send/Trade: Disposition ---
      if ([TransactionType.SELL, TransactionType.SEND, TransactionType.TRADE].includes(tx.type) && tx.send_asset_symbol === asset_symbol) {
        if (!tx.send_asset_quantity) {
          throw new Error(`No valid send quantity found for transaction ${tx.id} of type ${tx.type}`);
        };
        if ((tx.type === TransactionType.SELL && tx.receive_asset_symbol !== fiat_symbol) ||
            ((tx.type === TransactionType.SELL || tx.type === TransactionType.TRADE) && (!tx.receive_asset_symbol || !tx.receive_asset_quantity))) {
          throw new Error(`No valid receive asset found for transaction ${tx.id} of type ${tx.type}`);
        };
        if (totalUnits === 0) {
          throw new Error(`Cannot sell ${asset_symbol} because no units are available`);
        }
        // Proceeds
        let proceeds = 0;
        if (tx.type === TransactionType.SELL) {
          proceeds = tx.receive_asset_quantity!;
        } else if (tx.type === TransactionType.SEND) {
          proceeds = tx.send_asset_quantity * priceCache[tx.send_asset_symbol].price; // FMV of disposed assets
        } else if (tx.type === TransactionType.TRADE) {
          proceeds = tx.receive_asset_quantity! * priceCache[tx.receive_asset_symbol!].price; // FMV of acquired assets
        }
        // Fees (Outlays) - Only applicable for SELL and SEND. TRADE will add fee back into ACB of the aqcquired asset.
        let fee = 0;
        if (tx.type !== TransactionType.TRADE) {
          if (tx.fee_asset_symbol === fiat_symbol && tx.fee_asset_quantity) {
            fee = tx.fee_asset_quantity;
          } else if (tx.fee_asset_symbol && tx.fee_asset_quantity) {
            fee = tx.fee_asset_quantity * priceCache[tx.fee_asset_symbol].price; // FMV of fee assets
          }
        }
        // Costs + ACB
        const cost = (tx.send_asset_quantity / totalUnits) * acb;
        acb -= cost;
        totalUnits -= tx.send_asset_quantity;
        totalProceeds += proceeds; // 'Realizing' proceeds
        totalCosts += cost; // 'Realizing' costs
        totalOutlays += fee; // 'Realizing' outlays
        yearlyTotals[year].acb -= cost;
        yearlyTotals[year].totalUnits -= tx.send_asset_quantity;
        yearlyTotals[year].totalProceeds += proceeds; // 'Realizing' proceeds
        yearlyTotals[year].totalCosts += cost; // 'Realizing' costs
        yearlyTotals[year].totalOutlays += fee; // 'Realizing' outlays
        // Superficial loss check: if loss, check for repurchase within 30 days before/after
        const gainLoss = proceeds - cost - fee;
        if (gainLoss < 0 && isSuperficialLoss(tx, txs, i, asset_symbol)) {
          superficialLosses += Math.abs(gainLoss);
          acb += Math.abs(gainLoss); // Add back to ACB
          totalCosts -= Math.abs(gainLoss); // Remove from 'Realized' costs
          yearlyTotals[year].superficialLosses += Math.abs(gainLoss);
          yearlyTotals[year].acb += Math.abs(gainLoss); // Add back to ACB
          yearlyTotals[year].totalCosts -= Math.abs(gainLoss); // Remove from 'Realized' costs
        } else {
          totalGainLoss += gainLoss;
          yearlyTotals[year].totalGainLoss += gainLoss;
        }
      }

      // --- Buy/Receive/Trade: Acquisition ---
      if ([TransactionType.BUY, TransactionType.RECEIVE, TransactionType.TRADE].includes(tx.type) && tx.receive_asset_symbol === asset_symbol) {
        if (!tx.receive_asset_quantity) {
          throw new Error(`No valid receive quantity found for transaction ${tx.id} of type ${tx.type}`);
        };
        if ((tx.type === TransactionType.BUY && tx.send_asset_symbol !== fiat_symbol) || 
            (tx.type === TransactionType.BUY || tx.type === TransactionType.TRADE) && (!tx.send_asset_symbol || !tx.send_asset_quantity)) {
          throw new Error(`No valid send asset found for transaction ${tx.id} of type ${tx.type}`);
        };
        // Costs
        let cost = 0;
        if (tx.type === TransactionType.BUY) {
          cost = tx.send_asset_quantity!;
        } else if (tx.type === TransactionType.RECEIVE && tx.is_income) {
          cost = tx.receive_asset_quantity * priceCache[tx.receive_asset_symbol].price; // FMV of aqcuired assets
          totalIncome += cost;
          yearlyTotals[year].totalIncome += cost;
        } else if (tx.type === TransactionType.TRADE) {
          cost = tx.send_asset_quantity! * priceCache[tx.send_asset_symbol!].price; // FMV of disposed assets
        }
        // Fees
        let fee = 0;
        if (tx.fee_asset_symbol === fiat_symbol && tx.fee_asset_quantity) {
          fee = tx.fee_asset_quantity;
        } else if (tx.fee_asset_symbol && tx.fee_asset_quantity) {
          fee = tx.fee_asset_quantity * priceCache[tx.fee_asset_symbol].price; // FMV of fee assets
        }
        // ACB
        acb += cost + fee;
        totalUnits += tx.receive_asset_quantity;
        yearlyTotals[year].acb += cost + fee;
        yearlyTotals[year].totalUnits += tx.receive_asset_quantity;
      }

      // --- Fees paid in the asset (not part of a send/receive): Disposition ---
      if (
        tx.fee_asset_symbol === asset_symbol &&
        tx.fee_asset_quantity &&
        tx.send_asset_symbol !== asset_symbol &&
        tx.receive_asset_symbol !== asset_symbol
      ) {
        // Proceeds
        let proceeds = tx.fee_asset_quantity * priceCache[tx.fee_asset_symbol].price; // FMV of fee assets
        // Costs + ACB
        const cost = (tx.fee_asset_quantity / totalUnits) * acb;
        acb -= cost;
        totalUnits -= tx.fee_asset_quantity;
        totalProceeds += proceeds; // 'Realizing' proceeds
        totalCosts += cost; // 'Realizing' costs
        yearlyTotals[year].acb -= cost;
        yearlyTotals[year].totalUnits -= tx.fee_asset_quantity;
        yearlyTotals[year].totalProceeds += proceeds; // 'Realizing' proceeds
        yearlyTotals[year].totalCosts += cost; // 'Realizing' costs
        const gainLoss = proceeds - cost;
        // Superficial loss check: if loss, check for repurchase within 30 days before/after
        if (gainLoss < 0 && isSuperficialLoss(tx, txs, i, asset_symbol)) {
          superficialLosses += Math.abs(gainLoss);
          acb += Math.abs(gainLoss); // Add back to ACB
          totalCosts -= Math.abs(gainLoss); // Remove from 'Realized' costs
          yearlyTotals[year].superficialLosses += Math.abs(gainLoss); 
          yearlyTotals[year].acb += Math.abs(gainLoss); // Add back to ACB
          yearlyTotals[year].totalCosts -= Math.abs(gainLoss); // Remove from 'Realized' costs
        } else {
          totalGainLoss += gainLoss;
          yearlyTotals[year].totalGainLoss += gainLoss;
        }
      }
    }
    // Final totals
    yearlyTotals['TOTALS'] = {
      acb,
      totalUnits,
      totalProceeds,
      totalCosts,
      totalOutlays,
      totalGainLoss,
      superficialLosses,
      totalIncome,
    };
    return yearlyTotals;
  } catch (err) {
    console.error(err);
    throw err;
  }
}

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