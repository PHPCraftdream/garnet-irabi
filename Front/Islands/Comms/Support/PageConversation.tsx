import * as React from 'react';

import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {SupportTicket, SupportMessage} from './parts/supportTypes';
import {StatusBadge} from './parts/supportRenders';
import {SupportMessageList} from './parts/SupportMessageList';
import AttachmentPicker, {PendingFile} from '../../../Common/attachments/AttachmentPicker';
import SendButton from '@common/Components/Controls/SendButton';
import {useCtrlEnter, CTRL_ENTER_HINT} from '@common/hooks/ui/useCtrlEnter';
import {formatTs} from '@common/Utils/Time/DateUtils';

interface ConversationProps {
    selectedTicket: SupportTicket | null;
    messages: SupportMessage[];
    loading: boolean;
    endRef: React.RefObject<HTMLDivElement>;
    replyText: string;
    onReplyTextChange: (v: string) => void;
    replyFiles: PendingFile[];
    onReplyFilesChange: (files: PendingFile[]) => void;
    onReply: () => void;
    sending: boolean;
}

/** Переписка по обращению. */
export const PageConversation: React.FC<ConversationProps> = ({selectedTicket, messages, loading, endRef, replyText, onReplyTextChange, replyFiles, onReplyFilesChange, onReply, sending}) => {
    if (!selectedTicket) return null;

    return (
        <>
            {/* Header */}
            <div className="support-conv-header">
                <div className="support-conv-header-row">
                    <h3 className="support-conv-title">{selectedTicket.subject}</h3>
                    <StatusBadge status={selectedTicket.status} />
                </div>
                <div className="support-conv-meta">
                    {t.Support_Created()}: {formatTs(selectedTicket.created_at)} &middot; {t.Support_Updated()}: {formatTs(selectedTicket.updated_at)}
                </div>
            </div>

            <SupportMessageList
                messages={messages}
                loading={loading}
                emptyText={t.Support_NoMessages()}
                loadingText={t.User_Loading()}
                endRef={endRef}
            />

            {/* Reply input */}
            <div className="support-thread-input">
                <textarea
                    data-test-id="support-reply-input"
                    className="form-control text-sm w-full mb-2"
                    rows={2}
                    aria-label={t.Support_Reply()}
                    placeholder={t.Support_Reply() + '...' + CTRL_ENTER_HINT}
                    value={replyText}
                    onChange={e => onReplyTextChange(e.target.value)}
                    onKeyDown={useCtrlEnter(onReply, sending || !replyText.trim())}
                />
                <div className="support-thread-actions">
                    <AttachmentPicker files={replyFiles} onChange={onReplyFilesChange} />
                    <SendButton
                        onClick={onReply}
                        disabled={!replyText.trim()}
                        sending={sending}
                        label={t.Support_Send()}
                        testId="support-reply-btn"
                    />
                </div>
            </div>
        </>
    );
};
