import request from 'supertest';
import { Asset, AssetType, Price, Transaction, TransactionType, Wallet } from '../src/types';

const ASSETS_ROW: Asset = { name: 'Ethereum', symbol: 'ETH', asset_type: AssetType.BLOCKCHAIN, logo_url: 'https://example.com/eth-logo.png' };
const ASSETS_ROW_MOCK = jest.fn().mockResolvedValue([ASSETS_ROW]);
const PRICES_ROW: Price = { unix_timestamp: new Date('2024-06-01').getTime(), price: 3500, fiat_symbol: 'CAD', asset_symbol: 'ETH' };
const PRICES_ROW_MOCK = jest.fn().mockResolvedValue([PRICES_ROW]);
const TRANSACTIONS_ROW: Transaction = {
  id: 1,
  unix_timestamp: new Date('2024-06-01').getTime(),
  type: TransactionType.BUY,
  send_asset_symbol: 'ETH',
  send_asset_quantity: 1,
  receive_asset_symbol: 'ETH',
  receive_asset_quantity: 2,
  fee_asset_symbol: 'ETH',
  fee_asset_quantity: 0.01,
  from_wallet_id: 1,
  to_wallet_id: 2
};
const TRANSACTIONS_ROW_MOCK = jest.fn().mockResolvedValue([TRANSACTIONS_ROW]);
const WALLETS_ROW: Wallet = { id: 1, name: 'Ledger Nano', description: 'Hardware wallet' };
const WALLETS_ROW_MOCK = jest.fn().mockResolvedValue([WALLETS_ROW]);

jest.mock('../src/db', () => ({
  initDb: jest.fn().mockResolvedValue(Promise.resolve()),
  addAsset: ASSETS_ROW_MOCK,
  getAssets: ASSETS_ROW_MOCK,
  addPrice: PRICES_ROW_MOCK,
  getPrices: PRICES_ROW_MOCK,
  addTransaction: TRANSACTIONS_ROW_MOCK,
  getTransactions: TRANSACTIONS_ROW_MOCK,
  addWallet: WALLETS_ROW_MOCK,
  getWallets: WALLETS_ROW_MOCK,
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
    expect(res.body.some((b: Asset) => 
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
    expect(res.body.some((b: Price) => 
      b.unix_timestamp === PRICES_ROW.unix_timestamp && 
      b.price === PRICES_ROW.price && 
      b.fiat_symbol === PRICES_ROW.fiat_symbol &&
      b.asset_symbol === PRICES_ROW.asset_symbol)
    ).toBeTruthy();
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
    expect(res.body.some((b: Transaction) => 
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
    expect(res.body.some((b: Wallet) =>
      b.id === WALLETS_ROW.id &&
      b.name === WALLETS_ROW.name &&
      b.description === WALLETS_ROW.description
    )).toBeTruthy();
  });

  it('POST /api/wallet', async () => {
    const res = await request(app).post('/api/wallet').send({ name: 'Ledger Nano', description: 'Hardware wallet' });
    expect(res.status).toBe(200);
    expect(res.body.some((b: Wallet) =>
      b.id === WALLETS_ROW.id &&
      b.name === WALLETS_ROW.name &&
      b.description === WALLETS_ROW.description
    )).toBeTruthy();
  });

  it('POST /api/wallet returns 400 without name', async () => {
    const res = await request(app).post('/api/wallet').send({ description: 'No name' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('PUT /api/wallet/:id', async () => {
    const res = await request(app).put('/api/wallet/1').send({ name: 'Updated Wallet', description: 'Updated desc' });
    expect(res.status).toBe(200);
    expect(res.body.some((b: Wallet) =>
      b.id === WALLETS_ROW.id &&
      b.name === WALLETS_ROW.name
    )).toBeTruthy();
  });

  it('PUT /api/wallet/:id returns 400 without name', async () => {
    const res = await request(app).put('/api/wallet/1').send({ description: 'No name' });
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

  it('POST /api/transaction with wallet IDs', async () => {
    const txWithWallets = { ...TRANSACTIONS_ROW, from_wallet_id: 1, to_wallet_id: 2 };
    const res = await request(app).post('/api/transaction').send(txWithWallets);
    expect(res.status).toBe(200);
    expect(res.body.some((b: any) =>
      b.from_wallet_id === 1 &&
      b.to_wallet_id === 2
    )).toBeTruthy();
  });

  it('GET /api/wallet/:id/balances calculates balances from transactions', async () => {
    // The mock returns TRANSACTIONS_ROW which has from_wallet_id=1, to_wallet_id=2
    // For wallet 1 (from): send ETH 1, fee ETH 0.01 => ETH balance = -1.01
    // For wallet 2 (to): receive ETH 2 => ETH balance = +2
    const res1 = await request(app).get('/api/wallet/1/balances');
    expect(res1.status).toBe(200);
    expect(res1.body.some((b: any) => b.symbol === 'ETH' && b.balance === -1.01)).toBeTruthy();

    const res2 = await request(app).get('/api/wallet/2/balances');
    expect(res2.status).toBe(200);
    expect(res2.body.some((b: any) => b.symbol === 'ETH' && b.balance === 2)).toBeTruthy();
  });

  it('GET /api/wallet/:id/balances returns 400 for invalid ID', async () => {
    const res = await request(app).get('/api/wallet/0/balances');
    expect(res.status).toBe(400);
  });
});