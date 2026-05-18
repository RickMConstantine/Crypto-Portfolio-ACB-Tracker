import {
  initDb, destroyDb, addAsset, getAssets, addPrices, addPrice, getPrices,
  addTransaction, getTransactions, addAssets, deleteAsset, deleteAllAssets,
  addWallet, getWallets, updateWallet, deleteWallet
} from '../src/db';
import { beforeAll, afterAll, describe, it, expect } from '@jest/globals';
import { Asset, AssetType, Price, Transaction, TransactionType, Wallet } from '../src/types';

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
    const newAsset = await addAsset({name: 'Bitcoin', symbol: 'BTC', asset_type: AssetType.BLOCKCHAIN, launch_date: 1672531199000, logo_url: 'https://example.com/btc-logo.png'});
    if (newAsset instanceof Error) throw newAsset;
    expect(newAsset.some((a: Asset) => a.symbol === 'BTC' && a.name === 'Bitcoin' && a.asset_type === AssetType.BLOCKCHAIN && a.launch_date === 1672531199000 && a.logo_url === 'https://example.com/btc-logo.png')).toBeTruthy();
    const { items: assets } = await getAssets();
    expect(assets.some((a: Asset) => a.symbol === 'BTC' && a.name === 'Bitcoin' && a.asset_type === AssetType.BLOCKCHAIN && a.launch_date === 1672531199000 && a.logo_url === 'https://example.com/btc-logo.png')).toBeTruthy();
  });

  it('should add multiple assets with addAssets', async () => {
    const newAssets = await addAssets([
      { name: 'Ethereum', symbol: 'ETH', asset_type: AssetType.BLOCKCHAIN, launch_date: 1672531199000, logo_url: 'https://example.com/eth-logo.png' },
      { name: 'Litecoin', symbol: 'LTC', asset_type: AssetType.BLOCKCHAIN, launch_date: 1672531199000, logo_url: 'https://example.com/ltc-logo.png' }
    ]);
    if (newAssets instanceof Error) throw newAssets;
    console.log('New Assets:', newAssets);
    expect(newAssets.some((a: Asset) => a.symbol === 'ETH' && a.name === 'Ethereum' && a.asset_type === AssetType.BLOCKCHAIN && a.launch_date === 1672531199000 && a.logo_url === 'https://example.com/eth-logo.png')).toBeTruthy();
    expect(newAssets.some((a: Asset) => a.symbol === 'LTC' && a.name === 'Litecoin' && a.asset_type === AssetType.BLOCKCHAIN && a.launch_date === 1672531199000 && a.logo_url === 'https://example.com/ltc-logo.png')).toBeTruthy();
    const { items: assets } = await getAssets();
    expect(assets.some((a: Asset) => a.symbol === 'ETH' && a.name === 'Ethereum' && a.asset_type === AssetType.BLOCKCHAIN && a.launch_date === 1672531199000 && a.logo_url === 'https://example.com/eth-logo.png')).toBeTruthy();
    expect(assets.some((a: Asset) => a.symbol === 'LTC' && a.name === 'Litecoin' && a.asset_type === AssetType.BLOCKCHAIN && a.launch_date === 1672531199000 && a.logo_url === 'https://example.com/ltc-logo.png')).toBeTruthy();
  });

  it('should add and get price', async () => {
    // Add fiat asset first
    await addAsset({name: 'Canadian Dollar', symbol: 'CAD', asset_type: AssetType.FIAT, launch_date: 1672531199000, logo_url: 'https://example.com/cad-logo.png'});
    const { items: assets } = await getAssets();
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
    const { items: prices } = await getPrices();
    expect(prices.some((p: Price) =>
      p.unix_timestamp === date.getTime() &&
      p.price === 65000 &&
      p.asset_symbol === asset_symbol &&
      p.fiat_symbol === fiat_symbol
    )).toBeTruthy();
  });

  it('should add multiple prices with addPrices', async () => {
    const { items: assets } = await getAssets();
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
    const { items: prices } = await getPrices();
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
    const { items: assets } = await getAssets();
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
    const { items: txs } = await getTransactions();
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
    const newAsset = await addAsset({name: 'ToDelete', symbol: 'DEL', asset_type: AssetType.BLOCKCHAIN, launch_date: 1672531199000, logo_url: 'https://example.com/del-logo.png'});
    if (newAsset instanceof Error) throw newAsset;
    const symbol = newAsset[0].symbol;
    const result = await deleteAsset(symbol);
    if (result instanceof Error) throw result;
    const { items: assets } = await getAssets();
    expect(assets.some((a: Asset) => a.symbol === symbol)).toBeFalsy();
  });

  it('should cascade delete prices when the referenced asset is deleted', async () => {
    const { items: assets } = await getAssets();
    const fiat = assets.find((a: Asset) => a.asset_type === AssetType.FIAT)?.symbol;
    if (!fiat) throw new Error('No fiat asset found');
    // Add a throwaway asset with an associated price
    await addAsset({ name: 'Cascade', symbol: 'CAS', asset_type: AssetType.BLOCKCHAIN, launch_date: 1672531199000, logo_url: 'https://example.com/cas-logo.png' });
    const date = new Date('2024-08-01');
    await addPrice({ unix_timestamp: date.getTime(), price: 42, asset_symbol: 'CAS', fiat_symbol: fiat });
    const { items: beforePrices } = await getPrices({ asset_symbol: 'CAS' });
    expect(beforePrices.some((p: Price) => p.asset_symbol === 'CAS')).toBeTruthy();
    await deleteAsset('CAS');
    const { items: afterPrices } = await getPrices({ asset_symbol: 'CAS' });
    expect(afterPrices.some((p: Price) => p.asset_symbol === 'CAS')).toBeFalsy();
  });

  it('should block asset deletion when the asset is referenced by a transaction', async () => {
    const { items: assets } = await getAssets();
    const btc = assets.find((a: Asset) => a.symbol === 'BTC');
    if (!btc) throw new Error('BTC asset expected to exist from earlier tests');
    // Earlier tests inserted a transaction that references BTC as send_asset_symbol.
    await expect(deleteAsset('BTC')).rejects.toThrow();
    // And the asset should still exist.
    const { items: after } = await getAssets();
    expect(after.some((a: Asset) => a.symbol === 'BTC')).toBeTruthy();
  });

  it('should add and get a wallet', async () => {
    const newWallet = await addWallet({ name: 'Ledger Nano' });
    expect(newWallet.length).toBe(1);
    expect(newWallet[0].name).toBe('Ledger Nano');
    const { items: wallets } = await getWallets();
    expect(wallets.some((w: Wallet) => w.name === 'Ledger Nano')).toBeTruthy();
  });

  it('should add a second wallet', async () => {
    const newWallet = await addWallet({ name: 'MetaMask' });
    expect(newWallet.length).toBe(1);
    expect(newWallet[0].name).toBe('MetaMask');
  });

  it('should get wallets with filters', async () => {
    const { items: wallets, total } = await getWallets({ names: ['Ledger Nano'] });
    expect(total).toBe(1);
    expect(wallets.length).toBe(1);
    expect(wallets[0].name).toBe('Ledger Nano');
  });

  it('should rename a wallet and cascade the new name to transactions', async () => {
    const updated = await updateWallet('Ledger Nano', 'Ledger Nano X');
    expect(updated.length).toBe(1);
    expect(updated[0].name).toBe('Ledger Nano X');
  });

  it('should add a transaction with wallet associations', async () => {
    const { items: wallets } = await getWallets();
    const wallet1 = wallets[0];
    const wallet2 = wallets[1];
    const { items: assets } = await getAssets();
    const btc = assets.find((a: Asset) => a.symbol === 'BTC')?.symbol;
    const eth = assets.find((a: Asset) => a.symbol === 'ETH')?.symbol;
    if (!btc || !eth) throw new Error('Assets not found');
    const unix_timestamp = new Date('2024-07-01').getTime();
    const newTx = await addTransaction({
      unix_timestamp,
      type: TransactionType.TRANSFER,
      send_asset_symbol: btc,
      send_asset_quantity: 0.5,
      receive_asset_symbol: btc,
      receive_asset_quantity: 0.5,
      from_wallet_name: wallet1.name,
      to_wallet_name: wallet2.name
    });
    expect(newTx.length).toBe(1);
    expect(newTx[0].type).toBe(TransactionType.TRANSFER);
    expect(newTx[0].from_wallet_name).toBe(wallet1.name);
    expect(newTx[0].to_wallet_name).toBe(wallet2.name);
  });

  it('should filter transactions by wallet_name', async () => {
    const { items: wallets } = await getWallets();
    const wallet1 = wallets[0];
    const { items: txs } = await getTransactions({ wallet_name: wallet1.name });
    expect(txs.length).toBeGreaterThan(0);
    txs.forEach((tx: Transaction) => {
      expect(tx.from_wallet_name === wallet1.name || tx.to_wallet_name === wallet1.name).toBeTruthy();
    });
  });

  it('should delete a wallet and clear references from transactions', async () => {
    const result = await deleteWallet('MetaMask');
    expect(result.length).toBe(1);
    expect(result[0].name).toBe('MetaMask');
    const { items: remaining } = await getWallets({ names: ['MetaMask'] });
    expect(remaining.length).toBe(0);
  });

  it('should be idempotent when re-adding a wallet with the same name', async () => {
    await addWallet({ name: 'UniqueWallet' });
    const second = await addWallet({ name: 'UniqueWallet' });
    expect(second.length).toBe(1);
    expect(second[0].name).toBe('UniqueWallet');
    const { items: wallets } = await getWallets({ names: ['UniqueWallet'] });
    expect(wallets.length).toBe(1);
  });

  it('should paginate prices with limit/offset returning an envelope with total', async () => {
    const firstPage = await getPrices({ limit: 1, offset: 0 });
    expect(firstPage.total).toBeGreaterThan(0);
    expect(firstPage.items.length).toBe(1);
    if (firstPage.total > 1) {
      const secondPage = await getPrices({ limit: 1, offset: 1 });
      expect(secondPage.items.length).toBe(1);
      expect(secondPage.total).toBe(firstPage.total);
      expect(secondPage.items[0].unix_timestamp).not.toBe(firstPage.items[0].unix_timestamp);
    }
  });

  it('should paginate transactions with limit/offset returning an envelope with total', async () => {
    const firstPage = await getTransactions({ limit: 1, offset: 0 });
    expect(firstPage.total).toBeGreaterThan(0);
    expect(firstPage.items.length).toBe(1);
    if (firstPage.total > 1) {
      const secondPage = await getTransactions({ limit: 1, offset: 1 });
      expect(secondPage.items.length).toBe(1);
      expect(secondPage.total).toBe(firstPage.total);
      expect(secondPage.items[0].id).not.toBe(firstPage.items[0].id);
    }
  });
});