import * as React from 'react';
import {SupportAttachment} from '@/Islands/Comms/Support/parts/supportTypes';

export type AttachmentWithAuthor = SupportAttachment & {author_name?: string};

const formatSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + 'B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';

    return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
};

const FileIcon: React.FC = () => (
    <div className="admin-attachment-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14,2 14,8 20,8" />
        </svg>
    </div>
);

/** Одно вложение: превью для картинки, иконка для остального. */
export const AttachmentRow: React.FC<{att: AttachmentWithAuthor}> = ({att}) => (
    <a
        href={att.download_url}
        target="_blank"
        rel="noopener noreferrer"
        className="admin-attachment-row"
        data-test-id={`support-attachment-${att.id}`}
    >
        {att.mime_type.startsWith('image/')
            ? <img src={att.download_url} alt={att.original_name} className="admin-attachment-image" loading="lazy" />
            : <FileIcon />}
        <div className="admin-attachment-details">
            <div className="admin-attachment-name">{att.original_name}</div>
            <div className="admin-attachment-meta">
                <span>{formatSize(att.size)}</span>
                <span>{att.mime_type}</span>
                {att.author_name && <span>- {att.author_name}</span>}
            </div>
        </div>
    </a>
);
