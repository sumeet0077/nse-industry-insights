"use client";

import React, { useCallback, useState } from 'react';
import { Camera, Loader2, Download } from 'lucide-react';
import { toPng } from 'html-to-image';

interface CaptureScreenshotProps {
    targetId?: string;
    targetRef?: React.RefObject<HTMLElement | null>;
    filename?: string;
    label?: string;
    className?: string;
    type?: 'button' | 'icon';
}

export function CaptureScreenshot({ 
    targetId, 
    targetRef, 
    filename = 'screenshot', 
    label = 'Capture',
    className = '',
    type = 'button'
}: CaptureScreenshotProps) {
    const [isCapturing, setIsCapturing] = useState(false);

    const handleCapture = useCallback(async () => {
        const element = targetRef?.current || (targetId ? document.getElementById(targetId) : null);
        
        if (!element) {
            console.error('Screenshot target not found');
            return;
        }

        try {
            setIsCapturing(true);
            
            // Filter out internal toggle buttons and other UI noise from the screenshot
            const filter = (node: HTMLElement) => {
                const exclusionClasses = ['capture-exclude', 'ag-header-cell-menu-button'];
                return !exclusionClasses.some(cls => node.classList?.contains(cls));
            };

            const dataUrl = await toPng(element, {
                cacheBust: true,
                backgroundColor: '#0a0a0f', // Match dashboard background
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
            setIsCapturing(false);
        }
    }, [targetId, targetRef, filename]);

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
