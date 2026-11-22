import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import {sendPost} from '@common/Api/Send/sendPost';
import SendButton from '@common/Components/Controls/SendButton';
import {appUrl} from '@common/Utils/Url/appUrl';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {ModalShell} from '../../../../../Common/Components/ModalShell';

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
function matchesLogin(typed: string, login: string): boolean {
    const cleaned = typed.trim();
    return cleaned.length > 0 && cleaned === login;
}

export class ClearUserModal extends AntiHookComponent<Props> {
    private readonly ui = new Carburetor({typed: '', sending: false, error: null as string | null});

    private update(patch: Partial<ReturnType<typeof this.ui.getData>>): void {
        this.ui.setData({...this.ui.getData(), ...patch});
    }

    private readonly changeConfirmation = (event: React.ChangeEvent<HTMLInputElement>) => this.update({typed: event.target.value});

    private readonly send = async () => {
        const {typed, sending} = this.ui.getData();
        const {accountLogin, accountId, onSuccess} = this.props;
        const matches = matchesLogin(typed, accountLogin);
        if (!matches || sending) return;
        this.update({sending: true, error: null});
        try {
            const csrf = (window as any).__GARNET_CSRF__ ?? '';
            const r: any = await sendPost(appUrl('/admin/~clearUser'), {
                CSRF_TOKEN: csrf,
                user_id: accountId,
                confirm_login: typed.trim(),
            });
            if (r?.error) {
                this.update({error: r.error});
                return;
            }
            onSuccess();
        } catch {
            this.update({error: t.General_Error()});
        } finally {
            this.update({sending: false});
        }
    };

    private renderConfirmation({typed, sending}: ReturnType<typeof this.ui.getData>, matches: boolean) {
        const {accountId} = this.props;
        return (
            <div className="token-field">
                <label className="admin-user-message-label">
                    {t.Admin_ClearUserTypeEmail()}
                    <span className="token-cell-muted"> {t.Admin_ClearUserTypeEmailHint()}</span>
                </label>
                <input
                    type="text"
                    className="admin-filter-field"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    value={typed}
                    onChange={this.changeConfirmation}
                    disabled={sending}
                    data-test-id={`clear-user-confirm-input-${accountId}`}
                />
                {typed.trim().length > 0 && !matches && (
                    <div className="admin-user-clear-mismatch">{t.Admin_ClearUserMismatch()}</div>
                )}
            </div>
        );
    }

    private renderActions(matches: boolean, sending: boolean) {
        const {accountId, onClose} = this.props;
        return (
            <div className="booking-cancel-actions">
                <button type="button" className="admin-user-message-cancel" onClick={onClose} disabled={sending}>
                    {t.Action_Cancel()}
                </button>
                <SendButton
                    onClick={this.send}
                    sending={sending}
                    disabled={!matches}
                    label={sending ? t.User_Loading() : t.Admin_ClearUser()}
                    testId={`clear-user-confirm-btn-${accountId}`}
                    size="sm"
                />
            </div>
        );
    }

    render() {
        const {accountId, accountLogin, accountName, onClose} = this.props;
        const state = this.useCarburetor(this.ui);
        const {typed, sending, error} = state;
        const matches = matchesLogin(typed, accountLogin);
        return (
            <ModalShell
                title={t.Admin_ClearUserModalTitle()}
                titleTone="danger"
                testId={`clear-user-${accountId}`}
                size="lg"
                onClose={onClose}
            >
                <div className="admin-user-message-caption">
                    <strong className="admin-user-count-danger">{accountName}</strong>
                    <span className="token-cell-muted"> · {accountLogin} · ID: {accountId}</span>
                </div>
                {error && <div className="admin-user-message-error">{error}</div>}
                <div className="admin-user-clear-warning">{t.Admin_ClearUserModalBody()}</div>
                {this.renderConfirmation(state, matches)}
                {this.renderActions(matches, sending)}
            </ModalShell>
        );
    }
}
