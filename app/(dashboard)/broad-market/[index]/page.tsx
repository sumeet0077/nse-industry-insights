// app/(dashboard)/broad-market/[index]/page.tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getConfigById } from "@/lib/config";
import { getBreadthData } from "@/lib/data";
import { BROAD_MARKET } from "@/lib/config";

interface Props {
    params: Promise<{ index: string }>;
}

export async function generateStaticParams() {
    return BROAD_MARKET.map((c) => ({ index: c.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { index } = await params;
    const config = getConfigById(index);
    if (!config) return {};
    return {
        title: `${config.title} Market Breadth`,
        description: `${config.title} breadth analysis — track stocks above the 200-day moving average.`,
    };
}

export default async function BroadMarketPage({ params }: Props) {
    const { index } = await params;
    const config = getConfigById(index);
    if (!config) notFound();

    const data = getBreadthData(config.dataFile);

    return (
        <div>
            <h1 className="text-xl font-bold text-white mb-1">{config.title} Market Breadth</h1>
            <p className="text-sm text-slate-400 mb-6">{config.description}</p>

            {data.length === 0 ? (
                <div className="text-slate-500 text-sm">
                    Data unavailable. Please check back after the next data refresh.
                </div>
            ) : (
                <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-4 text-slate-300 text-sm">
                    {/* Phase 2: BreadthChart + MetricCards + ConstituentTable go here */}
                    <p className="text-slate-500">
                        Charts and constituent table coming in Phase 2 — {data.length} data points loaded ✓
                    </p>
                </div>
            )}
        </div>
    );
}
