import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {createPortal} from 'react-dom';
import {Download, X} from 'lucide-react';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';

const stopPropagation = (event: React.MouseEvent) => event.stopPropagation();

interface Props {
    src: string;
    alt: string;
    downloadUrl?: string;
    downloadName?: string;
    onClose: () => void;
}

export default class ImageLightbox extends AntiHookComponent<Props> {
/** Закрывает изображение. */
    private readonly close = () => this.props.onClose();

/** Закрывает просмотр клавишей Escape. */
    private readonly handleKey = (event: KeyboardEvent) => {
        if (event.key === 'Escape') this.props.onClose();
    };

/** Закрывает просмотр при клике по фону. */
    private readonly handleBackdrop = (event: React.MouseEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget) this.props.onClose();
    };

/** Блокирует прокрутку и подписывает клавиатурный обработчик. */
    private readonly lockBody = () => {
        window.addEventListener('keydown', this.handleKey);
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', this.handleKey);
            document.body.style.overflow = previousOverflow;
        };
    };

/** Подключает обработчики лайтбокса. */
    protected useEffects(): void {
        this.useEffect(this.lockBody, []);
    }

/** Выводит лайтбокс в портале документа. */
    public render() {
        // Portal straight to <body>: a `position: fixed` element rendered as a
        // descendant of ANY ancestor with backdrop-filter/filter/transform/
        // perspective/will-change (e.g. the glass-skin theme's frosted `.card`/
        // `.welcome-card`/etc.) gets trapped inside that ancestor's box instead
        // of covering the viewport — the lightbox shrinks to the card's bounds
        // and its `absolute top-3 right-3` close button ends up misplaced inside
        // it. Escaping to `document.body` sidesteps the issue regardless of
        // which card/theme a given call site happens to render inside.
        return createPortal(this.renderContent(), document.body);
    }

/** Собирает содержимое окна просмотра. */
    private renderContent() {
        const {src, alt, downloadUrl, downloadName} = this.props;
        return (
            <div
                className="lightbox-backdrop"
                onClick={this.handleBackdrop}
                role="dialog"
                aria-modal="true"
                aria-label={alt}
                data-test-id="image-lightbox"
            >
                <div className="lightbox-actions">
                    {downloadUrl && (
                        <a
                            href={downloadUrl}
                            download={downloadName}
                            className="lightbox-bg-download"
                            title={t.Lightbox_Download()}
                            data-test-id="image-lightbox-download"
                            onClick={stopPropagation}
                        >
                            <Download size={16} aria-hidden="true" />
                            <span className="lightbox-download-label">{t.Lightbox_Download()}</span>
                        </a>
                    )}
                    <button
                        type="button"
                        className="lightbox-close"
                        onClick={this.close}
                        title={t.Lightbox_Close()}
                        aria-label={t.Lightbox_Close()}
                        data-test-id="image-lightbox-close"
                    >
                        <X size={18} aria-hidden="true" />
                    </button>
                </div>

                <img
                    src={src}
                    alt={alt}
                    className="lightbox-photo"
                    onClick={stopPropagation}
                />

                {downloadName && (
                    <div className="lightbox-caption">
                        {downloadName}
                    </div>
                )}
            </div>
        );
    }
}
