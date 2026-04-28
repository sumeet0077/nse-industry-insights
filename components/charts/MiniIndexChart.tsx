// components/charts/MiniIndexChart.tsx
"use client";

import dynamic from "next/dynamic";

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
}

export function MiniIndexChart({ title, data, changePercent }: MiniIndexChartProps) {
    if (!data || data.length < 2) return null;

    const isPositive = changePercent >= 0;
    const lineColor = isPositive ? "#22c55e" : "#ef4444";
    const badgeColor = isPositive ? "text-emerald-400" : "text-red-400";
    const badgeBg = isPositive ? "bg-emerald-500/10" : "bg-red-500/10";
    const sign = isPositive ? "+" : "";

    return (
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-3 hover:border-[#2a2a3e] transition-colors group">
            {/* Header */}
            <div className="flex items-start justify-between mb-1">
                <h4 className="text-[12px] font-semibold text-slate-300 leading-tight truncate pr-2 group-hover:text-white transition-colors">
                    {title}
                </h4>
                <span
                    className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${badgeBg} ${badgeColor} whitespace-nowrap`}
                >
                    {sign}{changePercent.toFixed(1)}%
                </span>
            </div>

            {/* Chart */}
            <Plot
                data={[
                    {
                        x: data.map((d) => d.Date),
                        y: data.map((d) => d.Index_Close),
                        type: "scatter",
                        mode: "lines",
                        line: { color: lineColor, width: 1.5 },
                        hovertemplate: "<b>%{x|%d %b %Y}</b><br>Index: %{y:.1f}<extra></extra>",
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
                    margin: { l: 0, r: 0, t: 0, b: 0 },
                    xaxis: {
                        visible: false,
                        fixedrange: true,
                    },
                    yaxis: {
                        visible: false,
                        fixedrange: true,
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
