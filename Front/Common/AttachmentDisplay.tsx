import * as React from 'react';
import {useState} from 'react';
import type {SupportAttachment} from '../Islands/Support/supportTypes';
import ImageLightbox from './ImageLightbox';

interface Props {
    attachments: SupportAttachment[];
}

export default function AttachmentDisplay({attachments}: Props) {
    const [lightbox, setLightbox] = useState<SupportAttachment | null>(null);

    if (!attachments || attachments.length === 0) return null;

    const formatSize = (bytes: number): string => {
        if (bytes < 1024) return bytes + 'B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
        return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
    };

    const isImage = (mime: string) => mime.startsWith('image/');

    return (
        <>
            <div className="common-attach-list">
                {attachments.map((att) => {
                    if (isImage(att.mime_type)) {
                        return (
                            <button
                                key={att.id}
                                type="button"
                                onClick={() => setLightbox(att)}
                                className="common-attach-image"
                                data-test-id={`attachment-${att.id}`}
                                aria-label={att.original_name}
                            >
                                <img
                                    src={att.download_url}
                                    alt={att.original_name}
                                    className="common-attach-image-img"
                                    loading="lazy"
                                />
                            </button>
                        );
                    }
                    return (
                        <a
                            key={att.id}
                            href={att.download_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="common-attach-file"
                            data-test-id={`attachment-${att.id}`}
                        >
                            <div className="common-attach-file-inner">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                                    <polyline points="14,2 14,8 20,8" />
                                </svg>
                                <span className="truncate max-w-32">{att.original_name}</span>
                                <span className="text-xs text-muted">{formatSize(att.size)}</span>
                            </div>
                        </a>
                    );
                })}
            </div>

            {lightbox && (
                <ImageLightbox
                    src={lightbox.download_url}
                    alt={lightbox.original_name}
                    downloadUrl={lightbox.download_url}
                    downloadName={lightbox.original_name}
                    onClose={() => setLightbox(null)}
                />
            )}
        </>
    );
}
