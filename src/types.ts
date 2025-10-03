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

// --- SQL Table Interfaces ---

export interface Asset {
    symbol: string;
    name: string;
    asset_type: AssetType;
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

export interface AcbData {
    acb: number;
    totalUnits: number;
    avgCostPerUnit: number;
    totalProceeds: number;
    totalCosts: number;
    totalOutlays: number;
    totalGainLoss: number;
    superficialLosses: number;
    totalIncome: number;
}