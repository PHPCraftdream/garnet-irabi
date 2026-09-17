import * as React from 'react';
import {SupportAttachment} from '../../../../Comms/Support/supportTypes';

export type AttachmentWithAuthor = SupportAttachment & {author_name?: string};

const formatSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + 'B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';

    return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
};

const FileIcon: React.FC = () => (
    <div className="w-10 h-10 flex items-center justify-center bg-surface-hover rounded text-muted">
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
        className="flex items-center gap-3 px-3 py-2 bg-surface rounded border border-default hover:border-accent transition-colors text-sm"
        data-test-id={`support-attachment-${att.id}`}
    >
        {att.mime_type.startsWith('image/')
            ? <img src={att.download_url} alt={att.original_name} className="w-10 h-10 object-cover rounded" loading="lazy" />
            : <FileIcon />}
        <div className="flex-1 min-w-0">
            <div className="truncate font-medium text-on-surface">{att.original_name}</div>
            <div className="flex gap-2 text-xs text-muted">
                <span>{formatSize(att.size)}</span>
                <span>{att.mime_type}</span>
                {att.author_name && <span>- {att.author_name}</span>}
            </div>
        </div>
    </a>
);
