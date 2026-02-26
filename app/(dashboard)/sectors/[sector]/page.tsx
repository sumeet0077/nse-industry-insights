// app/(dashboard)/sectors/[sector]/page.tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getConfigById, SECTORS } from "@/lib/config";
import { getBreadthData } from "@/lib/data";

interface Props {
    params: Promise<{ sector: string }>;
}

export async function generateStaticParams() {
    return SECTORS.map((c) => ({ sector: c.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { sector } = await params;
    const config = getConfigById(sector);
    if (!config) return {};
    return {
        title: `${config.title} Market Breadth`,
        description: `${config.title} sector breadth analysis — track stocks above the 200-day moving average.`,
    };
}

export default async function SectorPage({ params }: Props) {
    const { sector } = await params;
    const config = getConfigById(sector);
    if (!config) notFound();

    const data = getBreadthData(config.dataFile);

    return (
        <div>
            <h1 className="text-xl font-bold text-white mb-1">{config.title} Market Breadth</h1>
            <p className="text-sm text-slate-400 mb-6">{config.description}</p>
            {data.length === 0 ? (
                <div className="text-slate-500 text-sm">Data unavailable.</div>
            ) : (
                <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-4 text-sm text-slate-500">
                    Charts and constituent table coming in Phase 2 — {data.length} data points loaded ✓
                </div>
            )}
        </div>
    );
}
