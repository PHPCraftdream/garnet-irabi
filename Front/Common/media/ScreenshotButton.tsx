import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import {D} from '@common/Support/Debug/D';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';

const pad = (n: number) => String(n).padStart(2, '0');

const includeScreenshotNode = (node: HTMLElement) =>
    !(node instanceof HTMLElement && node.closest?.('[data-test-id="screenshot-btn"]'));

/** Возвращает индикатор выполнения снимка. */
function renderProgress() {
    return <span className="screenshot-progress" aria-hidden="true">&#x23F3;</span>;
}

/** Возвращает значок камеры. */
function renderIcon() {
    return (
        <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
        >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="12" cy="13" r="3" />
            <path d="M5 7h2" />
        </svg>
    );
}

interface Props {
    onScreenshot: (blob: Blob, name: string) => void;
    disabled?: boolean;
}

export default class ScreenshotButton extends AntiHookComponent<Props> {
    private readonly captureState = new Carburetor({capturing: false});

/** Делает снимок страницы и вызывает обработчик результата. */
    private capture = async () => {
        const {onScreenshot} = this.props;
        this.captureState.setData({capturing: true});
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
                    filter: includeScreenshotNode,
                });

                // Convert data URL to Blob
                const res = await fetch(dataUrl);
                const blob = await res.blob();

                const now = new Date();
                const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
                const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
                const name = `screenshot_${date}_${time}.png`;

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
            this.captureState.setData({capturing: false});
        }
    };

    /** Рисует кнопку захвата экрана. */
    public render() {
        const {disabled} = this.props;
        const {capturing} = this.useCarburetor(this.captureState);
        return (
            <button
                type="button"
                className="attachment-add-button"
                onClick={this.capture}
                disabled={disabled || capturing}
                data-test-id="screenshot-btn"
                title={t.Support_Screenshot()}
            >
                {capturing ? renderProgress() : renderIcon()}
                {t.Support_Screenshot()}
            </button>
        );
    }
}
