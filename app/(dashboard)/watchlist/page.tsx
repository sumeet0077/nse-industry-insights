import type { Metadata } from "next";
import { getStockSearchIndex } from "@/lib/data";
import { CustomWatchlistRRGClient } from "@/components/CustomWatchlistRRGClient";

export const metadata: Metadata = {
    title: "Custom Watchlist RRG",
    description: "Build custom stock watchlists and analyze Relative Rotation Graphs relative to Broad Market and Sectoral Benchmarks.",
};

export default function CustomWatchlistPage() {
    const stockSearchIndex = getStockSearchIndex();

    return (
        <CustomWatchlistRRGClient
            stockSearchIndex={stockSearchIndex}
        />
    );
}
