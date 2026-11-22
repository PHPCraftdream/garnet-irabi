import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import SendButton from '@common/Components/Controls/SendButton';
import {CTRL_ENTER_HINT} from '@common/hooks/ui/useCtrlEnter';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import AttachmentPicker, {type PendingFile} from '../../../../Common/attachments/AttachmentPicker';

interface Props {
    subject: string;
    onSubjectChange: (value: string) => void;
    message: string;
    onMessageChange: (value: string) => void;
    files: PendingFile[];
    onFilesChange: (files: PendingFile[]) => void;
    onSubmit: () => void;
    onCancel: () => void;
    sending: boolean;
}

export class PageNewTicketForm extends AntiHookComponent<Props> {
    private readonly changeSubject = (event: React.ChangeEvent<HTMLInputElement>) => this.props.onSubjectChange(event.target.value);
    private readonly changeMessage = (event: React.ChangeEvent<HTMLTextAreaElement>) => this.props.onMessageChange(event.target.value);

    private canSend(): boolean {
        return Boolean(this.props.subject.trim() && this.props.message.trim());
    }

    private readonly submitOnShortcut = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !this.props.sending && this.canSend()) {
            event.preventDefault();
            this.props.onSubmit();
        }
    };

    private renderFields() {
        const {subject, message} = this.props;
        return (
            <>
                <div>
                    <label className="support-form-label">{t.Support_Subject()}</label>
                    <input type="text" data-test-id="support-subject-input" className="support-form-control"
                        value={subject} onChange={this.changeSubject} placeholder={t.Support_Subject()} />
                </div>
                <div>
                    <label className="support-form-label">{t.Support_Message()}</label>
                    <textarea data-test-id="support-message-input" className="support-form-control" rows={6}
                        value={message} onChange={this.changeMessage} placeholder={t.Support_Message() + CTRL_ENTER_HINT}
                        onKeyDown={this.submitOnShortcut} />
                </div>
            </>
        );
    }

    private renderActions() {
        const {files, onFilesChange, onSubmit, sending, onCancel} = this.props;
        return (
            <div className="im-thread-actions">
                <AttachmentPicker files={files} onChange={onFilesChange} />
                <SendButton onClick={onSubmit} disabled={!this.canSend()} sending={sending} label={t.Support_Send()} testId="support-send-btn" />
                <button type="button" className="booking-cancel-dismiss-regular" data-booking-action="regular" onClick={onCancel}>
                    {t.Support_BackToList()}
                </button>
            </div>
        );
    }

    render() {
        return (
            <div className="im-new-form">
                <h3 className="im-new-title">{t.Support_NewTicket()}</h3>
                {this.renderFields()}
                {this.renderActions()}
            </div>
        );
    }
}
