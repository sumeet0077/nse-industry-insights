// components/charts/BreadthChart.tsx
"use client";

import dynamic from "next/dynamic";
import type { BreadthDataPoint } from "@/types";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface BreadthChartProps {
    data: BreadthDataPoint[];
    title: string;
}

export function BreadthChart({ data, title }: BreadthChartProps) {
    if (!data || data.length === 0) return null;

    return (
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-3">
            <h3 className="text-sm font-semibold text-white mb-2">% of Stocks Above 200 DMA</h3>
            <Plot
                data={[
                    {
                        x: data.map((d) => d.Date),
                        y: data.map((d) => d.Percentage),
                        type: "scatter",
                        mode: "lines",
                        name: "% Above 200 SMA",
                        line: { color: "#3b82f6", width: 2 },
                        hovertemplate: "<b>%{x|%d %b %Y}</b><br>%{y:.2f}%<extra></extra>",
                    },
                ]}
                layout={{
                    paper_bgcolor: "transparent",
                    plot_bgcolor: "transparent",
                    font: { color: "#94a3b8", family: "Inter, sans-serif", size: 11 },
                    margin: { l: 40, r: 15, t: 10, b: 40 },
                    xaxis: {
                        gridcolor: "#1e1e2e",
                        tickformat: "%b '%y",
                        rangeslider: { visible: true, thickness: 0.06, bgcolor: "#111118", borderwidth: 0 },
                    },
                    yaxis: {
                        gridcolor: "#1e1e2e",
                        range: [0, 100],
                        ticksuffix: "%",
                    },
                    shapes: [
                        // Green zone (bullish)
                        { type: "rect", x0: 0, x1: 1, xref: "paper", y0: 80, y1: 100, fillcolor: "rgba(34,197,94,0.08)", line: { width: 0 }, layer: "below" },
                        // Red zone (bearish)
                        { type: "rect", x0: 0, x1: 1, xref: "paper", y0: 0, y1: 20, fillcolor: "rgba(239,68,68,0.08)", line: { width: 0 }, layer: "below" },
                    ],
                    hovermode: "x unified",
                    showlegend: false,
                    autosize: true,
                    height: 400,
                }}
                config={{ responsive: true, displayModeBar: false }}
                style={{ width: "100%", height: "400px" }}
            />
        </div>
    );
}

export function ParticipationChart({ data, title }: BreadthChartProps) {
    if (!data || data.length === 0) return null;

    return (
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-3 mt-4">
            <h3 className="text-sm font-semibold text-white mb-2">Stock Participation (Above vs Below 200 DMA)</h3>
            <Plot
                data={[
                    {
                        x: data.map((d) => d.Date),
                        y: data.map((d) => d.Above),
                        type: "scatter",
                        mode: "lines",
                        name: "Above 200 DMA",
                        stackgroup: "one",
                        fillcolor: "rgba(34,197,94,0.3)",
                        line: { color: "#22c55e", width: 0.5 },
                    },
                    {
                        x: data.map((d) => d.Date),
                        y: data.map((d) => d.Below),
                        type: "scatter",
                        mode: "lines",
                        name: "Below 200 DMA",
                        stackgroup: "one",
                        fillcolor: "rgba(239,68,68,0.3)",
                        line: { color: "#ef4444", width: 0.5 },
                    },
                ]}
                layout={{
                    paper_bgcolor: "transparent",
                    plot_bgcolor: "transparent",
                    font: { color: "#94a3b8", family: "Inter, sans-serif", size: 11 },
                    margin: { l: 40, r: 15, t: 10, b: 40 },
                    xaxis: { gridcolor: "#1e1e2e", tickformat: "%b '%y" },
                    yaxis: { gridcolor: "#1e1e2e" },
                    hovermode: "x unified",
                    showlegend: true,
                    legend: { orientation: "h", y: 1.12, x: 0.5, xanchor: "center", font: { size: 10 } },
                    autosize: true,
                    height: 300,
                }}
                config={{ responsive: true, displayModeBar: false }}
                style={{ width: "100%", height: "300px" }}
            />
        </div>
    );
}
