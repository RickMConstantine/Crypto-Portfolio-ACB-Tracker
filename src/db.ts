import { Database } from 'sqlite3';
import { mkdir, unlink } from 'fs';
import { dirname } from 'path';
import { AssetType, Asset, Price, Transaction, InsertionType } from './types';

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
            launch_date INTEGER NOT NULL,
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
          if (err) return reject(err);
          if (!db) return reject(new Error('DB not initialized'));
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
// Create
export async function addAsset({name, symbol, asset_type, logo_url, launch_date}: Asset): Promise<Asset[] | Error> {
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
        'INSERT INTO assets (symbol, name, asset_type, launch_date, logo_url) VALUES (?, ?, ?, ?, ?) RETURNING *',
        [symbol, name, asset_type, launch_date, logo_url ?? null],
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

    const placeholders = assets.map(() => '(?, ?, ?, ?, ?)').join(', ');
    const values = assets.flatMap(a => [a.symbol, a.name, a.asset_type, a.launch_date, a.logo_url ?? null]);
    const sql = `INSERT INTO assets (symbol, name, asset_type, launch_date, logo_url) VALUES ${placeholders} RETURNING *`;

    db.all(sql, values, (err, rows) => {
      if (err) return reject(err);
      console.log(`Inserted ${assets.length} assets.`);
      resolve(rows);
    });
  });
}

// Retrieve
export async function getAssets(filters?: {
  name?: string,
  symbol?: string,
  asset_type?: AssetType,
}): Promise<Asset[] | Error> {
  return new Promise<any[] | Error>((resolve, reject) => {
    if (!db) return reject(new Error('DB not initialized'));
    let sql = 'SELECT * FROM assets WHERE 1=1';
    const params: any[] = [];
    if (filters) {
      if (filters.name) {
        sql += ' AND name = ?';
        params.push(filters.name);
      }
      if (filters.symbol) {
        sql += ' AND symbol = ?';
        params.push(filters.symbol);
      }
      if (filters.asset_type) {
        sql += ' AND asset_type = ?';
        params.push(filters.asset_type);
      }
    }
    sql += ' ORDER BY asset_type DESC, symbol ASC';
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

// Update
export async function updateAsset(symbol: string, name: string, asset_type: AssetType, launch_date: number, logo_url: string): Promise<Asset[] | Error> {
    return new Promise<any[] | Error>((resolve, reject) => {
    if (!db) return reject(new Error('DB not initialized'));
    db.all(
      'UPDATE assets SET name = ?, asset_type = ?, launch_date = ?, logo_url = ? WHERE symbol = ? RETURNING *',
      [name, asset_type, launch_date, logo_url, symbol],
      (err, rows) => {
        if (err) return reject(err);
        if (!rows.length) return reject(new Error('Failed to update asset'));
        console.log(
          `Updated asset with 
          symbol: ${(rows[0] as any).symbol}, 
          name: ${(rows[0] as any).name}, 
          launch_date: ${(rows[0] as any).launch_date},
          logo_url: ${(rows[0] as any).logo_url}`
        );
        resolve(rows);
      }
    );
  });
}

// Delete
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
// Create
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

export async function addPrices(prices: Price[], insertionType: InsertionType = InsertionType.INSERT): Promise<Price[] | Error> {
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
    let sql = `INSERT INTO prices (unix_timestamp, price, asset_symbol, fiat_symbol) VALUES ${placeholders} `;
    if (insertionType === InsertionType.UPSERT) {
      sql += `ON CONFLICT(unix_timestamp, asset_symbol, fiat_symbol) DO UPDATE SET price = excluded.price `;
    }
    sql += 'RETURNING *';

    db.all(sql, values, (err, rows) => {
      if (err) return reject(err);
      if (!rows.length) return reject(new Error('Failed to insert prices'));
      console.log(`Inserted ${rows.length} prices for asset: ${(rows[0] as any).asset_symbol} and fiat: ${(rows[0] as any).fiat_symbol}`);
      resolve(rows);
    });
  });
}

// Retrieve
export async function getPrices(filters?: {
  asset_symbol?: string;
  fiat_symbol?: string;
  date_from?: number;
  date_to?: number;
}): Promise<Price[] | Error> {
  return new Promise<any[] | Error>((resolve, reject) => {
    if (!db) return reject(new Error('DB not initialized'));
    let sql = `
      SELECT prices.*, a.logo_url AS asset_logo_url, f.logo_url AS fiat_logo_url
      FROM prices
      JOIN assets a ON prices.asset_symbol = a.symbol
      JOIN assets f ON prices.fiat_symbol = f.symbol
      WHERE 1=1
    `;
    const params: any[] = [];
    if (filters) {
      if (filters.asset_symbol) {
        sql += ' AND prices.asset_symbol = ?';
        params.push(filters.asset_symbol);
      }
      if (filters.fiat_symbol) {
        sql += ' AND prices.fiat_symbol = ?';
        params.push(filters.fiat_symbol);
      }
      if (filters.date_from) {
        sql += ' AND prices.unix_timestamp >= ?';
        params.push(filters.date_from);
      }
      if (filters.date_to) {
        sql += ' AND prices.unix_timestamp <= ?';
        params.push(filters.date_to);
      }
    }
    sql += ' ORDER BY prices.unix_timestamp ASC';
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

// Update
export async function updatePrice({ unix_timestamp, asset_symbol, fiat_symbol, price }: Price): Promise<Price[] | Error> {
  return new Promise<any[] | Error>((resolve, reject) => {
    if (!db) return reject(new Error('DB not initialized'));
    db.all(
      'UPDATE prices SET price = ? WHERE unix_timestamp = ? AND asset_symbol = ? AND fiat_symbol = ? RETURNING *',
      [price, unix_timestamp, asset_symbol, fiat_symbol],
      (err, rows) => {
        if (err) return reject(err);
        if (!rows.length) return reject(new Error('Failed to update price'));
        console.log(
          `Updated price with 
          unix_timestamp: ${(rows[0] as any).unix_timestamp}, 
          asset_symbol: ${(rows[0] as any).asset_symbol}, 
          fiat_symbol: ${(rows[0] as any).fiat_symbol}, 
          price: ${(rows[0] as any).price}`
        );
        resolve(rows);
      }
    );
  });
}

// Delete
export async function deletePrice({ unix_timestamp, asset_symbol, fiat_symbol }: Omit<Price, 'price'>): Promise<Price[] | Error> {
  return new Promise<any[] | Error>((resolve, reject) => {
    if (!db) return reject(new Error('DB not initialized'));
    db.all(
      'DELETE FROM prices WHERE unix_timestamp = ? AND asset_symbol = ? AND fiat_symbol = ? RETURNING *',
      [unix_timestamp, asset_symbol, fiat_symbol],
      (err, rows) => {
        if (err) return reject(err);
        if (!rows.length) return reject(new Error('Failed to delete price'));
        console.log(`Deleted price with unix_timestamp: ${unix_timestamp}, asset_symbol: ${asset_symbol}, fiat_symbol: ${fiat_symbol}`);
        resolve(rows);
      }
    );
  });
}

// Helper to get the latest price for an asset in fiat before or at a given timestamp
export async function getLatestPrice(asset_symbol: string, fiat_symbol: string, unix_timestamp: number): Promise<Price | Error> {
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
// Create
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

// Retrieve
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

// Update
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

// Delete
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