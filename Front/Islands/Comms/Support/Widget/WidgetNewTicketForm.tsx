import * as React from 'react';

import SendButton from '@common/Components/Controls/SendButton';
import {CTRL_ENTER_HINT} from '@common/hooks/ui/useCtrlEnter';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import {PendingFile} from '@/Common/attachments/AttachmentPicker';
import {WidgetAttachmentTools} from './controls/WidgetAttachmentTools';

interface NewTicketFormProps {
    subject: string;
    onSubjectChange: (v: string) => void;
    message: string;
    onMessageChange: (v: string) => void;
    files: PendingFile[];
    onFilesChange: (files: PendingFile[]) => void;
    onScreenshot: (blob: Blob, name: string) => void;
    onSubmit: () => void;
    onBack: () => void;
    sending: boolean;
}

/** Форма нового обращения. */
export class WidgetNewTicketForm extends React.Component<NewTicketFormProps> {
    /** Обновляет тему обращения. */
    private readonly changeSubject = (event: React.ChangeEvent<HTMLInputElement>) => {
        this.props.onSubjectChange(event.target.value);
    };

    /** Обновляет текст сообщения. */
    private readonly changeMessage = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        this.props.onMessageChange(event.target.value);
    };

    /** Отправляет форму по клавиатурному сочетанию. */
    private readonly submitOnKey = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        const {sending, subject, message, onSubmit} = this.props;
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !sending && subject.trim() && message.trim()) {
            event.preventDefault();
            onSubmit();
        }
    };

    /** Рисует поля формы. */
    private renderFields() {
        const {subject, message} = this.props;
        return (
            <>
                <div>
                    <label className="support-form-label">{t.Support_Subject()}</label>
                    <input
                        type="text"
                        data-test-id="support-subject-input"
                        className="support-form-control"
                        value={subject}
                        onChange={this.changeSubject}
                        placeholder={t.Support_Subject()}
                    />
                </div>
                <div>
                    <label className="support-form-label">{t.Support_Message()}</label>
                    <textarea
                        data-test-id="support-message-input"
                        className="support-form-control"
                        rows={4}
                        value={message}
                        onChange={this.changeMessage}
                        placeholder={t.Support_Message() + CTRL_ENTER_HINT}
                        onKeyDown={this.submitOnKey}
                    />
                </div>
            </>
        );
    }

    /** Рисует содержимое компонента. */
    public render() {
        const {subject, message, files, onFilesChange, onScreenshot, onSubmit, onBack, sending} = this.props;
        return (
            <div className="support-widget-new-form">
                <button type="button" className="support-widget-back-btn-self" onClick={onBack}>
                    &larr; {t.Support_BackToList()}
                </button>
                {this.renderFields()}
                <WidgetAttachmentTools files={files} onFilesChange={onFilesChange} onScreenshot={onScreenshot} />
                <SendButton
                    onClick={onSubmit}
                    disabled={!subject.trim() || !message.trim()}
                    sending={sending}
                    label={t.Support_Send()}
                    testId="support-send-btn"
                />
            </div>
        );
    }
}
