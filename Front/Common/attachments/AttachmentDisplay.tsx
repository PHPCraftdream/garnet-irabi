import * as React from 'react';
import {useState} from 'react';
import type {SupportAttachment} from '../../Islands/Comms/Support/parts/supportTypes';
import ImageLightbox from '../media/ImageLightbox';
import {formatSize} from './attachmentHelpers';

interface Props {
    attachments: SupportAttachment[];
}

const FileGlyph: React.FC = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14,2 14,8 20,8" />
    </svg>
);

/** Картинка открывается просмотром, остальное скачивается по ссылке. */
const AttachmentItem: React.FC<{att: SupportAttachment; onOpen: (att: SupportAttachment) => void}> = ({att, onOpen}) => {
    if (att.mime_type.startsWith('image/')) {
        return (
            <button
                type="button"
                onClick={() => onOpen(att)}
                className="common-attach-image"
                data-test-id={`attachment-${att.id}`}
                aria-label={att.original_name}
            >
                <img src={att.download_url} alt={att.original_name} className="common-attach-image-img" loading="lazy" />
            </button>
        );
    }

    return (
        <a
            href={att.download_url}
            target="_blank"
            rel="noopener noreferrer"
            className="common-attach-file"
            data-test-id={`attachment-${att.id}`}
            title={att.original_name}
        >
            <div className="common-attach-file-inner">
                <FileGlyph />
                {/* Имя обрезано, чтобы влезть; наведение должно показывать остальное. */}
                <span className="truncate max-w-32" title={att.original_name}>{att.original_name}</span>
                <span className="text-xs text-muted">{formatSize(att.size)}</span>
            </div>
        </a>
    );
};

/** Вложения сообщения. */
export default function AttachmentDisplay({attachments}: Props) {
    const [lightbox, setLightbox] = useState<SupportAttachment | null>(null);

    if (!attachments || attachments.length === 0) return null;

    return (
        <>
            <div className="common-attach-list">
                {attachments.map(att => <AttachmentItem key={att.id} att={att} onOpen={setLightbox} />)}
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
