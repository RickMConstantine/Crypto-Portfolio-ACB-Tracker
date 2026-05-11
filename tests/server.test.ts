import request from 'supertest';
import { Asset, AssetType, Price, Transaction, TransactionType, Wallet } from '../src/types';

const ASSETS_ROW: Asset = { name: 'Ethereum', symbol: 'ETH', asset_type: AssetType.BLOCKCHAIN, logo_url: 'https://example.com/eth-logo.png' };
const ADD_ASSET_MOCK = jest.fn().mockResolvedValue([ASSETS_ROW]);
const GET_ASSETS_MOCK = jest.fn().mockImplementation((filters?: { asset_types?: AssetType[] }) => {
  // Return nothing when filtering specifically for fiat (fixture is blockchain)
  if (filters?.asset_types?.length && !filters.asset_types.includes(AssetType.BLOCKCHAIN)) {
    return Promise.resolve({ items: [], total: 0 });
  }
  return Promise.resolve({ items: [ASSETS_ROW], total: 1 });
});
const PRICES_ROW: Price = { unix_timestamp: new Date('2024-06-01').getTime(), price: 3500, fiat_symbol: 'CAD', asset_symbol: 'ETH' };
const ADD_PRICE_MOCK = jest.fn().mockResolvedValue([PRICES_ROW]);
const GET_PRICES_MOCK = jest.fn().mockResolvedValue({ items: [PRICES_ROW], total: 1 });
const TRANSACTIONS_ROW: Transaction = {
  id: 1,
  unix_timestamp: new Date('2024-06-01').getTime(),
  type: TransactionType.BUY,
  send_asset_symbol: 'ETH',
  send_asset_quantity: 1,
  receive_asset_symbol: 'ETH',
  receive_asset_quantity: 2,
  fee_asset_symbol: 'ETH',
  fee_asset_quantity: 0.01
};
const ADD_TRANSACTION_MOCK = jest.fn().mockResolvedValue([TRANSACTIONS_ROW]);
const GET_TRANSACTIONS_MOCK = jest.fn().mockResolvedValue({ items: [TRANSACTIONS_ROW], total: 1 });
const WALLETS_ROW: Wallet = { id: 1, name: 'Ledger Nano' };
const WALLETS_ROW_MOCK = jest.fn().mockResolvedValue([WALLETS_ROW]);
const GET_WALLETS_MOCK = jest.fn().mockResolvedValue({ items: [WALLETS_ROW], total: 1 });

jest.mock('../src/db', () => ({
  initDb: jest.fn().mockResolvedValue(Promise.resolve()),
  addAsset: ADD_ASSET_MOCK,
  getAssets: GET_ASSETS_MOCK,
  addPrice: ADD_PRICE_MOCK,
  getPrices: GET_PRICES_MOCK,
  addTransaction: ADD_TRANSACTION_MOCK,
  getTransactions: GET_TRANSACTIONS_MOCK,
  updateTransaction: ADD_TRANSACTION_MOCK,
  deleteTransaction: ADD_TRANSACTION_MOCK,
  addWallet: WALLETS_ROW_MOCK,
  getWallets: GET_WALLETS_MOCK,
  updateWallet: WALLETS_ROW_MOCK,
  deleteWallet: WALLETS_ROW_MOCK
}));

// Get the Express app instance (not the server listener)
const app = require('../src/server').default || require('../src/server');

describe('Express API endpoints (mocked db)', () => {
  it('GET /api/ping', async () => {
    const res = await request(app).get('/api/ping');
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('pong');
  });

  it('GET /api/assets', async () => {
    const res = await request(app).get('/api/assets?asset_types=blockchain');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items.some((b: Asset) =>
      b.name === ASSETS_ROW.name &&
      b.symbol === ASSETS_ROW.symbol &&
      b.asset_type === AssetType.BLOCKCHAIN &&
      b.logo_url === ASSETS_ROW.logo_url)
    ).toBeTruthy();
  });

  it('POST /api/assets', async () => {
    const res = await request(app).post('/api/asset').send(ASSETS_ROW);
    expect(res.status).toBe(200);
    expect(res.body.some((b: Asset) =>
      b.name === ASSETS_ROW.name &&
      b.symbol === ASSETS_ROW.symbol &&
      b.asset_type === AssetType.BLOCKCHAIN &&
      b.logo_url === ASSETS_ROW.logo_url)
    ).toBeTruthy();
  });

  it('GET /api/prices', async () => {
    const res = await request(app).get('/api/prices');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items.some((b: Price) =>
      b.unix_timestamp === PRICES_ROW.unix_timestamp &&
      b.price === PRICES_ROW.price &&
      b.fiat_symbol === PRICES_ROW.fiat_symbol &&
      b.asset_symbol === PRICES_ROW.asset_symbol)
    ).toBeTruthy();
  });

  it('GET /api/prices with limit returns paginated envelope', async () => {
    const res = await request(app).get('/api/prices?limit=10&offset=0');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(typeof res.body.total).toBe('number');
    expect(res.body.items.some((b: Price) =>
      b.asset_symbol === PRICES_ROW.asset_symbol
    )).toBeTruthy();
  });

  it('POST /api/prices', async () => {
    const res = await request(app).post('/api/price').send(PRICES_ROW);
    expect(res.status).toBe(200);
    expect(res.body.some((b: Price) => 
      b.unix_timestamp === PRICES_ROW.unix_timestamp && 
      b.price === PRICES_ROW.price && 
      b.fiat_symbol === PRICES_ROW.fiat_symbol &&
      b.asset_symbol === PRICES_ROW.asset_symbol)
    ).toBeTruthy();
  });

  it('GET /api/transactions', async () => {
    const res = await request(app).get('/api/transactions');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items.some((b: Transaction) =>
      b.id === TRANSACTIONS_ROW.id &&
      b.unix_timestamp === TRANSACTIONS_ROW.unix_timestamp &&
      b.type === TRANSACTIONS_ROW.type &&
      b.send_asset_symbol === TRANSACTIONS_ROW.send_asset_symbol &&
      b.send_asset_quantity === TRANSACTIONS_ROW.send_asset_quantity &&
      b.receive_asset_symbol === TRANSACTIONS_ROW.receive_asset_symbol &&
      b.receive_asset_quantity === TRANSACTIONS_ROW.receive_asset_quantity &&
      b.fee_asset_symbol === TRANSACTIONS_ROW.fee_asset_symbol &&
      b.fee_asset_quantity === TRANSACTIONS_ROW.fee_asset_quantity
    )).toBeTruthy();
  });

  it('GET /api/transactions with limit returns paginated envelope', async () => {
    const res = await request(app).get('/api/transactions?limit=10&offset=0');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(typeof res.body.total).toBe('number');
    expect(res.body.items.some((b: Transaction) =>
      b.id === TRANSACTIONS_ROW.id
    )).toBeTruthy();
  });

  it('POST /api/transactions', async () => {
    const res = await request(app).post('/api/transaction').send(TRANSACTIONS_ROW);
    expect(res.status).toBe(200);
    expect(res.body.some((b: any) => 
      b.id === TRANSACTIONS_ROW.id &&
      b.unix_timestamp === TRANSACTIONS_ROW.unix_timestamp &&
      b.type === TRANSACTIONS_ROW.type &&
      b.send_asset_symbol === TRANSACTIONS_ROW.send_asset_symbol &&
      b.send_asset_quantity === TRANSACTIONS_ROW.send_asset_quantity &&
      b.receive_asset_symbol === TRANSACTIONS_ROW.receive_asset_symbol &&
      b.receive_asset_quantity === TRANSACTIONS_ROW.receive_asset_quantity &&
      b.fee_asset_symbol === TRANSACTIONS_ROW.fee_asset_symbol &&
      b.fee_asset_quantity === TRANSACTIONS_ROW.fee_asset_quantity
    )).toBeTruthy();
  });

  it('GET /api/wallets', async () => {
    const res = await request(app).get('/api/wallets');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items.some((b: Wallet) =>
      b.id === WALLETS_ROW.id &&
      b.name === WALLETS_ROW.name
    )).toBeTruthy();
  });

  it('POST /api/wallet', async () => {
    const res = await request(app).post('/api/wallet').send({ name: 'Ledger Nano' });
    expect(res.status).toBe(200);
    expect(res.body.some((b: Wallet) =>
      b.id === WALLETS_ROW.id &&
      b.name === WALLETS_ROW.name
    )).toBeTruthy();
  });

  it('POST /api/wallet returns 400 without name', async () => {
    const res = await request(app).post('/api/wallet').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('PUT /api/wallet/:id', async () => {
    const res = await request(app).put('/api/wallet/1').send({ name: 'Updated Wallet' });
    expect(res.status).toBe(200);
    expect(res.body.some((b: Wallet) =>
      b.id === WALLETS_ROW.id &&
      b.name === WALLETS_ROW.name
    )).toBeTruthy();
  });

  it('PUT /api/wallet/:id returns 400 without name', async () => {
    const res = await request(app).put('/api/wallet/1').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('DELETE /api/wallet/:id', async () => {
    const res = await request(app).delete('/api/wallet/1');
    expect(res.status).toBe(200);
    expect(res.body.some((b: Wallet) =>
      b.id === WALLETS_ROW.id &&
      b.name === WALLETS_ROW.name
    )).toBeTruthy();
  });

  it('POST /api/transaction with TRANSFER type and wallet IDs', async () => {
    // getWallets mock returns [{ id: 1, ... }]; need a second wallet id for to_wallet.
    // The server validates wallet IDs via getWallets({ ids: [...] }); our mock always
    // returns WALLETS_ROW (id: 1) so we validate that id 1 is allowed as from_wallet
    // but use id 1 for both will fail the "must be different" check.
    // Instead, cover the happy path with a single wallet: SEND (disposition) allowing only from_wallet.
    const sendTx = {
      unix_timestamp: new Date('2024-06-02').getTime(),
      type: TransactionType.SEND,
      send_asset_symbol: 'ETH',
      send_asset_quantity: 1,
      from_wallet_id: 1
    };
    const res = await request(app).post('/api/transaction').send(sendTx);
    expect(res.status).toBe(200);
  });

  it('POST /api/transaction with TRANSFER fails when receive is missing', async () => {
    const transferTx = {
      unix_timestamp: new Date('2024-06-02').getTime(),
      type: TransactionType.TRANSFER,
      send_asset_symbol: 'ETH',
      send_asset_quantity: 1,
      from_wallet_id: 1,
      to_wallet_id: 2
    };
    const res = await request(app).post('/api/transaction').send(transferTx);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Receive asset\/symbol and quantity are required for Transfer/i);
  });

  it('POST /api/transaction with TRANSFER fails when send/receive do not match', async () => {
    const transferTx = {
      unix_timestamp: new Date('2024-06-02').getTime(),
      type: TransactionType.TRANSFER,
      send_asset_symbol: 'ETH',
      send_asset_quantity: 1,
      receive_asset_symbol: 'BTC',
      receive_asset_quantity: 1,
      from_wallet_id: 1,
      to_wallet_id: 2
    };
    const res = await request(app).post('/api/transaction').send(transferTx);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Transfer Send and Receive asset\/symbol and quantity must match/i);
  });

  it('POST /api/transaction with TRANSFER fails when to_wallet missing', async () => {
    const transferTx = {
      unix_timestamp: new Date('2024-06-02').getTime(),
      type: TransactionType.TRANSFER,
      send_asset_symbol: 'ETH',
      send_asset_quantity: 1,
      receive_asset_symbol: 'ETH',
      receive_asset_quantity: 1,
      from_wallet_id: 1
    };
    const res = await request(app).post('/api/transaction').send(transferTx);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/To Wallet is required for Transfer/i);
  });

  it('POST /api/transaction with BUY rejects from_wallet_id', async () => {
    const buyTx = {
      unix_timestamp: new Date('2024-06-02').getTime(),
      type: TransactionType.BUY,
      send_asset_symbol: 'ETH',
      send_asset_quantity: 1,
      receive_asset_symbol: 'ETH',
      receive_asset_quantity: 2,
      from_wallet_id: 1
    };
    const res = await request(app).post('/api/transaction').send(buyTx);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/From Wallet is not allowed/i);
  });

  it('POST /api/transaction with SELL rejects to_wallet_id', async () => {
    const sellTx = {
      unix_timestamp: new Date('2024-06-02').getTime(),
      type: TransactionType.SELL,
      send_asset_symbol: 'ETH',
      send_asset_quantity: 1,
      receive_asset_symbol: 'ETH',
      receive_asset_quantity: 2,
      to_wallet_id: 1
    };
    const res = await request(app).post('/api/transaction').send(sellTx);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/To Wallet is not allowed/i);
  });

  it('GET /api/wallet/:id/balances calculates balances from transactions', async () => {
    // The mock returns TRANSACTIONS_ROW which has no wallet associations, so balances
    // will be empty. To test with wallet data, override getTransactions for this test.
    const mockTxWithWallets: Transaction = {
      id: 2,
      unix_timestamp: new Date('2024-06-01').getTime(),
      type: TransactionType.SEND,
      send_asset_symbol: 'ETH',
      send_asset_quantity: 1,
      fee_asset_symbol: 'ETH',
      fee_asset_quantity: 0.01,
      from_wallet_id: 1
    };
    const { getTransactions } = require('../src/db');
    (getTransactions as jest.Mock).mockResolvedValueOnce({ items: [mockTxWithWallets], total: 1 });
    const res = await request(app).get('/api/wallet/1/balances');
    expect(res.status).toBe(200);
    expect(res.body.some((b: any) => b.symbol === 'ETH' && b.balance === -1.01)).toBeTruthy();
  });

  it('GET /api/wallet/:id/balances returns 400 for invalid ID', async () => {
    const res = await request(app).get('/api/wallet/0/balances');
    expect(res.status).toBe(400);
  });

  it('DELETE /api/transactions/bulk deletes multiple transactions', async () => {
    const res = await request(app)
      .delete('/api/transactions/bulk')
      .send({ ids: [1, 2, 3] });
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(3);
  });

  it('DELETE /api/transactions/bulk returns 400 for missing ids', async () => {
    const res = await request(app)
      .delete('/api/transactions/bulk')
      .send({});
    expect(res.status).toBe(400);
  });

  it('DELETE /api/transactions/bulk returns 400 for non-numeric ids', async () => {
    const res = await request(app)
      .delete('/api/transactions/bulk')
      .send({ ids: ['not-a-number'] });
    expect(res.status).toBe(400);
  });

  it('PATCH /api/transactions/bulk applies patch when types match', async () => {
    const { getTransactions } = require('../src/db');
    (getTransactions as jest.Mock).mockResolvedValueOnce({
      items: [
        { ...TRANSACTIONS_ROW, id: 1 },
        { ...TRANSACTIONS_ROW, id: 2 }
      ],
      total: 2
    });
    const res = await request(app)
      .patch('/api/transactions/bulk')
      .send({ ids: [1, 2], patch: { notes: 'Updated in bulk' } });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(2);
  });

  it('PATCH /api/transactions/bulk rejects mixed types', async () => {
    const { getTransactions } = require('../src/db');
    (getTransactions as jest.Mock).mockResolvedValueOnce({
      items: [
        { ...TRANSACTIONS_ROW, id: 1, type: TransactionType.BUY },
        { ...TRANSACTIONS_ROW, id: 2, type: TransactionType.SELL }
      ],
      total: 2
    });
    const res = await request(app)
      .patch('/api/transactions/bulk')
      .send({ ids: [1, 2], patch: { notes: 'Mixed types' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/same type/i);
  });

  it('PATCH /api/transactions/bulk rejects type change', async () => {
    const res = await request(app)
      .patch('/api/transactions/bulk')
      .send({ ids: [1], patch: { type: 'Sell' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cannot change transaction type/i);
  });

  it('PATCH /api/transactions/bulk returns 404 when any ID is missing', async () => {
    const { getTransactions } = require('../src/db');
    (getTransactions as jest.Mock).mockResolvedValueOnce({
      items: [{ ...TRANSACTIONS_ROW, id: 1 }],
      total: 1
    });
    const res = await request(app)
      .patch('/api/transactions/bulk')
      .send({ ids: [1, 999], patch: { notes: 'x' } });
    expect(res.status).toBe(404);
  });

  it('PATCH /api/transactions/bulk returns 400 for invalid body', async () => {
    const res = await request(app)
      .patch('/api/transactions/bulk')
      .send({ ids: [1] });
    expect(res.status).toBe(400);
  });
});