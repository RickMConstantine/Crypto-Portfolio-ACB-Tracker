#!/usr/bin/env node
// Transforms a Koinly-style CSV export into the internal transactions CSV
// format and POSTs it to /api/import-transactions.
//
// Usage:
//   node examples/import_koinly.mjs <input.csv> [serverUrl]
//
// Run from the repo root so the bare `papaparse` import resolves through
// the workspace's node_modules.
//
// Source columns (Koinly export):
//   Date,Source,Wallet/Exchange,Wallet/Exchange (User Defined Name),Type,
//   Received Amount,Received Currency,Received Wallet,Received Address,Received Tag,
//   Sent Amount,Sent Currency,Sent Wallet,Sent Address,Sent Tag,
//   Fee Amount,Fee Currency,Capital Gain/Loss,Comment

import { readFileSync } from 'node:fs';
import { argv } from 'node:process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Papa = require('papaparse');

const [, , inputPath, serverUrl = 'http://localhost:3030'] = argv;
if (!inputPath) {
  console.error('Usage: node examples/import_koinly.mjs <input.csv> [serverUrl]');
  process.exit(1);
}

const FIAT_SYMBOL = 'CAD';

const TYPE_MAP = {
  Buy: 'Buy',
  Sell: 'Sell',
  Trade: 'Trade',
  Send: 'Send',
  Receive: 'Receive',
  Transfer: 'Transfer',
  Swap: 'Trade',  // exchange-style asset->asset swap
  Cost: 'Send',   // gas-only outflow
};

const stripCommas = s => (typeof s === 'string' ? s.replace(/,/g, '').trim() : s);
const num = s => {
  const cleaned = stripCommas(s);
  if (!cleaned) return '';
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : '';
};
const sym = s => (s ? String(s).trim().toUpperCase() : '');
const wallet = s => {
  const v = (s ?? '').toString().trim();
  return v;
};

// Convert "MM/DD/YYYY HH:MM:SS" -> ISO Z (treat as UTC since the export
// doesn't carry tz info; this matches what the existing example CSV does).
const toIso = dateStr => {
  if (!dateStr) return '';
  const [date, time = '00:00:00'] = dateStr.trim().split(/\s+/);
  const [mm, dd, yyyy] = date.split('/');
  return `${yyyy}-${mm}-${dd}T${time}Z`;
};

const csvText = readFileSync(inputPath, 'utf8');
const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
if (parsed.errors.length) {
  console.error('CSV parse errors:', parsed.errors.slice(0, 3));
}

let dropped = 0;
const internalRows = [];
for (const row of parsed.data) {
  const rawType = (row.Type || '').trim();
  const type = TYPE_MAP[rawType];
  if (!type) {
    dropped++;
    continue;
  }

  let send_asset_symbol = sym(row['Sent Currency']);
  let send_asset_quantity = num(row['Sent Amount']);
  let receive_asset_symbol = sym(row['Received Currency']);
  let receive_asset_quantity = num(row['Received Amount']);

  // Koinly puts fiat in the "Sent" columns for Sell rows; flip so send=disposed
  // asset and receive=fiat proceeds, which is what the internal model expects.
  if (
    type === 'Sell' &&
    send_asset_symbol === FIAT_SYMBOL &&
    receive_asset_symbol &&
    receive_asset_symbol !== FIAT_SYMBOL
  ) {
    [send_asset_symbol, receive_asset_symbol] = [receive_asset_symbol, send_asset_symbol];
    [send_asset_quantity, receive_asset_quantity] = [receive_asset_quantity, send_asset_quantity];
  }

  // Send/Receive can only have one side populated per the validator.
  if (type === 'Send') {
    receive_asset_symbol = '';
    receive_asset_quantity = '';
  } else if (type === 'Receive') {
    send_asset_symbol = '';
    send_asset_quantity = '';
  }

  // Wallet rules: dispositions get from_wallet only, acquisitions get
  // to_wallet only, transfers get both.
  const sentWallet = wallet(row['Sent Wallet']);
  const receivedWallet = wallet(row['Received Wallet']);
  let from_wallet_name = '';
  let to_wallet_name = '';
  if (type === 'Transfer') {
    from_wallet_name = sentWallet;
    to_wallet_name = receivedWallet;
  } else if (['Sell', 'Send', 'Trade'].includes(type)) {
    from_wallet_name = sentWallet;
  } else if (['Buy', 'Receive'].includes(type)) {
    to_wallet_name = receivedWallet;
  }

  // Income heuristic: tag rewards/staking/airdrops/earn/yield receives.
  const notes = (row.Comment || '').trim();
  const is_income =
    type === 'Receive' && /\b(reward|staking|airdrop|earn|yield|interest)\b/i.test(notes)
      ? 'true'
      : '';

  internalRows.push({
    unix_timestamp: toIso(row.Date),
    type,
    send_asset_symbol,
    send_asset_quantity,
    receive_asset_symbol,
    receive_asset_quantity,
    fee_asset_symbol: sym(row['Fee Currency']),
    fee_asset_quantity: num(row['Fee Amount']),
    is_income,
    notes,
    from_wallet_name,
    to_wallet_name,
  });
}

const internalCsv = Papa.unparse(internalRows, {
  columns: [
    'unix_timestamp', 'type',
    'send_asset_symbol', 'send_asset_quantity',
    'receive_asset_symbol', 'receive_asset_quantity',
    'fee_asset_symbol', 'fee_asset_quantity',
    'is_income', 'notes',
    'from_wallet_name', 'to_wallet_name',
  ],
});

console.error(`Transformed ${internalRows.length} rows (dropped ${dropped} with unsupported types)`);
console.error(`POSTing to ${serverUrl}/api/import-transactions ...`);

const resp = await fetch(`${serverUrl}/api/import-transactions`, {
  method: 'POST',
  headers: { 'Content-Type': 'text/csv' },
  body: internalCsv,
});

const result = await resp.json();
if (!resp.ok) {
  console.error('Import failed:', result);
  process.exit(1);
}
console.log(JSON.stringify(result, null, 2));
console.error(`\nDone. Inserted ${result.inserted}; skipped ${(result.skipped || []).length}.`);
