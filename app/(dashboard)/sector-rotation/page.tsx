// app/(dashboard)/sector-rotation/page.tsx
import type { Metadata } from "next";
import { getRRGData } from "@/lib/data";
import { SectorRotationClient } from "@/components/SectorRotationClient";

export const metadata: Metadata = {
    title: "Sector Rotation (RRG)",
    description: "Cycle analysis of themes vs Nifty 50 with Relative Rotation Graphs.",
};

export default function SectorRotationPage() {
    const dataD = getRRGData("D");
    const dataW = getRRGData("W");
    const dataM = getRRGData("M");

    return <SectorRotationClient dataD={dataD} dataW={dataW} dataM={dataM} />;
}
