#!/usr/bin/env node
// CSV import adapters for various third-party transaction exports. Each
// adapter normalizes a source format into the internal CSV schema, then
// POSTs to /api/import-transactions. The endpoint auto-creates any wallets
// or assets it doesn't recognize.
//
// Run from the repo root so the bare `papaparse` import resolves through
// the workspace's node_modules.
//
// Usage:
//   node examples/import_adapters.mjs --adapter <name> --input <path> [options]
//
// Adapters:
//   koinly             Koinly-style export
//                      Required: --input <file>
//                      Optional: --fiat <SYMBOL>  (default: CAD; controls the
//                                                 Sell-row column-swap heuristic)
//   coinbase           Coinbase transactions report (3-line preamble before
//                      the real header)
//                      Required: --input <file>, --wallet <name>
//   crypto.com         Crypto.com app `crypto_transactions_record_*.csv`
//                      Required: --input <file>, --wallet <name>
//   shakepay           Shakepay `crypto_transactions_summary_*.csv`
//                      Required: --input <file>, --wallet <name>
//   uphold             Uphold transactions export
//                      Required: --input <file>, --wallet <name>
//   metamask-bsc       Paired BSCScan native + token CSV exports.
//                      Required: --input <native.csv>, --token-input <token.csv>,
//                                --address <0x..>, --wallet <name>
//   trust-bch          Trust Wallet BCH statement (semicolon-separated)
//                      Required: --input <file>, --wallet <name>
//   trust-eth-tokens   Etherscan token transfer export for a given address
//                      Required: --input <file>, --address <0x..>, --wallet <name>
//   yield-app          Internal-format CSV; only useful flag is is_income
//                      handling (defaults to forcing every Receive to income
//                      since Yield.app data is purely interest accrual)
//                      Required: --input <file>, --wallet <name>
//
// Common options:
//   --server <url>     Server URL (default: http://localhost:3030)
//   --date-from <YYYY-MM-DD>  Drop rows with timestamps before this (UTC)
//   --date-to <YYYY-MM-DD>    Drop rows with timestamps on/after this (UTC)
//   --dry-run          Print stats and the first 5 normalized rows; don't POST.

import { readFileSync } from 'node:fs';
import { argv } from 'node:process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Papa = require('papaparse');

// --- CLI parsing -----------------------------------------------------------

const opts = {};
for (let i = 2; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) opts[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
}
const ADAPTER = opts.adapter;
const SERVER = opts.server || 'http://localhost:3030';
const DRY_RUN = !!opts['dry-run'];

const dateFromMs = opts['date-from'] ? Date.UTC(...parseYmd(opts['date-from'])) : -Infinity;
const dateToMs = opts['date-to'] ? Date.UTC(...parseYmd(opts['date-to'])) : Infinity;

function parseYmd(s) {
  const [y, m, d] = s.split('-').map(Number);
  return [y, m - 1, d];
}

if (!ADAPTER || opts.help) {
  console.error(readFileSync(new URL(import.meta.url)).toString().match(/\/\/ Usage:[\s\S]*?\n\n/)[0]);
  process.exit(opts.help ? 0 : 1);
}

const inWindow = ts => ts >= dateFromMs && ts < dateToMs;
const isoOf = ms => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const stripCommas = s => (typeof s === 'string' ? s.replace(/,/g, '').trim() : s);
const num = s => {
  const cleaned = stripCommas(s);
  if (cleaned === '' || cleaned === undefined || cleaned === null) return '';
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : '';
};
const sym = s => (s ? String(s).trim().toUpperCase() : '');
const emptyStr = s => {
  if (s === undefined || s === null) return '';
  const t = String(s).trim();
  return t === '' ? '' : t;
};

const stats = {};
const bumpStat = (k, n = 1) => { stats[k] = (stats[k] || 0) + n; };

function readCsv(path, { skipLines = 0, ...parseOpts } = {}) {
  const text = readFileSync(path, 'utf8');
  const body = skipLines ? text.split('\n').slice(skipLines).join('\n') : text;
  const parsed = Papa.parse(body, { header: true, skipEmptyLines: true, ...parseOpts });
  if (parsed.errors.length) console.error(`CSV parse errors in ${path}:`, parsed.errors.slice(0, 3));
  return parsed.data;
}

function requireOpts(...names) {
  for (const n of names) if (!opts[n]) {
    console.error(`Adapter ${ADAPTER} requires --${n}`);
    process.exit(1);
  }
}

// --- Adapters --------------------------------------------------------------

function adapterKoinly() {
  requireOpts('input');
  const FIAT_SYMBOL = (opts.fiat || 'CAD').toUpperCase();
  const TYPE_MAP = {
    Buy: 'Buy', Sell: 'Sell', Trade: 'Trade', Send: 'Send',
    Receive: 'Receive', Transfer: 'Transfer',
    Swap: 'Trade',  // exchange-style asset->asset swap
    Cost: 'Send',   // gas-only outflow with no receive side
  };

  // Convert "MM/DD/YYYY HH:MM:SS" -> ISO Z (Koinly export omits tz; treat UTC).
  const toIso = dateStr => {
    if (!dateStr) return '';
    const [date, time = '00:00:00'] = dateStr.trim().split(/\s+/);
    const [mm, dd, yyyy] = date.split('/');
    return `${yyyy}-${mm}-${dd}T${time}Z`;
  };

  const rows = readCsv(opts.input);
  const out = [];
  for (const row of rows) {
    const ts = Date.parse(toIso(row.Date));
    if (!inWindow(ts)) { bumpStat('skipped_window'); continue; }

    const rawType = (row.Type || '').trim();
    const type = TYPE_MAP[rawType];
    if (!type) { bumpStat(`skipped_type:${rawType}`); continue; }

    let send_asset_symbol = sym(row['Sent Currency']);
    let send_asset_quantity = num(row['Sent Amount']);
    let receive_asset_symbol = sym(row['Received Currency']);
    let receive_asset_quantity = num(row['Received Amount']);

    // Koinly puts fiat in "Sent" for Sells. Flip so send=disposed asset,
    // receive=fiat proceeds.
    if (type === 'Sell' && send_asset_symbol === FIAT_SYMBOL && receive_asset_symbol && receive_asset_symbol !== FIAT_SYMBOL) {
      [send_asset_symbol, receive_asset_symbol] = [receive_asset_symbol, send_asset_symbol];
      [send_asset_quantity, receive_asset_quantity] = [receive_asset_quantity, send_asset_quantity];
    }

    if (type === 'Send') { receive_asset_symbol = ''; receive_asset_quantity = ''; }
    else if (type === 'Receive') { send_asset_symbol = ''; send_asset_quantity = ''; }

    const sentWallet = emptyStr(row['Sent Wallet']);
    const receivedWallet = emptyStr(row['Received Wallet']);
    let from_wallet_name = '', to_wallet_name = '';
    if (type === 'Transfer') { from_wallet_name = sentWallet; to_wallet_name = receivedWallet; }
    else if (['Sell', 'Send', 'Trade'].includes(type)) from_wallet_name = sentWallet;
    else if (['Buy', 'Receive'].includes(type)) to_wallet_name = receivedWallet;

    const notes = emptyStr(row.Comment);
    const is_income = type === 'Receive' && /\b(reward|staking|airdrop|earn|yield|interest)\b/i.test(notes) ? 'true' : '';

    out.push({
      unix_timestamp: isoOf(ts), type,
      send_asset_symbol, send_asset_quantity,
      receive_asset_symbol, receive_asset_quantity,
      fee_asset_symbol: sym(row['Fee Currency']),
      fee_asset_quantity: num(row['Fee Amount']),
      is_income, notes, from_wallet_name, to_wallet_name,
    });
    bumpStat('emitted');
  }
  return out;
}

function adapterCoinbase() {
  requireOpts('input', 'wallet');
  const wallet = opts.wallet;
  // Coinbase prepends 3 metadata lines before the real header.
  const rows = readCsv(opts.input, { skipLines: 3 });
  const out = [];
  for (const r of rows) {
    const ts = Date.parse(r.Timestamp);
    if (!inWindow(ts)) { bumpStat('skipped_window'); continue; }
    const type = r['Transaction Type'];
    const asset = sym(r.Asset);
    const qty = num(r['Quantity Transacted']);
    const notes = emptyStr(r.Notes);

    if (type === 'Learning Reward' || type === 'Staking Income' || type === 'Reward Income') {
      out.push({
        unix_timestamp: isoOf(ts), type: 'Receive',
        receive_asset_symbol: asset, receive_asset_quantity: qty,
        is_income: 'true', notes, to_wallet_name: wallet,
      });
      bumpStat('income');
    } else if (type === 'Receive') {
      out.push({
        unix_timestamp: isoOf(ts), type: 'Receive',
        receive_asset_symbol: asset, receive_asset_quantity: qty,
        notes, to_wallet_name: wallet,
      });
      bumpStat('receive');
    } else if (type === 'Retail Staking Transfer') {
      // Coinbase-internal staking move. Skip per the project policy of
      // treating staked balances as still held in the parent wallet.
      bumpStat('skipped_internal_staking');
    } else {
      bumpStat(`skipped_type:${type}`);
    }
  }
  return out;
}

function adapterCryptoCom() {
  requireOpts('input', 'wallet');
  const wallet = opts.wallet;
  const rows = readCsv(opts.input);
  const out = [];

  // dust_conversion_debited rows pair with a single dust_conversion_credited
  // at the same timestamp. Multiple debits may share one credit; split the
  // credit evenly across them (FMV is not reliably present).
  const dustDebits = [];
  const dustCreditsByTs = {};

  for (const r of rows) {
    const ts = Date.parse(r['Timestamp (UTC)'].replace(' ', 'T') + 'Z');
    if (!inWindow(ts)) { bumpStat('skipped_window'); continue; }
    const kind = r['Transaction Kind'];
    const asset = sym(r.Currency);
    const qty = Math.abs(Number(r.Amount));
    const desc = emptyStr(r['Transaction Description']);

    // Earn / supercharger reward / admin credits → income
    if (
      kind === 'crypto_earn_interest_paid' ||
      kind === 'supercharger_reward_to_app_credited' ||
      kind === 'admin_wallet_credited' ||
      kind === 'finance.dpos.compound_interest.crypto_wallet' ||
      kind === 'finance.dpos.non_compound_interest.crypto_wallet' ||
      kind === 'rewards_platform_deposit_credited'
    ) {
      out.push({
        unix_timestamp: isoOf(ts), type: 'Receive',
        receive_asset_symbol: asset, receive_asset_quantity: qty,
        is_income: 'true', notes: desc, to_wallet_name: wallet,
      });
      bumpStat('income');
    } else if (kind === 'supercharger_withdrawal') {
      // Principal+rewards return — rewards already credited separately, so
      // model the withdrawal as a plain receive (not income).
      out.push({
        unix_timestamp: isoOf(ts), type: 'Receive',
        receive_asset_symbol: asset, receive_asset_quantity: qty,
        notes: desc, to_wallet_name: wallet,
      });
      bumpStat('receive');
    } else if (kind === 'crypto_withdrawal') {
      out.push({
        unix_timestamp: isoOf(ts), type: 'Send',
        send_asset_symbol: asset, send_asset_quantity: qty,
        notes: desc, from_wallet_name: wallet,
      });
      bumpStat('send');
    } else if (kind === 'dust_conversion_debited') {
      dustDebits.push({ ts, asset, qty, desc });
    } else if (kind === 'dust_conversion_credited') {
      (dustCreditsByTs[ts] ||= []).push({ ts, asset, qty, desc });
    } else if (
      kind === 'crypto_earn_program_created' ||
      kind === 'crypto_earn_program_withdrawn' ||
      kind === 'lockup_unlock' ||
      kind === 'supercharger_deposit' ||
      kind === 'finance.dpos.staking.crypto_wallet'
    ) {
      // Internal product-state transitions — no balance change.
      bumpStat(`skipped_internal:${kind}`);
    } else {
      bumpStat(`skipped_kind:${kind}`);
    }
  }

  const debitsByTs = {};
  for (const d of dustDebits) (debitsByTs[d.ts] ||= []).push(d);
  for (const [ts, debits] of Object.entries(debitsByTs)) {
    const credits = dustCreditsByTs[ts];
    if (!credits || credits.length !== 1) {
      bumpStat(`dust_unpaired_debits:${debits.length}`);
      continue;
    }
    for (const d of debits) {
      out.push({
        unix_timestamp: isoOf(Number(ts)), type: 'Trade',
        send_asset_symbol: d.asset, send_asset_quantity: d.qty,
        receive_asset_symbol: credits[0].asset,
        receive_asset_quantity: credits[0].qty / debits.length,
        notes: d.desc, from_wallet_name: wallet,
      });
      bumpStat('dust_trade');
    }
  }
  return out;
}

function adapterShakepay() {
  requireOpts('input', 'wallet');
  const wallet = opts.wallet;
  const rows = readCsv(opts.input);
  const out = [];
  for (const r of rows) {
    const ts = Date.parse(r.Date.replace(' ', 'T') + 'Z');
    if (!inWindow(ts)) { bumpStat('skipped_window'); continue; }
    const type = r.Type;
    if (type === 'Reward' || type === 'Receive') {
      out.push({
        unix_timestamp: isoOf(ts), type: 'Receive',
        receive_asset_symbol: sym(r['Asset Credited']),
        receive_asset_quantity: num(r['Amount Credited']),
        is_income: type === 'Reward' ? 'true' : '',
        notes: emptyStr(r.Description),
        to_wallet_name: wallet,
      });
      bumpStat(type === 'Reward' ? 'income' : 'receive');
    } else if (type === 'Buy') {
      // Buy uses fiat (Book Cost / Book Cost Currency) → crypto (Asset Credited).
      // Asset Debited is empty for Buys.
      out.push({
        unix_timestamp: isoOf(ts), type: 'Buy',
        send_asset_symbol: sym(r['Book Cost Currency']),
        send_asset_quantity: num(r['Book Cost']),
        receive_asset_symbol: sym(r['Asset Credited']),
        receive_asset_quantity: num(r['Amount Credited']),
        notes: emptyStr(r.Description),
        to_wallet_name: wallet,
      });
      bumpStat('buy');
    } else if (type === 'Send') {
      out.push({
        unix_timestamp: isoOf(ts), type: 'Send',
        send_asset_symbol: sym(r['Asset Debited']),
        send_asset_quantity: num(r['Amount Debited']),
        notes: emptyStr(r.Description),
        from_wallet_name: wallet,
      });
      bumpStat('send');
    } else {
      bumpStat(`skipped_type:${type}`);
    }
  }
  return out;
}

function adapterUphold() {
  requireOpts('input', 'wallet');
  const wallet = opts.wallet;
  const rows = readCsv(opts.input);
  const out = [];
  for (const r of rows) {
    const ts = Date.parse(r.Date);
    if (!inWindow(ts)) { bumpStat('skipped_window'); continue; }
    if (r.Type !== 'in') { bumpStat(`skipped_type:${r.Type}`); continue; }
    out.push({
      unix_timestamp: isoOf(ts), type: 'Receive',
      receive_asset_symbol: sym(r['Destination Currency']),
      receive_asset_quantity: num(r['Destination Amount']),
      is_income: 'true',
      notes: 'Brave Rewards',
      to_wallet_name: wallet,
    });
    bumpStat('income');
  }
  return out;
}

function adapterMetamaskBsc() {
  requireOpts('input', 'token-input', 'address', 'wallet');
  const ME = opts.address.toLowerCase();
  const wallet = opts.wallet;
  const native = readCsv(opts.input);
  const tokens = readCsv(opts['token-input']);
  const tokensByHash = {};
  for (const t of tokens) (tokensByHash[t['Transaction Hash']] ||= []).push(t);

  const out = [];
  for (const n of native) {
    const ts = Number(n.UnixTimestamp) * 1000;
    if (!inWindow(ts)) { bumpStat('skipped_window'); continue; }
    const fee = num(n['TxnFee(BNB)']);
    const method = n.Method || '';
    const tokenRows = tokensByHash[n['Transaction Hash']] || [];

    if (tokenRows.length === 0) {
      // No token movement → just gas. Model as Send of BNB.
      out.push({
        unix_timestamp: isoOf(ts), type: 'Send',
        send_asset_symbol: 'BNB', send_asset_quantity: fee,
        notes: `BSC ${method} ${n['Transaction Hash'].slice(0, 12)}`,
        from_wallet_name: wallet,
      });
      bumpStat('gas_only_send');
      continue;
    }
    if (tokenRows.length > 1) {
      bumpStat(`unhandled_multi_token:${tokenRows.length}`);
      continue;
    }
    const tk = tokenRows[0];
    const isReceive = tk.To.toLowerCase() === ME;
    const symbol = sym(tk.TokenSymbol);
    const value = num(tk.TokenValue);
    // Treat "Claim" methods as reward income; stake/unstake principal moves
    // (Withdraw All, Create Lock) are not income.
    const isIncome = isReceive && /claim/i.test(method);
    out.push({
      unix_timestamp: isoOf(ts),
      type: isReceive ? 'Receive' : 'Send',
      ...(isReceive
        ? { receive_asset_symbol: symbol, receive_asset_quantity: value, to_wallet_name: wallet }
        : { send_asset_symbol: symbol, send_asset_quantity: value, from_wallet_name: wallet }),
      fee_asset_symbol: 'BNB', fee_asset_quantity: fee,
      is_income: isIncome ? 'true' : '',
      notes: `BSC ${method} ${n['Transaction Hash'].slice(0, 12)}`,
    });
    bumpStat(isReceive ? (isIncome ? 'claim_income' : 'receive') : 'send');
  }
  return out;
}

function adapterTrustBch() {
  requireOpts('input', 'wallet');
  const wallet = opts.wallet;
  // The Trust BCH "Wallet statement" file mixes `;`-separated metadata at the
  // top with `;`-separated data rows after. Find numeric-prefixed lines.
  const text = readFileSync(opts.input, 'utf8');
  const out = [];
  for (const line of text.split('\n')) {
    if (!/^\d+;/.test(line)) continue;
    // tx_num;address;effect;ticker;amount_fiat;asset_rate;date;hash
    const cols = line.split(';');
    const ticker = sym(cols[3]);
    const effect = Number(cols[2]);
    const dateStr = cols[6].replace(/^"|"$/g, '');
    const ts = Date.parse(dateStr.replace(' ', 'T') + 'Z');
    if (!inWindow(ts)) { bumpStat('skipped_window'); continue; }
    if (effect <= 0) { bumpStat('skipped_non_receive'); continue; }
    out.push({
      unix_timestamp: isoOf(ts), type: 'Receive',
      receive_asset_symbol: ticker, receive_asset_quantity: effect,
      notes: cols[7].replace(/^"|"$/g, '').slice(0, 64),
      to_wallet_name: wallet,
    });
    bumpStat('receive');
  }
  return out;
}

function adapterTrustEthTokens() {
  requireOpts('input', 'address', 'wallet');
  const ME = opts.address.toLowerCase();
  const wallet = opts.wallet;
  const rows = readCsv(opts.input);
  const out = [];
  for (const r of rows) {
    const ts = Number(r.UnixTimestamp) * 1000;
    if (!inWindow(ts)) { bumpStat('skipped_window'); continue; }
    const isReceive = r.To.toLowerCase() === ME;
    const symbol = sym(r.TokenSymbol);
    const value = num(r.TokenValue);
    const note = `${r['Transaction Hash'].slice(0, 12)}`;
    if (isReceive) {
      out.push({
        unix_timestamp: isoOf(ts), type: 'Receive',
        receive_asset_symbol: symbol, receive_asset_quantity: value,
        notes: note, to_wallet_name: wallet,
      });
      bumpStat('receive');
    } else {
      out.push({
        unix_timestamp: isoOf(ts), type: 'Send',
        send_asset_symbol: symbol, send_asset_quantity: value,
        notes: note, from_wallet_name: wallet,
      });
      bumpStat('send');
    }
  }
  return out;
}

function adapterYieldApp() {
  requireOpts('input', 'wallet');
  const wallet = opts.wallet;
  const rows = readCsv(opts.input);
  const out = [];
  for (const r of rows) {
    const ts = Date.parse(r.timestamp);
    if (!inWindow(ts)) { bumpStat('skipped_window'); continue; }
    out.push({
      unix_timestamp: isoOf(ts), type: r.type,
      send_asset_symbol: emptyStr(r.send_asset_symbol),
      send_asset_quantity: emptyStr(r.send_asset_quantity),
      receive_asset_symbol: emptyStr(r.receive_asset_symbol),
      receive_asset_quantity: emptyStr(r.receive_asset_quantity),
      fee_asset_symbol: emptyStr(r.fee_asset_symbol),
      fee_asset_quantity: emptyStr(r.fee_asset_quantity),
      is_income: r.type === 'Receive' ? 'true' : '',
      notes: emptyStr(r.notes),
      to_wallet_name: r.type === 'Receive' ? wallet : '',
      from_wallet_name: r.type === 'Send' ? wallet : '',
    });
    bumpStat(`emitted_${r.type.toLowerCase()}`);
  }
  return out;
}

const ADAPTERS = {
  'koinly': adapterKoinly,
  'coinbase': adapterCoinbase,
  'crypto.com': adapterCryptoCom,
  'shakepay': adapterShakepay,
  'uphold': adapterUphold,
  'metamask-bsc': adapterMetamaskBsc,
  'trust-bch': adapterTrustBch,
  'trust-eth-tokens': adapterTrustEthTokens,
  'yield-app': adapterYieldApp,
};

const adapter = ADAPTERS[ADAPTER];
if (!adapter) {
  console.error(`Unknown adapter: ${ADAPTER}. Available: ${Object.keys(ADAPTERS).join(', ')}`);
  process.exit(1);
}

const rows = adapter();

console.error('--- Stats ---');
for (const [k, v] of Object.entries(stats).sort()) console.error(`  ${k}: ${v}`);
console.error(`--- Rows to POST: ${rows.length} ---`);

if (DRY_RUN) {
  console.error('\nDry run — first 5 rows:');
  console.error(rows.slice(0, 5));
  process.exit(0);
}

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

const resp = await fetch(`${SERVER}/api/import-transactions`, {
  method: 'POST',
  headers: { 'Content-Type': 'text/csv' },
  body: csv,
});
const result = await resp.json();
if (!resp.ok) {
  console.error('Import failed:', result);
  process.exit(1);
}
console.log(JSON.stringify(result, null, 2));
console.error(`\nDone. Inserted ${result.inserted}; skipped ${(result.skipped || []).length}.`);
