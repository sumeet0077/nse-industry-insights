// components/common/IndexDetailPage.tsx
"use client";

import { BreadthChart, ParticipationChart } from "@/components/charts/BreadthChart";
import { MetricCardsRow } from "@/components/common/MetricCard";
import { ConstituentTable } from "@/components/tables/ConstituentTable";
import type { BreadthDataPoint } from "@/types";
import { useState } from "react";

interface IndexDetailPageProps {
    title: string;
    description: string;
    breadthData: BreadthDataPoint[];
    constituentData?: Array<{ ticker: string;[k: string]: number | string | null | undefined }>;
}

export function IndexDetailPage({ title, description, breadthData, constituentData }: IndexDetailPageProps) {
    const [activeTab, setActiveTab] = useState<"chart" | "constituents">("chart");

    // Latest data point for metric cards
    const latest = breadthData.length > 0 ? breadthData[breadthData.length - 1] : null;

    return (
        <div>
            <h1 className="text-xl font-bold text-white mb-1">{title}</h1>
            <p className="text-sm text-slate-400 mb-4">{description}</p>

            {/* Metric Cards */}
            {latest && (
                <MetricCardsRow
                    total={latest.Total}
                    above={latest.Above}
                    below={latest.Below}
                    percentage={latest.Percentage}
                />
            )}

            {/* Tabs */}
            <div className="flex gap-1 mb-4 border-b border-[#1e1e2e]">
                <button
                    onClick={() => setActiveTab("chart")}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === "chart"
                            ? "text-blue-400 border-b-2 border-blue-400"
                            : "text-slate-400 hover:text-white"
                        }`}
                >
                    Breadth Chart
                </button>
                {constituentData && constituentData.length > 0 && (
                    <button
                        onClick={() => setActiveTab("constituents")}
                        className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === "constituents"
                                ? "text-blue-400 border-b-2 border-blue-400"
                                : "text-slate-400 hover:text-white"
                            }`}
                    >
                        Constituents
                    </button>
                )}
            </div>

            {/* Tab content */}
            {activeTab === "chart" && (
                <>
                    <BreadthChart data={breadthData} title={title} />
                    <ParticipationChart data={breadthData} title={title} />
                </>
            )}

            {activeTab === "constituents" && constituentData && (
                <ConstituentTable data={constituentData} />
            )}
        </div>
    );
}
