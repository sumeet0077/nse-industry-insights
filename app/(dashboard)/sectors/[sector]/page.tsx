// app/(dashboard)/sectors/[sector]/page.tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getConfigById, SECTORS } from "@/lib/config";
import { getBreadthData, getConstituentPerformance, getMarketStatusForIndex, getLatestDataDate } from "@/lib/data";
import { IndexDetailPage } from "@/components/common/IndexDetailPage";

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
        title: `${config.title} Market Breadth | NSE Industry Insights`,
        description: `${config.title} sector breadth analysis — track stocks above the 200-day SMA.`,
    };
}

export default async function SectorPage({ params }: Props) {
    const { sector } = await params;
    const config = getConfigById(sector);
    if (!config) notFound();

    const breadthData = getBreadthData(config.dataFile);
    const allConstituents = getConstituentPerformance();
    const marketStatus = getMarketStatusForIndex(config.title);

    let constituents: any[] = [];
    if (marketStatus) {
        const allTickers = [
            ...(marketStatus.above || []),
            ...(marketStatus.below || []),
            ...(marketStatus.new_stock || []),
        ];
        constituents = allTickers.map((ticker) => {
            const data = allConstituents[ticker] || {};
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { ticker: _t, ...rest } = data;
            return { ticker, ...rest };
        });
    }

    return (
        <IndexDetailPage
            title={config.title}
            description={config.description}
            breadthData={breadthData}
            constituentData={constituents}
            marketStatus={marketStatus}
            globalLatestDate={getLatestDataDate()}
        />
    );
}
