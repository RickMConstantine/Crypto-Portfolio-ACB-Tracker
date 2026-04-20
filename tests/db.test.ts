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
    const assets = await getAssets();
    if (assets instanceof Error) throw assets;
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
    const assets = await getAssets();
    if (assets instanceof Error) throw assets;
    expect(assets.some((a: Asset) => a.symbol === 'ETH' && a.name === 'Ethereum' && a.asset_type === AssetType.BLOCKCHAIN && a.launch_date === 1672531199000 && a.logo_url === 'https://example.com/eth-logo.png')).toBeTruthy();
    expect(assets.some((a: Asset) => a.symbol === 'LTC' && a.name === 'Litecoin' && a.asset_type === AssetType.BLOCKCHAIN && a.launch_date === 1672531199000 && a.logo_url === 'https://example.com/ltc-logo.png')).toBeTruthy();
  });

  it('should add and get price', async () => {
    // Add fiat asset first
    await addAsset({name: 'Canadian Dollar', symbol: 'CAD', asset_type: AssetType.FIAT, launch_date: 1672531199000, logo_url: 'https://example.com/cad-logo.png'});
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
    const newAsset = await addAsset({name: 'ToDelete', symbol: 'DEL', asset_type: AssetType.BLOCKCHAIN, launch_date: 1672531199000, logo_url: 'https://example.com/del-logo.png'});
    if (newAsset instanceof Error) throw newAsset;
    const symbol = newAsset[0].symbol;
    const result = await deleteAsset(symbol);
    if (result instanceof Error) throw result;
    const assets = await getAssets();
    if (assets instanceof Error) throw assets;
    expect(assets.some((a: Asset) => a.symbol === symbol)).toBeFalsy();
  });

  it('should add and get a wallet', async () => {
    const newWallet = await addWallet({ name: 'Ledger Nano', description: 'Hardware wallet' });
    expect(newWallet.length).toBe(1);
    expect(newWallet[0].name).toBe('Ledger Nano');
    expect(newWallet[0].description).toBe('Hardware wallet');
    expect(newWallet[0].id).toBeDefined();
    const wallets = await getWallets();
    expect(wallets.some((w: Wallet) => w.name === 'Ledger Nano' && w.description === 'Hardware wallet')).toBeTruthy();
  });

  it('should add a wallet without description', async () => {
    const newWallet = await addWallet({ name: 'MetaMask' });
    expect(newWallet.length).toBe(1);
    expect(newWallet[0].name).toBe('MetaMask');
    expect(newWallet[0].description).toBeNull();
  });

  it('should get wallets with filters', async () => {
    const wallets = await getWallets({ names: ['Ledger Nano'] });
    expect(wallets.length).toBe(1);
    expect(wallets[0].name).toBe('Ledger Nano');

    const byId = await getWallets({ ids: [wallets[0].id] });
    expect(byId.length).toBe(1);
    expect(byId[0].name).toBe('Ledger Nano');
  });

  it('should update a wallet', async () => {
    const wallets = await getWallets({ names: ['Ledger Nano'] });
    const id = wallets[0].id;
    const updated = await updateWallet(id, 'Ledger Nano X', 'Updated hardware wallet');
    expect(updated.length).toBe(1);
    expect(updated[0].name).toBe('Ledger Nano X');
    expect(updated[0].description).toBe('Updated hardware wallet');
  });

  it('should add a transaction with wallet associations', async () => {
    const wallets = await getWallets();
    const wallet1 = wallets[0];
    const wallet2 = wallets[1];
    const assets = await getAssets();
    const btc = assets.find((a: Asset) => a.symbol === 'BTC')?.symbol;
    const eth = assets.find((a: Asset) => a.symbol === 'ETH')?.symbol;
    if (!btc || !eth) throw new Error('Assets not found');
    const unix_timestamp = new Date('2024-07-01').getTime();
    const newTx = await addTransaction({
      unix_timestamp,
      type: TransactionType.SEND,
      send_asset_symbol: btc,
      send_asset_quantity: 0.5,
      from_wallet_id: wallet1.id,
      to_wallet_id: wallet2.id
    });
    expect(newTx.length).toBe(1);
    expect(newTx[0].from_wallet_id).toBe(wallet1.id);
    expect(newTx[0].to_wallet_id).toBe(wallet2.id);
  });

  it('should filter transactions by wallet_id', async () => {
    const wallets = await getWallets();
    const wallet1 = wallets[0];
    const txs = await getTransactions({ wallet_id: wallet1.id });
    expect(txs.length).toBeGreaterThan(0);
    txs.forEach((tx: Transaction) => {
      expect(tx.from_wallet_id === wallet1.id || tx.to_wallet_id === wallet1.id).toBeTruthy();
    });
  });

  it('should delete a wallet and clear references from transactions', async () => {
    const wallets = await getWallets({ names: ['MetaMask'] });
    const id = wallets[0].id;
    const result = await deleteWallet(id);
    expect(result.length).toBe(1);
    expect(result[0].name).toBe('MetaMask');
    const remaining = await getWallets({ ids: [id] });
    expect(remaining.length).toBe(0);
  });

  it('should reject duplicate wallet names', async () => {
    await addWallet({ name: 'UniqueWallet' });
    await expect(addWallet({ name: 'UniqueWallet' })).rejects.toThrow();
  });
});