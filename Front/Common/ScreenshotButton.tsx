import * as React from 'react';
import {useState} from 'react';
import {D} from '@common/Debug/D';
import {I18nForeground as t} from '../I18nGen/I18nForeground';

interface Props {
    onScreenshot: (blob: Blob, name: string) => void;
    disabled?: boolean;
}

export default function ScreenshotButton({onScreenshot, disabled}: Props) {
    const [capturing, setCapturing] = useState(false);

    const capture = async () => {
        setCapturing(true);
        D('support.screenshot', 'capture-start');
        try {
            // Dynamically import html-to-image (tree-shakeable, only loaded when needed)
            const {toPng} = await import('html-to-image');

            // Hide the support widget and any modals during capture
            const hideSelectors = [
                '[data-test-id="support-widget-btn"]',
                '[data-test-id="support-widget-panel"]',
                '.modal',
                '[role="dialog"]',
            ];
            const hidden: HTMLElement[] = [];
            for (const sel of hideSelectors) {
                document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
                    if (el.style.display !== 'none') {
                        hidden.push(el);
                        el.style.visibility = 'hidden';
                    }
                });
            }

            try {
                const dataUrl = await toPng(document.body, {
                    quality: 0.8,
                    pixelRatio: 1,
                    skipAutoScale: true,
                    filter: (node) => {
                        // Skip the screenshot button itself
                        if (node instanceof HTMLElement && node.closest?.('[data-test-id="screenshot-btn"]')) return false;
                        return true;
                    },
                });

                // Convert data URL to Blob
                const res = await fetch(dataUrl);
                const blob = await res.blob();

                const now = new Date();
                const pad = (n: number) => String(n).padStart(2, '0');
                const name = `screenshot_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.png`;

                onScreenshot(blob, name);
            } finally {
                // Restore hidden elements
                for (const el of hidden) {
                    el.style.visibility = '';
                }
            }
        } catch (err) {
            D('support.error', {action: 'screenshot', error: err});
        } finally {
            setCapturing(false);
        }
    };

    return (
        <button
            type="button"
            className="btn btn-outline-secondary text-sm flex items-center gap-1"
            onClick={capture}
            disabled={disabled || capturing}
            data-test-id="screenshot-btn"
            title={t.Support_Screenshot()}
        >
            {capturing ? (
                <span className="animate-pulse" aria-hidden="true">&#x23F3;</span>
            ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="12" cy="13" r="3" />
                    <path d="M5 7h2" />
                </svg>
            )}
            {t.Support_Screenshot()}
        </button>
    );
}
