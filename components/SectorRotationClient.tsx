// components/SectorRotationClient.tsx
"use client";

import { useState } from "react";
import { RRGChart } from "@/components/charts/RRGChart";
import type { RRGDataPoint } from "@/types";

interface SectorRotationClientProps {
    dataD: RRGDataPoint[];
    dataW: RRGDataPoint[];
    dataM: RRGDataPoint[];
}

export function SectorRotationClient({ dataD, dataW, dataM }: SectorRotationClientProps) {
    const [timeframe, setTimeframe] = useState<"D" | "W" | "M">("W");
    const [tailLength, setTailLength] = useState(5);

    const currentData = timeframe === "D" ? dataD : timeframe === "W" ? dataW : dataM;
    const timeframeLabel = timeframe === "D" ? "Daily" : timeframe === "W" ? "Weekly" : "Monthly";

    return (
        <div>
            <h1 className="text-xl font-bold text-white mb-1">Relative Rotation Graph (RRG)</h1>
            <p className="text-sm text-slate-400 mb-6 font-medium">
                Cycle analysis of themes vs Nifty 50
            </p>

            <div className="flex flex-col md:flex-row gap-6 mb-6 bg-[#111118] border border-[#1e1e2e] p-4 rounded-lg">
                <div className="flex-1">
                    <label className="block text-xs text-slate-400 mb-2 font-semibold">
                        Timeframe
                    </label>
                    <select
                        value={timeframe}
                        onChange={(e) => setTimeframe(e.target.value as "D" | "W" | "M")}
                        className="w-full bg-[#1a1a2e] border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                        <option value="D">Daily</option>
                        <option value="W">Weekly</option>
                        <option value="M">Monthly</option>
                    </select>
                </div>

                <div className="flex-1">
                    <label className="block text-xs text-slate-400 mb-2 font-semibold flex justify-between">
                        <span>Tail Length (Periods)</span>
                        <span className="text-blue-400">{tailLength}</span>
                    </label>
                    <input
                        type="range"
                        min="1"
                        max="12"
                        value={tailLength}
                        onChange={(e) => setTailLength(parseInt(e.target.value))}
                        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500 mt-2"
                    />
                </div>
            </div>

            <RRGChart data={currentData} tailLength={tailLength} timeframe={timeframeLabel} />
        </div>
    );
}
