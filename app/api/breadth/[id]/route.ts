import { NextRequest, NextResponse } from "next/server";
import { getBreadthData } from "@/lib/data";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const data = getBreadthData(id);
    if (!data || data.length === 0) {
        return NextResponse.json({ error: "Data not found" }, { status: 404 });
    }
    return NextResponse.json(data);
}
