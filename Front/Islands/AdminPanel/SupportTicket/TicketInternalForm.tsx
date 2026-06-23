import * as React from 'react';
import {useCtrlEnter, CTRL_ENTER_HINT} from '@common/hooks/useCtrlEnter';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import AttachmentPicker, {PendingFile} from '../../../Common/AttachmentPicker';
import SendButton from '@common/Components/SendButton';

interface Props {
    internalText: string;
    onInternalTextChange: (text: string) => void;
    internalFiles: PendingFile[];
    onInternalFilesChange: (files: PendingFile[]) => void;
    sending: boolean;
    onSend: () => void;
}

export default function TicketInternalForm({internalText, onInternalTextChange, internalFiles, onInternalFilesChange, sending, onSend}: Props) {
    return (
        <div className="mb-4" data-test-id="support-internal-form">
            {/* Visual separator between reply and internal comment */}
            <div className="border-t border-default pt-3 mb-3">
                <div className="status-warning text-xs font-semibold uppercase tracking-wide px-3 py-1.5 rounded">
                    {t.Support_InternalComment()}
                </div>
            </div>
            <div className="bg-warning-subtle rounded-lg p-4 border border-default">
            <label className="text-sm font-medium text-warning block mb-1">{t.Support_InternalComment()}</label>
            <textarea
                className="form-control text-sm w-full mb-2 border-default focus:border-strong"
                rows={3}
                placeholder={t.Support_InternalComment() + '...' + CTRL_ENTER_HINT}
                value={internalText}
                onChange={e => onInternalTextChange(e.target.value)}
                onKeyDown={useCtrlEnter(onSend, sending || !internalText.trim())}
                data-test-id="support-internal-input"
            />
            <div className="flex items-center gap-3">
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
        </div>
    );
}
