import * as React from 'react';

import SendButton from '@common/Components/Controls/SendButton';
import {useCtrlEnter, CTRL_ENTER_HINT} from '@common/hooks/ui/useCtrlEnter';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import AttachmentPicker, {PendingFile} from '../../../Common/attachments/AttachmentPicker';
import ScreenshotButton from '../../../Common/media/ScreenshotButton';

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
export const WidgetNewTicketForm: React.FC<NewTicketFormProps> = ({
    subject,
    onSubjectChange,
    message,
    onMessageChange,
    files,
    onFilesChange,
    onScreenshot,
    onSubmit,
    onBack,
    sending,
}) => (
    <div className="support-widget-new-form">
        <button
            type="button"
            className="support-widget-back-btn-self"
            onClick={onBack}
        >
            &larr; {t.Support_BackToList()}
        </button>
        <div>
            <label className="support-form-label">{t.Support_Subject()}</label>
            <input
                type="text"
                data-test-id="support-subject-input"
                className="form-control text-sm"
                value={subject}
                onChange={e => onSubjectChange(e.target.value)}
                placeholder={t.Support_Subject()}
            />
        </div>
        <div>
            <label className="support-form-label">{t.Support_Message()}</label>
            <textarea
                data-test-id="support-message-input"
                className="form-control text-sm"
                rows={4}
                value={message}
                onChange={e => onMessageChange(e.target.value)}
                placeholder={t.Support_Message() + CTRL_ENTER_HINT}
                onKeyDown={useCtrlEnter(onSubmit, sending || !subject.trim() || !message.trim())}
            />
        </div>
        <div className="flex items-center gap-2">
            <AttachmentPicker files={files} onChange={onFilesChange} />
            <ScreenshotButton onScreenshot={onScreenshot} />
        </div>
        <SendButton
            onClick={onSubmit}
            disabled={!subject.trim() || !message.trim()}
            sending={sending}
            label={t.Support_Send()}
            testId="support-send-btn"
        />
    </div>
);
