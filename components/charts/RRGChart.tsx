// components/charts/RRGChart.tsx
"use client";

import dynamic from "next/dynamic";
import type { RRGDataPoint } from "@/types";
import { useMemo, useState } from "react";

const Plot = dynamic(() => import("react-plotly.js"), {
    ssr: false,
    loading: () => (
        <div className="w-full h-[850px] flex items-center justify-center bg-slate-900/20 text-slate-400 rounded-lg animate-pulse">
            Loading RRG Chart...
        </div>
    ),
});

function cleanTicker(ticker: string): string {
    return ticker.replace(/\.NS$/i, "").replace(/\.BO$/i, "");
}

type LabelModeType = "staggered" | "leaders" | "hover";

interface RRGChartProps {
    data: RRGDataPoint[];
    tailLength: number;
    timeframe: string;
}

export function RRGChart({ data, tailLength, timeframe }: RRGChartProps) {
    const [labelMode, setLabelMode] = useState<LabelModeType>("staggered");

    const chartData = useMemo(() => {
        if (!data || data.length === 0) return null;

        // Group by ticker
        const grouped = data.reduce((acc, point) => {
            if (!acc[point.Ticker]) acc[point.Ticker] = [];
            acc[point.Ticker].push(point);
            return acc;
        }, {} as Record<string, RRGDataPoint[]>);

        // Calculate distance from center (100, 100) for each ticker's head point to identify top leaders
        const tickerDistances: { ticker: string; dist: number }[] = [];
        for (const [ticker, points] of Object.entries(grouped)) {
            if (points.length === 0) continue;
            points.sort((a, b) => a.Date.localeCompare(b.Date));
            const head = points[points.length - 1];
            const dist = Math.sqrt(Math.pow(head.RS_Ratio - 100, 2) + Math.pow(head.RS_Momentum - 100, 2));
            tickerDistances.push({ ticker, dist });
        }

        // Sort descending by distance from center
        tickerDistances.sort((a, b) => b.dist - a.dist);
        const top10Tickers = new Set(tickerDistances.slice(0, 10).map((t) => t.ticker));

        // Stagger positions for text labels to prevent text overlap in dense clusters
        const cardinalPositions: ("top right" | "bottom right" | "top left" | "bottom left" | "top center" | "bottom center" | "middle right" | "middle left")[] = [
            "top right",
            "bottom right",
            "top left",
            "bottom left",
            "top center",
            "bottom center",
            "middle right",
            "middle left",
        ];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const traces: any[] = [];
        let minX = 100, maxX = 100, minY = 100, maxY = 100;
        let index = 0;

        for (const [ticker, points] of Object.entries(grouped)) {
            index++;
            points.sort((a, b) => a.Date.localeCompare(b.Date));

            const tailData = points.slice(-(tailLength + 1));
            if (tailData.length === 0) continue;

            const head = tailData[tailData.length - 1];
            const cleanName = cleanTicker(ticker);

            // Hash color generator
            let hash = 0;
            for (let i = 0; i < ticker.length; i++) {
                hash = ticker.charCodeAt(i) + ((hash << 5) - hash);
            }
            const hue = Math.abs(hash) % 360;
            const color = `hsl(${hue}, 85%, 62%)`;

            // Update axis ranges
            for (const p of tailData) {
                if (p.RS_Ratio < minX) minX = p.RS_Ratio;
                if (p.RS_Ratio > maxX) maxX = p.RS_Ratio;
                if (p.RS_Momentum < minY) minY = p.RS_Momentum;
                if (p.RS_Momentum > maxY) maxY = p.RS_Momentum;
            }

            const tailLen = tailData.length;
            const markerSizes = tailData.map((_, i) => Math.max(5, Math.round(4 + (i / Math.max(1, tailLen - 1)) * 4)));
            const markerOpacities = tailData.map((_, i) => Math.min(1.0, 0.6 + (i / Math.max(1, tailLen - 1)) * 0.4));

            // Determine quadrant name for tooltip
            const getQuadrantName = (r: number, m: number) => {
                if (r >= 100 && m >= 100) return "Leading";
                if (r >= 100 && m < 100) return "Weakening";
                if (r < 100 && m < 100) return "Lagging";
                return "Improving";
            };

            // 1. Draw Tail line + path markers
            traces.push({
                x: tailData.map((d) => d.RS_Ratio),
                y: tailData.map((d) => d.RS_Momentum),
                mode: "lines+markers",
                marker: {
                    size: markerSizes,
                    color: color,
                    opacity: markerOpacities,
                    line: { width: 1, color: "#0f172a" },
                },
                line: { width: 2, color: color, opacity: 0.75 },
                hoverinfo: "text",
                hovertext: tailData.map(
                    (d) =>
                        `<b>${cleanName}</b><br>Date: ${d.Date.split("T")[0]}<br>RS-Ratio: ${d.RS_Ratio.toFixed(2)}<br>RS-Mom: ${d.RS_Momentum.toFixed(2)}<br>Quadrant: <b>${getQuadrantName(d.RS_Ratio, d.RS_Momentum)}</b>`
                ),
                showlegend: false,
            });

            // Determine if label should be visible based on labelMode
            const shouldShowLabel =
                labelMode === "staggered" || (labelMode === "leaders" && top10Tickers.has(ticker));

            const textPos = cardinalPositions[index % cardinalPositions.length];

            // 2. Draw Head marker + text label
            traces.push({
                x: [head.RS_Ratio],
                y: [head.RS_Momentum],
                mode: shouldShowLabel ? "markers+text" : "markers",
                text: shouldShowLabel ? [cleanName] : undefined,
                textposition: textPos,
                marker: { symbol: "circle", size: 10, color: color, line: { width: 2, color: "#ffffff" } },
                textfont: { color: color, size: 11, weight: "bold" },
                hoverinfo: "text",
                hovertext: [
                    `<b>${cleanName}</b> (Current Head)<br>Date: ${head.Date.split("T")[0]}<br>RS-Ratio: ${head.RS_Ratio.toFixed(2)}<br>RS-Mom: ${head.RS_Momentum.toFixed(2)}<br>Quadrant: <b>${getQuadrantName(head.RS_Ratio, head.RS_Momentum)}</b>`,
                ],
                showlegend: false,
            });
        }

        // Add padding to axis ranges
        const xPad = (maxX - minX) * 0.1 || 2;
        const yPad = (maxY - minY) * 0.1 || 2;

        const maxDevX = Math.max(Math.abs(maxX - 100), Math.abs(100 - minX)) + xPad;
        const maxDevY = Math.max(Math.abs(maxY - 100), Math.abs(100 - minY)) + yPad;

        return {
            traces,
            xRange: [100 - maxDevX, 100 + maxDevX],
            yRange: [100 - maxDevY, 100 + maxDevY],
        };
    }, [data, tailLength, labelMode]);

    if (!data || data.length === 0) {
        return (
            <div className="w-full h-[850px] flex items-center justify-center bg-slate-900/40 text-slate-400 rounded-lg border border-slate-800">
                <div className="text-center">
                    <p className="font-semibold text-lg text-slate-300 mb-2">No selections active</p>
                    <p className="text-sm">Please select indices/themes to display the Relative Rotation Graph.</p>
                </div>
            </div>
        );
    }

    if (!chartData) {
        return (
            <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-3 h-[850px] flex items-center justify-center">
                <p className="text-slate-400">Loading RRG Data...</p>
            </div>
        );
    }

    return (
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-3 relative">
            {/* Label Density Controls Toolbar */}
            <div className="flex items-center justify-between mb-3 px-2 pt-1 border-b border-[#1e1e2e] pb-2.5">
                <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
                        Graph Labels:
                    </span>
                    <div className="flex bg-[#1a1a2e] border border-slate-700/80 rounded-lg p-0.5">
                        {[
                            { id: "staggered", label: "Auto-Staggered (Clean)" },
                            { id: "leaders", label: "Top 10 Leaders Only" },
                            { id: "hover", label: "Hover / Focus Only" },
                        ].map((mode) => (
                            <button
                                key={mode.id}
                                onClick={() => setLabelMode(mode.id as LabelModeType)}
                                className={`text-xs px-2.5 py-1 rounded-md font-medium transition-all ${
                                    labelMode === mode.id
                                        ? "bg-blue-600 text-white font-semibold shadow-sm"
                                        : "text-slate-400 hover:text-slate-200"
                                }`}
                            >
                                {mode.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="text-[11px] text-slate-500 hidden sm:block">
                    Tip: Hover over any head or path to see details
                </div>
            </div>

            <Plot
                useResizeHandler={true}
                data={chartData.traces}
                layout={{
                    title: { text: `Sector Rotation - ${timeframe}`, font: { size: 14 } },
                    paper_bgcolor: "transparent",
                    plot_bgcolor: "transparent",
                    font: { color: "#94a3b8", family: "Inter, sans-serif" },
                    xaxis: {
                        title: { text: "RS-Ratio (Trend)" },
                        range: chartData.xRange,
                        zeroline: true,
                        zerolinecolor: "gray",
                        zerolinewidth: 1,
                        gridcolor: "#1e1e2e",
                    },
                    yaxis: {
                        title: { text: "RS-Momentum (ROC)" },
                        range: chartData.yRange,
                        zeroline: true,
                        zerolinecolor: "gray",
                        zerolinewidth: 1,
                        gridcolor: "#1e1e2e",
                        scaleanchor: "x",
                        scaleratio: 1,
                    },
                    shapes: [
                        { type: "line", x0: 100, x1: 100, y0: 0, y1: 200, xref: "x", yref: "paper", line: { color: "#334155", width: 1, dash: "dot" } },
                        { type: "line", x0: 0, x1: 200, y0: 100, y1: 100, xref: "paper", yref: "y", line: { color: "#334155", width: 1, dash: "dot" } },
                    ],
                    annotations: [
                        { xref: "paper", yref: "paper", x: 0.98, y: 0.98, text: "LEADING", showarrow: false, font: { color: "rgba(34, 197, 94, 0.35)", size: 36, weight: "bold" }, xanchor: "right", yanchor: "top" },
                        { xref: "paper", yref: "paper", x: 0.98, y: 0.02, text: "WEAKENING", showarrow: false, font: { color: "rgba(234, 179, 8, 0.35)", size: 36, weight: "bold" }, xanchor: "right", yanchor: "bottom" },
                        { xref: "paper", yref: "paper", x: 0.02, y: 0.02, text: "LAGGING", showarrow: false, font: { color: "rgba(239, 68, 68, 0.35)", size: 36, weight: "bold" }, xanchor: "left", yanchor: "bottom" },
                        { xref: "paper", yref: "paper", x: 0.02, y: 0.98, text: "IMPROVING", showarrow: false, font: { color: "rgba(59, 130, 246, 0.35)", size: 36, weight: "bold" }, xanchor: "left", yanchor: "top" },
                    ],
                    showlegend: false,
                    autosize: true,
                    height: 800,
                    margin: { l: 50, r: 25, t: 40, b: 50 },
                }}
                config={{
                    responsive: true,
                    displayModeBar: true,
                    displaylogo: false,
                    modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d"],
                }}
                style={{ width: "100%", height: "800px" }}
            />
        </div>
    );
}
