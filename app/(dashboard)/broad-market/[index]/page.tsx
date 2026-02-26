// app/(dashboard)/broad-market/[index]/page.tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getConfigById, BROAD_MARKET } from "@/lib/config";
import { getBreadthData, getConstituentPerformance, getMarketStatusForIndex } from "@/lib/data";
import { IndexDetailPage } from "@/components/common/IndexDetailPage";

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
        title: `${config.title} Market Breadth | NSE Industry Insights`,
        description: `${config.title} breadth analysis — track stocks above the 200-day SMA.`,
    };
}

export default async function BroadMarketPage({ params }: Props) {
    const { index } = await params;
    const config = getConfigById(index);
    if (!config) notFound();

    const breadthData = getBreadthData(config.dataFile);
    const allConstituents = getConstituentPerformance();
    const marketStatus = getMarketStatusForIndex(config.title);

    const constituents = allConstituents[config.title]
        ? Object.entries(allConstituents[config.title]).map(([ticker, data]) => {
            const { ticker: _t, ...rest } = data;
            return { ticker, ...rest };
        })
        : [];

    return (
        <IndexDetailPage
            title={config.title}
            description={config.description}
            breadthData={breadthData}
            constituentData={constituents}
            marketStatus={marketStatus}
        />
    );
}
