import Decimal from "decimal.js";

export enum AssetType {
    BLOCKCHAIN = 'blockchain',
    FIAT = 'fiat'
}

export enum TransactionType {
    BUY = 'Buy',
    SELL = 'Sell',
    TRADE = 'Trade',
    SEND = 'Send',
    RECEIVE = 'Receive'
}

export enum InsertionType {
    INSERT,
    UPSERT
}

// --- API Response Interfaces ---
export interface FinageAggregatesResponse {
    v: number; // Volume
    o: number; // Open price
    c: number; // Close price
    h: number; // High price
    l: number; // Low price
    t: number; // Timestamp (in ms)
}

// --- SQL Table Interfaces ---

export interface Asset {
    symbol: string;
    name: string;
    asset_type: AssetType;
    launch_date: number;
    logo_url?: string;
}

export interface Price {
    unix_timestamp: number;
    price: number;
    asset_symbol: string;
    fiat_symbol: string;
    asset_logo_url?: string;
    fiat_logo_url?: string;
}

export interface TransactionInput {
    unix_timestamp: number;
    type: TransactionType;
    send_asset_symbol?: string;
    send_asset_quantity?: number;
    receive_asset_symbol?: string;
    receive_asset_quantity?: number;
    fee_asset_symbol?: string;
    fee_asset_quantity?: number;
    is_income?: boolean;
    notes?: string;
}

export interface Transaction extends TransactionInput {
    id: number;
}

export interface AcbDataDecimal {
    acb: Decimal;
    totalUnits: Decimal;
    totalProceeds: Decimal;
    totalCosts: Decimal;
    totalOutlays: Decimal;
    totalGainLoss: Decimal;
    superficialLosses: Decimal;
    totalIncome: Decimal;
}

export interface AcbDataNumber {
    acb: number;
    totalUnits: number;
    totalProceeds: number;
    totalCosts: number;
    totalOutlays: number;
    totalGainLoss: number;
    superficialLosses: number;
    totalIncome: number;
}