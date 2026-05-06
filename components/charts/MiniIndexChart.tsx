// components/charts/MiniIndexChart.tsx
"use client";

import dynamic from "next/dynamic";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

const Plot = dynamic(() => import("react-plotly.js"), {
    ssr: false,
    loading: () => (
        <div className="w-full h-[140px] bg-slate-900/30 rounded animate-pulse" />
    ),
});

interface MiniIndexChartProps {
    title: string;
    data: { Date: string; Index_Close: number }[];
    changePercent: number;
    href?: string;
}

export function MiniIndexChart({ title, data, changePercent, href }: MiniIndexChartProps) {
    if (!data || data.length < 2) return null;

    const isPositive = changePercent >= 0;
    const lineColor = isPositive ? "#22c55e" : "#ef4444";
    const badgeColor = isPositive ? "text-emerald-400" : "text-red-400";
    const badgeBg = isPositive ? "bg-emerald-500/10" : "bg-red-500/10";
    const sign = isPositive ? "+" : "";

    // Normalize data to Base 100 (like a Mutual Fund NAV)
    const baseValue = data[0].Index_Close;
    const normalizedData = data.map((d) => ({
        Date: d.Date,
        Value: baseValue > 0 ? (d.Index_Close / baseValue) * 100 : 100,
        Original: d.Index_Close,
    }));

    // Calculate tight Y-axis range to prevent flat-line scaling
    const yValues = normalizedData.map((d) => d.Value);
    const yMin = Math.min(...yValues);
    const yMax = Math.max(...yValues);
    const yPadding = (yMax - yMin) * 0.1 || 1; // 10% padding

    return (
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-3 hover:border-[#2a2a3e] transition-colors group">
            {/* Header */}
            <div className="flex items-start justify-between mb-1">
                {href ? (
                    <Link href={href} className="flex items-center gap-1 group/link">
                        <h4 className="text-[12px] font-semibold text-slate-300 leading-tight truncate pr-1 group-hover/link:text-blue-400 transition-colors">
                            {title}
                        </h4>
                        <ChevronRight className="h-3 w-3 text-slate-500 group-hover/link:text-blue-400 transition-colors" />
                    </Link>
                ) : (
                    <h4 className="text-[12px] font-semibold text-slate-300 leading-tight truncate pr-2 group-hover:text-white transition-colors">
                        {title}
                    </h4>
                )}
                <span
                    className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${badgeBg} ${badgeColor} whitespace-nowrap`}
                >
                    {sign}{changePercent.toFixed(1)}%
                </span>
            </div>

            {/* Chart */}
            <Plot
                useResizeHandler={true}
                data={[
                    {
                        x: normalizedData.map((d) => d.Date),
                        y: normalizedData.map((d) => d.Value),
                        customdata: normalizedData.map((d) => d.Original),
                        type: "scatter",
                        mode: "lines",
                        line: { color: lineColor, width: 1.5 },
                        hovertemplate: "Base 100: <b>%{y:.1f}</b><br>Index: %{customdata:.1f}<extra></extra>",
                        fill: "tozeroy",
                        fillcolor: isPositive
                            ? "rgba(34,197,94,0.05)"
                            : "rgba(239,68,68,0.05)",
                    },
                ]}
                layout={{
                    paper_bgcolor: "transparent",
                    plot_bgcolor: "transparent",
                    font: { color: "#64748b", family: "Inter, sans-serif", size: 9 },
                    hoverlabel: {
                        bgcolor: "#1e1e2e",
                        font: { color: "#f8fafc", size: 10, family: "Inter, sans-serif" },
                        bordercolor: "#334155",
                    },
                    margin: { l: 0, r: 0, t: 0, b: 0 },
                    xaxis: {
                        visible: false,
                        fixedrange: true,
                    },
                    yaxis: {
                        visible: false,
                        fixedrange: true,
                        range: [yMin - yPadding, yMax + yPadding],
                    },
                    hovermode: "x unified" as const,
                    showlegend: false,
                    autosize: true,
                    height: 100,
                    dragmode: false as const,
                }}
                config={{
                    staticPlot: false,
                    responsive: true,
                    displayModeBar: false,
                }}
                style={{ width: "100%", height: "100px" }}
            />
        </div>
    );
}
