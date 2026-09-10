import * as React from 'react';
import {useState} from 'react';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {SupportMessage} from '../../Support/supportTypes';
import {AttachmentRow, AttachmentWithAuthor} from './AttachmentRow';

interface Props {
    messages: SupportMessage[];
}

/** Собрать вложения со всей переписки, запомнив, кто их прислал. */
const collect = (messages: SupportMessage[]): AttachmentWithAuthor[] =>
    messages.flatMap(msg => (msg.attachments ?? []).map(att => ({...att, author_name: msg.author_name})));

/**
 * Все файлы обращения одним списком.
 *
 * Свёрнут по умолчанию: нужен, когда ищешь конкретный файл, а не читаешь
 * переписку.
 */
export default function TicketAttachments({messages}: Props) {
    const [expanded, setExpanded] = useState(false);
    const attachments = collect(messages);

    if (attachments.length === 0) return null;

    return (
        <div className="mb-4" data-test-id="support-attachments-block">
            <button
                type="button"
                className="text-sm text-muted hover:text-secondary flex items-center gap-1"
                onClick={() => setExpanded(!expanded)}
                data-test-id="support-attachments-toggle"
            >
                <span className="text-xs select-none">{expanded ? '\u25BE' : '\u25B8'}</span>
                {t.Support_Attachments()} ({attachments.length})
            </button>
            {expanded && (
                <div className="mt-2 bg-surface-alt rounded border border-default p-3" data-test-id="support-attachments-list">
                    <div className="flex flex-col gap-2">
                        {attachments.map(att => <AttachmentRow key={att.id} att={att} />)}
                    </div>
                </div>
            )}
        </div>
    );
}
