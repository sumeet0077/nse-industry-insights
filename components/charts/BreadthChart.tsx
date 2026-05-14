"use client";

import { useEffect, useRef } from "react";
import { createChart, ColorType, CrosshairMode, IChartApi, ISeriesApi, LineSeries, AreaSeries } from "lightweight-charts";
import type { BreadthDataPoint } from "@/types";

interface BreadthChartProps {
    data: BreadthDataPoint[];
    title: string;
}

export function BreadthChart({ data, title }: BreadthChartProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    
    // Formatting data
    const lwData = data
        .filter(d => d.Percentage !== undefined && d.Percentage !== null)
        .map(d => ({
            time: d.Date,
            value: d.Percentage
        }));

    useEffect(() => {
        if (!chartContainerRef.current || lwData.length === 0) return;

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: 'transparent' },
                textColor: '#94a3b8',
                fontFamily: 'Inter, sans-serif',
            },
            grid: {
                vertLines: { color: '#1e1e2e', style: 1 },
                horzLines: { color: '#1e1e2e', style: 1 },
            },
            rightPriceScale: {
                borderVisible: false,
                scaleMargins: { top: 0.1, bottom: 0.1 },
            },
            timeScale: {
                borderVisible: false,
                timeVisible: true,
                rightOffset: 5,
            },
            crosshair: {
                mode: CrosshairMode.Normal,
                vertLine: { width: 1, color: '#334155', style: 3 },
                horzLine: { width: 1, color: '#334155', style: 3 },
            },
            autoSize: true,
        });
        chartRef.current = chart;

        // Oversold background (Green)
        const oversoldBg = chart.addSeries(AreaSeries, {
            lineColor: 'transparent',
            topColor: 'rgba(34,197,94,0.02)', // Very faint green
            bottomColor: 'rgba(34,197,94,0.15)', // Light green at bottom
            lineWidth: 1,
            priceLineVisible: false,
            crosshairMarkerVisible: false,
        });
        oversoldBg.setData(lwData.map(d => ({ time: d.time, value: 20 })));

        // Overbought background (Red)
        const overboughtBg = chart.addSeries(AreaSeries, {
            lineColor: 'transparent',
            topColor: 'rgba(239,68,68,0.15)', // Light red at top
            bottomColor: 'rgba(239,68,68,0.02)', // Very faint red
            lineWidth: 1,
            priceLineVisible: false,
            crosshairMarkerVisible: false,
            invertFilledArea: true, // Fills upwards from the baseline!
        });
        overboughtBg.setData(lwData.map(d => ({ time: d.time, value: 80 })));

        const series = chart.addSeries(LineSeries, {
            color: '#3b82f6',
            lineWidth: 2,
            priceFormat: {
                type: 'price',
                precision: 2,
                minMove: 0.01,
            },
            autoscaleInfoProvider: () => ({
                priceRange: {
                    minValue: 0,
                    maxValue: 100,
                },
            }),
        });

        // Add 80 and 20 lines
        series.createPriceLine({ price: 80, color: 'rgba(34,197,94,0.5)', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'Overbought' });
        series.createPriceLine({ price: 20, color: 'rgba(239,68,68,0.5)', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'Oversold' });
        series.createPriceLine({ price: 50, color: 'gray', lineWidth: 1, lineStyle: 3, axisLabelVisible: false });

        series.setData(lwData);
        chart.timeScale().fitContent();

        // Tooltip logic
        const toolTip = tooltipRef.current;
        if (toolTip) {
            chart.subscribeCrosshairMove((param) => {
                if (!param.point || !param.time || param.point.x < 0 || param.point.x > chartContainerRef.current!.clientWidth || param.point.y < 0 || param.point.y > chartContainerRef.current!.clientHeight) {
                    toolTip.style.display = 'none';
                } else {
                    const dateStr = param.time as string;
                    let html = `<div class="font-bold mb-1 border-b border-slate-700 pb-1">${dateStr}</div>`;
                    
                    const price = param.seriesData.get(series) as any;
                    if (price !== undefined) {
                        const val = price.value !== undefined ? price.value : price;
                        html += `<div class="flex justify-between gap-4"><span class="text-blue-400 font-semibold">% Above 200 SMA</span> <span class="text-white">${val.toFixed(2)}%</span></div>`;
                    }

                    toolTip.innerHTML = html;
                    toolTip.style.display = 'block';
                    
                    const toolTipWidth = 180;
                    const toolTipHeight = 60;
                    const margin = 15;
                    const chartWidth = chartContainerRef.current!.clientWidth;
                    const chartHeight = chartContainerRef.current!.clientHeight;
                    
                    let left = param.point.x + margin;
                    if (left + toolTipWidth > chartWidth) {
                        left = param.point.x - toolTipWidth - margin;
                    }
                    
                    let top = param.point.y + margin;
                    if (top + toolTipHeight > chartHeight) {
                        top = param.point.y - toolTipHeight - margin;
                    }
                    
                    toolTip.style.left = left + 'px';
                    toolTip.style.top = top + 'px';
                }
            });
        }

        return () => {
            chart.remove();
        };
    }, [lwData]);

    const latest = data[data.length - 1];
    const latestDateStr = latest?.Date ?? "";

    return (
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-3">
            <div className="flex justify-between items-center mb-2">
                <h3 className="text-sm font-semibold text-white">
                    Percentage of Stocks Above 200-Day SMA
                    <span className="text-slate-500 font-normal ml-2 text-xs">
                        (Latest: {latestDateStr})
                    </span>
                </h3>
                <button 
                    onClick={() => chartRef.current?.timeScale().fitContent()}
                    className="px-3 py-1 bg-slate-800/50 hover:bg-slate-700 text-slate-300 rounded text-[10px] transition-colors border border-[#1e1e2e]"
                >
                    Reset View
                </button>
            </div>
            <div className="relative w-full h-[500px]">
                <div ref={chartContainerRef} className="absolute inset-0" />
                <div 
                    ref={tooltipRef} 
                    className="absolute z-50 bg-[#1e1e2e]/90 border border-slate-700 p-2 text-xs rounded shadow-lg pointer-events-none"
                    style={{ display: 'none' }}
                />
            </div>
        </div>
    );
}

export function ParticipationChart({ data, title }: BreadthChartProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);

    const totalData = data.map(d => ({
        time: d.Date,
        value: (d.Above || 0) + (d.Below || 0)
    }));

    const aboveData = data.map(d => ({
        time: d.Date,
        value: d.Above || 0
    }));

    useEffect(() => {
        if (!chartContainerRef.current || totalData.length === 0) return;

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: 'transparent' },
                textColor: '#94a3b8',
                fontFamily: 'Inter, sans-serif',
            },
            grid: {
                vertLines: { color: '#1e1e2e', style: 1 },
                horzLines: { color: '#1e1e2e', style: 1 },
            },
            rightPriceScale: {
                borderVisible: false,
                scaleMargins: { top: 0.1, bottom: 0.1 },
            },
            timeScale: {
                borderVisible: false,
                timeVisible: true,
                rightOffset: 5,
            },
            crosshair: {
                mode: CrosshairMode.Normal,
                vertLine: { width: 1, color: '#334155', style: 3 },
                horzLine: { width: 1, color: '#334155', style: 3 },
            },
            autoSize: true,
        });
        chartRef.current = chart;

        // Background / Total (Red layer for Below)
        const totalSeries = chart.addSeries(AreaSeries, {
            lineColor: '#ef4444', // Red
            topColor: 'rgba(239,68,68,0.6)',
            bottomColor: 'rgba(239,68,68,0.6)',
            lineWidth: 1,
            priceFormat: { type: 'volume' },
        });
        totalSeries.setData(totalData);

        // Foreground (Green layer for Above)
        const aboveSeries = chart.addSeries(AreaSeries, {
            lineColor: '#22c55e', // Green
            topColor: 'rgba(34,197,94,0.6)',
            bottomColor: 'rgba(34,197,94,0.6)',
            lineWidth: 1,
            priceFormat: { type: 'volume' },
        });
        aboveSeries.setData(aboveData);

        chart.timeScale().fitContent();

        // Tooltip logic
        const toolTip = tooltipRef.current;
        if (toolTip) {
            chart.subscribeCrosshairMove((param) => {
                if (!param.point || !param.time || param.point.x < 0 || param.point.x > chartContainerRef.current!.clientWidth || param.point.y < 0 || param.point.y > chartContainerRef.current!.clientHeight) {
                    toolTip.style.display = 'none';
                } else {
                    const dateStr = param.time as string;
                    let html = `<div class="font-bold mb-1 border-b border-slate-700 pb-1">${dateStr}</div>`;
                    
                    const abovePrice = param.seriesData.get(aboveSeries) as any;
                    const totalPrice = param.seriesData.get(totalSeries) as any;
                    
                    if (abovePrice !== undefined && totalPrice !== undefined) {
                        const aboveVal = abovePrice.value !== undefined ? abovePrice.value : abovePrice;
                        const totalVal = totalPrice.value !== undefined ? totalPrice.value : totalPrice;
                        const belowVal = totalVal - aboveVal;
                        
                        html += `<div class="flex justify-between gap-4"><span class="text-green-400 font-semibold">Above</span> <span class="text-white">${Math.round(aboveVal)}</span></div>`;
                        html += `<div class="flex justify-between gap-4"><span class="text-red-400 font-semibold">Below</span> <span class="text-white">${Math.round(belowVal)}</span></div>`;
                    }

                    toolTip.innerHTML = html;
                    toolTip.style.display = 'block';
                    
                    const toolTipWidth = 150;
                    const toolTipHeight = 80;
                    const margin = 15;
                    const chartWidth = chartContainerRef.current!.clientWidth;
                    const chartHeight = chartContainerRef.current!.clientHeight;
                    
                    let left = param.point.x + margin;
                    if (left + toolTipWidth > chartWidth) {
                        left = param.point.x - toolTipWidth - margin;
                    }
                    
                    let top = param.point.y + margin;
                    if (top + toolTipHeight > chartHeight) {
                        top = param.point.y - toolTipHeight - margin;
                    }
                    
                    toolTip.style.left = left + 'px';
                    toolTip.style.top = top + 'px';
                }
            });
        }

        return () => {
            chart.remove();
        };
    }, [aboveData, totalData]);

    if (!data || data.length === 0) return null;

    return (
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-3 mt-4">
            <div className="flex justify-between items-center mb-2">
                <h3 className="text-sm font-semibold text-white">Market Participation</h3>
                <button 
                    onClick={() => chartRef.current?.timeScale().fitContent()}
                    className="px-3 py-1 bg-slate-800/50 hover:bg-slate-700 text-slate-300 rounded text-[10px] transition-colors border border-[#1e1e2e]"
                >
                    Reset View
                </button>
            </div>
            <div className="relative w-full h-[400px]">
                <div ref={chartContainerRef} className="absolute inset-0" />
                <div 
                    ref={tooltipRef} 
                    className="absolute z-50 bg-[#1e1e2e]/90 border border-slate-700 p-2 text-xs rounded shadow-lg pointer-events-none"
                    style={{ display: 'none' }}
                />
            </div>
        </div>
    );
}
