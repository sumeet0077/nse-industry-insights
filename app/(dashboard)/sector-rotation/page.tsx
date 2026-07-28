import type { Metadata } from "next";
import { getRRGData, getAllThemeBreadthData } from "@/lib/data";
import { SectorRotationClient } from "@/components/SectorRotationClient";

export const metadata: Metadata = {
    title: "Sector Rotation (RRG)",
    description: "Cycle analysis of themes vs Broad Market Indices with Relative Rotation Graphs.",
};

export default function SectorRotationPage() {
    const dataD = getRRGData("D");
    const dataW = getRRGData("W");
    const dataM = getRRGData("M");
    const allThemeData = getAllThemeBreadthData();

    return (
        <SectorRotationClient
            dataD={dataD}
            dataW={dataW}
            dataM={dataM}
            allThemeData={allThemeData}
        />
    );
}

