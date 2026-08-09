// components/charts/MiniIndexChart.tsx
"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ChevronRight, Calendar } from "lucide-react";

const Plot = dynamic(() => import("react-plotly.js"), {
    ssr: false,
    loading: () => (
        <div className="w-full h-[150px] bg-slate-900/30 rounded animate-pulse" />
    ),
});

interface MiniIndexChartProps {
    title: string;
    data: { Date: string; Index_Close: number }[];
    changePercent: number;
    href?: string;
    timeRange?: string;
}

function formatDateLabel(dateStr: string): string {
    if (!dateStr) return "";
    const d = new Date(dateStr + "T00:00:00");
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "2-digit",
    });
}

export function MiniIndexChart({ title, data, changePercent, href, timeRange }: MiniIndexChartProps) {
    if (!data || data.length < 2) return null;

    const isPositive = changePercent >= 0;
    const lineColor = isPositive ? "#22c55e" : "#ef4444";
    const badgeColor = isPositive ? "text-emerald-400" : "text-red-400";
    const badgeBg = isPositive ? "bg-emerald-500/10" : "bg-red-500/10";
    const sign = isPositive ? "+" : "";

    // Date range formatting
    const startDateStr = data[0].Date;
    const endDateStr = data[data.length - 1].Date;
    const startDateFormatted = formatDateLabel(startDateStr);
    const endDateFormatted = formatDateLabel(endDateStr);

    const startDateObj = new Date(startDateStr + "T00:00:00");
    const endDateObj = new Date(endDateStr + "T00:00:00");
    const daysDiff = Math.abs(endDateObj.getTime() - startDateObj.getTime()) / (1000 * 3600 * 24);
    const tickFormat = daysDiff <= 90 ? "%d %b" : "%b '%y";

    // Normalize data to Base 100
    const baseValue = data[0].Index_Close;
    const normalizedData = data.map((d) => ({
        Date: d.Date,
        Value: baseValue > 0 ? (d.Index_Close / baseValue) * 100 : 100,
        Original: d.Index_Close,
    }));

    // Calculate tight Y-axis range
    const yValues = normalizedData.map((d) => d.Value);
    const yMin = Math.min(...yValues);
    const yMax = Math.max(...yValues);
    const yPadding = (yMax - yMin) * 0.1 || 1;

    return (
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-3 hover:border-[#2a2a3e] transition-colors group">
            {/* Header */}
            <div className="flex items-start justify-between mb-2">
                <div className="flex flex-col min-w-0 pr-2">
                    {href ? (
                        <Link href={href} className="flex items-center gap-1 group/link">
                            <h4 className="text-[13px] font-bold text-slate-200 leading-tight truncate group-hover/link:text-blue-400 transition-colors">
                                {title}
                            </h4>
                            <ChevronRight className="h-3.5 w-3.5 text-slate-500 group-hover/link:text-blue-400 transition-colors shrink-0" />
                        </Link>
                    ) : (
                        <h4 className="text-[13px] font-bold text-slate-200 leading-tight truncate group-hover:text-white transition-colors">
                            {title}
                        </h4>
                    )}
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono mt-0.5">
                        <Calendar className="h-2.5 w-2.5 text-slate-500 shrink-0" />
                        <span>{startDateFormatted} – {endDateFormatted}</span>
                        {timeRange && (
                            <span className="text-[9px] px-1 py-0.2 bg-slate-800 text-slate-300 rounded font-semibold ml-0.5 border border-slate-700/50">
                                {timeRange}
                            </span>
                        )}
                    </div>
                </div>
                <span
                    className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${badgeBg} ${badgeColor} whitespace-nowrap shrink-0`}
                >
                    {sign}{changePercent.toFixed(1)}%
                </span>
            </div>

            {/* Chart with visible X-axis dates */}
            <Plot
                useResizeHandler={true}
                data={[
                    {
                        x: normalizedData.map((d) => d.Date),
                        y: normalizedData.map((d) => d.Value),
                        customdata: normalizedData.map((d) => d.Original),
                        type: "scatter",
                        mode: "lines",
                        line: { color: lineColor, width: 1.8 },
                        hovertemplate: "Date: <b>%{x}</b><br>Base 100: <b>%{y:.1f}</b><br>Index: %{customdata:.1f}<extra></extra>",
                        fill: "tozeroy",
                        fillcolor: isPositive
                            ? "rgba(34,197,94,0.06)"
                            : "rgba(239,68,68,0.06)",
                    },
                ]}
                layout={{
                    paper_bgcolor: "transparent",
                    plot_bgcolor: "transparent",
                    font: { color: "#94a3b8", family: "Inter, sans-serif", size: 9 },
                    hoverlabel: {
                        bgcolor: "#1e1e2e",
                        font: { color: "#f8fafc", size: 10, family: "Inter, sans-serif" },
                        bordercolor: "#334155",
                    },
                    margin: { l: 8, r: 8, t: 4, b: 24 },
                    xaxis: {
                        visible: true,
                        showgrid: false,
                        showline: true,
                        linecolor: "#1e1e2e",
                        linewidth: 1,
                        tickfont: { color: "#94a3b8", size: 9, family: "Inter, sans-serif" },
                        fixedrange: true,
                        nticks: 4,
                        tickformat: tickFormat,
                        zeroline: false,
                    },
                    yaxis: {
                        visible: false,
                        fixedrange: true,
                        range: [yMin - yPadding, yMax + yPadding],
                    },
                    hovermode: "x unified" as const,
                    showlegend: false,
                    autosize: true,
                    height: 120,
                    dragmode: false as const,
                }}
                config={{
                    staticPlot: false,
                    responsive: true,
                    displayModeBar: false,
                }}
                style={{ width: "100%", height: "120px" }}
            />
        </div>
    );
}

