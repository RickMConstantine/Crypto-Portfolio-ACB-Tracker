import request from 'supertest';
import { TransactionType } from '../src/types';

const ASSETS_ROW = { id: 1, name: 'Ethereum', symbol: 'ETH', logo_url: 'https://example.com/eth-logo.png' };
const ASSETS_ROW_MOCK = jest.fn().mockResolvedValue([ASSETS_ROW]);
const PRICES_ROW = { date: '2024-06-01', price: 3500, asset_id: 1 };
const PRICES_ROW_MOCK = jest.fn().mockResolvedValue([PRICES_ROW]);
const TRANSACTIONS_ROW = { id: 1, date: '2024-06-01', type: 'Buy', send_asset_symbol: 'ETH', send_asset_quantity: 1, receive_asset_symbol: 'ETH', receive_asset_quantity: 2, fee_asset_symbol: 'ETH', fee_asset_quantity: 0.01 };
const TRANSACTIONS_ROW_MOCK = jest.fn().mockResolvedValue([TRANSACTIONS_ROW]);

jest.mock('../src/db', () => ({
  initDb: jest.fn().mockResolvedValue(Promise.resolve()),
  addAsset: ASSETS_ROW_MOCK,
  getAssets: ASSETS_ROW_MOCK,
  addPrice: PRICES_ROW_MOCK,
  getPrices: PRICES_ROW_MOCK,
  addTransaction: TRANSACTIONS_ROW_MOCK,
  getTransactions: TRANSACTIONS_ROW_MOCK
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
    const res = await request(app).get('/api/assets?asset_type=blockchain');
    expect(res.status).toBe(200);
    expect(res.body.some((b: any) => 
      b.id === ASSETS_ROW.id && 
      b.name === ASSETS_ROW.name && 
      b.symbol === ASSETS_ROW.symbol &&
      b.logo_url === ASSETS_ROW.logo_url)
    ).toBeTruthy();
  });

  it('POST /api/assets', async () => {
    const res = await request(app).post('/api/asset').send(ASSETS_ROW);
    expect(res.status).toBe(200);
    expect(res.body.some((b: any) => 
      b.id === ASSETS_ROW.id && 
      b.name === ASSETS_ROW.name && 
      b.symbol === ASSETS_ROW.symbol &&
      b.logo_url === ASSETS_ROW.logo_url)
    ).toBeTruthy();
  });

  it('GET /api/prices', async () => {
    const res = await request(app).get('/api/prices');
    expect(res.status).toBe(200);
    expect(res.body.some((b: any) => 
      b.date === PRICES_ROW.date && 
      b.price === PRICES_ROW.price && 
      b.asset_id === PRICES_ROW.asset_id)
    ).toBeTruthy();
  });

  it('POST /api/prices', async () => {
    const res = await request(app).post('/api/price').send(PRICES_ROW);
    expect(res.status).toBe(200);
    expect(res.body.some((b: any) => 
      b.date === PRICES_ROW.date && 
      b.price === PRICES_ROW.price && 
      b.asset_id === PRICES_ROW.asset_id)
    ).toBeTruthy();
  });

  it('GET /api/transactions', async () => {
    const res = await request(app).get('/api/transactions');
    expect(res.status).toBe(200);
    expect(res.body.some((b: any) => 
      b.id === TRANSACTIONS_ROW.id &&
      b.date === TRANSACTIONS_ROW.date &&
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
      b.date === TRANSACTIONS_ROW.date &&
      b.type === TRANSACTIONS_ROW.type &&
      b.send_asset_symbol === TRANSACTIONS_ROW.send_asset_symbol &&
      b.send_asset_quantity === TRANSACTIONS_ROW.send_asset_quantity &&
      b.receive_asset_symbol === TRANSACTIONS_ROW.receive_asset_symbol &&
      b.receive_asset_quantity === TRANSACTIONS_ROW.receive_asset_quantity &&
      b.fee_asset_symbol === TRANSACTIONS_ROW.fee_asset_symbol &&
      b.fee_asset_quantity === TRANSACTIONS_ROW.fee_asset_quantity
    )).toBeTruthy();
  });
});