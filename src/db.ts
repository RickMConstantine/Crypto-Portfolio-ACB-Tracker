import { Database } from 'sqlite3';
import { mkdir, unlink } from 'fs';
import { dirname } from 'path';
import { AssetType, Asset, Price, Transaction, TransactionType } from './types';

// For fetching historical price data, create a free API key at https://cryptocompare.com
const API_KEY = "";

//=======================
// Database Init
//=======================
let db: Database | undefined;

export async function initDb(path: string): Promise<Database | Error> {
  return new Promise<Database | Error>((resolve, reject) => {
    mkdir(dirname(path), { recursive: true }, (err) => {
      if (err) {
        return reject(err);
      }
      db = new Database(path, (err) => {
        if (err) {
          return reject(err);
        }
        console.log('Connected to the SQLite database.');
      });
      db.exec(
        `
          CREATE TABLE IF NOT EXISTS assets (
            symbol TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            asset_type TEXT NOT NULL,
            logo_url TEXT
          );
          CREATE TABLE IF NOT EXISTS prices (
            unix_timestamp INTEGER NOT NULL,
            price REAL NOT NULL,
            asset_symbol TEXT NOT NULL,
            fiat_symbol TEXT NOT NULL,
            FOREIGN KEY(asset_symbol) REFERENCES assets(symbol),
            FOREIGN KEY(fiat_symbol) REFERENCES assets(symbol),
            PRIMARY KEY (unix_timestamp, asset_symbol, fiat_symbol)
          );
          CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            unix_timestamp INTEGER NOT NULL,
            type TEXT NOT NULL,
            send_asset_symbol TEXT,
            send_asset_quantity REAL,
            receive_asset_symbol TEXT,
            receive_asset_quantity REAL,
            fee_asset_symbol TEXT,
            fee_asset_quantity REAL,
            is_income BOOLEAN,
            notes TEXT,
            FOREIGN KEY(send_asset_symbol) REFERENCES assets(symbol),
            FOREIGN KEY(receive_asset_symbol) REFERENCES assets(symbol),
            FOREIGN KEY(fee_asset_symbol) REFERENCES assets(symbol)
          );
        `,
        (err) => {
          if (err) {
            return reject(err);
          }
          if (!db) {
            return reject(new Error('DB not initialized'));
          }
          console.log('Successfully initialized tables.');
          resolve(db);
        }
      );
    });
  });
}

export async function destroyDb(path: string): Promise<void | Error> {
  return new Promise<void | Error>((resolve, reject) => {
    if (!db) return reject(new Error('DB not initialized'));
    db.close((err) => {
      if (err) {
          return reject(err);
      }
      console.log('Database connection closed.');
      unlink(path, (err) => {
        if (err) {
          return reject(err);
        }
        console.log('File deleted successfully!');
        resolve();
      });
    });
  });
}

//=======================
// Assets
//=======================
export async function addAssetBySymbol(symbol: string, assetType: AssetType): Promise<Asset | Error> {
  let assetAdded: any;
  try {
    if (!db) throw new Error('DB not initialized');
    if (!symbol) throw new Error('Symbol is required');
    if (!assetType) throw new Error('AssetType is required');
    if (!(Object.values(AssetType)).includes(assetType)) throw new Error(`Invalid AssetType: ${assetType}`);

    // Check if asset already registered
    const currAsset = await getAssetBySymbol(symbol);
    if (currAsset instanceof Error) throw currAsset;
    if (!!currAsset) {
      console.log(`Asset already exists for symbol: ${symbol}, skipping addition.`);
      return currAsset;
    }

    // Get Asset Summary
    // https://developers.coindesk.com/documentation/data-api/asset_v1_summary_list
    const assetUrl = `https://data-api.coindesk.com/asset/v1/summary/list?asset_lookup_priority=SYMBOL&assets=${symbol}&assetType=${assetType}` + (API_KEY ? `&api_key=${API_KEY}` : "");
    const assetResponse = await fetch(assetUrl);
    const assetJson = await assetResponse.json();
    if (assetJson.Err.message) {
      throw new Error(`Invalid API response: ${assetJson.Err.message}`);
    }
    if (!assetJson.Data || !Array.isArray(assetJson.Data.LIST) || assetJson.Data.LIST.length !== 1) {
      throw new Error(`Invalid API response: ${JSON.stringify(assetJson)}`);
    }

    const asset = assetJson.Data.LIST[0];
    if (assetType.toLocaleUpperCase() !== asset.ASSET_TYPE) {
      throw new Error(`Asset type mismatch: ${assetType.toLocaleUpperCase()} !== ${asset.ASSET_TYPE}`);
    }
    
    switch (assetType) {
      case AssetType.FIAT:
        // If the user adds a new fiat asset, delete all existing blockchain assets
        // instead of refreshing entire price history
        await deleteAllAssets();
        assetAdded = await addAsset({name: asset.NAME, symbol: asset.SYMBOL, asset_type: assetType, logo_url: asset.LOGO_URL});
        break;
      case AssetType.BLOCKCHAIN:
        // Populate price data for the new blockchain fiat pair
        assetAdded = await addAsset({name: asset.NAME, symbol: asset.SYMBOL, asset_type: assetType, logo_url: asset.LOGO_URL});
        await insertHistoricalPrices(assetAdded[0].symbol);
        break;
    }

    if (!assetAdded || !assetAdded.length) {
      throw new Error(`Failed to insert new ${assetType} asset: ${asset.NAME} (${asset.SYMBOL})`);
    }
    console.log(`Inserted new ${assetAdded[0].asset_type} asset: ${assetAdded[0].name} (${assetAdded[0].symbol}).`);

    return assetAdded[0];
  } catch (err) {
    if (assetAdded && assetAdded.length) {
      deleteAsset(assetAdded[0].symbol);
    }
    throw err;
  }
}

export async function addAsset({name, symbol, asset_type, logo_url}: Asset): Promise<Asset[] | Error> {
  return new Promise<any[] | Error>((resolve, reject) => {
    if (!db) return reject(new Error('DB not initialized'));
    db.serialize(() => {
      if (!db) return reject(new Error('DB not initialized'));
      if (asset_type === AssetType.FIAT) {
        // Remove any existing fiat asset before inserting
        db.all('DELETE FROM assets WHERE asset_type = ? RETURNING *', [AssetType.FIAT], (err, rows) => {
          if (err) return reject(err);
          if (!rows.length) return;
          console.log(`Deleted fiat asset: ${(rows[0] as any).name} (${(rows[0] as any).symbol})`);
        });
      }
      db.all(
        'INSERT INTO assets (symbol, name, asset_type, logo_url) VALUES (?, ?, ?, ?) RETURNING *',
        [symbol, name, asset_type, logo_url ?? null],
        (err, rows) => {
          if (err) return reject(err);
          if (!rows.length) return;
          console.log(`Inserted new ${asset_type} asset: ${(rows[0] as any).name} (${(rows[0] as any).symbol})`);
          resolve(rows);
        }
      );
    });
  });
}

export async function addAssets(assets: Asset[]): Promise<Asset[] | Error> {
  return new Promise<any[] | Error>((resolve, reject) => {
    if (!db) return reject(new Error('DB not initialized'));
    if (!assets.length) return reject(new Error('No assets to add'));

    const placeholders = assets.map(() => '(?, ?, ?, ?)').join(', ');
    const values = assets.flatMap(a => [a.symbol, a.name, a.asset_type, a.logo_url ?? null]);
    const sql = `INSERT INTO assets (symbol, name, asset_type, logo_url) VALUES ${placeholders} RETURNING *`;

    db.all(sql, values, (err, rows) => {
      if (err) return reject(err);
      console.log(`Inserted ${assets.length} assets.`);
      resolve(rows);
    });
  });
}

async function getAssetBySymbol(symbol: string): Promise<Asset | Error> {
  return new Promise<any | Error>((resolve, reject) => {
    if (!db) return reject(new Error('DB not initialized'));
    db.get(
      `SELECT * FROM assets WHERE UPPER(symbol) = UPPER(?)`,
      [symbol],
      (err, row) => {
        if (err) return reject(err);
        resolve(row);
      }
    );
  });
}

export async function getAssets(asset_type?: AssetType): Promise<Asset[] | Error> {
  return new Promise<any[] | Error>((resolve, reject) => {
    if (!db) return reject(new Error('DB not initialized'));
    if (asset_type) {
      db.all('SELECT * FROM assets WHERE asset_type = ?', [asset_type], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    } else {
      db.all('SELECT * FROM assets', (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    }
  });
}

export async function deleteAsset(symbol: string): Promise<Asset[] | Error> {
  return new Promise<any[] | Error>((resolve, reject) => {
    if (!db) return reject(new Error('DB not initialized'));
    db.serialize(() => {
      if (!db) return reject(new Error('DB not initialized'));
      db.all('DELETE FROM prices WHERE asset_symbol = ? RETURNING *', [symbol], (err, rows) => {
        if (err) return reject(err);
        console.log(`Deleted ${rows.length} price entries for asset: ${symbol}`);
      });
      db.all('DELETE FROM assets WHERE symbol = ? RETURNING *', [symbol], (err, rows) => {
        if (err) return reject(err);
        if (!rows.length) return reject(new Error(`Failed to delete asset with symbol: ${symbol}`));
        console.log(`Deleted asset: ${symbol}`);
        resolve(rows);
      });
    });
  });
}

export async function deleteAllAssets(): Promise<Asset[] | Error> {
  return new Promise<any[] | Error>((resolve, reject) => {
    if (!db) return reject(new Error('DB not initialized'));
    db.serialize(() => {
      if (!db) return reject(new Error('DB not initialized'));
      db.all('DELETE FROM prices RETURNING *', (err, rows) => {
        if (err) return reject(err);
        console.log(`Deleted ${rows.length} price entries`);
      });
      db.all('DELETE FROM assets RETURNING *', (err, rows) => {
        if (err) return reject(err);
        console.log(`Deleted ${rows.length} assets`);
        resolve(rows);
      });
    });
  });
}

//=======================
// Prices
//=======================
export async function addPrice({unix_timestamp, price, asset_symbol, fiat_symbol}: Price): Promise<Price[] | Error> {
  return new Promise<any[] | Error>((resolve, reject) => {
    if (!db) return reject(new Error('DB not initialized'));
    db.all(
      'INSERT INTO prices (unix_timestamp, price, asset_symbol, fiat_symbol) VALUES (?, ?, ?, ?) RETURNING *',
      [unix_timestamp, price, asset_symbol, fiat_symbol],
      (err, rows) => {
        if (err) return reject(err);
        if (!rows.length) return reject(new Error('Failed to insert price'));
        console.log(`Inserted price for asset: ${asset_symbol} and fiat: ${fiat_symbol}`);
        resolve(rows);
      }
    );
  });
}

export async function addPrices(prices: Price[]): Promise<Price[] | Error> {
  return new Promise<any[] | Error>((resolve, reject) => {
    if (!db) return reject(new Error('DB not initialized'));
    if (!prices.length) return reject(new Error('No prices to add'));

    const placeholders = prices.map(() => '(?, ?, ?, ?)').join(', ');
    const values = prices.flatMap(p => [
      p.unix_timestamp,
      p.price,
      p.asset_symbol,
      p.fiat_symbol
    ]);
    const sql = `INSERT INTO prices (unix_timestamp, price, asset_symbol, fiat_symbol) VALUES ${placeholders} RETURNING *`;

    db.all(sql, values, (err, rows) => {
      if (err) return reject(err);
      if (!rows.length) return reject(new Error('Failed to insert prices'));
      console.log(`Inserted ${rows.length} prices for asset: ${(rows[0] as any).asset_symbol} and fiat: ${(rows[0] as any).fiat_symbol}`);
      resolve(rows);
    });
  });
}

export async function getPrices(): Promise<Price[] | Error> {
  return new Promise<any[] | Error>((resolve, reject) => {
    if (!db) return reject(new Error('DB not initialized'));
    db.all(
      `
        SELECT prices.*, a.logo_url AS asset_logo_url, f.logo_url AS fiat_logo_url
        FROM prices
        JOIN assets a ON prices.asset_symbol = a.symbol
        JOIN assets f ON prices.fiat_symbol = f.symbol
      `,
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
}

// Helper to get the latest price for an asset in fiat before or at a given timestamp
async function getLatestPrice(asset_symbol: string, fiat_symbol: string, unix_timestamp: number): Promise<Price | Error> {
  return new Promise<Price>((resolve, reject) => {
    if (!db) return reject(new Error('DB not initialized'));
    db.get(
      `SELECT * FROM prices WHERE asset_symbol = ? AND fiat_symbol = ? AND unix_timestamp <= ? ORDER BY unix_timestamp DESC LIMIT 1`,
      [asset_symbol, fiat_symbol, unix_timestamp],
      (err, row) => {
        if (err) return reject(err);
        resolve(row as Price);
      }
    );
  });
}

//=======================
// Transactions
//=======================
export async function addTransaction(
  {
    unix_timestamp,
    type,
    send_asset_symbol,
    send_asset_quantity,
    receive_asset_symbol,
    receive_asset_quantity,
    fee_asset_symbol,
    fee_asset_quantity,
    is_income,
    notes
  }: Omit<Transaction, 'id'>
): Promise<Transaction[] | Error> {
  return new Promise<any[] | Error>((resolve, reject) => {
    if (!db) return reject(new Error('DB not initialized'));
    db.all(
      `
        INSERT INTO transactions (
          unix_timestamp, type, send_asset_symbol, send_asset_quantity,
          receive_asset_symbol, receive_asset_quantity,
          fee_asset_symbol, fee_asset_quantity,
          is_income, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *
      `,
      [
        unix_timestamp, type, send_asset_symbol, send_asset_quantity,
        receive_asset_symbol, receive_asset_quantity,
        fee_asset_symbol, fee_asset_quantity,
        is_income, notes
      ],
      (err, rows) => {
        if (err) return reject(err);
        if (!rows.length) return reject(new Error('Failed to insert transactions'));
        console.log(
          `Inserted ${rows.length} transaction with
          ID: ${(rows[0] as any).id}, 
          unix_timestamp: ${(rows[0] as any).unix_timestamp}, 
          type: ${(rows[0] as any).type}, 
          send_asset_symbol: ${(rows[0] as any).send_asset_symbol}, 
          send_asset_quantity: ${(rows[0] as any).send_asset_quantity}, 
          receive_asset_symbol: ${(rows[0] as any).receive_asset_symbol}, 
          receive_asset_quantity: ${(rows[0] as any).receive_asset_quantity}, 
          fee_asset_symbol: ${(rows[0] as any).fee_asset_symbol}, 
          fee_asset_quantity: ${(rows[0] as any).fee_asset_quantity}, 
          is_income: ${(rows[0] as any).is_income}, 
          notes: ${(rows[0] as any).notes}`
        );
        resolve(rows);
      }
    );
  });
}

export async function getTransactions(filters?: {
  asset?: string;
  type?: string;
  date_from?: number;
  date_to?: number;
}): Promise<Transaction[] | Error> {
  return new Promise<any[] | Error>((resolve, reject) => {
    if (!db) return reject(new Error('DB not initialized'));
    let sql = `
      SELECT
        t.id, t.unix_timestamp, t.type,
        t.send_asset_symbol, t.send_asset_quantity,
        t.receive_asset_symbol, t.receive_asset_quantity,
        t.fee_asset_symbol, t.fee_asset_quantity,
        t.is_income, t.notes
      FROM transactions t
      LEFT JOIN assets sa ON t.send_asset_symbol = sa.symbol
      LEFT JOIN assets ra ON t.receive_asset_symbol = ra.symbol
      LEFT JOIN assets fa ON t.fee_asset_symbol = fa.symbol
      WHERE 1=1
    `;
    const params: any[] = [];
    if (filters) {
      if (filters.asset) {
        sql += ' AND (t.send_asset_symbol = ? OR t.receive_asset_symbol = ? OR t.fee_asset_symbol = ?)';
        params.push(filters.asset, filters.asset, filters.asset);
      }
      if (filters.type) {
        sql += ' AND t.type = ?';
        params.push(filters.type);
      }
      if (filters.date_from) {
        sql += ' AND t.unix_timestamp >= ?';
        params.push(filters.date_from);
      }
      if (filters.date_to) {
        sql += ' AND t.unix_timestamp <= ?';
        params.push(filters.date_to);
      }
    }
    sql += ' ORDER BY t.unix_timestamp ASC';
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

export async function getTransactionsByAssetSymbol(symbol: string): Promise<Transaction[] | Error> {
  return new Promise<any[] | Error>((resolve, reject) => {
    if (!db) return reject(new Error('DB not initialized'));
    db.all(
      `
      SELECT
        t.id, t.unix_timestamp, t.type,
        t.send_asset_symbol, t.send_asset_quantity,
        t.receive_asset_symbol, t.receive_asset_quantity,
        t.fee_asset_symbol, t.fee_asset_quantity,
        t.is_income, t.notes
      FROM transactions t
      WHERE t.send_asset_symbol = ?
         OR t.receive_asset_symbol = ?
         OR t.fee_asset_symbol = ?
      ORDER BY t.unix_timestamp ASC
      `,
      [symbol, symbol, symbol],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
}

export async function deleteTransaction(id: number): Promise<Transaction[] | Error> {
  return new Promise<any[] | Error>((resolve, reject) => {
    if (!db) return reject(new Error('DB not initialized'));
    db.all('DELETE FROM transactions WHERE id = ? RETURNING *', [id], (err, rows) => {
      if (err) return reject(err);
      if (!rows.length) return reject(new Error('Failed to delete transaction.'));
      console.log(`Deleted transaction with id: ${id}`);
      resolve(rows);
    });
  });
}

export async function updateTransaction(id: number, data: Omit<Transaction, 'id'>): Promise<Transaction[] | Error> {
  return new Promise<any[] | Error>((resolve, reject) => {
    if (!db) return reject(new Error('DB not initialized'));

    const setClause = Object.entries(data)
      .filter(([key, value]) => value !== undefined)
      .map(([key, _]) => `${key} = ?`)
      .join(', ');

    const values = Object.values(data)
      .filter(value => value !== undefined);
    
    db.all(
      `UPDATE transactions SET ${setClause} WHERE id = ? RETURNING *`,
      [...values, id],
      (err, rows) => {
        if (err) return reject(err);
        if (!rows.length) return reject(new Error('Failed to update transaction.'));
        console.log(
          `Updated transaction with 
          ID: ${(rows[0] as any).id}, 
          unix_timestamp: ${(rows[0] as any).unix_timestamp}, 
          type: ${(rows[0] as any).type}, 
          send_asset_symbol: ${(rows[0] as any).send_asset_symbol}, 
          send_asset_quantity: ${(rows[0] as any).send_asset_quantity}, 
          receive_asset_symbol: ${(rows[0] as any).receive_asset_symbol}, 
          receive_asset_quantity: ${(rows[0] as any).receive_asset_quantity}, 
          fee_asset_symbol: ${(rows[0] as any).fee_asset_symbol}, 
          fee_asset_quantity: ${(rows[0] as any).fee_asset_quantity}, 
          is_income: ${(rows[0] as any).is_income}, 
          notes: ${(rows[0] as any).notes}`
        );
        resolve(rows);
      }
    );
  });
}

//=======================
// Helpers involving 
// multiple tables
//=======================
export async function insertHistoricalPrices(symbol: string): Promise<void | Error> {
  try {
    if (!db) throw new Error('DB not initialized');
    if (!symbol) throw new Error('Symbol is required');
    const fiat = await getAssets(AssetType.FIAT);
    if (fiat instanceof Error) throw fiat;
    if (!fiat.length || !fiat[0].symbol) throw new Error('No fiat currency set. Please set a fiat currency before adding assets.');
    const pricesUrl = `https://min-api.cryptocompare.com/data/v2/histoday?fsym=${symbol}&tsym=${fiat[0].symbol}&allData=true` + (API_KEY ? `&api_key=${API_KEY}` : "");
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

    await addPrices(prices);
    console.log(`Inserted ${prices.length} historical prices for asset symbol: ${symbol} and fiat symbol: ${fiat[0].symbol}`);
  } catch (err) {
    throw err;
  }
}

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
export async function calculateACB(asset_symbol: string): Promise<
  Record<string, {
    acb: number,
    totalUnits: number,
    avgCostPerUnit: number,
    totalProceeds: number,
    totalCosts: number,
    totalOutlays: number,
    totalGainLoss: number,
    superficialLosses: number
  }>
> {
  try {
    if (!db) throw new Error('DB not initialized');
    if (!asset_symbol) throw new Error('Asset symbol is required');

    // Fetch fiat symbol (assume only one fiat asset)
    const fiatAssets = await getAssets(AssetType.FIAT);
    if (fiatAssets instanceof Error) throw fiatAssets;
    if (!fiatAssets.length) throw new Error('No fiat asset set');
    const fiat_symbol = fiatAssets[0].symbol;

    // Fetch all transactions where asset is send, receive, or fee asset, ordered by date
    const txs = await getTransactionsByAssetSymbol(asset_symbol);
    if (txs instanceof Error) throw txs;

    let acb = 0;
    let totalUnits = 0;
    let totalProceeds = 0;
    let totalCosts = 0;
    let totalOutlays = 0;
    let totalGainLoss = 0;
    let superficialLosses = 0;
    
    // Per-year aggregates
    const yearlyTotals: Record<string, any> = {};

    for (let i = 0; i < txs.length; i++) {
      const tx = txs[i];
      const year = new Date(tx.unix_timestamp).getFullYear().toString();
      if (!yearlyTotals[year]) {
        yearlyTotals[year] = {
          acb: 0,
          totalUnits: 0,
          totalProceeds: 0,
          totalCosts: 0,
          totalOutlays: 0,
          totalGainLoss: 0,
          superficialLosses: 0
        };
      }

      // --- Sell/Send/Trade: Disposition ---
      if ([TransactionType.SELL, TransactionType.SEND, TransactionType.TRADE].includes(tx.type)) {
        if (!tx.send_asset_symbol || !tx.send_asset_quantity) {
          throw new Error(`No valid send asset found for transaction ${tx.id} of type ${tx.type}`);
        };
        if ((tx.type === TransactionType.SELL || tx.type === TransactionType.TRADE) && (!tx.receive_asset_symbol || !tx.receive_asset_quantity)) {
          throw new Error(`No valid receive asset found for transaction ${tx.id} of type ${tx.type}`);
        };
        if (totalUnits === 0) {
          throw new Error(`Cannot sell ${asset_symbol} because no units are available`);
        }
        const sellPrice = await getLatestPrice(asset_symbol, fiat_symbol, tx.unix_timestamp);
        if (sellPrice instanceof Error) throw sellPrice;
        if (!sellPrice || !sellPrice.price) throw new Error(`No valid sell price found for transaction ${tx.id} of type ${tx.type}`);
        // Proceeds
        let proceeds = 0;
        if (tx.receive_asset_symbol === fiat_symbol && tx.receive_asset_quantity) {
          proceeds = tx.receive_asset_quantity;
        } else if (tx.receive_asset_symbol && tx.receive_asset_quantity) {
          proceeds = tx.send_asset_quantity * sellPrice.price;
        }
        // Fees (Outlays)
        let fee = 0;
        if (tx.fee_asset_symbol === fiat_symbol && tx.fee_asset_quantity) {
          fee = tx.fee_asset_quantity;
        } else if (tx.fee_asset_symbol && tx.fee_asset_quantity) {
          if (tx.fee_asset_symbol === asset_symbol) {
              fee = tx.fee_asset_quantity * sellPrice.price;
          } else {
            const feePriceRow = await getLatestPrice(tx.fee_asset_symbol, fiat_symbol, tx.unix_timestamp);
            if (feePriceRow instanceof Error) throw feePriceRow;
            if (!feePriceRow || !feePriceRow.price) throw new Error(`No valid fee price found for transaction ${tx.id} of type ${tx.type}`);
            fee = tx.fee_asset_quantity * feePriceRow.price;
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
      if ([TransactionType.BUY, TransactionType.RECEIVE, TransactionType.TRADE].includes(tx.type)) {
        if (!tx.receive_asset_symbol || !tx.receive_asset_quantity) {
          throw new Error(`No valid receive asset found for transaction ${tx.id} of type ${tx.type}`);
        };
        if ((tx.type === TransactionType.BUY || tx.type === TransactionType.TRADE) && (!tx.send_asset_symbol || !tx.send_asset_quantity)) {
          throw new Error(`No valid send asset found for transaction ${tx.id} of type ${tx.type}`);
        };
        const buyPrice = await getLatestPrice(asset_symbol, fiat_symbol, tx.unix_timestamp);
        if (buyPrice instanceof Error) throw buyPrice;
        if (!buyPrice || !buyPrice.price) throw new Error(`No valid buy price found for transaction ${tx.id} of type ${tx.type}`);
        // Costs
        let cost = 0;
        if (tx.send_asset_symbol === fiat_symbol && tx.send_asset_quantity) {
          cost = tx.send_asset_quantity;
        } else if (tx.receive_asset_symbol && tx.receive_asset_quantity && !(tx.type === TransactionType.RECEIVE && !tx.is_income)) {
          cost = tx.receive_asset_quantity * buyPrice.price;
        }
        // Fees
        let fee = 0;
        if (tx.fee_asset_symbol === fiat_symbol && tx.fee_asset_quantity) {
          fee = tx.fee_asset_quantity;
        } else if (tx.fee_asset_symbol && tx.fee_asset_quantity) {
          if (tx.fee_asset_symbol === asset_symbol) {
              fee = tx.fee_asset_quantity * buyPrice.price;
          } else {
            const feePriceRow = await getLatestPrice(tx.fee_asset_symbol, fiat_symbol, tx.unix_timestamp);
            if (feePriceRow instanceof Error) throw feePriceRow;
            if (!feePriceRow || !feePriceRow.price) throw new Error(`No valid fee price found for transaction ${tx.id} of type ${tx.type}`);
            fee = tx.fee_asset_quantity * feePriceRow.price;
          }
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
        const feePrice = await getLatestPrice(asset_symbol, fiat_symbol, tx.unix_timestamp);
        if (feePrice instanceof Error) throw feePrice;
        if (!feePrice || !feePrice.price) throw new Error(`No valid fee price found for transaction ${tx.id} of type ${tx.type}`);
        // Proceeds
        let proceeds = tx.fee_asset_quantity * feePrice.price;
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
      if (yearlyTotals[year].acb < 0) yearlyTotals[year].acb = 0; // Prevent negative due to incomplete data
      if (yearlyTotals[year].totalUnits < 0) yearlyTotals[year].totalUnits = 0; // Prevent negative due to incomplete data
      if (asset_symbol === 'XLM') {
        console.log(acb);
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
    };
    return yearlyTotals;
  } catch (err) {
    console.error(err);
    throw err;
  }
}

/**
 * Calculate Adjusted Cost Base (ACB) for all assets across all transactions.
 * Uses a nested Map for price caching: Map<asset_symbol, Map<fiat_symbol, Map<unix_timestamp, price>>>.
 * Returns an object mapping asset symbols to their ACB state.
 */
// export async function calculateAllACBs(): Promise<Record<string, {
//   acb: number,
//   totalUnits: number,
//   avgCostPerUnit: number,
//   totalProceeds: number,
//   totalCosts: number,
//   totalOutlays: number,
//   totalGainLoss: number
// }> | Error> {
//   try {
//     if (!db) throw new Error('DB not initialized');
//     // Fetch fiat symbol (assume only one fiat asset)
//     const fiatAssets = await getAssets(AssetType.FIAT);
//     if (fiatAssets instanceof Error) throw fiatAssets;
//     if (!fiatAssets.length) throw new Error('No fiat asset set');
//     const fiat_symbol = fiatAssets[0].symbol;

//     // Fetch all transactions ordered by date
//     const txs = await getTransactions();
//     if (txs instanceof Error) throw txs;

//     // Fetch all prices and cache them in a nested Map
//     const allPrices = await getPrices();
//     if (allPrices instanceof Error) throw allPrices;
//     // Map<asset_symbol, Map<fiat_symbol, Map<unix_timestamp, price>>>
//     const priceCache: Map<string, Map<string, Map<number, number>>> = new Map();
//     for (const p of allPrices) {
//       if (!priceCache.has(p.asset_symbol)) priceCache.set(p.asset_symbol, new Map());
//       const fiatMap = priceCache.get(p.asset_symbol)!;
//       if (!fiatMap.has(p.fiat_symbol)) fiatMap.set(p.fiat_symbol, new Map());
//       fiatMap.get(p.fiat_symbol)!.set(p.unix_timestamp, p.price);
//     }
//     // Helper: get latest price for asset/fiat at or before timestamp
//     function getCachedLatestPrice(asset_symbol: string, fiat_symbol: string, unix_timestamp: number): number | undefined {
//       // Truncate to the beginning of the day (midnight UTC)
//       const truncated_timestamp = unix_timestamp - (unix_timestamp % 86400000);
//       return priceCache.get(asset_symbol)?.get(fiat_symbol)?.get(truncated_timestamp);
//     }

//     // State per asset
//     const acbState: Record<string, {
//       acb: number,
//       totalUnits: number,
//       avgCostPerUnit: number,
//       totalProceeds: number,
//       totalCosts: number,
//       totalOutlays: number,
//       totalGainLoss: number
//     }> = {};

//     // Helper to get or init state
//     function getState(symbol: string) {
//       if (!acbState[symbol]) {
//         acbState[symbol] = {
//           acb: 0,
//           totalUnits: 0,
//           avgCostPerUnit: 0,
//           totalProceeds: 0,
//           totalCosts: 0,
//           totalOutlays: 0,
//           totalGainLoss: 0
//         };
//       }
//       return acbState[symbol];
//     }

//     for (const tx of txs) {
//       // --- Handle send asset (disposition) ---
//       if (tx.send_asset_symbol && tx.send_asset_quantity) {
//         const state = getState(tx.send_asset_symbol);
//         if (tx.send_asset_symbol !== fiat_symbol) {
//           const sellPrice = getCachedLatestPrice(tx.send_asset_symbol, fiat_symbol, tx.unix_timestamp);
//           if (!sellPrice) throw new Error(`No valid sell price for ${tx.send_asset_symbol} at tx ${tx.id}`);
//           let proceeds = 0;
//           if (tx.receive_asset_symbol === fiat_symbol && tx.receive_asset_quantity) {
//             proceeds = tx.receive_asset_quantity;
//           } else {
//             proceeds = tx.send_asset_quantity * sellPrice;
//           }
//           let fee = 0;
//           if (tx.fee_asset_symbol === fiat_symbol && tx.fee_asset_quantity) {
//             fee = tx.fee_asset_quantity;
//           } else if (tx.fee_asset_symbol === tx.send_asset_symbol && tx.fee_asset_quantity) {
//             fee = tx.fee_asset_quantity * sellPrice;
//           } else if (tx.fee_asset_symbol && tx.fee_asset_quantity) {
//             const feePrice = getCachedLatestPrice(tx.fee_asset_symbol, fiat_symbol, tx.unix_timestamp);
//             if (!feePrice) throw new Error(`No valid fee price for ${tx.fee_asset_symbol} at tx ${tx.id}`);
//             fee = tx.fee_asset_quantity * feePrice;
//           }
//           const cost = state.totalUnits > 0 ? (tx.send_asset_quantity / state.totalUnits) * state.acb : 0;
//           state.acb -= cost;
//           state.totalUnits -= tx.send_asset_quantity;
//           state.totalProceeds += proceeds;
//           state.totalCosts += cost;
//           state.totalOutlays += fee;
//           state.totalGainLoss += (proceeds - cost - fee);
//         }
//       }
//       // --- Handle receive asset (acquisition) ---
//       if (tx.receive_asset_symbol && tx.receive_asset_quantity) {
//         const state = getState(tx.receive_asset_symbol);
//         if (tx.receive_asset_symbol !== fiat_symbol) {
//           const buyPrice = getCachedLatestPrice(tx.receive_asset_symbol, fiat_symbol, tx.unix_timestamp);
//           if (!buyPrice) throw new Error(`No valid buy price for ${tx.receive_asset_symbol} at tx ${tx.id}`);
//           let cost = 0;
//           if (tx.send_asset_symbol === fiat_symbol && tx.send_asset_quantity) {
//             cost = tx.send_asset_quantity;
//           } else {
//             cost = tx.receive_asset_quantity * buyPrice;
//           }
//           let fee = 0;
//           if (tx.fee_asset_symbol === fiat_symbol && tx.fee_asset_quantity) {
//             fee = tx.fee_asset_quantity;
//           } else if (tx.fee_asset_symbol === tx.receive_asset_symbol && tx.fee_asset_quantity) {
//             fee = tx.fee_asset_quantity * buyPrice;
//           } else if (tx.fee_asset_symbol && tx.fee_asset_quantity) {
//             const feePrice = getCachedLatestPrice(tx.fee_asset_symbol, fiat_symbol, tx.unix_timestamp);
//             if (!feePrice) throw new Error(`No valid fee price for ${tx.fee_asset_symbol} at tx ${tx.id}`);
//             fee = tx.fee_asset_quantity * feePrice;
//           }
//           state.acb += cost + fee;
//           state.totalUnits += tx.receive_asset_quantity;
//         }
//       }
//       // --- Handle fee asset (outlay only, if not already handled above) ---
//       if (
//         tx.fee_asset_symbol &&
//         tx.fee_asset_quantity &&
//         tx.fee_asset_symbol !== fiat_symbol &&
//         tx.fee_asset_symbol !== tx.send_asset_symbol &&
//         tx.fee_asset_symbol !== tx.receive_asset_symbol
//       ) {
//         const state = getState(tx.fee_asset_symbol);
//         const feePrice = getCachedLatestPrice(tx.fee_asset_symbol, fiat_symbol, tx.unix_timestamp);
//         if (!feePrice) throw new Error(`No valid fee price for ${tx.fee_asset_symbol} at tx ${tx.id}`);
//         const fee = tx.fee_asset_quantity * feePrice;
//         state.acb -= fee;
//         state.totalUnits -= tx.fee_asset_quantity;
//         state.totalOutlays += fee;
//       }
//     }
//     // Calculate avg cost per unit for each asset
//     for (const symbol of Object.keys(acbState)) {
//       const state = acbState[symbol];
//       state.avgCostPerUnit = state.totalUnits > 0 ? state.acb / state.totalUnits : 0;
//     }
//     return acbState;
//   } catch (err) {
//     throw err;
//   }
// }