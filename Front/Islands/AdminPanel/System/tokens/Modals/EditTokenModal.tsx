import * as React from 'react';
import {sendPost} from '@common/Api/Send/sendPost';
import {showToast} from '@common/Components/Feedback/GlobalToast';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import SendButton from '@common/Components/Controls/SendButton';
import {LogDetailModal} from '@common/Components/Admin/AdminLog/LogDetailModal';
import {tsToInputDateTime} from '@common/Utils/Time/DateUtils';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {TokenRow} from '../config/tokenTypes';
import {TokenField} from '../TokenField';

export interface TokenUpdate {
    id: number;
    label: string;
    max_uses: number;
    uses_left: number;
    expires_at: number | null;
}

interface Props {
    token: TokenRow;
    updateUrl: string;
    onUpdated: (updated: TokenUpdate) => void;
    onClose: () => void;
}

    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
function showPicker(event: React.MouseEvent<HTMLInputElement>): void {
    (event.target as HTMLInputElement).showPicker?.();
}

    /** Формирует представление данных для соответствующего раздела панели. */
function initialForm(token: TokenRow) {
    return {label: token.label, maxUses: token.max_uses, expiresAt: token.expires_at ?
        tsToInputDateTime(token.expires_at) : '', sending: false};
}

type Form = ReturnType<typeof initialForm>;

export class EditTokenModal extends AntiHookComponent<Props> {
    private readonly form = new Carburetor(initialForm(this.props.token));

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private update(patch: Partial<Form>): void {
        this.form.setData({...this.form.getData(), ...patch});
    }

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly changeLabel = (event: React.ChangeEvent<HTMLInputElement>) => this.update({label:
        event.target.value});
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly changeMaxUses = (event: React.ChangeEvent<HTMLInputElement>) => this.update({maxUses:
        Math.max(1, parseInt(event.target.value, 10) || 1)});
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly changeExpiry = (event: React.ChangeEvent<HTMLInputElement>) => this.update({expiresAt:
        event.target.value});

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly submit = async () => {
        const {sending, label, maxUses, expiresAt} = this.form.getData();
        if (sending) return;
        const {token, updateUrl, onUpdated} = this.props;
        const used = token.max_uses - token.uses_left;
        // Сервер разбирает строку срока в часовом поясе пользователя.
        this.update({sending: true});
        try {
            const resp = await sendPost<
                {id: number; label: string; max_uses: number; expires_at: string},
                {success: boolean; expires_at: number | null}
            >(updateUrl, {id: token.id, label, max_uses: maxUses, expires_at: expiresAt});
            const data = ('data' in resp && resp.data) ? resp.data : (resp as unknown as {success: boolean;
        expires_at: number | null});
            if (!data?.success) {
                showToast(t.General_Error(), 'danger');
                return;
            }
            onUpdated({
                id: token.id,
                label,
                max_uses: maxUses,
                uses_left: Math.max(0, maxUses - used),
                expires_at: data.expires_at ?? null,
            });
            showToast(t.Admin_SaveSettings_Success(), 'success');
        } catch {
            showToast(t.General_Error(), 'danger');

        } finally {
            this.update({sending: false});
        }
    };

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly submitForm = (event: React.FormEvent) => {
        event.preventDefault();
        void this.submit();
    };

    /** Формирует представление данных для соответствующего раздела панели. */
    private renderFields({label, maxUses, expiresAt}: Form) {
        const {token} = this.props;
        const used = token.max_uses - token.uses_left;
        return (
            <>
                <TokenField id="edit-token-label" label={t.Admin_Tokens_Label()}>
                    <input
                        id="edit-token-label"
                        type="text"
                        className="admin-filter-field"
                        value={label}
                        onChange={this.changeLabel}
                        placeholder={t.Admin_Tokens_LabelPlaceholder()}
                        data-test-id="token-edit-label"
                    />
                </TokenField>
                <TokenField id="edit-token-expires" label={t.Admin_Tokens_ExpiresAt()}
        hint={t.Admin_Tokens_EditExpiresHint()}>
                    <input
                        id="edit-token-expires"
                        type="datetime-local"
                        className="admin-filter-field"
                        value={expiresAt}
                        onChange={this.changeExpiry}
                        onClick={showPicker}
                        data-test-id="token-edit-expires"
                    />
                </TokenField>
                <TokenField id="edit-token-max-uses" label={t.Admin_Tokens_MaxUses()}
        hint={t.Admin_Tokens_EditUsedInfo([used])}>
                    <input
                        id="edit-token-max-uses"
                        type="number"
                        className="admin-filter-field"
                        value={maxUses}
                        onChange={this.changeMaxUses}
                        min={Math.max(1, used)}
                        data-test-id="token-edit-max-uses"
                    />
                </TokenField>
            </>
        );
    }

    /** Формирует представление данных для соответствующего раздела панели. */
    render() {
        const {onClose} = this.props;
        const state = this.useCarburetor(this.form);
        const {sending} = state;
        return (
            <LogDetailModal title={t.Admin_Tokens_EditTitle()} onClose={onClose}>
                <form onSubmit={this.submitForm} data-test-id="token-edit-form">
                    {this.renderFields(state)}
                    <div className="token-link-actions">
                        <SendButton
                            onClick={this.submit}
                            sending={sending}
                            label={sending ? t.Admin_SaveSettings_Saving() : t.Admin_SaveSettings()}
                            testId="token-edit-submit"
                        />
                        <button type="button" className="confirm-modal-cancel" onClick={onClose} disabled={sending}>
                            {t.Action_Cancel()}
                        </button>
                    </div>
                </form>
            </LogDetailModal>
        );
    }
}
