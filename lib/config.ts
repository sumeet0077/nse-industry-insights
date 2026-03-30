// lib/config.ts
// Central registry of all indices, sectors, and industries
// File names match the actual Streamlit project CSV→JSON output from export_json.py
//
// IMPORTANT NAMING RULE: The `title` field MUST exactly match the key used in
// market_status_latest.json (case-insensitive). If they mismatch, the Constituent
// tab on that theme's page will silently disappear. Always check data.ts ALIASES
// or add a new alias there if an exact match is not possible.

import type { IndexConfig } from "@/types";

export const BROAD_MARKET: IndexConfig[] = [
    { id: "market_breadth_nifty50", title: "Nifty 50", description: "Top 50 Blue-chip Companies", dataFile: "market_breadth_nifty50", category: "broad-market" },
    { id: "market_breadth_nifty500", title: "Nifty 500", description: "Top 500 Companies", dataFile: "market_breadth_nifty500", category: "broad-market" },
    { id: "market_breadth_smallcap", title: "Nifty Smallcap 250", description: "Smallcap Segment", dataFile: "market_breadth_smallcap", category: "broad-market" },
];

export const SECTORS: IndexConfig[] = [
    { id: "breadth_auto", title: "Nifty Auto", description: "Automobile Sector", dataFile: "breadth_auto", category: "sectors" },
    { id: "breadth_bank", title: "Nifty Bank", description: "Banking Sector", dataFile: "breadth_bank", category: "sectors" },
    { id: "breadth_finance", title: "Nifty Financial Services", description: "Financial Services", dataFile: "breadth_finance", category: "sectors" },
    { id: "breadth_fmcg", title: "Nifty FMCG", description: "Fast Moving Consumer Goods", dataFile: "breadth_fmcg", category: "sectors" },
    { id: "breadth_healthcare", title: "Nifty Healthcare", description: "Healthcare & Hospitals", dataFile: "breadth_healthcare", category: "sectors" },
    { id: "breadth_it", title: "Nifty IT", description: "Information Technology", dataFile: "breadth_it", category: "sectors" },
    { id: "breadth_media", title: "Nifty Media", description: "Media & Entertainment", dataFile: "breadth_media", category: "sectors" },
    { id: "breadth_metal", title: "Nifty Metal", description: "Metals & Mining", dataFile: "breadth_metal", category: "sectors" },
    { id: "breadth_pharma", title: "Nifty Pharma", description: "Pharmaceuticals", dataFile: "breadth_pharma", category: "sectors" },
    { id: "breadth_pvtbank", title: "Nifty Private Bank", description: "Private Sector Banks", dataFile: "breadth_pvtbank", category: "sectors" },
    { id: "breadth_psubank", title: "Nifty PSU Bank", description: "Public Sector Banks", dataFile: "breadth_psubank", category: "sectors" },
    { id: "breadth_realty", title: "Nifty Realty", description: "Real Estate", dataFile: "breadth_realty", category: "sectors" },
    { id: "breadth_consumer", title: "Nifty Consumer Durables", description: "Consumer Durables", dataFile: "breadth_consumer", category: "sectors" },
    { id: "breadth_oilgas", title: "Nifty Oil & Gas", description: "Oil, Gas & Petroleum", dataFile: "breadth_oilgas", category: "sectors" },
];

export const INDUSTRIES: IndexConfig[] = [
    { id: "breadth_theme_copper", title: "Copper", description: "Copper Producers & Processors", dataFile: "breadth_theme_copper", category: "industries" },
    { id: "breadth_theme_defence_and_aerospace", title: "Defence & Aerospace", description: "Defence Equipment & Services", dataFile: "breadth_theme_defence_and_aerospace", category: "industries" },
    { id: "breadth_theme_railways_and_infrastructure", title: "Railways & Infrastructure", description: "Railway Infra & Rolling Stock", dataFile: "breadth_theme_railways_and_infrastructure", category: "industries" },
    { id: "breadth_theme_power_tandd", title: "Power T&D", description: "Power Transmission & Distribution", dataFile: "breadth_theme_power_tandd", category: "industries" },
    { id: "breadth_theme_life_insurance", title: "Life Insurance", description: "Life Insurance Companies", dataFile: "breadth_theme_life_insurance", category: "industries" },
    { id: "breadth_theme_general_insurance", title: "General Insurance", description: "General Insurance Companies", dataFile: "breadth_theme_general_insurance", category: "industries" },
    { id: "breadth_theme_private_banking", title: "Private Banking", description: "Private Sector Banks", dataFile: "breadth_theme_private_banking", category: "industries" },
    { id: "breadth_theme_psu_banking", title: "PSU Banking", description: "Public Sector Banks", dataFile: "breadth_theme_psu_banking", category: "industries" },
    { id: "breadth_theme_housing_finance", title: "Housing Finance", description: "Housing Finance Companies", dataFile: "breadth_theme_housing_finance", category: "industries" },
    { id: "breadth_theme_nbfc", title: "NBFC", description: "Non-Banking Financial Companies", dataFile: "breadth_theme_nbfc", category: "industries" },
    { id: "breadth_theme_retail_and_e_commerce", title: "Retail & E-Commerce", description: "Retail and Online Commerce", dataFile: "breadth_theme_retail_and_e_commerce", category: "industries" },
    { id: "breadth_theme_asset_management", title: "AMC", description: "Asset Management Companies", dataFile: "breadth_theme_asset_management", category: "industries" },
    { id: "breadth_theme_wealth_management", title: "Wealth Management", description: "Wealth Management Firms", dataFile: "breadth_theme_wealth_management", category: "industries" },
    { id: "breadth_theme_capital_market", title: "Capital Market", description: "Capital Market Intermediaries", dataFile: "breadth_theme_capital_market", category: "industries" },
    { id: "breadth_theme_capital_goods", title: "Capital Goods", description: "Heavy Engineering & Industrial Equipment", dataFile: "breadth_theme_capital_goods", category: "industries" },
    { id: "breadth_theme_personal_care_and_wellness", title: "Personal Care & Wellness", description: "Health, Hygiene & Consumer Wellness", dataFile: "breadth_theme_personal_care_and_wellness", category: "industries" },
    { id: "breadth_theme_alcohols_and_breweries", title: "Alcohols & Breweries", description: "Alcohol & Brewery Companies", dataFile: "breadth_theme_alcohols_and_breweries", category: "industries" },
    { id: "breadth_theme_oil_and_gas_downstream", title: "Oil & Gas Downstream", description: "Oil Refining & Marketing", dataFile: "breadth_theme_oil_and_gas_downstream", category: "industries" },
    { id: "breadth_theme_oil_and_gas_upstream", title: "Oil & Gas Upstream", description: "Oil Exploration & Production", dataFile: "breadth_theme_oil_and_gas_upstream", category: "industries" },
    { id: "breadth_theme_cement", title: "Cement", description: "Cement Manufacturers", dataFile: "breadth_theme_cement", category: "industries" },
    { id: "breadth_theme_solar_manufacturing", title: "Solar Manufacturing", description: "Solar Cells, Modules & EPC", dataFile: "breadth_theme_solar_manufacturing", category: "industries" },
    { id: "breadth_theme_semiconductors_and_ems", title: "Semiconductors & EMS", description: "Semiconductor & Electronic Manufacturing", dataFile: "breadth_theme_semiconductors_and_ems", category: "industries" },
    { id: "breadth_theme_infrastructure_and_epc", title: "Infrastructure & EPC", description: "Infrastructure & Engineering", dataFile: "breadth_theme_infrastructure_and_epc", category: "industries" },
    { id: "breadth_theme_fintech", title: "Fintech", description: "Financial Technology", dataFile: "breadth_theme_fintech", category: "industries" },
    { id: "breadth_theme_ev_ecosystem", title: "EV Ecosystem", description: "Electric Vehicle Ecosystem", dataFile: "breadth_theme_ev_ecosystem", category: "industries" },
    { id: "breadth_theme_renewable_energy_generation", title: "Renewable Energy", description: "Renewable Energy Generation", dataFile: "breadth_theme_renewable_energy_generation", category: "industries" },
    { id: "breadth_theme_green_hydrogen", title: "Green Hydrogen", description: "Green Hydrogen Companies", dataFile: "breadth_theme_green_hydrogen", category: "industries" },
    { id: "breadth_theme_data_centre_and_ai", title: "Data Centre and AI", description: "Data Centre & Artificial Intelligence", dataFile: "breadth_theme_data_centre_and_ai", category: "industries" },
    { id: "breadth_theme_aviation", title: "Aviation", description: "Airlines & Aviation", dataFile: "breadth_theme_aviation", category: "industries" },
    { id: "breadth_theme_logistics", title: "Logistics", description: "Logistics & Supply Chain", dataFile: "breadth_theme_logistics", category: "industries" },
    { id: "breadth_theme_hospitals", title: "Hospitals", description: "Hospital Chains", dataFile: "breadth_theme_hospitals", category: "industries" },
    { id: "breadth_theme_pharma_formulations", title: "Pharma Formulations", description: "Pharma Formulation Companies", dataFile: "breadth_theme_pharma_formulations", category: "industries" },
    { id: "breadth_theme_specialty_chemicals", title: "Specialty Chemicals", description: "Specialty Chemical Companies", dataFile: "breadth_theme_specialty_chemicals", category: "industries" },
    { id: "breadth_theme_agrochemicals_and_fertilisers", title: "Agrochemicals & Fertilisers", description: "Agrochemicals & Fertiliser Companies", dataFile: "breadth_theme_agrochemicals_and_fertilisers", category: "industries" },
    { id: "breadth_theme_textiles", title: "Textiles", description: "Textile Companies", dataFile: "breadth_theme_textiles", category: "industries" },
    { id: "breadth_theme_paints", title: "Paints", description: "Paint Companies", dataFile: "breadth_theme_paints", category: "industries" },
    { id: "breadth_theme_jewellery_gold", title: "Jewellery & Gold", description: "Jewellery & Gold Retailers", dataFile: "breadth_theme_jewellery_gold", category: "industries" },
    { id: "breadth_theme_silver", title: "Silver", description: "Silver Producers", dataFile: "breadth_theme_silver", category: "industries" },
    { id: "breadth_theme_critical_minerals", title: "Critical Minerals", description: "Critical Mineral Companies", dataFile: "breadth_theme_critical_minerals", category: "industries" },
    { id: "breadth_theme_metals_and_mining", title: "Metals & Mining", description: "Metals & Mining Companies", dataFile: "breadth_theme_metals_and_mining", category: "industries" },
    { id: "breadth_theme_telecom_services", title: "Telecom Services", description: "Telecom Service Providers", dataFile: "breadth_theme_telecom_services", category: "industries" },
    { id: "breadth_theme_telecom_infra", title: "Telecom Infra", description: "Telecom Infrastructure", dataFile: "breadth_theme_telecom_infra", category: "industries" },
    { id: "breadth_theme_media_and_broadcasting", title: "Media & Broadcasting", description: "Media & Broadcasting", dataFile: "breadth_theme_media_and_broadcasting", category: "industries" },
    { id: "breadth_theme_music_and_content", title: "Music & Content", description: "Music & Content Platforms", dataFile: "breadth_theme_music_and_content", category: "industries" },
    { id: "breadth_theme_luxury", title: "Luxury", description: "Luxury Brands", dataFile: "breadth_theme_luxury", category: "industries" },
    { id: "breadth_theme_qsr", title: "QSR", description: "Quick Service Restaurants", dataFile: "breadth_theme_qsr", category: "industries" },
    { id: "breadth_theme_fmcg_staples", title: "FMCG Staples", description: "FMCG Staples", dataFile: "breadth_theme_fmcg_staples", category: "industries" },
    { id: "breadth_theme_it_services", title: "IT Services", description: "IT Services Companies", dataFile: "breadth_theme_it_services", category: "industries" },
    { id: "breadth_theme_auto_passenger_and_cv", title: "Auto Passenger & CV", description: "Passenger Vehicles & Commercial Vehicles", dataFile: "breadth_theme_auto_passenger_and_cv", category: "industries" },
    { id: "breadth_theme_two_and_three_wheelers", title: "Two & Three Wheelers", description: "Two & Three Wheeler Manufacturers", dataFile: "breadth_theme_two_and_three_wheelers", category: "industries" },
    { id: "breadth_theme_auto_ancillary", title: "Auto Ancillary", description: "Companies manufacturing automotive components", dataFile: "breadth_theme_auto_ancillary", category: "industries" },
    { id: "breadth_theme_tyres_and_rubber_products", title: "Tyres & Rubber", description: "Tyre and Rubber manufacturers", dataFile: "breadth_theme_tyres_and_rubber_products", category: "industries" },
    { id: "breadth_theme_sugar", title: "Sugar", description: "Sugar and Bio-organics Manufacturers", dataFile: "breadth_theme_sugar", category: "industries" },
    { id: "breadth_theme_paper", title: "Paper", description: "Paper and Packaging Manufacturers", dataFile: "breadth_theme_paper", category: "industries" },
    { id: "breadth_theme_wires_and_cables", title: "Wires & Cables", description: "Cables, Wires & Electrical Equipment", dataFile: "breadth_theme_wires_and_cables", category: "industries" },
    { id: "breadth_theme_hotels_and_hospitality", title: "Hotels & Hospitality", description: "Hotels, Resorts, and Tourism", dataFile: "breadth_theme_hotels_and_hospitality", category: "industries" },
    { id: "breadth_theme_pvc_pipes_and_plumbing", title: "PVC Pipes & Plumbing", description: "PVC Pipes & Sanitaryware", dataFile: "breadth_theme_pvc_pipes_and_plumbing", category: "industries" },
    { id: "breadth_theme_building_materials", title: "Building Materials", description: "Ceramics, Tiles and Plywood", dataFile: "breadth_theme_building_materials", category: "industries" },
    { id: "breadth_theme_white_goods_and_durables", title: "White Goods", description: "Consumer Electronics and Appliances", dataFile: "breadth_theme_white_goods_and_durables", category: "industries" },
    { id: "breadth_theme_footwear", title: "Footwear", description: "Footwear and Leather Products", dataFile: "breadth_theme_footwear", category: "industries" },
    { id: "breadth_theme_diagnostics_and_pathology", title: "Diagnostics & Pathology", description: "Diagnostic Clinics and Pathology Labs", dataFile: "breadth_theme_diagnostics_and_pathology", category: "industries" },
    { id: "breadth_theme_packaging_solutions", title: "Packaging Solutions", description: "Specialty Packaging Solutions", dataFile: "breadth_theme_packaging_solutions", category: "industries" },
    { id: "breadth_theme_shipbuilding", title: "Shipbuilding", description: "Commercial and Defence Shipbuilding", dataFile: "breadth_theme_shipbuilding", category: "industries" },
    { id: "breadth_theme_marine_and_offshore_services", title: "Marine & Offshore Services", description: "Offshore Support, Diving & Port Services", dataFile: "breadth_theme_marine_and_offshore_services", category: "industries" },
    { id: "breadth_theme_power_generation", title: "Power Generation", description: "Thermal, Hydro & Integrated Power Utilities", dataFile: "breadth_theme_power_generation", category: "industries" },
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
