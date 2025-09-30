import {
  initDb, destroyDb, addAsset, getAssets, addPrices, addPrice, getPrices,
  addTransaction, getTransactions, addAssets, deleteAsset, deleteAllAssets
} from '../src/db';
import { beforeAll, afterAll, describe, it, expect } from '@jest/globals';
import { Asset, AssetType, Price, Transaction, TransactionType } from '../src/types';

const TEST_DB_PATH = `${__dirname}/app_db_test.sqlite`;

describe('DB functions', () => {
  beforeAll(async () => {
    await initDb(TEST_DB_PATH);
    await deleteAllAssets();
  });

  afterAll(async () => {
    await destroyDb(TEST_DB_PATH);
  });

  it('should add and get asset', async () => {
    const newAsset = await addAsset({name: 'Bitcoin', symbol: 'BTC', asset_type: AssetType.BLOCKCHAIN, logo_url: 'https://example.com/btc-logo.png'});
    if (newAsset instanceof Error) throw newAsset;
    expect(newAsset.some((a: Asset) => a.symbol === 'BTC' && a.name === 'Bitcoin' && a.asset_type === AssetType.BLOCKCHAIN && a.logo_url === 'https://example.com/btc-logo.png')).toBeTruthy();
    const assets = await getAssets();
    if (assets instanceof Error) throw assets;
    expect(assets.some((a: Asset) => a.symbol === 'BTC' && a.name === 'Bitcoin' && a.asset_type === AssetType.BLOCKCHAIN && a.logo_url === 'https://example.com/btc-logo.png')).toBeTruthy();
  });

  it('should add multiple assets with addAssets', async () => {
    const newAssets = await addAssets([
      { name: 'Ethereum', symbol: 'ETH', asset_type: AssetType.BLOCKCHAIN, logo_url: 'https://example.com/eth-logo.png' },
      { name: 'Litecoin', symbol: 'LTC', asset_type: AssetType.BLOCKCHAIN, logo_url: 'https://example.com/ltc-logo.png' }
    ]);
    if (newAssets instanceof Error) throw newAssets;
    expect(newAssets.some((a: Asset) => a.symbol === 'ETH' && a.name === 'Ethereum' && a.asset_type === AssetType.BLOCKCHAIN && a.logo_url === 'https://example.com/eth-logo.png')).toBeTruthy();
    expect(newAssets.some((a: Asset) => a.symbol === 'LTC' && a.name === 'Litecoin' && a.asset_type === AssetType.BLOCKCHAIN && a.logo_url === 'https://example.com/ltc-logo.png')).toBeTruthy();
    const assets = await getAssets();
    if (assets instanceof Error) throw assets;
    expect(assets.some((a: Asset) => a.symbol === 'ETH' && a.name === 'Ethereum' && a.asset_type === AssetType.BLOCKCHAIN && a.logo_url === 'https://example.com/eth-logo.png')).toBeTruthy();
    expect(assets.some((a: Asset) => a.symbol === 'LTC' && a.name === 'Litecoin' && a.asset_type === AssetType.BLOCKCHAIN && a.logo_url === 'https://example.com/ltc-logo.png')).toBeTruthy();
  });

  it('should add and get price', async () => {
    // Add fiat asset first
    await addAsset({name: 'Canadian Dollar', symbol: 'CAD', asset_type: AssetType.FIAT, logo_url: 'https://example.com/cad-logo.png'});
    const assets = await getAssets();
    if (assets instanceof Error) throw assets;
    const asset_symbol = assets.find((a: Asset) => a.asset_type === AssetType.BLOCKCHAIN)?.symbol;
    if (!asset_symbol) throw new Error('No blockchain asset found');
    const fiat_symbol = assets.find((a: Asset) => a.asset_type === AssetType.FIAT)?.symbol;
    if (!fiat_symbol) throw new Error('No fiat asset found');
    const date = new Date('2024-06-01');
    const newPrice = await addPrice({unix_timestamp: date.getTime(), price: 65000, asset_symbol, fiat_symbol});
    if (newPrice instanceof Error) throw newPrice;
    expect(newPrice.some((p: Price) =>
      p.unix_timestamp === date.getTime() &&
      p.price === 65000 &&
      p.asset_symbol === asset_symbol &&
      p.fiat_symbol === fiat_symbol
    )).toBeTruthy();
    const prices = await getPrices();
    if (prices instanceof Error) throw prices;
    expect(prices.some((p: Price) =>
      p.unix_timestamp === date.getTime() &&
      p.price === 65000 &&
      p.asset_symbol === asset_symbol &&
      p.fiat_symbol === fiat_symbol
    )).toBeTruthy();
  });

  it('should add multiple prices with addPrices', async () => {
    const assets = await getAssets();
    if (assets instanceof Error) throw assets;
    const asset1 = assets.find((a: Asset) => a.symbol === 'BTC')?.symbol;
    if (!asset1) throw new Error('No blockchain asset found');
    const asset2 = assets.find((a: Asset) => a.symbol === 'ETH')?.symbol;
    if (!asset2) throw new Error('No blockchain asset found');
    const fiat = assets.find((a: Asset) => a.asset_type === AssetType.FIAT)?.symbol;
    if (!fiat) throw new Error('No fiat asset found');
    const date1 = new Date('2024-06-02');
    const date2 = new Date('2024-06-03');
    const newPrices = await addPrices([
      { unix_timestamp: date1.getTime(), price: 66000, asset_symbol: asset1, fiat_symbol: fiat },
      { unix_timestamp: date2.getTime(), price: 67000, asset_symbol: asset2, fiat_symbol: fiat }
    ]);
    if (newPrices instanceof Error) throw newPrices;
    expect(newPrices.some((p: Price) =>
      p.unix_timestamp === date1.getTime() &&
      p.price === 66000 &&
      p.asset_symbol === asset1 &&
      p.fiat_symbol === fiat
    )).toBeTruthy();
    expect(newPrices.some((p: Price) =>
      p.unix_timestamp === date2.getTime() &&
      p.price === 67000 &&
      p.asset_symbol === asset2 &&
      p.fiat_symbol === fiat
    )).toBeTruthy();
    const prices = await getPrices();
    if (prices instanceof Error) throw prices;
    expect(prices.some((p: Price) =>
      p.unix_timestamp === date1.getTime() &&
      p.price === 66000 &&
      p.asset_symbol === asset1 &&
      p.fiat_symbol === fiat
    )).toBeTruthy();
    expect(prices.some((p: Price) =>
      p.unix_timestamp === date2.getTime() &&
      p.price === 67000 &&
      p.asset_symbol === asset2 &&
      p.fiat_symbol === fiat
    )).toBeTruthy();
  });

  it('should add and get transaction with new columns', async () => {
    const assets = await getAssets();
    if (assets instanceof Error) throw assets;
    const asset1 = assets.find((a: Asset) => a.symbol === 'BTC')?.symbol;
    if (!asset1) throw new Error('No blockchain asset found');
    const asset2 = assets.find((a: Asset) => a.symbol === 'ETH')?.symbol;
    if (!asset2) throw new Error('No blockchain asset found');
    const fiat = assets.find((a: Asset) => a.asset_type === AssetType.FIAT)?.symbol;
    if (!fiat) throw new Error('No fiat asset found');
    const asset3 = assets.find((a: Asset) => a.symbol === 'LTC')?.symbol;
    if (!asset3) throw new Error('No blockchain asset found');
    const unix_timestamp = new Date('2024-06-01').getTime();
    const newTx = await addTransaction(
      {
        unix_timestamp,
        type: TransactionType.BUY,
        send_asset_symbol: asset1,
        send_asset_quantity: 1,
        receive_asset_symbol: asset2,
        receive_asset_quantity: 2,
        fee_asset_symbol: asset3,
        fee_asset_quantity: 3,
        is_income: true,
        notes: 'Test transaction'
      }
    );
    if (newTx instanceof Error) throw newTx;
    expect(newTx.some((t: Transaction) =>
      t.unix_timestamp === unix_timestamp &&
      t.type === TransactionType.BUY &&
      t.send_asset_symbol === asset1 &&
      t.send_asset_quantity === 1 &&
      t.receive_asset_symbol === asset2 &&
      t.receive_asset_quantity === 2 &&
      t.fee_asset_symbol === asset3 &&
      t.fee_asset_quantity === 3 &&
      !!t.is_income &&
      t.notes === 'Test transaction'
    )).toBeTruthy();
    const txs = await getTransactions();
    if (txs instanceof Error) throw txs;
    expect(txs.some((t: Transaction) =>
      t.unix_timestamp === unix_timestamp &&
      t.type === TransactionType.BUY &&
      t.send_asset_symbol === asset1 &&
      t.send_asset_quantity === 1 &&
      t.receive_asset_symbol === asset2 &&
      t.receive_asset_quantity === 2 &&
      t.fee_asset_symbol === asset3 &&
      t.fee_asset_quantity === 3 &&
      !!t.is_income &&
      t.notes === 'Test transaction'
    )).toBeTruthy();
  });

  it('should delete an asset', async () => {
    const newAsset = await addAsset({name: 'ToDelete', symbol: 'DEL', asset_type: AssetType.BLOCKCHAIN, logo_url: 'https://example.com/del-logo.png'});
    if (newAsset instanceof Error) throw newAsset;
    const symbol = newAsset[0].symbol;
    const result = await deleteAsset(symbol);
    if (result instanceof Error) throw result;
    const assets = await getAssets();
    if (assets instanceof Error) throw assets;
    expect(assets.some((a: Asset) => a.symbol === symbol)).toBeFalsy();
  });
});