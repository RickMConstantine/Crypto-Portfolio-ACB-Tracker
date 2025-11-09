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
export interface CCAssetSummaryResponse {
    Data: {
        STATS?: {
            PAGE: number,
            PAGE_SIZE: number,
            TOTAL_ASSETS: number
        },
        LIST?: {
            TYPE: string,
            ID: number,
            SYMBOL: string,
            ASSET_TYPE: string,
            NAME: string,
            LOGO_URL: string
            LAUNCH_DATE: number
        }
    },
    Err: {
        message?: string 
    },
}

export interface CCHistoDayResponse {
    Data: {
        UNIT?: string,
        TIMESTAMP?: number,
        TYPE?: string,
        MARKET?: string,
        INSTRUMENT?: string,
        OPENv: number,
        HIGH?: number,
        LOW?: number,
        CLOSE?: number,
        FIRST_MESSAGE_TIMESTAMP?: number,
        LAST_MESSAGE_TIMESTAMP?: number,
        FIRST_MESSAGE_VALUE?: number,
        HIGH_MESSAGE_VALUE?: number,
        HIGH_MESSAGE_TIMESTAMP?: number,
        LOW_MESSAGE_VALUE?: number,
        LOW_MESSAGE_TIMESTAMP?: number,
        LAST_MESSAGE_VALUE?: number,
        TOTAL_INDEX_UPDATES?: number,
        VOLUME?: number,
        QUOTE_VOLUME?: number,
        VOLUME_TOP_TIER?: number,
        QUOTE_VOLUME_TOP_TIER?: number,
        VOLUME_DIRECT?: number,
        QUOTE_VOLUME_DIRECT?: number,
        VOLUME_TOP_TIER_DIRECT?: number,
        QUOTE_VOLUME_TOP_TIER_DIRECT?: number
    }
    Err: {
        message?: string 
    },
}

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