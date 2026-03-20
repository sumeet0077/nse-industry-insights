"use client";

import React, { useCallback, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { toPng } from 'html-to-image';

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
 * so that ALL rows render (not just the virtualized visible ones).
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
    const rowCount = element.querySelectorAll('.ag-row').length;
    
    // AG Grid virtualizes rows — we need to force ALL rows visible.
    // The best approach is to remove the fixed height constraint and let the grid expand.
    // First, get the actual row height from an existing row.
    const sampleRow = element.querySelector('.ag-row') as HTMLElement | null;
    const rowHeight = sampleRow?.getBoundingClientRect().height || 35;
    
    // We need to estimate the total number of rows from the grid's internal data.
    // The scrollHeight of the container gives us the virtual total height.
    const virtualTotalHeight = gridBody.scrollHeight;
    const fullHeight = Math.max(virtualTotalHeight + headerHeight + 20, 400);

    // Expand the container to full height
    element.style.height = `${fullHeight}px`;
    element.style.maxHeight = 'none';
    element.style.overflow = 'visible';
    element.style.minHeight = `${fullHeight}px`;

    gridWrapper.style.height = `${fullHeight}px`;
    gridWrapper.style.maxHeight = 'none';
    gridWrapper.style.overflow = 'visible';

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

            const dataUrl = await toPng(element, {
                cacheBust: true,
                backgroundColor: '#0a0a0f',
                style: {
                    borderRadius: '8px',
                },
                filter: filter as any
            });

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
