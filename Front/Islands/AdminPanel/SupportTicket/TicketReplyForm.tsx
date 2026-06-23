import * as React from 'react';
import {useCtrlEnter, CTRL_ENTER_HINT} from '@common/hooks/useCtrlEnter';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import AttachmentPicker, {PendingFile} from '../../../Common/AttachmentPicker';
import SendButton from '@common/Components/SendButton';

interface Props {
    replyText: string;
    onReplyTextChange: (text: string) => void;
    replyFiles: PendingFile[];
    onReplyFilesChange: (files: PendingFile[]) => void;
    sending: boolean;
    onSend: () => void;
}

export default function TicketReplyForm({replyText, onReplyTextChange, replyFiles, onReplyFilesChange, sending, onSend}: Props) {
    return (
        <div className="mb-4" data-test-id="support-reply-form">
            <label className="text-sm font-medium text-secondary block mb-1">{t.Support_Reply()}</label>
            <textarea
                className="form-control text-sm w-full mb-2"
                rows={3}
                placeholder={t.Support_Reply() + '...' + CTRL_ENTER_HINT}
                value={replyText}
                onChange={e => onReplyTextChange(e.target.value)}
                onKeyDown={useCtrlEnter(onSend, sending || !replyText.trim())}
                data-test-id="support-reply-input"
            />
            <div className="flex items-center gap-3">
                <AttachmentPicker files={replyFiles} onChange={onReplyFilesChange} />
                <SendButton
                    onClick={onSend}
                    disabled={!replyText.trim()}
                    sending={sending}
                    label={t.Support_Send()}
                    testId="support-reply-btn"
                    variant="primary"
                />
            </div>
        </div>
    );
}
