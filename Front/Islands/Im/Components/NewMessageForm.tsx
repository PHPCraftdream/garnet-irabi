import * as React from 'react';
import {useState, useEffect} from 'react';
import {sendPost} from '@common/Api/sendPost';
import {D} from '@common/Debug/D';
import {useCtrlEnter, CTRL_ENTER_HINT} from '@common/hooks/useCtrlEnter';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import AttachmentPicker, {PendingFile} from '../../../Common/AttachmentPicker';
import SendButton from '@common/Components/SendButton';
import {Recipient, RecipientCombobox} from './RecipientCombobox';

interface Props {
    searchRecipientsUrl: string;
    recipientId: string;
    onRecipientIdChange: (id: string) => void;
    newMessage: string;
    onNewMessageChange: (msg: string) => void;
    newFiles: PendingFile[];
    onNewFilesChange: (files: PendingFile[]) => void;
    sending: boolean;
    onSend: () => void;
}

/** Новое сообщение: кому, текст, вложения. */
export default function NewMessageForm({
    searchRecipientsUrl, recipientId, onRecipientIdChange,
    newMessage, onNewMessageChange, newFiles, onNewFilesChange,
    sending, onSend,
}: Props) {
    const [recipients, setRecipients] = useState<Recipient[]>([]);
    const [loading, setLoading] = useState(true);

    // Список грузится целиком один раз: получателей немного, а поиск по уже
    // загруженному отвечает мгновенно и не бьёт в сервер на каждую букву.
    useEffect(() => {
        D('im.loadRecipients');
        sendPost(searchRecipientsUrl, {query: ''}).then((r: any) => {
            setRecipients(r?.recipients ?? []);
            D('im.recipients.loaded', {count: r?.recipients?.length ?? 0});
            setLoading(false);
        }).catch(() => setLoading(false));
    }, [searchRecipientsUrl]);

    const canSend = !!recipientId.trim() && !!newMessage.trim();

    return (
        <div className="support-new-form" data-test-id="im-new-form">
            <h3 className="support-new-form-title">{t.IM_NewMessage()}</h3>

            <div>
                <label className="support-form-label">{t.IM_Recipient()}</label>
                <RecipientCombobox
                    recipients={recipients}
                    loading={loading}
                    value={recipientId}
                    onChange={onRecipientIdChange}
                />
            </div>

            <div>
                <label className="support-form-label">{t.IM_MessagePlaceholder()}</label>
                <textarea
                    data-test-id="im-new-message-input"
                    className="form-control"
                    rows={6}
                    value={newMessage}
                    onChange={e => onNewMessageChange(e.target.value)}
                    placeholder={t.IM_MessagePlaceholder() + CTRL_ENTER_HINT}
                    onKeyDown={useCtrlEnter(onSend, sending || !canSend)}
                />
            </div>

            <div className="support-thread-actions">
                <AttachmentPicker files={newFiles} onChange={onNewFilesChange} />
                <SendButton
                    onClick={onSend}
                    disabled={!canSend}
                    sending={sending}
                    label={t.IM_Send()}
                    testId="im-send-btn"
                />
            </div>
        </div>
    );
}
