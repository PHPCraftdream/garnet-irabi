import * as React from 'react';
import {useState} from 'react';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {SupportMessage, SupportAttachment} from '../../Support/supportTypes';

interface Props {
    messages: SupportMessage[];
}

const formatSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + 'B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
    return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
};

const isImage = (mime: string) => mime.startsWith('image/');

export default function TicketAttachments({messages}: Props) {
    const [expanded, setExpanded] = useState(false);

    // Collect all attachments across all messages
    const allAttachments: (SupportAttachment & {author_name?: string})[] = [];
    for (const msg of messages) {
        if (msg.attachments && msg.attachments.length > 0) {
            for (const att of msg.attachments) {
                allAttachments.push({...att, author_name: msg.author_name});
            }
        }
    }

    if (allAttachments.length === 0) return null;

    return (
        <div className="mb-4" data-test-id="support-attachments-block">
            <button
                type="button"
                className="text-sm text-muted hover:text-secondary flex items-center gap-1"
                onClick={() => setExpanded(!expanded)}
                data-test-id="support-attachments-toggle"
            >
                <span className="text-xs select-none">{expanded ? '\u25BE' : '\u25B8'}</span>
                {t.Support_Attachments()} ({allAttachments.length})
            </button>
            {expanded && (
                <div className="mt-2 bg-surface-alt rounded border border-default p-3" data-test-id="support-attachments-list">
                    <div className="flex flex-col gap-2">
                        {allAttachments.map((att) => (
                            <a
                                key={att.id}
                                href={att.download_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-3 px-3 py-2 bg-surface rounded border border-default hover:border-accent transition-colors text-sm"
                                data-test-id={`support-attachment-${att.id}`}
                            >
                                {isImage(att.mime_type) ? (
                                    <img
                                        src={att.download_url}
                                        alt={att.original_name}
                                        className="w-10 h-10 object-cover rounded"
                                        loading="lazy"
                                    />
                                ) : (
                                    <div className="w-10 h-10 flex items-center justify-center bg-surface-hover rounded text-muted">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                                            <polyline points="14,2 14,8 20,8" />
                                        </svg>
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <div className="truncate font-medium text-on-surface">{att.original_name}</div>
                                    <div className="flex gap-2 text-xs text-muted">
                                        <span>{formatSize(att.size)}</span>
                                        <span>{att.mime_type}</span>
                                        {att.author_name && <span>- {att.author_name}</span>}
                                    </div>
                                </div>
                            </a>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
