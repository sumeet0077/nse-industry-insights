import type { Metadata } from "next";
import { getStockSearchIndex, getStockRRGData, StockRRGPayload } from "@/lib/data";
import { CustomWatchlistRRGClient } from "@/components/CustomWatchlistRRGClient";

export const metadata: Metadata = {
    title: "Custom Watchlist RRG",
    description: "Build custom stock watchlists and analyze Relative Rotation Graphs relative to Broad Market and Sectoral Benchmarks.",
};

export default function CustomWatchlistPage() {
    const stockSearchIndex = getStockSearchIndex();

    // Preload ONLY default benchmark (Nifty 50) on server to keep static RSC payload light (< 2 MB)
    const initialBenchmarkPayload = getStockRRGData("market_breadth_nifty50");

    const initialStockRRGMap: Record<string, StockRRGPayload | null> = {
        market_breadth_nifty50: initialBenchmarkPayload,
    };

    return (
        <CustomWatchlistRRGClient
            stockSearchIndex={stockSearchIndex}
            allStockRRGMap={initialStockRRGMap}
        />
    );
}
