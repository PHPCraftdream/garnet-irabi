import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {CTRL_ENTER_HINT} from '@common/hooks/ui/useCtrlEnter';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import AttachmentPicker, {PendingFile} from '../../../../../Common/attachments/AttachmentPicker';
import SendButton from '@common/Components/Controls/SendButton';

interface Props {
    replyText: string;
    onReplyTextChange: (text: string) => void;
    replyFiles: PendingFile[];
    onReplyFilesChange: (files: PendingFile[]) => void;
    sending: boolean;
    onSend: () => void;
}

export default class TicketReplyForm extends AntiHookComponent<Props> {
    private readonly changeText = (event: React.ChangeEvent<HTMLTextAreaElement>) => this.props.onReplyTextChange(event.target.value);

    private readonly submitOnShortcut = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        const {replyText, sending, onSend} = this.props;
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !sending && replyText.trim()) {
            event.preventDefault();
            onSend();
        }
    };

    render() {
        const {replyText, replyFiles, onReplyFilesChange, sending, onSend} = this.props;
        return (
            <div className="admin-support-form" data-test-id="support-reply-form">
                <label className="admin-support-reply-label">{t.Support_Reply()}</label>
                <textarea
                    className="im-thread-input"
                    rows={3}
                    placeholder={t.Support_Reply() + '...' + CTRL_ENTER_HINT}
                    value={replyText}
                    onChange={this.changeText}
                    onKeyDown={this.submitOnShortcut}
                    data-test-id="support-reply-input"
                />
                <div className="im-thread-actions">
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
}
