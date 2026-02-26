// components/common/MetricCard.tsx
import { cn } from "@/lib/utils";

interface MetricCardProps {
    label: string;
    value: number | string;
    delta?: number | null;
    deltaInverse?: boolean;
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

export function MetricCard({ label, value, delta, deltaInverse, color = "default", suffix }: MetricCardProps) {
    let deltaColor = "text-gray-400";
    let deltaSign = "";
    if (delta !== null && delta !== undefined) {
        if (deltaInverse) {
            deltaColor = delta > 0 ? "text-red-400" : delta < 0 ? "text-emerald-400" : "text-gray-400";
        } else {
            deltaColor = delta > 0 ? "text-emerald-400" : delta < 0 ? "text-red-400" : "text-gray-400";
        }
        deltaSign = delta > 0 ? "+" : "";
    }

    return (
        <div className={cn("rounded-lg border p-4", colorMap[color])}>
            <p className="text-xs text-slate-400 mb-1">{label}</p>
            <div className="flex items-baseline gap-2">
                <p className="text-2xl font-bold">
                    {value}
                    {suffix && <span className="text-sm font-normal ml-1">{suffix}</span>}
                </p>
                {delta !== null && delta !== undefined && (
                    <span className={cn("text-xs font-medium", deltaColor)}>
                        {deltaSign}{typeof delta === "number" && !suffix ? delta : `${delta}${suffix || ""}`}
                    </span>
                )}
            </div>
        </div>
    );
}

interface MetricCardsRowProps {
    total: number;
    above: number;
    below: number;
    percentage: number;
    prevAbove?: number;
    prevBelow?: number;
    prevPercentage?: number;
}

export function MetricCardsRow({ total, above, below, percentage, prevAbove, prevBelow, prevPercentage }: MetricCardsRowProps) {
    const aboveDelta = prevAbove !== undefined ? above - prevAbove : null;
    const belowDelta = prevBelow !== undefined ? below - prevBelow : null;
    const percentageDelta = prevPercentage !== undefined ? percentage - prevPercentage : null;

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <MetricCard label="Total Stocks" value={total} color="blue" />
            <MetricCard
                label="Stocks > 200 SMA"
                value={above}
                delta={aboveDelta}
                color="emerald"
            />
            <MetricCard
                label="Stocks < 200 SMA"
                value={below}
                delta={belowDelta}
                deltaInverse={true}
                color="red"
            />
            <MetricCard
                label="Breadth (%)"
                value={percentage.toFixed(2)}
                suffix="%"
                delta={percentageDelta !== null ? Number(percentageDelta.toFixed(2)) : null}
                color={percentage >= 50 ? "emerald" : "red"}
            />
        </div>
    );
}
