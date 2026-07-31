import type { Metadata } from "next";
import { getStockSearchIndex, getStockRRGData, StockRRGPayload } from "@/lib/data";
import { BROAD_MARKET, SECTORS } from "@/lib/config";
import { CustomWatchlistRRGClient } from "@/components/CustomWatchlistRRGClient";

export const metadata: Metadata = {
    title: "Custom Watchlist RRG",
    description: "Build custom stock watchlists and analyze Relative Rotation Graphs relative to Broad Market and Sectoral Benchmarks.",
};

export default function CustomWatchlistPage() {
    const stockSearchIndex = getStockSearchIndex();

    // Load pre-computed stock RRG payloads for Broad Market and Sectoral Benchmarks
    const allStockRRGMap: Record<string, StockRRGPayload | null> = {};

    const benchmarksToPreload = [...BROAD_MARKET, ...SECTORS];

    for (const b of benchmarksToPreload) {
        allStockRRGMap[b.dataFile] = getStockRRGData(b.dataFile);
    }

    return (
        <CustomWatchlistRRGClient
            stockSearchIndex={stockSearchIndex}
            allStockRRGMap={allStockRRGMap}
        />
    );
}
