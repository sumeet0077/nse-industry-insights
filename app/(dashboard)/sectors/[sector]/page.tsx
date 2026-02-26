// app/(dashboard)/sectors/[sector]/page.tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getConfigById, SECTORS } from "@/lib/config";
import { getBreadthData, getConstituentPerformance } from "@/lib/data";
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
        title: `${config.title} Market Breadth`,
        description: `${config.title} sector breadth analysis — track stocks above the 200-day SMA.`,
    };
}

export default async function SectorPage({ params }: Props) {
    const { sector } = await params;
    const config = getConfigById(sector);
    if (!config) notFound();

    const breadthData = getBreadthData(config.dataFile);
    const allConstituents = getConstituentPerformance();
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
        />
    );
}
