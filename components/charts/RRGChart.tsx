// components/charts/RRGChart.tsx
"use client";

import dynamic from "next/dynamic";
import type { RRGDataPoint } from "@/types";
import { useMemo } from "react";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface RRGChartProps {
    data: RRGDataPoint[];
    tailLength: number;
    timeframe: string;
}

export function RRGChart({ data, tailLength, timeframe }: RRGChartProps) {
    const chartData = useMemo(() => {
        if (!data || data.length === 0) return null;

        // Group by ticker
        const grouped = data.reduce((acc, point) => {
            if (!acc[point.Ticker]) acc[point.Ticker] = [];
            acc[point.Ticker].push(point);
            return acc;
        }, {} as Record<string, RRGDataPoint[]>);

        // Build plotly traces
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const traces: any[] = [];
        let minX = 100, maxX = 100, minY = 100, maxY = 100;

        for (const [ticker, points] of Object.entries(grouped)) {
            // Sort by date just in case
            points.sort((a, b) => a.Date.localeCompare(b.Date));

            // Get the requested tail length + 1 (for the current point)
            const tailData = points.slice(-(tailLength + 1));
            if (tailData.length === 0) continue;

            const head = tailData[tailData.length - 1];
            const xVal = head.RS_Ratio;
            const yVal = head.RS_Momentum;

            let color = "#3b82f6"; // Improving (Blue) default
            if (xVal > 100 && yVal > 100) color = "#22c55e"; // Leading (Green)
            else if (xVal > 100 && yVal <= 100) color = "#eab308"; // Weakening (Yellow)
            else if (xVal <= 100 && yVal <= 100) color = "#ef4444"; // Lagging (Red)

            // Update manual axis ranges
            for (const p of tailData) {
                if (p.RS_Ratio < minX) minX = p.RS_Ratio;
                if (p.RS_Ratio > maxX) maxX = p.RS_Ratio;
                if (p.RS_Momentum < minY) minY = p.RS_Momentum;
                if (p.RS_Momentum > maxY) maxY = p.RS_Momentum;
            }

            // 1. Draw Path (tail)
            traces.push({
                x: tailData.map(d => d.RS_Ratio),
                y: tailData.map(d => d.RS_Momentum),
                mode: "lines+markers",
                marker: { size: 4, color: color, opacity: 0.4 },
                line: { width: 2, color: color, opacity: 0.6 },
                hoverinfo: "text",
                hovertext: tailData.map(
                    d => `<b>${ticker}</b><br>Date: ${d.Date.split('T')[0]}<br>Ratio: ${d.RS_Ratio.toFixed(2)}<br>Mom: ${d.RS_Momentum.toFixed(2)}`
                ),
                showlegend: false,
            });

            // 2. Draw Head
            traces.push({
                x: [head.RS_Ratio],
                y: [head.RS_Momentum],
                mode: "markers+text",
                text: [ticker],
                textposition: "top right",
                marker: { symbol: "circle", size: 8, color: color },
                textfont: { color: color, size: 12, weight: "bold" },
                hoverinfo: "none",
                showlegend: false,
            });
        }

        // Add padding to axis ranges
        const xPad = (maxX - minX) * 0.1 || 2;
        const yPad = (maxY - minY) * 0.1 || 2;

        // Ensure symmetric around 100 for better quadrant view (optional, but good for RRG)
        const maxDevX = Math.max(Math.abs(maxX - 100), Math.abs(100 - minX)) + xPad;
        const maxDevY = Math.max(Math.abs(maxY - 100), Math.abs(100 - minY)) + yPad;

        return {
            traces,
            xRange: [100 - maxDevX, 100 + maxDevX],
            yRange: [100 - maxDevY, 100 + maxDevY],
        };
    }, [data, tailLength]);

    if (!chartData) {
        return (
            <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-3 h-[850px] flex items-center justify-center">
                <p className="text-slate-400">Loading RRG Data...</p>
            </div>
        );
    }

    return (
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-3">
            <Plot
                data={chartData.traces}
                layout={{
                    title: { text: `Sector Rotation (vs Nifty 50) - ${timeframe}` },
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
                        // Quadrant divider lines
                        { type: "line", x0: 100, x1: 100, y0: 0, y1: 200, xref: "x", yref: "paper", line: { color: "#334155", width: 1, dash: "dot" } },
                        { type: "line", x0: 0, x1: 200, y0: 100, y1: 100, xref: "paper", yref: "y", line: { color: "#334155", width: 1, dash: "dot" } },
                    ],
                    annotations: [
                        { xref: "paper", yref: "paper", x: 0.98, y: 0.98, text: "LEADING", showarrow: false, font: { color: "rgba(34, 197, 94, 0.15)", size: 30, weight: "bold" }, xanchor: "right", yanchor: "top" },
                        { xref: "paper", yref: "paper", x: 0.98, y: 0.02, text: "WEAKENING", showarrow: false, font: { color: "rgba(234, 179, 8, 0.15)", size: 30, weight: "bold" }, xanchor: "right", yanchor: "bottom" },
                        { xref: "paper", yref: "paper", x: 0.02, y: 0.02, text: "LAGGING", showarrow: false, font: { color: "rgba(239, 68, 68, 0.15)", size: 30, weight: "bold" }, xanchor: "left", yanchor: "bottom" },
                        { xref: "paper", yref: "paper", x: 0.02, y: 0.98, text: "IMPROVING", showarrow: false, font: { color: "rgba(59, 130, 246, 0.15)", size: 30, weight: "bold" }, xanchor: "left", yanchor: "top" },
                    ],
                    showlegend: false,
                    autosize: true,
                    height: 850,
                    margin: { l: 50, r: 20, t: 50, b: 50 },
                }}
                config={{ responsive: true, displayModeBar: false }}
                style={{ width: "100%", height: "850px" }}
            />
        </div>
    );
}
