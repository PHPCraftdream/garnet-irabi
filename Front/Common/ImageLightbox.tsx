import * as React from 'react';
import {useEffect} from 'react';
import {Download, X} from 'lucide-react';
import {I18nForeground as t} from '../I18nGen/I18nForeground';

interface Props {
    src: string;
    alt: string;
    downloadUrl?: string;
    downloadName?: string;
    onClose: () => void;
}

export default function ImageLightbox({src, alt, downloadUrl, downloadName, onClose}: Props) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = prevOverflow;
        };
    }, [onClose]);

    const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) onClose();
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={handleBackdrop}
            role="dialog"
            aria-modal="true"
            aria-label={alt}
            data-test-id="image-lightbox"
        >
            <div className="absolute top-3 right-3 flex items-center gap-2">
                {downloadUrl && (
                    <a
                        href={downloadUrl}
                        download={downloadName}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-white/10 hover:bg-white/20 text-white text-sm transition-colors no-underline"
                        title={t.Lightbox_Download()}
                        data-test-id="image-lightbox-download"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <Download size={16} aria-hidden="true" />
                        <span className="hidden sm:inline">{t.Lightbox_Download()}</span>
                    </a>
                )}
                <button
                    type="button"
                    className="inline-flex items-center justify-center w-9 h-9 rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors"
                    onClick={onClose}
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
                className="max-w-full max-h-full object-contain rounded shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            />

            {downloadName && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded bg-white/10 text-white text-xs max-w-[80%] truncate">
                    {downloadName}
                </div>
            )}
        </div>
    );
}
