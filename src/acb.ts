import Decimal from 'decimal.js';
import { getAssets, getLatestPrice, getTransactions } from './db';
import {
  AcbDataDecimal,
  AcbDataNumber,
  AssetType,
  Price,
  Transaction,
  TransactionType,
} from './types';

// ===============================================================
// Adjusted Cost Base (ACB) calculations
// ---------------------------------------------------------------
// Extracted from server.ts so the tax math lives in one module and
// can be unit-tested in isolation.
// ===============================================================

async function getAsset(symbol: string) {
  const { items } = await getAssets({ symbols: [symbol] });
  if (!items.length) throw new Error(`No asset found for symbol ${symbol}`);
  return items[0];
}

function getPrice(symbol: string, priceCache: Record<string, Price>): number {
  if (!priceCache[symbol] || !priceCache[symbol].price) {
    throw new Error(`No valid price found for asset_symbol ${symbol}.`);
  }
  return priceCache[symbol].price;
}

// Net units of `asset_symbol` held as of (and including) the given timestamp,
// replaying acquisitions (Buy/Receive/Trade receive), dispositions
// (Sell/Send/Trade send), and fees paid in the asset. Transfers of the same
// asset net to zero. Used to test CRA's "still owns" condition below.
function unitsHeldAt(txs: Transaction[], asof: number, asset_symbol: string): Decimal {
  let units = new Decimal(0);
  for (const t of txs) {
    if (t.unix_timestamp > asof) break; // txs are sorted ascending
    if (t.receive_asset_symbol === asset_symbol && t.receive_asset_quantity) {
      units = units.plus(t.receive_asset_quantity);
    }
    if (t.send_asset_symbol === asset_symbol && t.send_asset_quantity) {
      units = units.minus(t.send_asset_quantity);
    }
    if (t.fee_asset_symbol === asset_symbol && t.fee_asset_quantity) {
      units = units.minus(t.fee_asset_quantity);
    }
  }
  return units;
}

// Superficial Loss (as defined by CRA)
// https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/personal-income/line-12700-capital-gains/capital-losses-deductions.html#toc7
// A superficial loss can occur when you dispose of capital property for a loss and both of the following conditions are met:
// You, or a person affiliated with you, buys, or has a right to buy, the same or identical property (called "substituted property") during the period starting 30 calendar days before the sale and ending 30 calendar days after the sale
// You, or a person affiliated with you, still owns, or has a right to buy, the substituted property 30 calendar days after the sale
//
// *** Assuming that:
// - this tx has (already) been identified as a capital loss
// - txs are sorted by unix_timestamp ascending
export function isSuperficialLoss(tx: Transaction, txs: Transaction[], i: number, asset_symbol: string): boolean {
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
  const windowEnd = tx.unix_timestamp + THIRTY_DAYS;
  const windowStart = tx.unix_timestamp - THIRTY_DAYS;

  // Condition 1: identical property (re)purchased in the [-30d, +30d] window.
  let repurchasedInWindow = false;
  // Repurchase within 30 days after disposition.
  for (let j = i + 1; j < txs.length; j++) {
    const nextTx = txs[j];
    if (nextTx.unix_timestamp > windowEnd) break;
    if (
      [TransactionType.BUY, TransactionType.TRADE].includes(nextTx.type) &&
      nextTx.receive_asset_symbol === asset_symbol &&
      nextTx.receive_asset_quantity &&
      nextTx.unix_timestamp > tx.unix_timestamp &&
      nextTx.unix_timestamp <= windowEnd
    ) {
      repurchasedInWindow = true;
      break;
    }
  }
  // Repurchase within 30 days before disposition.
  if (!repurchasedInWindow) {
    for (let j = i - 1; j >= 0; j--) {
      const prevTx = txs[j];
      if (prevTx.unix_timestamp < windowStart) break;
      if (
        [TransactionType.BUY, TransactionType.TRADE].includes(prevTx.type) &&
        prevTx.receive_asset_symbol === asset_symbol &&
        prevTx.receive_asset_quantity &&
        prevTx.unix_timestamp < tx.unix_timestamp &&
        prevTx.unix_timestamp >= windowStart
      ) {
        repurchasedInWindow = true;
        break;
      }
    }
  }
  if (!repurchasedInWindow) return false;

  // Condition 2: the substituted property is still held at the end of the
  // 30-day window after the disposition. If the position has been fully
  // disposed of (and not re-acquired) by then, the loss is NOT superficial.
  // A small epsilon absorbs import dust so negligible residue isn't treated
  // as a holding.
  const DUST = new Decimal(1e-9);
  return unitsHeldAt(txs, windowEnd, asset_symbol).greaterThan(DUST);
}

/**
 * Calculate Adjusted Cost Base (ACB) for a given asset symbol.
 * Returns yearly totals keyed by 4-digit year string, plus a 'TOTALS'
 * entry summarizing the entire history.
 */
export async function calculateACB(asset_symbol: string): Promise<Record<string, AcbDataNumber>> {
  if (!asset_symbol) throw new Error('Asset symbol is required');

  // Fetch asset
  const asset = await getAsset(asset_symbol);

  // Fetch fiat symbol (assume only one fiat asset)
  const { items: fiatAssets } = await getAssets({ asset_types: [AssetType.FIAT] });
  if (!fiatAssets.length) throw new Error('No fiat asset set');
  const fiat_symbol = fiatAssets[0].symbol;

  // Fetch all transactions where asset is send, receive, or fee asset, ordered by date
  const { items: txs } = await getTransactions({ asset: asset_symbol });

  let acb = new Decimal(0);
  let totalUnits = new Decimal(0);
  let totalProceeds = new Decimal(0);
  let totalCosts = new Decimal(0);
  let totalOutlays = new Decimal(0);
  let totalGainLoss = new Decimal(0);
  let superficialLosses = new Decimal(0);
  let totalIncome = new Decimal(0);

  // Per-year aggregates
  const yearlyTotals: Record<string, AcbDataDecimal> = {};

  for (let i = 0; i < txs.length; i++) {
    const tx = txs[i];
    const year = new Date(tx.unix_timestamp).getFullYear().toString();
    if (!yearlyTotals[year]) {
      yearlyTotals[year] = {
        acb: acb,
        totalUnits: totalUnits,
        totalProceeds: new Decimal(0),
        totalCosts: new Decimal(0),
        totalOutlays: new Decimal(0),
        totalGainLoss: new Decimal(0),
        superficialLosses: new Decimal(0),
        totalIncome: new Decimal(0),
      };
    }

    try {
      const priceCache: Record<string, Price> = {};
      for (const symbol of [tx.send_asset_symbol, tx.receive_asset_symbol, tx.fee_asset_symbol]) {
        if (!symbol || symbol === fiat_symbol || priceCache[symbol]) continue;
        const assetprice = await getLatestPrice(symbol, fiat_symbol, tx.unix_timestamp);
        if (assetprice instanceof Error) throw assetprice;
        priceCache[symbol] = assetprice;
      };

      // --- Sell/Send/Trade: Disposition ---
      if ([TransactionType.SELL, TransactionType.SEND, TransactionType.TRADE].includes(tx.type) && tx.send_asset_symbol === asset_symbol) {
        if (!tx.send_asset_quantity) {
          throw new Error(`No valid send quantity found for transaction ${tx.id} of type ${tx.type}`);
        };
        if ((tx.type === TransactionType.SELL && tx.receive_asset_symbol !== fiat_symbol) ||
            ((tx.type === TransactionType.SELL || tx.type === TransactionType.TRADE) && (!tx.receive_asset_symbol || !tx.receive_asset_quantity))) {
          throw new Error(`No valid receive asset found for transaction ${tx.id} of type ${tx.type}`);
        };
        if (totalUnits.lessThanOrEqualTo(0)) {
          throw new Error(`Cannot sell ${asset_symbol} because no units are available`);
        }
        // Proceeds
        let proceeds = new Decimal(0);
        if (tx.type === TransactionType.SELL) {
          proceeds = new Decimal(tx.receive_asset_quantity!);
        } else if (tx.type === TransactionType.SEND) {
          // Can't easily determine the FMV/floor of NFTs sent/gifted, hence just leave as 0
          if (asset.asset_type === AssetType.BLOCKCHAIN) {
            proceeds = new Decimal(tx.send_asset_quantity).times(getPrice(tx.send_asset_symbol, priceCache)); // FMV of Send Asset
          }
        } else if (tx.type === TransactionType.TRADE) {
          // Can't easily determine FMV/floor of NFTs sent or received, handle accordingly
          const receiveAsset = await getAsset(tx.receive_asset_symbol!);
          if (receiveAsset.asset_type === AssetType.BLOCKCHAIN) {
            proceeds = new Decimal(tx.receive_asset_quantity!).times(getPrice(tx.receive_asset_symbol!, priceCache)); // FMV of Receive Asset
          } else if (asset.asset_type === AssetType.BLOCKCHAIN) {
            proceeds = new Decimal(tx.send_asset_quantity).times(getPrice(tx.send_asset_symbol, priceCache)); // FMV of Send Asset
          }
        }
        // Fees (Outlays) - Only applicable for SELL and SEND. BUY, RECEIVE, TRADE will instead include fee back into ACB of the acquired asset.
        let fee = new Decimal(0);
        if (tx.type !== TransactionType.TRADE) {
          if (tx.fee_asset_symbol === fiat_symbol && tx.fee_asset_quantity) {
            fee = new Decimal(tx.fee_asset_quantity);
          } else if (tx.fee_asset_symbol && tx.fee_asset_quantity) {
            if (!priceCache[tx.fee_asset_symbol] || !priceCache[tx.fee_asset_symbol].price) {
              throw new Error(`No valid price found for asset_symbol ${asset_symbol} and transaction ${tx.id} of type ${tx.type}`);
            }
            fee = new Decimal(tx.fee_asset_quantity).times(getPrice(tx.fee_asset_symbol, priceCache)); // FMV of Fee Asset
          }
        }
        // Costs + ACB
        const cost = new Decimal(tx.send_asset_quantity).div(totalUnits).times(acb);
        acb = acb.minus(cost);
        totalUnits = totalUnits.minus(tx.send_asset_quantity);
        totalProceeds = totalProceeds.plus(proceeds); // 'Realizing' proceeds
        totalCosts = totalCosts.plus(cost); // 'Realizing' costs
        totalOutlays = totalOutlays.plus(fee); // 'Realizing' outlays
        yearlyTotals[year].acb = yearlyTotals[year].acb.minus(cost);
        yearlyTotals[year].totalUnits = yearlyTotals[year].totalUnits.minus(tx.send_asset_quantity);
        yearlyTotals[year].totalProceeds = yearlyTotals[year].totalProceeds.plus(proceeds); // 'Realizing' proceeds
        yearlyTotals[year].totalCosts = yearlyTotals[year].totalCosts.plus(cost); // 'Realizing' costs
        yearlyTotals[year].totalOutlays = yearlyTotals[year].totalOutlays.plus(fee); // 'Realizing' outlays
        // Superficial loss check: if loss, check for repurchase within 30 days before/after
        const gainLoss = proceeds.minus(cost).minus(fee);
        if (gainLoss.isNegative() && isSuperficialLoss(tx, txs, i, asset_symbol)) {
          superficialLosses = superficialLosses.plus(gainLoss.abs());
          acb = acb.plus(gainLoss.abs()); // Add back to ACB
          totalCosts = totalCosts.minus(gainLoss.abs()); // Remove from 'Realized' costs
          yearlyTotals[year].superficialLosses = yearlyTotals[year].superficialLosses.plus(gainLoss.abs());
          yearlyTotals[year].acb = yearlyTotals[year].acb.plus(gainLoss.abs()); // Add back to ACB
          yearlyTotals[year].totalCosts = yearlyTotals[year].totalCosts.minus(gainLoss.abs()); // Remove from 'Realized' costs
        } else {
          totalGainLoss = totalGainLoss.plus(gainLoss);
          yearlyTotals[year].totalGainLoss = yearlyTotals[year].totalGainLoss.plus(gainLoss);
        }
      }

      // --- Buy/Receive/Trade: Acquisition ---
      if ([TransactionType.BUY, TransactionType.RECEIVE, TransactionType.TRADE].includes(tx.type) && tx.receive_asset_symbol === asset_symbol) {
        if (!tx.receive_asset_quantity) {
          throw new Error(`No valid receive quantity found for transaction ${tx.id} of type ${tx.type}`);
        };
        if ((tx.type === TransactionType.BUY && tx.send_asset_symbol !== fiat_symbol) ||
            (tx.type === TransactionType.BUY || tx.type === TransactionType.TRADE) && (!tx.send_asset_symbol || !tx.send_asset_quantity)) {
          throw new Error(`No valid send asset found for transaction ${tx.id} of type ${tx.type}`);
        };
        // Costs
        let cost = new Decimal(0);
        if (tx.type === TransactionType.BUY) {
          cost = new Decimal(tx.send_asset_quantity!);
        } else if (tx.type === TransactionType.RECEIVE && tx.is_income) {
          // Can't easily determine the FMV/floor of NFTs received, hence just leave as 0
          if (asset.asset_type === AssetType.BLOCKCHAIN) {
            cost = new Decimal(tx.receive_asset_quantity).times(getPrice(tx.receive_asset_symbol, priceCache)); // FMV of Receive Asset
            totalIncome = totalIncome.plus(cost);
            yearlyTotals[year].totalIncome = yearlyTotals[year].totalIncome.plus(cost);
          }
        } else if (tx.type === TransactionType.TRADE) {
          // Can't easily determine FMV/floor of NFTs sent or received, handle accordingly
          const sendAsset = await getAsset(tx.send_asset_symbol!);
          if (sendAsset.asset_type === AssetType.BLOCKCHAIN) {
            cost = new Decimal(tx.send_asset_quantity!).times(getPrice(tx.send_asset_symbol!, priceCache)); // FMV of Send Asset
          } else if (asset.asset_type === AssetType.BLOCKCHAIN) {
            cost = new Decimal(tx.receive_asset_quantity).times(getPrice(tx.receive_asset_symbol, priceCache)); // FMV of Receive Asset
          }
        }
        // Fees
        let fee = new Decimal(0);
        if (tx.fee_asset_symbol === fiat_symbol && tx.fee_asset_quantity) {
          fee = new Decimal(tx.fee_asset_quantity);
        } else if (tx.fee_asset_symbol && tx.fee_asset_quantity) {
          fee = new Decimal(tx.fee_asset_quantity).times(getPrice(tx.fee_asset_symbol, priceCache)); // FMV of Fee Asset
        }
        // ACB
        acb = acb.plus(cost).plus(fee);
        totalUnits = totalUnits.plus(tx.receive_asset_quantity);
        yearlyTotals[year].acb = yearlyTotals[year].acb.plus(cost).plus(fee);
        yearlyTotals[year].totalUnits = yearlyTotals[year].totalUnits.plus(tx.receive_asset_quantity);
      }

      // --- Fees paid in the asset: Disposition ---
      if (tx.fee_asset_symbol === asset_symbol) {
        if (!tx.fee_asset_quantity) {
          throw new Error(`No valid fee quantity found for transaction ${tx.id} of type ${tx.type}`);
        };
        // Proceeds
        let proceeds = new Decimal(tx.fee_asset_quantity).times(getPrice(tx.fee_asset_symbol, priceCache)); // FMV of Fee Asset
        // Costs + ACB
        const cost = new Decimal(tx.fee_asset_quantity).div(totalUnits).times(acb);
        acb = acb.minus(cost);
        totalUnits = totalUnits.minus(tx.fee_asset_quantity);
        totalProceeds = totalProceeds.plus(proceeds); // 'Realizing' proceeds
        totalCosts = totalCosts.plus(cost); // 'Realizing' costs
        yearlyTotals[year].acb = yearlyTotals[year].acb.minus(cost);
        yearlyTotals[year].totalUnits = yearlyTotals[year].totalUnits.minus(tx.fee_asset_quantity);
        yearlyTotals[year].totalProceeds = yearlyTotals[year].totalProceeds.plus(proceeds); // 'Realizing' proceeds
        yearlyTotals[year].totalCosts = yearlyTotals[year].totalCosts.plus(cost); // 'Realizing' costs
        // Superficial loss check: if loss, check for repurchase within 30 days before/after
        const gainLoss = proceeds.minus(cost);
        if (gainLoss.isNegative() && isSuperficialLoss(tx, txs, i, asset_symbol)) {
          superficialLosses = superficialLosses.plus(gainLoss.abs());
          acb = acb.plus(gainLoss.abs()); // Add back to ACB
          totalCosts = totalCosts.minus(gainLoss.abs()); // Remove from 'Realized' costs
          yearlyTotals[year].superficialLosses = yearlyTotals[year].superficialLosses.plus(gainLoss.abs());
          yearlyTotals[year].acb = yearlyTotals[year].acb.plus(gainLoss.abs()); // Add back to ACB
          yearlyTotals[year].totalCosts = yearlyTotals[year].totalCosts.minus(gainLoss.abs()); // Remove from 'Realized' costs
        } else {
          totalGainLoss = totalGainLoss.plus(gainLoss);
          yearlyTotals[year].totalGainLoss = yearlyTotals[year].totalGainLoss.plus(gainLoss);
        }
      }
      if (
        acb.isNegative() ||
        totalUnits.isNegative() ||
        totalCosts.isNegative() ||
        totalOutlays.isNegative() ||
        totalIncome.isNegative()
      ) {
        console.log(acb, totalUnits, totalCosts, totalOutlays, totalIncome, tx);
        throw new Error(`Something went negative when it shouldn't have for symbol ${asset_symbol}. ACB: ${acb}, totalUnits: ${totalUnits}, totalCosts: ${totalCosts}, totalOutlays: ${totalOutlays}`);
      }
    } catch (err: any) {
      console.error(`Failed to process transaction ${tx.id} of type ${tx.type} due to ${err.message}`);
      throw err;
    }
  }
  // Finalize yearly totals
  const response: Record<string, AcbDataNumber> = {};
  const startingYear = Math.min(...Object.keys(yearlyTotals).map(Number));
  const currentYear = new Date().getFullYear();
  let prevData: AcbDataNumber | undefined;
  for (let year = startingYear; year < currentYear; year++) {
    const data = yearlyTotals[year];
    if (data && Object.keys(data).length) {
      response[year] = {
        acb: data.acb.toNumber(),
        totalUnits: data.totalUnits.toNumber(),
        totalProceeds: data.totalProceeds.toNumber(),
        totalCosts: data.totalCosts.toNumber(),
        totalOutlays: data.totalOutlays.toNumber(),
        totalGainLoss: data.totalGainLoss.toNumber(),
        superficialLosses: data.superficialLosses.toNumber(),
        totalIncome: data.totalIncome.toNumber(),
      };
      prevData = response[year];
    } else {
      response[year] = {
        acb: prevData?.acb || 0,
        totalUnits: prevData?.totalUnits || 0,
        totalProceeds: 0,
        totalCosts: 0,
        totalOutlays: 0,
        totalGainLoss: 0,
        superficialLosses: 0,
        totalIncome: 0,
      };
    }
  }
  // Finalize overall total
  response['TOTALS'] = {
    acb: acb.toNumber(),
    totalUnits: totalUnits.toNumber(),
    totalProceeds: totalProceeds.toNumber(),
    totalCosts: totalCosts.toNumber(),
    totalOutlays: totalOutlays.toNumber(),
    totalGainLoss: totalGainLoss.toNumber(),
    superficialLosses: superficialLosses.toNumber(),
    totalIncome: totalIncome.toNumber(),
  };
  return response;
}
