import { TransactionType } from './types';

// ===================================================================
// Transaction field rules
// -------------------------------------------------------------------
// Single source of truth for the per-type field requirements shared
// between server-side validation (validateTransaction in server.ts)
// and client-side form validation (validateTransactionFields in
// static/index.ts). Keeping the rules here avoids drift when a new
// transaction type or field is added.
// ===================================================================

export const DISPOSITION_TYPES: TransactionType[] = [
  TransactionType.SELL,
  TransactionType.SEND,
  TransactionType.TRADE,
];

export const ACQUISITION_TYPES: TransactionType[] = [
  TransactionType.BUY,
  TransactionType.RECEIVE,
];

export interface FieldRules {
  // Send asset/quantity fields are expected (any non-empty value).
  requiresSend: boolean;
  // Receive asset/quantity fields are expected.
  requiresReceive: boolean;
  // Send fields MUST NOT be populated (and, when set, cause a validation error).
  forbidsSend: boolean;
  // Receive fields MUST NOT be populated.
  forbidsReceive: boolean;
  // From wallet is required (Transfer only in current rules).
  requiresFromWallet: boolean;
  // To wallet is required (Transfer only).
  requiresToWallet: boolean;
  // From wallet MUST NOT be populated (acquisition types).
  forbidsFromWallet: boolean;
  // To wallet MUST NOT be populated (disposition types).
  forbidsToWallet: boolean;
  // Whether the "income" flag is relevant for this type.
  allowsIncome: boolean;
  // Whether send and receive must match (Transfer only).
  requiresMatchingSendReceive: boolean;
}

export function getFieldRules(type: TransactionType): FieldRules {
  const isDisposition = DISPOSITION_TYPES.includes(type);
  const isAcquisition = ACQUISITION_TYPES.includes(type);
  const isTransfer = type === TransactionType.TRANSFER;
  return {
    requiresSend: type !== TransactionType.RECEIVE,
    requiresReceive: type !== TransactionType.SEND,
    forbidsSend: type === TransactionType.RECEIVE,
    forbidsReceive: type === TransactionType.SEND,
    requiresFromWallet: isTransfer,
    requiresToWallet: isTransfer,
    forbidsFromWallet: isAcquisition,
    forbidsToWallet: isDisposition,
    allowsIncome: type === TransactionType.RECEIVE,
    requiresMatchingSendReceive: isTransfer,
  };
}
