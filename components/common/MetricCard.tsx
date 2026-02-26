// components/common/MetricCard.tsx
import { cn } from "@/lib/utils";

interface MetricCardProps {
    label: string;
    value: number | string;
    color?: "emerald" | "red" | "blue" | "amber" | "default";
    suffix?: string;
}

const colorMap = {
    emerald: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
    red: "bg-red-500/10 border-red-500/20 text-red-400",
    blue: "bg-blue-500/10 border-blue-500/20 text-blue-400",
    amber: "bg-amber-500/10 border-amber-500/20 text-amber-400",
    default: "bg-slate-800/50 border-slate-700 text-white",
};

export function MetricCard({ label, value, color = "default", suffix }: MetricCardProps) {
    return (
        <div className={cn("rounded-lg border p-4", colorMap[color])}>
            <p className="text-xs text-slate-400 mb-1">{label}</p>
            <p className="text-2xl font-bold">
                {value}
                {suffix && <span className="text-sm font-normal ml-1">{suffix}</span>}
            </p>
        </div>
    );
}

interface MetricCardsRowProps {
    total: number;
    above: number;
    below: number;
    percentage: number;
}

export function MetricCardsRow({ total, above, below, percentage }: MetricCardsRowProps) {
    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <MetricCard label="Total Stocks" value={total} color="blue" />
            <MetricCard label="Above 200 DMA" value={above} color="emerald" />
            <MetricCard label="Below 200 DMA" value={below} color="red" />
            <MetricCard
                label="Breadth"
                value={percentage.toFixed(1)}
                suffix="%"
                color={percentage >= 50 ? "emerald" : "red"}
            />
        </div>
    );
}
