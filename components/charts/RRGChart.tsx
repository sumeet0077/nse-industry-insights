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

type LabelModeType = "all" | "hover";

interface RRGChartProps {
    data: RRGDataPoint[];
    tailLength: number;
    timeframe: string;
}

export function RRGChart({ data, tailLength, timeframe }: RRGChartProps) {
    const [hoverOnlyLabels, setHoverOnlyLabels] = useState(false);
    const [hoveredTicker, setHoveredTicker] = useState<string | null>(null);

    const chartData = useMemo(() => {
        if (!data || data.length === 0) return null;

        // Group by ticker
        const grouped = data.reduce((acc, point) => {
            if (!acc[point.Ticker]) acc[point.Ticker] = [];
            acc[point.Ticker].push(point);
            return acc;
        }, {} as Record<string, RRGDataPoint[]>);

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

        const isHoverActive = hoveredTicker !== null;

        for (const [ticker, points] of Object.entries(grouped)) {
            index++;
            points.sort((a, b) => a.Date.localeCompare(b.Date));

            const tailData = points.slice(-(tailLength + 1));
            if (tailData.length === 0) continue;

            const head = tailData[tailData.length - 1];
            const cleanName = cleanTicker(ticker);
            const isHovered = isHoverActive && hoveredTicker === ticker;

            // Hash color generator
            let hash = 0;
            for (let i = 0; i < ticker.length; i++) {
                hash = ticker.charCodeAt(i) + ((hash << 5) - hash);
            }
            const hue = Math.abs(hash) % 360;
            const baseColor = `hsl(${hue}, 85%, 62%)`;

            // Update axis ranges
            for (const p of tailData) {
                if (p.RS_Ratio < minX) minX = p.RS_Ratio;
                if (p.RS_Ratio > maxX) maxX = p.RS_Ratio;
                if (p.RS_Momentum < minY) minY = p.RS_Momentum;
                if (p.RS_Momentum > maxY) maxY = p.RS_Momentum;
            }

            const tailLen = tailData.length;

            // Dynamic styling based on hover focus state
            let lineOpacity = 0.75;
            let lineWidth = 2;
            let markerBaseSize = 4;
            let headMarkerSize = 10;
            let headLineColor = "#ffffff";
            let headLineWidth = 2;

            if (isHoverActive) {
                if (isHovered) {
                    lineOpacity = 1.0;
                    lineWidth = 4;
                    markerBaseSize = 6;
                    headMarkerSize = 14;
                    headLineWidth = 3;
                    headLineColor = "#ffffff";
                } else {
                    lineOpacity = 0.12;
                    lineWidth = 1;
                    markerBaseSize = 3;
                    headMarkerSize = 5;
                    headLineWidth = 0;
                }
            }

            const markerSizes = tailData.map((_, i) => Math.max(3, Math.round(markerBaseSize + (i / Math.max(1, tailLen - 1)) * 4)));
            const markerOpacities = tailData.map((_, i) =>
                isHoverActive
                    ? isHovered ? Math.min(1.0, 0.7 + (i / Math.max(1, tailLen - 1)) * 0.3) : 0.1
                    : Math.min(1.0, 0.6 + (i / Math.max(1, tailLen - 1)) * 0.4)
            );

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
                customdata: tailData.map(() => ticker),
                marker: {
                    size: markerSizes,
                    color: baseColor,
                    opacity: markerOpacities,
                    line: { width: isHoverActive && !isHovered ? 0 : 1, color: "#0f172a" },
                },
                line: { width: lineWidth, color: baseColor, opacity: lineOpacity },
                hoverinfo: "text",
                hovertext: tailData.map(
                    (d) =>
                        `<b>${cleanName}</b><br>Date: ${d.Date.split("T")[0]}<br>RS-Ratio: ${d.RS_Ratio.toFixed(2)}<br>RS-Mom: ${d.RS_Momentum.toFixed(2)}<br>Quadrant: <b>${getQuadrantName(d.RS_Ratio, d.RS_Momentum)}</b>`
                ),
                showlegend: false,
            });

            // Determine if label should be visible based on hoverOnlyLabels & hover
            const shouldShowLabel = isHovered || (!isHoverActive && !hoverOnlyLabels);
            const textPos = cardinalPositions[index % cardinalPositions.length];

            // 2. Draw Head marker + text label
            traces.push({
                x: [head.RS_Ratio],
                y: [head.RS_Momentum],
                mode: shouldShowLabel ? "markers+text" : "markers",
                text: shouldShowLabel ? [cleanName] : undefined,
                textposition: textPos,
                customdata: [ticker],
                marker: {
                    symbol: "circle",
                    size: headMarkerSize,
                    color: baseColor,
                    opacity: isHoverActive && !isHovered ? 0.2 : 1.0,
                    line: { width: headLineWidth, color: headLineColor },
                },
                textfont: {
                    color: isHovered ? "#ffffff" : baseColor,
                    size: isHovered ? 13 : 11,
                    weight: "bold",
                },
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
    }, [data, tailLength, hoverOnlyLabels, hoveredTicker]);

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
                    <button
                        onClick={() => setHoverOnlyLabels(!hoverOnlyLabels)}
                        className={`text-xs px-3 py-1 rounded-md font-medium transition-all ${
                            hoverOnlyLabels
                                ? "bg-blue-600 text-white font-semibold shadow-sm"
                                : "bg-[#1a1a2e] border border-slate-700/80 text-slate-400 hover:text-slate-200"
                        }`}
                    >
                        Hover / Focus Only
                    </button>
                </div>

                <div className="text-[11px] text-slate-400 font-medium hidden sm:block">
                    {hoveredTicker ? (
                        <span className="text-blue-400 font-bold">
                            Focusing: {cleanTicker(hoveredTicker)}
                        </span>
                    ) : (
                        <span>Tip: Hover over any head or path to highlight</span>
                    )}
                </div>
            </div>

            <Plot
                useResizeHandler={true}
                data={chartData.traces}
                onHover={(event) => {
                    if (event.points && event.points.length > 0) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const pt = event.points[0] as any;
                        const t = Array.isArray(pt.customdata) ? pt.customdata[0] : pt.customdata;
                        if (t && typeof t === "string") {
                            setHoveredTicker(t);
                        }
                    }
                }}
                onUnhover={() => setHoveredTicker(null)}
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

