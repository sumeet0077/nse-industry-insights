// lib/config.ts
// Central registry of all indices, sectors, and industries
// This mirrors nifty_themes.py and index_config from the Streamlit app

import type { IndexConfig } from "@/types";

export const BROAD_MARKET: IndexConfig[] = [
    {
        id: "nifty50",
        title: "Nifty 50",
        description: "Top 50 large-cap companies on NSE by market capitalisation",
        dataFile: "nifty50",
        category: "broad-market",
    },
    {
        id: "nifty500",
        title: "Nifty 500",
        description: "Top 500 companies representing ~95% of the total free-float market capitalisation",
        dataFile: "nifty500",
        category: "broad-market",
    },
    {
        id: "nifty_smallcap250",
        title: "Nifty Smallcap 250",
        description: "250 smallcap companies outside the Nifty 500 universe",
        dataFile: "nifty_smallcap250",
        category: "broad-market",
    },
];

export const SECTORS: IndexConfig[] = [
    { id: "nifty_auto", title: "Nifty Auto", description: "Automobile and auto ancillaries sector", dataFile: "nifty_auto", category: "sectors" },
    { id: "nifty_bank", title: "Nifty Bank", description: "Most liquid and large-cap banking stocks", dataFile: "nifty_bank", category: "sectors" },
    { id: "nifty_energy", title: "Nifty Energy", description: "Energy sector companies", dataFile: "nifty_energy", category: "sectors" },
    { id: "nifty_financial_services", title: "Nifty Financial Services", description: "Financial services sector", dataFile: "nifty_financial_services", category: "sectors" },
    { id: "nifty_fmcg", title: "Nifty FMCG", description: "Fast-moving consumer goods sector", dataFile: "nifty_fmcg", category: "sectors" },
    { id: "nifty_healthcare", title: "Nifty Healthcare", description: "Healthcare and pharma sector", dataFile: "nifty_healthcare", category: "sectors" },
    { id: "nifty_it", title: "Nifty IT", description: "Information Technology sector", dataFile: "nifty_it", category: "sectors" },
    { id: "nifty_media", title: "Nifty Media", description: "Media and entertainment sector", dataFile: "nifty_media", category: "sectors" },
    { id: "nifty_metal", title: "Nifty Metal", description: "Metal and mining sector", dataFile: "nifty_metal", category: "sectors" },
    { id: "nifty_pharma", title: "Nifty Pharma", description: "Pharmaceutical sector", dataFile: "nifty_pharma", category: "sectors" },
    { id: "nifty_private_bank", title: "Nifty Private Bank", description: "Private sector banking", dataFile: "nifty_private_bank", category: "sectors" },
    { id: "nifty_psu_bank", title: "Nifty PSU Bank", description: "Public sector banking", dataFile: "nifty_psu_bank", category: "sectors" },
    { id: "nifty_realty", title: "Nifty Realty", description: "Real estate sector", dataFile: "nifty_realty", category: "sectors" },
];

export const INDUSTRIES: IndexConfig[] = [
    { id: "copper", title: "Copper", description: "Copper producers and processors", dataFile: "copper", category: "industries" },
    { id: "oil_gas_downstream", title: "Oil & Gas Downstream", description: "Oil refining and marketing", dataFile: "oil_gas_downstream", category: "industries" },
    { id: "defence", title: "Defence", description: "Defence equipment and services", dataFile: "defence", category: "industries" },
    { id: "railways", title: "Railways", description: "Railway infrastructure and rolling stock", dataFile: "railways", category: "industries" },
    { id: "power", title: "Power", description: "Power generation and distribution", dataFile: "power", category: "industries" },
    { id: "insurance_life", title: "Life Insurance", description: "Life insurance companies", dataFile: "insurance_life", category: "industries" },
    { id: "insurance_general", title: "General Insurance", description: "General insurance companies", dataFile: "insurance_general", category: "industries" },
    { id: "private_banking", title: "Private Banking", description: "Private sector banks", dataFile: "private_banking", category: "industries" },
    { id: "psu_banking", title: "PSU Banking", description: "Public sector banks", dataFile: "psu_banking", category: "industries" },
    { id: "housing_finance", title: "Housing Finance", description: "Housing finance companies", dataFile: "housing_finance", category: "industries" },
    { id: "nbfc", title: "NBFC", description: "Non-banking financial companies", dataFile: "nbfc", category: "industries" },
    { id: "retail", title: "Retail & E-Commerce", description: "Retail and online commerce", dataFile: "retail", category: "industries" },
    { id: "amc", title: "AMC", description: "Asset management companies", dataFile: "amc", category: "industries" },
    { id: "wealth_management", title: "Wealth Management", description: "Wealth management firms", dataFile: "wealth_management", category: "industries" },
    { id: "capital_markets", title: "Capital Market", description: "Capital market intermediaries", dataFile: "capital_markets", category: "industries" },
    { id: "alcohols_breweries", title: "Alcohols & Breweries", description: "Alcohol and brewery companies", dataFile: "alcohols_breweries", category: "industries" },
];

export const ALL_CONFIGS: IndexConfig[] = [...BROAD_MARKET, ...SECTORS, ...INDUSTRIES];

export function getConfigById(id: string): IndexConfig | undefined {
    return ALL_CONFIGS.find((c) => c.id === id);
}

// Free tier: only broad market indices
export const FREE_TIER_IDS = new Set(BROAD_MARKET.map((c) => c.id));

export function isProRequired(id: string): boolean {
    return !FREE_TIER_IDS.has(id);
}
