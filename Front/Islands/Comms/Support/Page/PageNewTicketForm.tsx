import * as React from 'react';

import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import AttachmentPicker, {PendingFile} from '../../../../Common/attachments/AttachmentPicker';
import SendButton from '@common/Components/Controls/SendButton';
import {useCtrlEnter, CTRL_ENTER_HINT} from '@common/hooks/ui/useCtrlEnter';

interface NewFormProps {
    subject: string;
    onSubjectChange: (v: string) => void;
    message: string;
    onMessageChange: (v: string) => void;
    files: PendingFile[];
    onFilesChange: (files: PendingFile[]) => void;
    onSubmit: () => void;
    onCancel: () => void;
    sending: boolean;
}

/** Форма нового обращения. */
export const PageNewTicketForm: React.FC<NewFormProps> = ({subject, onSubjectChange, message, onMessageChange, files, onFilesChange, onSubmit, onCancel, sending}) => (
    <div className="p-6 flex flex-col gap-4">
        <h3 className="text-lg font-semibold text-on-surface">{t.Support_NewTicket()}</h3>
        <div>
            <label className="text-sm text-secondary mb-1 block">{t.Support_Subject()}</label>
            <input
                type="text"
                data-test-id="support-subject-input"
                className="form-control"
                value={subject}
                onChange={e => onSubjectChange(e.target.value)}
                placeholder={t.Support_Subject()}
            />
        </div>
        <div>
            <label className="text-sm text-secondary mb-1 block">{t.Support_Message()}</label>
            <textarea
                data-test-id="support-message-input"
                className="form-control"
                rows={6}
                value={message}
                onChange={e => onMessageChange(e.target.value)}
                placeholder={t.Support_Message() + CTRL_ENTER_HINT}
                onKeyDown={useCtrlEnter(onSubmit, sending || !subject.trim() || !message.trim())}
            />
        </div>
        <div className="support-thread-actions">
            <AttachmentPicker files={files} onChange={onFilesChange} />
            <SendButton
                onClick={onSubmit}
                disabled={!subject.trim() || !message.trim()}
                sending={sending}
                label={t.Support_Send()}
                testId="support-send-btn"
            />
            <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={onCancel}
            >
                {t.Support_BackToList()}
            </button>
        </div>
    </div>
);
