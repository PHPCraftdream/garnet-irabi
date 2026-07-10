import * as React from 'react';
import {useRef, useState} from 'react';
import {useBodyScrollLock} from '@common/hooks/useBodyScrollLock';
import {I18nForeground as t} from '../I18nGen/I18nForeground';

export interface PendingFile {
    file: File | Blob;
    name: string;
    preview?: string; // object URL for images
}

interface Props {
    files: PendingFile[];
    onChange: (files: PendingFile[]) => void;
    maxFiles?: number;
    accept?: string;
}

export default function AttachmentPicker({files, onChange, maxFiles = 5, accept}: Props) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
    useBodyScrollLock(lightboxIndex !== null);

    const addFiles = (newFiles: FileList | File[]) => {
        const remaining = maxFiles - files.length;
        if (remaining <= 0) return;

        const toAdd = Array.from(newFiles).slice(0, remaining);
        const pending: PendingFile[] = [];

        for (const file of toAdd) {
            const entry: PendingFile = { file, name: file.name };
            if (file.type.startsWith('image/')) {
                entry.preview = URL.createObjectURL(file);
            }
            pending.push(entry);
        }

        onChange([...files, ...pending]);
        if (inputRef.current) inputRef.current.value = '';
    };

    const remove = (index: number) => {
        const next = [...files];
        const removed = next.splice(index, 1);
        for (const f of removed) {
            if (f.preview) URL.revokeObjectURL(f.preview);
        }
        onChange(next);
        if (lightboxIndex === index) setLightboxIndex(null);
    };

    const formatSize = (bytes: number): string => {
        if (bytes < 1024) return bytes + 'B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
        return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
    };

    // Images with previews for lightbox navigation
    const previewFiles = files.map((f, i) => ({...f, index: i})).filter(f => f.preview);

    return (
        <div>
            {/* Thumbnails */}
            {files.length > 0 && (
                <div className="common-pick-grid">
                    {files.map((f, i) => (
                        <div key={i} className="group common-pick-tile"
                             style={{width: 80, height: 80}}
                             onClick={() => f.preview && setLightboxIndex(i)}
                        >
                            {f.preview ? (
                                <img src={f.preview} alt={f.name}
                                     className="w-full h-full object-cover" />
                            ) : (
                                <div className="common-pick-tile-fallback">
                                    {f.name.split('.').pop()?.toUpperCase()}
                                    <br />
                                    {formatSize(f.file instanceof File ? f.file.size : f.file.size)}
                                </div>
                            )}
                            <button
                                type="button"
                                className="common-pick-remove"
                                onClick={(e) => { e.stopPropagation(); remove(i); }}
                                data-test-id={`attachment-remove-${i}`}
                                title={t.A11y_RemoveAttachment()}
                                aria-label={t.A11y_RemoveAttachment()}
                            >
                                ×
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Add button */}
            {files.length < maxFiles && (
                <>
                    <input
                        ref={inputRef}
                        type="file"
                        multiple
                        accept={accept || 'image/*,.pdf,.txt,.log'}
                        className="hidden"
                        aria-label={t.A11y_AttachFiles()}
                        onChange={(e) => e.target.files && addFiles(e.target.files)}
                        data-test-id="attachment-input"
                    />
                    <button
                        type="button"
                        className="btn btn-outline-secondary text-sm flex items-center gap-1"
                        onClick={() => inputRef.current?.click()}
                        data-test-id="attachment-btn"
                        title={t.A11y_AttachFiles()}
                        aria-label={t.A11y_AttachFiles()}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                        </svg>
                        {files.length > 0 ? `(${files.length}/${maxFiles})` : ''}
                    </button>
                </>
            )}

            {/* Lightbox */}
            {lightboxIndex !== null && files[lightboxIndex]?.preview && (
                <div
                    className="common-pick-lightbox"
                    onClick={() => setLightboxIndex(null)}
                    data-test-id="attachment-lightbox"
                >
                    <div role="dialog" aria-modal="true" aria-label={t.A11y_ImagePreview()} className="common-pick-lightbox-frame" onClick={e => e.stopPropagation()}>
                        <img
                            src={files[lightboxIndex].preview}
                            alt={files[lightboxIndex].name}
                            className="common-pick-lightbox-img"
                        />
                        <div className="common-pick-lightbox-actions">
                            <button
                                type="button"
                                className="common-pick-lightbox-btn-danger"
                                onClick={() => { remove(lightboxIndex); }}
                                title={t.A11y_RemoveAttachment()}
                                aria-label={t.A11y_RemoveAttachment()}
                            >
                                ×
                            </button>
                            <button
                                type="button"
                                className="common-pick-lightbox-btn-neutral"
                                onClick={() => setLightboxIndex(null)}
                                title={t.Action_Close()}
                                aria-label={t.Action_Close()}
                            >
                                ✕
                            </button>
                        </div>
                        {/* Navigation arrows */}
                        {previewFiles.length > 1 && (
                            <>
                                <button
                                    type="button"
                                    className="common-pick-lightbox-nav left-2"
                                    title={t.A11y_PreviousImage()}
                                    aria-label={t.A11y_PreviousImage()}
                                    onClick={() => {
                                        const currentIdx = previewFiles.findIndex(f => f.index === lightboxIndex);
                                        const prev = currentIdx > 0 ? previewFiles[currentIdx - 1] : previewFiles[previewFiles.length - 1];
                                        setLightboxIndex(prev.index);
                                    }}
                                >
                                    ‹
                                </button>
                                <button
                                    type="button"
                                    className="common-pick-lightbox-nav right-2"
                                    title={t.A11y_NextImage()}
                                    aria-label={t.A11y_NextImage()}
                                    onClick={() => {
                                        const currentIdx = previewFiles.findIndex(f => f.index === lightboxIndex);
                                        const next = currentIdx < previewFiles.length - 1 ? previewFiles[currentIdx + 1] : previewFiles[0];
                                        setLightboxIndex(next.index);
                                    }}
                                >
                                    ›
                                </button>
                            </>
                        )}
                        <div className="common-pick-lightbox-caption">
                            {files[lightboxIndex].name}
                            {previewFiles.length > 1 && ` (${previewFiles.findIndex(f => f.index === lightboxIndex) + 1}/${previewFiles.length})`}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
