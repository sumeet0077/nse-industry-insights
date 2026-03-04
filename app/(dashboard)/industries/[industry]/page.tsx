// app/(dashboard)/industries/[industry]/page.tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getConfigById, INDUSTRIES } from "@/lib/config";
import { getBreadthData, getConstituentPerformance, getMarketStatusForIndex, getLatestDataDate } from "@/lib/data";
import { IndexDetailPage } from "@/components/common/IndexDetailPage";

interface Props {
    params: Promise<{ industry: string }>;
}

export async function generateStaticParams() {
    return INDUSTRIES.map((c) => ({ industry: c.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { industry } = await params;
    const config = getConfigById(industry);
    if (!config) return {};
    return {
        title: `${config.title} Market Breadth | NSE Industry Insights`,
        description: `${config.title} industry breadth analysis — track stocks above the 200-day SMA.`,
    };
}

export default async function IndustryPage({ params }: Props) {
    const { industry } = await params;
    const config = getConfigById(industry);
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
            isIndustry={true}
            globalLatestDate={getLatestDataDate()}
        />
    );
}
