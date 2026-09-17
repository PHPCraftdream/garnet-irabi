import * as React from 'react';
import {useState} from 'react';
import {sendPost} from '@common/Api/Send/sendPost';
import SendButton from '@common/Components/Controls/SendButton';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {ModalShell} from '../../../../../Common/Components/ModalShell';

interface Props {
    accountId: number;
    accountName: string;
    createTicketUrl: string;
    onClose: () => void;
    onSuccess: () => void;
}

/** Написать пользователю — создаёт обращение в поддержку от его имени. */
export const WriteToUserModal: React.FC<Props> = ({accountId, accountName, createTicketUrl, onClose, onSuccess}) => {
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSend = async () => {
        if (!subject.trim() || !body.trim()) return;
        setSending(true);
        setError(null);
        try {
            const r: any = await sendPost(createTicketUrl, {
                account_id: accountId,
                subject: subject.trim(),
                message: body.trim(),
            });
            if (r?.error) {
                setError(r.error);
                return;
            }
            onSuccess();
        } catch {
            setError(t.General_Error());
        } finally {
            setSending(false);
        }
    };

    return (
        <ModalShell title={t.Admin_WriteToUser()} testId={`write-to-user-${accountId}`} size="lg" onClose={onClose}>
            <div className="fg-modal-subtitle">{accountName} (ID: {accountId})</div>
            {error && <div className="fg-modal-error">{error}</div>}
            <div className="mb-3">
                <label className="block text-sm font-medium mb-1">{t.Admin_MessageSubject()}</label>
                <input
                    type="text"
                    className="form-control w-full"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    disabled={sending}
                />
            </div>
            <div className="mb-4">
                <label className="block text-sm font-medium mb-1">{t.Admin_MessageBody()}</label>
                <textarea
                    className="form-control w-full"
                    rows={5}
                    value={body}
                    onChange={e => setBody(e.target.value)}
                    disabled={sending}
                />
            </div>
            <div className="fg-modal-actions">
                <button type="button" className="btn btn-sm btn-secondary" onClick={onClose} disabled={sending}>
                    {t.Action_Cancel()}
                </button>
                <SendButton
                    onClick={handleSend}
                    sending={sending}
                    disabled={!subject.trim() || !body.trim()}
                    label={sending ? t.User_Loading() : t.Support_Send()}
                    testId={`write-to-user-send-${accountId}`}
                    size="sm"
                />
            </div>
        </ModalShell>
    );
};
