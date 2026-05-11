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
  getTransactions,
  updateAsset,
  updatePrice,
  updateTransaction,
  deleteAsset,
  deletePrice,
  deleteTransaction,
  addWallet,
  getWallets,
  updateWallet,
  deleteWallet,
} from './db';
import { calculateACB } from './acb';
import { 
  AcbDataNumber,
  Asset,
  AssetType,
  CCAssetSummaryResponse,
  CCHistoDayResponse,
  FinageAggregatesResponse,
  InsertionType,
  Price,
  Transaction,
  TransactionType,
  Wallet
} from './types';
import Papa from 'papaparse';
import Decimal from 'decimal.js';

// ==============
// Server Config
// ==============
const app = express();
const PORT = 3030;
const DB_PATH = `${__dirname}/db/app_db.sqlite`;

// Serve static files from 'static'
app.use(express.static(path.join(__dirname, 'static')));
app.use(express.json());
app.use(express.text({ type: 'text/csv', limit: '2mb' }));

// ==============
// Api Keys
// ==============
// For fetching historical price data, create a free API key at https://cryptocompare.com or https://data-api.coindesk.com
const COIN_DESK_API_KEY = process.env.COIN_DESK_API_KEY || "";
console.log(`Coin Desk Api Key: ${COIN_DESK_API_KEY}`)
// for fetching historical price data, create a free API key at https://finage.co.uk
const FINAGE_API_KEY = process.env.FINAGE_API_KEY || "";
console.log(`Finage Api Key: ${FINAGE_API_KEY}\n`)

// ==============
// External Apis
// ==============
// https://developers.coindesk.com/documentation/data-api/asset_v1_summary_list
const CC_ASSET_SUMMARY_URL = 'https://data-api.coindesk.com/asset/v1/summary/list';
// https://developers.coindesk.com/documentation/data-api/index_cc_v1_historical_days
const CC_HISTO_DAYS_URL = 'https://data-api.coindesk.com/index/cc/v1/historical/days';
const CC_HISTO_DAYS_LIMIT = 5000;

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
  const { names, symbols, asset_types, search, limit, offset } = req.query;
  res.json(await getAssets({
    names: names?.length ? (names as string).split(',') : [],
    symbols: symbols?.length ? (symbols as string).split(',') : [],
    asset_types: asset_types?.length ? (asset_types as string).split(',') as AssetType[] : [],
    search: search as string | undefined,
    limit: limit !== undefined ? Number(limit) : undefined,
    offset: offset !== undefined ? Number(offset) : undefined
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
async function getAsset(symbol: string): Promise<Asset> {
  const { items } = await getAssets({symbols: [ symbol ]});
  if (!items.length) throw new Error(`No asset found for symbol ${symbol}`);
  return items[0];
}

async function addAssetBySymbolAndType(symbol: string, assetType: AssetType): Promise<Asset> {
  let assetAdded: any;
  try {
    if (!symbol) throw new Error('Symbol is required');
    if (!assetType) throw new Error('AssetType is required');
    if (!(Object.values(AssetType)).includes(assetType)) throw new Error(`Invalid AssetType: ${assetType}`);

    // Check if asset already registered
    const { items: currAsset } = await getAssets({ symbols: [ symbol ] });
    if (currAsset.length) {
      console.log(`Asset already exists for symbol: ${symbol}, skipping addition.`);
      return currAsset[0];
    }

    // Get Asset Summary
    const urlSearchParams = new URLSearchParams();
    urlSearchParams.append('asset_lookup_priority', 'SYMBOL');
    urlSearchParams.append('assets', symbol);
    urlSearchParams.append('assetType', assetType);
    if (COIN_DESK_API_KEY) {
      urlSearchParams.append('api_key', COIN_DESK_API_KEY);
    }
    const response = await (await fetch(`${CC_ASSET_SUMMARY_URL}?${urlSearchParams.toString()}`)).json() as CCAssetSummaryResponse;
    if (response.Err.message) {
      throw new Error(`Invalid API response: ${response.Err.message}`);
    }
    if (!response.Data || !Array.isArray(response.Data.LIST) || response.Data.LIST.length !== 1) {
      throw new Error(`Invalid API response: ${JSON.stringify(response)}`);
    }
    const asset = response.Data.LIST[0];
    if ((assetType === AssetType.FIAT && asset.ASSET_TYPE !== AssetType.FIAT.toUpperCase()) ||
        (assetType === AssetType.BLOCKCHAIN && asset.ASSET_TYPE !== AssetType.BLOCKCHAIN.toUpperCase() && asset.ASSET_TYPE !== 'TOKEN')) {
      throw new Error(`Asset type mismatch: ${assetType.toUpperCase()} !== ${asset.ASSET_TYPE}`);
    }

    // Add asset to DB
    assetAdded = await addAsset({name: asset.NAME, symbol: asset.SYMBOL, asset_type: assetType, launch_date: asset.LAUNCH_DATE*1000, logo_url: asset.LOGO_URL});
    if (!assetAdded || !assetAdded.length) {
      throw new Error(`Failed to insert new ${assetType} asset: ${asset.NAME} (${asset.SYMBOL})`);
    }
    
    // Block chain assets also fetch price history
    if (assetType === AssetType.BLOCKCHAIN) {
      await insertHistoricalPrices(assetAdded[0]);
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
  const { asset_symbol, fiat_symbol, date_from, date_to, limit, offset } = req.query;
  res.json(await getPrices({
    asset_symbol: asset_symbol as string | undefined,
    fiat_symbol: fiat_symbol as string | undefined,
    date_from: date_from ? Number(date_from) : undefined,
    date_to: date_to ? Number(date_to) : undefined,
    limit: limit !== undefined ? Number(limit) : undefined,
    offset: offset !== undefined ? Number(offset) : undefined
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

    const { items: assets } = await getAssets({ symbols: [ symbol ] });
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
async function insertHistoricalPrices(asset: Asset): Promise<Price[]> {
  // Insert historical prices using CoinDesk (CryptoCompare)
  let coinDeskPrices: Price[] | null = null;
  try {
    coinDeskPrices = await insertHistoricalPricesUsingCoinDesk(asset.symbol);
  } catch (err: any) {
    console.error('CoinDesk price fetch error:', err);
    throw err;
  }
  // Try Finage as a fallback (if API key provided)
  // let finagePrices: Price[] | null = null;
  // try {
  //   if (FINAGE_API_KEY && asset.launch_date) {
  //     const startDate = new Date(asset.launch_date);
  //     let endDate = new Date();
  //     if (coinDeskPrices && !(coinDeskPrices instanceof Error)) {
  //       const oldestValidPrice = coinDeskPrices.find(p => p.price > 0);
  //       if (oldestValidPrice && oldestValidPrice.unix_timestamp > asset.launch_date) {
  //         endDate = new Date(oldestValidPrice.unix_timestamp);
  //         endDate.setDate(endDate.getDate() - 1); // Finage end date is inclusive, so subtract 1 day to avoid duplicate price
  //       }
  //     }
  //     finagePrices = await insertHistoricalPricesUsingFinage(asset.symbol, startDate, endDate);
  //   }
  // } catch (err: any) {
  //   console.error('Finage price fetch error:', err);
  // }
  // If not prices were inserted, throw an error
  // if (coinDeskPrices instanceof Error && finagePrices === null || coinDeskPrices instanceof Error && finagePrices instanceof Error) {
  //   throw new Error(`Failed to fetch historical prices for ${asset.symbol}. CoinDesk: ${coinDeskPrices.message}; ${(finagePrices instanceof Error) ? `Finage: ${finagePrices.message}` :''}`);
  // }
  const results: Price[] = [];
  if (coinDeskPrices && !(coinDeskPrices instanceof Error)) results.push(...coinDeskPrices);
  // if (finagePrices && !(finagePrices instanceof Error)) results.push(...finagePrices);
  return results;
}

async function insertHistoricalPricesUsingCoinDesk(symbol: string): Promise<Price[]> {
  console.log("insertHistoricalPricesUsingCoinDesk", symbol);
  try {
    if (!symbol) throw new Error('Symbol is required');
    const { items: fiat } = await getAssets({ asset_types: [ AssetType.FIAT ] });
    if (!fiat.length || !fiat[0].symbol) throw new Error('No fiat currency set. Please set a fiat currency before adding assets.');
    
    // Get Price History
    let keepSearching = false;
    let results: Price[] = [];
    let minTs: number | undefined = undefined;
    do {
      const urlSearchParams = new URLSearchParams();
      urlSearchParams.append('market', 'cadli');
      urlSearchParams.append('instrument', `${symbol.toUpperCase()}-${fiat[0].symbol.toUpperCase()}`);
      urlSearchParams.append('limit', String(CC_HISTO_DAYS_LIMIT));
      urlSearchParams.append('aggregate', '1');
      if (COIN_DESK_API_KEY) {
        urlSearchParams.append('api_key', COIN_DESK_API_KEY);
      }
      if (minTs) {
        urlSearchParams.append('to_ts', String(minTs-24*60*60))
      }
      const pricesUrl = `${CC_HISTO_DAYS_URL}?${urlSearchParams.toString()}`;
      console.log("CoinDesk Prices URL:", pricesUrl);
      const response = await (await fetch(pricesUrl)).json() as CCHistoDayResponse;
      if (response.Err.message) {
        throw new Error(`Invalid API response: ${response.Err.message}`);
      }
      if (!response.Data || !Array.isArray(response.Data)) {
        throw new Error('Invalid API response');
      }

      const prices = response.Data.map((entry) => {
        if (!minTs || entry.TIMESTAMP < minTs) minTs = entry.TIMESTAMP;
        return {
          unix_timestamp: entry.TIMESTAMP * 1000,
          price: entry.HIGH,
          asset_symbol: symbol,
          fiat_symbol: fiat[0].symbol
        };
      });

      if (prices.length === 0) {
        throw new Error('No valid prices to insert');
      }

      const result = await addPrices(prices, InsertionType.UPSERT);
      if (result instanceof Error) {
        throw result;
      }
      results.push(...result);

      keepSearching = response.Data.length === CC_HISTO_DAYS_LIMIT;
    } while (keepSearching)
      
      return results;
  } catch (err: any) {
    throw err;
  }
}

async function insertHistoricalPricesUsingFinage(symbol: string, startDate: Date, endDate: Date): Promise<Price[]> {
  console.log("insertHistoricalPricesUsingFinage", symbol, startDate, endDate);
  try {
    if (!symbol) throw new Error('Symbol is required');
    const { items: fiat } = await getAssets({ asset_types: [ AssetType.FIAT ] });
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

app.post('/api/import-transactions', express.text({ type: 'text/csv', limit: '10mb' }), async (req, res) => {
  try {
    const csv = req.body;
    if (!csv) return res.status(400).json({ error: 'No CSV data received' });
    const parsed = Papa.parse(csv, { skipEmptyLines: true, header: true });
    if (parsed.errors.length) return res.status(400).json({ error: parsed.errors[0].message });

    const emptyToUndef = (v?: string) => (v?.trim() === '' ? undefined : v);
    const rows: any[] = parsed.data;
    const walletNames = new Set<string>();
    const assetSymbols = new Set<string>();
    const transactions = rows.map(row => {
      let unix_timestamp = row.unix_timestamp || row.date || row.timestamp;
      if (unix_timestamp && isNaN(Number(unix_timestamp))) {
        unix_timestamp = Date.parse(unix_timestamp);
      } else {
        unix_timestamp = Number(unix_timestamp);
      }
      const tx = {
        unix_timestamp,
        type: TransactionType[row.type?.toUpperCase() as keyof typeof TransactionType],
        send_asset_symbol: emptyToUndef(row.send_asset_symbol),
        send_asset_quantity: row.send_asset_quantity ? Number(row.send_asset_quantity) : undefined,
        receive_asset_symbol: emptyToUndef(row.receive_asset_symbol),
        receive_asset_quantity: row.receive_asset_quantity ? Number(row.receive_asset_quantity) : undefined,
        fee_asset_symbol: emptyToUndef(row.fee_asset_symbol),
        fee_asset_quantity: row.fee_asset_quantity ? Number(row.fee_asset_quantity) : undefined,
        is_income: row.is_income === true || row.is_income === 'true' || row.is_income === 1 || row.is_income === '1',
        notes: emptyToUndef(row.notes),
        from_wallet_name: emptyToUndef(row.from_wallet_name),
        to_wallet_name: emptyToUndef(row.to_wallet_name)
      };
      if (tx.from_wallet_name) walletNames.add(tx.from_wallet_name);
      if (tx.to_wallet_name) walletNames.add(tx.to_wallet_name);
      if (tx.send_asset_symbol) assetSymbols.add(tx.send_asset_symbol);
      if (tx.receive_asset_symbol) assetSymbols.add(tx.receive_asset_symbol);
      if (tx.fee_asset_symbol) assetSymbols.add(tx.fee_asset_symbol);
      return tx;
    });

    await ensureWalletsExist(Array.from(walletNames));
    await ensureAssetsExist(Array.from(assetSymbols));

    let inserted = 0;
    const skipped: Array<{ row: number; reason: string }> = [];
    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      try {
        await validateTransaction(tx);
      } catch (err: any) {
        console.log(`Skipping invalid transaction row #${i}: ${JSON.stringify(tx)}`);
        skipped.push({ row: i, reason: err?.message || 'validation failed' });
        continue;
      }
      try {
        await addTransaction(tx);
        inserted++;
      } catch (err: any) {
        console.log(`Skipping invalid transaction row #${i}: ${JSON.stringify(tx)}`);
        skipped.push({ row: i, reason: err?.message || 'insert failed' });
      }
    }
    res.json({ success: true, inserted, skipped });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

// Retrieve
app.get('/api/transactions', async (req, res) => {
  const { asset, type, date_from, date_to, wallet_name, limit, offset } = req.query;
  res.json(await getTransactions({
    asset: asset as string | undefined,
    type: type as string | undefined,
    date_from: date_from ? Number(date_from) : undefined,
    date_to: date_to ? Number(date_to) : undefined,
    wallet_name: wallet_name as string | undefined,
    limit: limit !== undefined ? Number(limit) : undefined,
    offset: offset !== undefined ? Number(offset) : undefined
  }));
});

app.get('/api/download-transactions-csv', async (req, res) => {
  const { asset, type, date_from, date_to, wallet_name } = req.query;
  // Pull every matching row (no pagination) so the export reflects the full
  // filtered query, not just the page the user is currently looking at.
  const { items } = await getTransactions({
    asset: asset as string | undefined,
    type: type as string | undefined,
    date_from: date_from ? Number(date_from) : undefined,
    date_to: date_to ? Number(date_to) : undefined,
    wallet_name: wallet_name as string | undefined,
  });

  // Emit the same column set the import endpoint expects, so an export →
  // re-import round-trip preserves the data. The id column is intentionally
  // omitted (auto-assigned on insert).
  const rows = items.map(t => ({
    unix_timestamp: new Date(t.unix_timestamp).toISOString(),
    type: t.type,
    send_asset_symbol: t.send_asset_symbol ?? '',
    send_asset_quantity: t.send_asset_quantity ?? '',
    receive_asset_symbol: t.receive_asset_symbol ?? '',
    receive_asset_quantity: t.receive_asset_quantity ?? '',
    fee_asset_symbol: t.fee_asset_symbol ?? '',
    fee_asset_quantity: t.fee_asset_quantity ?? '',
    is_income: t.is_income ? 'true' : '',
    notes: t.notes ?? '',
    from_wallet_name: t.from_wallet_name ?? '',
    to_wallet_name: t.to_wallet_name ?? '',
  }));
  const csv = Papa.unparse(rows, {
    columns: [
      'unix_timestamp', 'type',
      'send_asset_symbol', 'send_asset_quantity',
      'receive_asset_symbol', 'receive_asset_quantity',
      'fee_asset_symbol', 'fee_asset_quantity',
      'is_income', 'notes',
      'from_wallet_name', 'to_wallet_name',
    ],
  });

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="transactions-${stamp}.csv"`);
  res.send(csv);
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

// Bulk delete
app.delete('/api/transactions/bulk', async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.every(id => Number.isFinite(Number(id)))) {
    return res.status(400).json({ error: 'Request body must include an "ids" array of numeric transaction IDs.' });
  }
  const numericIds = ids.map(Number);
  if (!numericIds.length) return res.json({ deleted: 0 });
  try {
    let deleted = 0;
    for (const id of numericIds) {
      await deleteTransaction(id);
      deleted++;
    }
    res.json({ deleted });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to bulk delete transactions' });
  }
});

// Bulk edit
// Applies a partial update (patch) to all provided transaction IDs. All selected
// transactions must share the same type and cannot have their type changed.
app.patch('/api/transactions/bulk', async (req, res) => {
  const { ids, patch } = req.body;
  if (!Array.isArray(ids) || !ids.every(id => Number.isFinite(Number(id)))) {
    return res.status(400).json({ error: 'Request body must include an "ids" array of numeric transaction IDs.' });
  }
  if (!patch || typeof patch !== 'object') {
    return res.status(400).json({ error: 'Request body must include a "patch" object.' });
  }
  const numericIds = ids.map(Number);
  if (!numericIds.length) return res.json({ updated: 0 });
  if ('type' in patch) {
    return res.status(400).json({ error: 'Bulk edit cannot change transaction type.' });
  }
  try {
    const { items: existing } = await getTransactions({ ids: numericIds });
    if (existing.length !== numericIds.length) {
      return res.status(404).json({ error: 'One or more transactions not found.' });
    }
    const types = new Set(existing.map(t => t.type));
    if (types.size > 1) {
      return res.status(400).json({ error: 'Bulk edit requires all selected transactions to share the same type.' });
    }
    // Validate the merged row (existing + patch) so type-specific rules still apply,
    // but only write the patched keys so we don't re-touch already-valid FK columns.
    for (const tx of existing) {
      await validateTransaction({ ...tx, ...patch });
    }
    let updated = 0;
    for (const tx of existing) {
      await updateTransaction(tx.id, patch);
      updated++;
    }
    res.json({ updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to bulk edit transactions' });
  }
});

// Transaction Helper Functions

async function ensureWalletsExist(names: string[]): Promise<void> {
  if (!names.length) return;
  const { items: existing } = await getWallets({ names });
  const existingSet = new Set(existing.map(w => w.name));
  for (const name of names) {
    if (existingSet.has(name)) continue;
    try {
      await addWallet({ name });
    } catch (err: any) {
      console.log(`Could not create wallet "${name}": ${err?.message || err}`);
    }
  }
}

async function ensureAssetsExist(symbols: string[]): Promise<void> {
  if (!symbols.length) return;
  const { items: existing } = await getAssets({ symbols });
  const existingSet = new Set(existing.map(a => a.symbol));
  for (const symbol of symbols) {
    if (existingSet.has(symbol)) continue;
    try {
      await addAssetBySymbolAndType(symbol, AssetType.BLOCKCHAIN);
    } catch (err: any) {
      console.log(`Could not create asset "${symbol}": ${err?.message || err}`);
    }
  }
}

async function validateTransaction(transaction: Transaction | Omit<Transaction, 'id'>) {
  if (!Object.values(TransactionType).includes(transaction.type)) {
    throw new Error(`Invalid transaction type. Allowed: ${Object.values(TransactionType).join(', ')}`);
  }

  if ([TransactionType.BUY, TransactionType.SELL, TransactionType.TRADE].includes(transaction.type)) {
    if (!transaction.send_asset_symbol || !transaction.send_asset_quantity || !transaction.receive_asset_symbol || !transaction.receive_asset_quantity) {
      throw new Error('Send and Receive asset/symbol and quantity are required for Buy, Sell, or Trade.');
    }
  } else if (transaction.type === TransactionType.SEND) {
    if (!transaction.send_asset_symbol || !transaction.send_asset_quantity || transaction.receive_asset_symbol || transaction.receive_asset_quantity) {
      throw new Error('*Only* send asset/symbol and quantity are required for Send.');
    }
  } else if (transaction.type === TransactionType.RECEIVE) {
    if (transaction.send_asset_symbol || transaction.send_asset_quantity || !transaction.receive_asset_symbol || !transaction.receive_asset_quantity) {
      throw new Error('*Only* receive asset/symbol and quantity are required for Receive.');
    }
  } else if (transaction.type === TransactionType.TRANSFER) {
    if (!transaction.send_asset_symbol || !transaction.send_asset_quantity ||
        !transaction.receive_asset_symbol || !transaction.receive_asset_quantity) {
      throw new Error('Send and Receive asset/symbol and quantity are required for Transfer.');
    }
    if (transaction.send_asset_symbol !== transaction.receive_asset_symbol ||
        transaction.send_asset_quantity !== transaction.receive_asset_quantity) {
      throw new Error('Transfer Send and Receive asset/symbol and quantity must match.');
    }
  }

  if (transaction.fee_asset_symbol && !transaction.fee_asset_quantity || !transaction.fee_asset_symbol && transaction.fee_asset_quantity) {
    throw new Error('Fee asset/symbol and quantity must be provided together.');
  }

  // Wallet validation: dispositions require a from_wallet, acquisitions require a to_wallet, transfers require both
  const dispositionTypes = [TransactionType.SELL, TransactionType.SEND, TransactionType.TRADE];
  const acquisitionTypes = [TransactionType.BUY, TransactionType.RECEIVE];
  if (transaction.type === TransactionType.TRANSFER) {
    if (!transaction.from_wallet_name || !transaction.to_wallet_name) {
      throw new Error('Transfer requires both a From Wallet and a To Wallet.');
    }
    if (transaction.from_wallet_name === transaction.to_wallet_name) {
      throw new Error('Transfer From Wallet and To Wallet must be different.');
    }
  } else if (dispositionTypes.includes(transaction.type)) {
    if (transaction.to_wallet_name) {
      throw new Error(`To Wallet is not allowed for ${transaction.type}.`);
    }
  } else if (acquisitionTypes.includes(transaction.type)) {
    if (transaction.from_wallet_name) {
      throw new Error(`From Wallet is not allowed for ${transaction.type}.`);
    }
  }
  // Existence of referenced assets and wallets is enforced by FK constraints in the DB.
}

// ==============
// ACB API
// ==============
// Retrieve
app.get('/api/acb', async (req, res) => {
  try {
    const { items: assets } = await getAssets();
    const results: Record<string, Record<string, AcbDataNumber>> = {};
    for (const asset of assets) {
      if (asset.asset_type === AssetType.FIAT) continue;
      try {
        results[asset.symbol] = await calculateACB(asset.symbol);
      } catch (err: any) {
        results[asset.symbol] = { error: err.message ?? 'Cannot calculate ACB' }
      }
    }
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==============
// Wallets
// ==============
// Create
app.post('/api/wallet', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Wallet name is required' });
  try {
    res.json(await addWallet({ name }));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create wallet' });
  }
});

// Retrieve
app.get('/api/wallets', async (req, res) => {
  const { names } = req.query;
  res.json(await getWallets({
    names: names?.length ? (names as string).split(',') : []
  }));
});

// Update (rename)
app.put('/api/wallet/:name', async (req, res) => {
  const { name } = req.params;
  const { name: newName } = req.body;
  if (!newName) return res.status(400).json({ error: 'Wallet name is required' });
  try {
    res.json(await updateWallet(name, newName));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update wallet' });
  }
});

// Delete
app.delete('/api/wallet/:name', async (req, res) => {
  try {
    res.json(await deleteWallet(req.params.name));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete wallet' });
  }
});

// Wallet Balances - calculates asset balances for a given wallet based on transactions.
//
// Rules (data-driven, no transaction-type checks):
// - send_asset is debited from from_wallet
// - receive_asset is credited to to_wallet
// - fee_asset is debited from from_wallet
// - Fiat assets are not tracked per wallet and are filtered out of the result.
app.get('/api/wallet/:name/balances', async (req, res) => {
  try {
    const walletName = req.params.name;
    if (!walletName) return res.status(400).json({ error: 'Invalid wallet name' });

    const { items: txs } = await getTransactions({ wallet_name: walletName });

    const { items: fiatAssets } = await getAssets({ asset_types: [AssetType.FIAT] });
    const fiatSymbols = new Set(fiatAssets.map((a: any) => a.symbol));

    const balances: Record<string, Decimal> = {};
    const add = (symbol: string, quantity: number) => {
      balances[symbol] = (balances[symbol] || new Decimal(0)).plus(quantity);
    };

    for (const tx of txs) {
      if (tx.from_wallet_name === walletName) {
        if (tx.send_asset_symbol && tx.send_asset_quantity) {
          add(tx.send_asset_symbol, -tx.send_asset_quantity);
        }
        if (tx.fee_asset_symbol && tx.fee_asset_quantity) {
          add(tx.fee_asset_symbol, -tx.fee_asset_quantity);
        }
      }

      // When from_wallet_name is set and to_wallet_name is null, treat them as the same wallet
      // (covers a Trade that debits and credits the same wallet). Safe in all cases because
      // transactions without a receive asset won't credit anything.
      const effectiveToWalletName = tx.to_wallet_name ?? tx.from_wallet_name;
      if (effectiveToWalletName === walletName && tx.receive_asset_symbol && tx.receive_asset_quantity) {
        add(tx.receive_asset_symbol, tx.receive_asset_quantity);
      }
    }

    const result = Object.entries(balances)
      .filter(([symbol]) => !fiatSymbols.has(symbol))
      .map(([symbol, balance]) => ({ symbol, balance: balance.toNumber() }))
      .sort((a, b) => a.symbol.localeCompare(b.symbol));

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to calculate wallet balances' });
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