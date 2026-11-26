import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {CTRL_ENTER_HINT} from '@common/hooks/ui/useCtrlEnter';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import AttachmentPicker, {PendingFile} from '@/Common/attachments/AttachmentPicker';
import SendButton from '@common/Components/Controls/SendButton';

interface Props {
    internalText: string;
    onInternalTextChange: (text: string) => void;
    internalFiles: PendingFile[];
    onInternalFilesChange: (files: PendingFile[]) => void;
    sending: boolean;
    onSend: () => void;
}

export default class TicketInternalForm extends AntiHookComponent<Props> {
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly changeText = (event: React.ChangeEvent<HTMLTextAreaElement>) =>
        this.props.onInternalTextChange(event.target.value);

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly submitOnShortcut = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        const {internalText, sending, onSend} = this.props;
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !sending && internalText.trim()) {
            event.preventDefault();
            onSend();
        }
    };

    /** Формирует представление данных для соответствующего раздела панели. */
    private renderEditor() {
        const {internalText, internalFiles, onInternalFilesChange, sending, onSend} = this.props;
        return (
            <div className="admin-support-internal-panel">
                <label className="admin-support-internal-form-label">{t.Support_InternalComment()}</label>
                <textarea
                    className="admin-support-internal-input"
                    rows={3}
                    placeholder={t.Support_InternalComment() + '...' + CTRL_ENTER_HINT}
                    value={internalText}
                    onChange={this.changeText}
                    onKeyDown={this.submitOnShortcut}
                    data-test-id="support-internal-input"
                />
                <div className="im-thread-actions">
                    <AttachmentPicker files={internalFiles} onChange={onInternalFilesChange} />
                    <SendButton
                        onClick={onSend}
                        disabled={!internalText.trim()}
                        sending={sending}
                        label={t.Support_Send()}
                        testId="support-internal-btn"
                        variant="outline-warning"
                    />
                </div>
            </div>
        );
    }

    /** Формирует представление данных для соответствующего раздела панели. */
    render() {
        return (
            <div className="admin-support-form" data-test-id="support-internal-form">
                <div className="admin-support-internal-divider">
                    <div className="admin-support-internal-banner">{t.Support_InternalComment()}</div>
                </div>
                {this.renderEditor()}
            </div>
        );
    }
}
