"use client";

import React, { useCallback, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { toCanvas } from 'html-to-image';

interface CaptureScreenshotProps {
    targetId?: string;
    targetRef?: React.RefObject<HTMLElement | null>;
    filename?: string;
    label?: string;
    className?: string;
    type?: 'button' | 'icon';
    /** Optional callback to prepare the DOM before capture (e.g., expand AG Grid). Must return a cleanup function. */
    onBeforeCapture?: () => (() => void) | Promise<() => void>;
}

/**
 * Automatically expands AG Grid containers within the target element
 * so that ALL rows render (not just the virtualized visible ones) and
 * collapses unused horizontal blank space when columns do not fill the width.
 * Returns a cleanup function that restores the original state.
 */
function expandAgGrid(element: HTMLElement): () => void {
    const gridWrapper = element.querySelector('.ag-root-wrapper') as HTMLElement | null;
    const gridBody = element.querySelector('.ag-body-viewport') as HTMLElement | null;
    const gridCenter = element.querySelector('.ag-center-cols-viewport') as HTMLElement | null;
    const gridContainer = element.querySelector('.ag-center-cols-container') as HTMLElement | null;

    if (!gridWrapper || !gridBody) {
        return () => {}; // No AG Grid found, nothing to do
    }

    // Save original styles
    const origElementStyle = element.style.cssText;
    const origWrapperStyle = gridWrapper.style.cssText;
    const origBodyStyle = gridBody.style.cssText;
    const origCenterStyle = gridCenter?.style.cssText || '';
    const origContainerStyle = gridContainer?.style.cssText || '';

    // Calculate the full content height: header + all rows
    const headerHeight = element.querySelector('.ag-header')?.getBoundingClientRect().height || 48;
    
    // Virtual scrollHeight gives us the virtual total height
    const virtualTotalHeight = gridBody.scrollHeight;
    const fullHeight = Math.max(virtualTotalHeight + headerHeight + 20, 400);

    // Measure actual rendered column widths in AG Grid to collapse blank space
    const headerContainer = element.querySelector('.ag-header-container') as HTMLElement | null;
    const pinnedLeftHeader = element.querySelector('.ag-pinned-left-header') as HTMLElement | null;
    const pinnedRightHeader = element.querySelector('.ag-pinned-right-header') as HTMLElement | null;

    const leftW = pinnedLeftHeader?.offsetWidth || 0;
    const centerW = headerContainer?.offsetWidth || 0;
    const rightW = pinnedRightHeader?.offsetWidth || 0;
    const totalColsWidth = leftW + centerW + rightW;

    // Expand the container to full height
    element.style.height = `${fullHeight}px`;
    element.style.maxHeight = 'none';
    element.style.overflow = 'visible';
    element.style.minHeight = `${fullHeight}px`;

    gridWrapper.style.height = `${fullHeight}px`;
    gridWrapper.style.maxHeight = 'none';
    gridWrapper.style.overflow = 'visible';

    // Note: Trailing horizontal blank space is cropped cleanly at the canvas pixel level by trimCanvasBlankSpace,
    // avoiding artificial DOM width clamping that could cause AG Grid to compress header columns.

    gridBody.style.height = `${virtualTotalHeight}px`;
    gridBody.style.maxHeight = 'none';
    gridBody.style.overflow = 'visible';

    if (gridCenter) {
        gridCenter.style.height = `${virtualTotalHeight}px`;
        gridCenter.style.maxHeight = 'none';
        gridCenter.style.overflow = 'visible';
    }
    if (gridContainer) {
        gridContainer.style.overflow = 'visible';
    }

    // Force re-render by triggering a resize event
    window.dispatchEvent(new Event('resize'));

    return () => {
        element.style.cssText = origElementStyle;
        gridWrapper.style.cssText = origWrapperStyle;
        gridBody.style.cssText = origBodyStyle;
        if (gridCenter) gridCenter.style.cssText = origCenterStyle;
        if (gridContainer) gridContainer.style.cssText = origContainerStyle;
        window.dispatchEvent(new Event('resize'));
    };
}

/**
 * Intelligently inspects rendered canvas pixels from the right and bottom edges.
 * If trailing blank space (uniform empty background) is detected, crops it out cleanly.
 */
function trimCanvasBlankSpace(canvas: HTMLCanvasElement): HTMLCanvasElement {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return canvas;

    const width = canvas.width;
    const height = canvas.height;
    if (width <= 100 || height <= 100) return canvas;

    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    const getPixel = (x: number, y: number) => {
        const idx = (y * width + x) * 4;
        return {
            r: data[idx],
            g: data[idx + 1],
            b: data[idx + 2],
            a: data[idx + 3]
        };
    };

    const colorDiff = (
        p1: { r: number; g: number; b: number; a: number },
        p2: { r: number; g: number; b: number; a: number }
    ) => {
        return Math.abs(p1.r - p2.r) + Math.abs(p1.g - p2.g) + Math.abs(p1.b - p2.b) + Math.abs(p1.a - p2.a);
    };

    // 1. Detect right content boundary by comparing column x to the rightmost reference column
    let rightContentX = width - 1;
    let foundRight = false;
    for (let x = width - 2; x >= 0; x--) {
        let diffCount = 0;
        for (let y = 0; y < height; y += 2) {
            const curr = getPixel(x, y);
            const ref = getPixel(width - 1, y);
            if (colorDiff(curr, ref) > 15) {
                diffCount++;
            }
        }
        if (diffCount > 3) {
            rightContentX = x;
            foundRight = true;
            break;
        }
    }

    // 2. Detect bottom content boundary
    let bottomContentY = height - 1;
    let foundBottom = false;
    const maxX = foundRight ? Math.min(rightContentX + 16, width) : width;
    for (let y = height - 2; y >= 0; y--) {
        let diffCount = 0;
        for (let x = 0; x < maxX; x += 2) {
            const curr = getPixel(x, y);
            const ref = getPixel(x, height - 1);
            if (colorDiff(curr, ref) > 15) {
                diffCount++;
            }
        }
        if (diffCount > 3) {
            bottomContentY = y;
            foundBottom = true;
            break;
        }
    }

    // Add breathing room for border/shadows
    const targetWidth = foundRight ? Math.min(rightContentX + 16, width) : width;
    const targetHeight = foundBottom ? Math.min(bottomContentY + 16, height) : height;

    const trimmedWidth = (width - targetWidth >= 30) ? targetWidth : width;
    const trimmedHeight = (height - targetHeight >= 30) ? targetHeight : height;

    if (trimmedWidth === width && trimmedHeight === height) {
        return canvas;
    }

    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = trimmedWidth;
    croppedCanvas.height = trimmedHeight;
    const croppedCtx = croppedCanvas.getContext('2d');
    if (!croppedCtx) return canvas;

    croppedCtx.drawImage(canvas, 0, 0, trimmedWidth, trimmedHeight, 0, 0, trimmedWidth, trimmedHeight);
    return croppedCanvas;
}

export function CaptureScreenshot({ 
    targetId, 
    targetRef, 
    filename = 'screenshot', 
    label = 'Capture',
    className = '',
    type = 'button',
    onBeforeCapture
}: CaptureScreenshotProps) {
    const [isCapturing, setIsCapturing] = useState(false);

    const handleCapture = useCallback(async () => {
        const element = targetRef?.current || (targetId ? document.getElementById(targetId) : null);
        
        if (!element) {
            console.error('Screenshot target not found');
            return;
        }

        let cleanupCustom: (() => void) | null = null;
        let cleanupGrid: (() => void) | null = null;

        try {
            setIsCapturing(true);

            // Run custom pre-capture hook if provided
            if (onBeforeCapture) {
                cleanupCustom = await onBeforeCapture();
            }
            
            // Auto-expand any AG Grid within the target
            cleanupGrid = expandAgGrid(element as HTMLElement);
            
            // Wait for AG Grid to re-render after expansion
            await new Promise(resolve => setTimeout(resolve, 300));

            // Filter out internal toggle buttons and other UI noise from the screenshot
            const filter = (node: HTMLElement) => {
                const exclusionClasses = ['capture-exclude', 'ag-header-cell-menu-button'];
                return !exclusionClasses.some(cls => node.classList?.contains(cls));
            };

            const canvas = await toCanvas(element, {
                cacheBust: true,
                backgroundColor: '#0a0a0f',
                style: {
                    borderRadius: '8px',
                },
                filter: filter as any
            });

            // Automatically detect and crop out any trailing blank space
            const trimmedCanvas = trimCanvasBlankSpace(canvas);
            const dataUrl = trimmedCanvas.toDataURL('image/png');

            const link = document.createElement('a');
            link.download = `${filename}_${new Date().toISOString().split('T')[0]}.png`;
            link.href = dataUrl;
            link.click();
        } catch (err) {
            console.error('Failed to capture screenshot:', err);
        } finally {
            // Restore AG Grid layout
            if (cleanupGrid) cleanupGrid();
            if (cleanupCustom) cleanupCustom();
            setIsCapturing(false);
        }
    }, [targetId, targetRef, filename, onBeforeCapture]);

    if (type === 'icon') {
        return (
            <button
                onClick={handleCapture}
                disabled={isCapturing}
                className={`p-1.5 rounded-md text-slate-400 hover:text-blue-400 hover:bg-slate-800/50 transition-all ${className} ${isCapturing ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={label}
            >
                {isCapturing ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
            </button>
        );
    }

    return (
        <button
            onClick={handleCapture}
            disabled={isCapturing}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all capture-exclude ${
                isCapturing 
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                : 'bg-blue-600/10 text-blue-400 hover:bg-blue-600/20 border border-blue-600/20'
            } ${className}`}
        >
            {isCapturing ? (
                <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Capturing...</span>
                </>
            ) : (
                <>
                    <Camera size={14} />
                    <span>{label}</span>
                </>
            )}
        </button>
    );
}
