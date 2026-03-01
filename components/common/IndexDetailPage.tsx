// components/common/IndexDetailPage.tsx
"use client";

import { BreadthChart, ParticipationChart } from "@/components/charts/BreadthChart";
import { MetricCardsRow } from "@/components/common/MetricCard";
import { ConstituentTable } from "@/components/tables/ConstituentTable";
import type { BreadthDataPoint, MarketStatusEntry } from "@/types";
import { useState } from "react";
import { makeTradingViewUrl } from "@/lib/utils";

interface IndexDetailPageProps {
    title: string;
    description: string;
    breadthData: BreadthDataPoint[];
    constituentData?: Array<{ ticker: string;[k: string]: number | string | null | undefined }>;
    marketStatus?: MarketStatusEntry | null;
    isIndustry?: boolean;
}

export function IndexDetailPage({
    title,
    description,
    breadthData,
    constituentData,
    marketStatus,
    isIndustry = false,
}: IndexDetailPageProps) {
    const [activeTab, setActiveTab] = useState<"chart" | "constituents">("chart");
    const [showCagr, setShowCagr] = useState(false);

    // Latest + previous data points for metric cards
    const latest = breadthData.length > 0 ? breadthData[breadthData.length - 1] : null;
    const prev = breadthData.length > 1 ? breadthData[breadthData.length - 2] : latest;

    // Compute performance trend from Index_Close if available
    const performanceTrend = computePerformanceTrend(breadthData, showCagr);

    // Compute CAGR-converted constituent data
    const displayConstituents = showCagr && constituentData
        ? constituentData.map((row) => {
            const newRow = { ...row };
            // 1Y CAGR same as absolute for 1 year
            if (typeof row["3Y"] === "number" && row["3Y"] !== null) {
                newRow["3Y"] = (Math.pow(1 + (row["3Y"] as number) / 100, 1 / 3) - 1) * 100;
            }
            if (typeof row["5Y"] === "number" && row["5Y"] !== null) {
                newRow["5Y"] = (Math.pow(1 + (row["5Y"] as number) / 100, 1 / 5) - 1) * 100;
            }
            return newRow;
        })
        : constituentData;

    // Open All in TradingView handler
    const handleOpenAll = () => {
        if (!constituentData) return;
        constituentData.forEach((row) => {
            const url = makeTradingViewUrl(row.ticker);
            window.open(url, "_blank");
        });
    };

    return (
        <div>
            <h1 className="text-xl font-bold text-white mb-1">{title} Market Breadth</h1>
            <p className="text-sm text-slate-400 mb-4">{description}</p>

            {/* Metric Cards */}
            {latest && prev && (
                <MetricCardsRow
                    total={latest.Total}
                    above={latest.Above}
                    below={latest.Below}
                    percentage={latest.Percentage}
                    prevAbove={prev.Above}
                    prevBelow={prev.Below}
                    prevPercentage={prev.Percentage}
                />
            )}

            {/* Performance Trend (Equal Weighted) */}
            {performanceTrend && (
                <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-3 mb-4">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-semibold text-white">Performance Trend (Equal Weighted)</h3>
                        <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={showCagr}
                                onChange={(e) => setShowCagr(e.target.checked)}
                                className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 h-3.5 w-3.5"
                            />
                            Annualize Returns (CAGR)
                        </label>
                    </div>
                    <div className="grid grid-cols-4 lg:grid-cols-8 gap-2">
                        {Object.entries(performanceTrend).map(([period, value]) => (
                            <div key={period} className="text-center">
                                <p className="text-[10px] text-slate-500 uppercase">{period}</p>
                                <p
                                    className={`text-sm font-mono font-medium ${value === null
                                        ? "text-gray-500"
                                        : value >= 0
                                            ? "text-emerald-400"
                                            : "text-red-400"
                                        }`}
                                >
                                    {value === null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="flex items-center justify-between mb-4 border-b border-[#1e1e2e]">
                <div className="flex gap-1">
                    <button
                        onClick={() => setActiveTab("chart")}
                        className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === "chart"
                            ? "text-blue-400 border-b-2 border-blue-400"
                            : "text-slate-400 hover:text-white"
                            }`}
                    >
                        📊 Breadth Chart
                    </button>
                    {constituentData && constituentData.length > 0 && (
                        <button
                            onClick={() => setActiveTab("constituents")}
                            className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === "constituents"
                                ? "text-blue-400 border-b-2 border-blue-400"
                                : "text-slate-400 hover:text-white"
                                }`}
                        >
                            📋 Constituents
                        </button>
                    )}
                </div>

                {/* CAGR Toggle for constituents tab */}
                {activeTab === "constituents" && (
                    <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer mr-2">
                        <input
                            type="checkbox"
                            checked={showCagr}
                            onChange={(e) => setShowCagr(e.target.checked)}
                            className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 h-3.5 w-3.5"
                        />
                        Annualize (CAGR)
                    </label>
                )}
            </div>

            {/* Tab content */}
            {activeTab === "chart" && (
                <>
                    <BreadthChart data={breadthData} title={title} />

                    {/* Above / Below 200 SMA Lists */}
                    {marketStatus && (
                        <div className="mt-4">
                            <hr className="border-[#1e1e2e] mb-4" />
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {/* Above 200 SMA */}
                                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-4">
                                    <h4 className="text-sm font-semibold text-emerald-400 mb-3">
                                        📈 Above 200 SMA ({marketStatus.above?.length ?? 0})
                                    </h4>
                                    {marketStatus.above && marketStatus.above.length > 0 ? (
                                        <div className="flex flex-wrap gap-1.5">
                                            {marketStatus.above.map((ticker) => (
                                                <a
                                                    key={ticker}
                                                    href={makeTradingViewUrl(ticker)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-xs bg-emerald-500/10 text-emerald-300 px-2 py-1 rounded hover:bg-emerald-500/20 transition-colors font-mono"
                                                >
                                                    {ticker.replace(".NS", "").replace(".BO", "")}
                                                </a>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-slate-500">None</p>
                                    )}
                                </div>

                                {/* Below 200 SMA */}
                                <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4">
                                    <h4 className="text-sm font-semibold text-red-400 mb-3">
                                        📉 Below 200 SMA ({marketStatus.below?.length ?? 0})
                                    </h4>
                                    {marketStatus.below && marketStatus.below.length > 0 ? (
                                        <div className="flex flex-wrap gap-1.5">
                                            {marketStatus.below.map((ticker) => (
                                                <a
                                                    key={ticker}
                                                    href={makeTradingViewUrl(ticker)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-xs bg-red-500/10 text-red-300 px-2 py-1 rounded hover:bg-red-500/20 transition-colors font-mono"
                                                >
                                                    {ticker.replace(".NS", "").replace(".BO", "")}
                                                </a>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-slate-500">None</p>
                                    )}
                                </div>
                            </div>

                            {/* New Stocks */}
                            {marketStatus.new_stock && marketStatus.new_stock.length > 0 && (
                                <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-4 mt-4">
                                    <h4 className="text-sm font-semibold text-amber-400 mb-3">
                                        🆕 New Stock — Insufficient History for 200 SMA ({marketStatus.new_stock.length})
                                    </h4>
                                    <div className="flex flex-wrap gap-1.5">
                                        {marketStatus.new_stock.map((ticker) => (
                                            <a
                                                key={ticker}
                                                href={makeTradingViewUrl(ticker)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs bg-amber-500/10 text-amber-300 px-2 py-1 rounded hover:bg-amber-500/20 transition-colors font-mono"
                                            >
                                                {ticker.replace(".NS", "").replace(".BO", "")}
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <ParticipationChart data={breadthData} title={title} />
                </>
            )}

            {activeTab === "constituents" && displayConstituents && (
                <div>
                    {/* Open All in TradingView button for industries */}
                    {isIndustry && displayConstituents.length > 0 && (
                        <div className="flex justify-end mb-3">
                            <button
                                onClick={handleOpenAll}
                                className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded transition-colors"
                            >
                                ↗️ Open All in TradingView
                            </button>
                        </div>
                    )}
                    <ConstituentTable data={displayConstituents} showCagr={showCagr} />
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Compute performance trend from Index_Close data
// ---------------------------------------------------------------------------
function computePerformanceTrend(
    data: BreadthDataPoint[],
    useCagr: boolean
): Record<string, number | null> | null {
    if (data.length === 0) return null;

    const latest = data[data.length - 1];
    // Check if Index_Close exists
    if (latest.Index_Close === undefined || latest.Index_Close === null) return null;

    const currentPrice = latest.Index_Close;
    const latestDate = new Date(latest.Date);

    const periods: Record<string, number> = {
        "1 Day": 1,
        "1 Week": 7,
        "1 Month": 30,
        "3 Months": 90,
        "6 Months": 180,
        "1 Year": 365,
        "3 Years": 365 * 3,
        "5 Years": 365 * 5,
    };

    const result: Record<string, number | null> = {};

    for (const [name, days] of Object.entries(periods)) {
        const targetDate = new Date(latestDate);
        targetDate.setDate(targetDate.getDate() - days);
        const targetStr = targetDate.toISOString().split("T")[0];

        // Find closest past row
        let pastIdx = -1;
        for (let i = data.length - 1; i >= 0; i--) {
            if (data[i].Date <= targetStr) {
                pastIdx = i;
                break;
            }
        }

        if (pastIdx >= 0 && data[pastIdx].Index_Close && data[pastIdx].Index_Close! > 0) {
            let ret = ((currentPrice - data[pastIdx].Index_Close!) / data[pastIdx].Index_Close!) * 100;
            if (useCagr && (name === "1 Year" || name === "3 Years" || name === "5 Years")) {
                const yrs = name === "1 Year" ? 1 : name === "3 Years" ? 3 : 5;
                ret = (Math.pow(1 + ret / 100, 1 / yrs) - 1) * 100;
            }
            result[name] = ret;
        } else {
            result[name] = null;
        }
    }

    return result;
}
