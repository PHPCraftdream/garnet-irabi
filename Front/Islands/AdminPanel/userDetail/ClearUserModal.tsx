import * as React from 'react';
import {useState} from 'react';
import {sendPost} from '@common/Api/sendPost';
import SendButton from '@common/Components/SendButton';
import {appUrl} from '@common/Utils/appUrl';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {ModalShell} from '../../../Common/Components/ModalShell';

interface Props {
    accountId: number;
    accountLogin: string;
    accountName: string;
    onClose: () => void;
    onSuccess: () => void;
}

/**
 * Необратимая очистка аккаунта (GDPR / 152-ФЗ).
 *
 * Кнопка оживает, только когда администратор набрал **точный** адрес
 * удаляемого аккаунта. Это зеркало серверной проверки `confirm_login === login`
 * — и защита от удаления не того человека, у которого похожее имя.
 */
export const ClearUserModal: React.FC<Props> = ({accountId, accountLogin, accountName, onClose, onSuccess}) => {
    const [typed, setTyped] = useState('');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const matches = typed.trim().length > 0 && typed.trim() === accountLogin;

    const handleSend = async () => {
        if (!matches || sending) return;
        setSending(true);
        setError(null);
        try {
            const csrf = (window as any).__GARNET_CSRF__ ?? '';
            const r: any = await sendPost(appUrl('/admin/~clearUser'), {
                CSRF_TOKEN: csrf,
                user_id: accountId,
                confirm_login: typed.trim(),
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
        <ModalShell
            title={t.Admin_ClearUserModalTitle()}
            titleClassName="text-danger"
            testId={`clear-user-${accountId}`}
            size="lg"
            onClose={onClose}
        >
            <div className="fg-modal-subtitle">
                <strong className="text-danger">{accountName}</strong>
                <span className="text-muted"> · {accountLogin} · ID: {accountId}</span>
            </div>
            {error && <div className="fg-modal-error">{error}</div>}
            <div className="fg-modal-warning mb-3">{t.Admin_ClearUserModalBody()}</div>
            <div className="mb-3">
                <label className="block text-sm font-medium mb-1">
                    {t.Admin_ClearUserTypeEmail()}
                    <span className="text-muted"> {t.Admin_ClearUserTypeEmailHint()}</span>
                </label>
                <input
                    type="text"
                    className="form-control w-full"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    value={typed}
                    onChange={e => setTyped(e.target.value)}
                    disabled={sending}
                    data-test-id={`clear-user-confirm-input-${accountId}`}
                />
                {typed.trim().length > 0 && !matches && (
                    <div className="text-danger text-sm mt-1">{t.Admin_ClearUserMismatch()}</div>
                )}
            </div>
            <div className="fg-modal-actions">
                <button type="button" className="btn btn-sm btn-secondary" onClick={onClose} disabled={sending}>
                    {t.Action_Cancel()}
                </button>
                <SendButton
                    onClick={handleSend}
                    sending={sending}
                    disabled={!matches}
                    label={sending ? t.User_Loading() : t.Admin_ClearUser()}
                    testId={`clear-user-confirm-btn-${accountId}`}
                    size="sm"
                />
            </div>
        </ModalShell>
    );
};
