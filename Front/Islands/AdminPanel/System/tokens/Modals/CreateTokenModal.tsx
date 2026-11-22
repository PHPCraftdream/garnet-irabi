import * as React from 'react';
import {sendPost} from '@common/Api/Send/sendPost';
import {showToast} from '@common/Components/Feedback/GlobalToast';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import {LogDetailModal} from '@common/Components/Admin/AdminLog/LogDetailModal';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {TokenRow, TTL_OPTIONS} from '../tokenTypes';
import {TokenField} from '../TokenField';

interface CreatedProps {
    url: string;
    onCopy: () => void;
    onClose: () => void;
}

/** Готовая ссылка сразу после создания — её нужно куда-то унести. */
const CreatedLink: React.FC<CreatedProps> = ({url, onCopy, onClose}) => (
    <div data-test-id="token-created-result">
        <label className="token-field-label">{t.Admin_Tokens_Link()}</label>
        <div className="token-created-link">
            <input type="text" className="admin-filter-field" readOnly value={url} data-test-id="token-created-url" />
            {/*
              * Кнопка называет действие, а не столбец: раньше здесь стояло
              * слово «Ссылка», и было непонятно, копирует она или открывает.
              */}
            <button type="button" className="primary-action-button" onClick={onCopy} data-test-id="token-created-copy">
                {t.Admin_Tokens_CopyLink()}
            </button>
        </div>
        <button type="button" className="confirm-modal-cancel" onClick={onClose}>{t.Action_Close()}</button>
    </div>
);

interface Props {
    createUrl: string;
    onCreated: (token: TokenRow) => void;
    onClose: () => void;
}

function renderTtlOption(option: (typeof TTL_OPTIONS)[number]) {
    return <option key={option.value} value={option.value}>{option.label()}</option>;
}

function copied(): void {
    showToast(t.Admin_Tokens_Copied(), 'success');
}

function initialForm() {
    return {label: '', maxUses: 1, ttl: 604800, accountType: 'user' as 'user' | 'expert', createdToken: null as TokenRow | null, sending: false};
}

type Form = ReturnType<typeof initialForm>;

export class CreateTokenModal extends AntiHookComponent<Props> {
    private readonly form = new Carburetor(initialForm());

    private update(patch: Partial<Form>): void {
        this.form.setData({...this.form.getData(), ...patch});
    }

    private readonly changeLabel = (event: React.ChangeEvent<HTMLInputElement>) => this.update({label: event.target.value});
    private readonly changeMaxUses = (event: React.ChangeEvent<HTMLInputElement>) => this.update({maxUses: Math.max(1, parseInt(event.target.value, 10) || 1)});
    private readonly changeTtl = (event: React.ChangeEvent<HTMLSelectElement>) => this.update({ttl: Number(event.target.value)});
    private readonly changeAccountType = (event: React.ChangeEvent<HTMLSelectElement>) => this.update({accountType: event.target.value as 'user' | 'expert'});

    private readonly submit = async (event: React.FormEvent) => {
        event.preventDefault();
        const {sending, label, maxUses, ttl, accountType} = this.form.getData();
        if (sending) return;
        const {createUrl, onCreated} = this.props;
        this.update({sending: true});
        try {
            const resp = await sendPost<
                {label: string; max_uses: number; ttl: number; account_type: string},
                {success: boolean; token: TokenRow}
            >(createUrl, {label, max_uses: maxUses, ttl, account_type: accountType});
            const data = ('data' in resp && resp.data) ? resp.data : (resp as unknown as {success: boolean; token: TokenRow});
            if (data?.success && data.token) {
                this.update({createdToken: data.token});
                onCreated(data.token);
                return;
            }
            showToast(t.General_Error(), 'danger');
        } catch {
            showToast(t.General_Error(), 'danger');

        } finally {
            this.update({sending: false});
        }
    };

    private readonly copyCreated = () => {
        const token = this.form.getData().createdToken;
        if (token) void navigator.clipboard.writeText(token.url).then(copied);
    };

    private renderFields({label, maxUses, ttl, accountType}: Form) {
        return (
            <>
                <TokenField id="token-label" label={t.Admin_Tokens_Label()}>
                    <input
                        id="token-label"
                        type="text"
                        className="admin-filter-field"
                        value={label}
                        onChange={this.changeLabel}
                        placeholder={t.Admin_Tokens_LabelPlaceholder()}
                        data-test-id="token-label-input"
                    />
                </TokenField>
                <TokenField id="token-account-type" label={t.Admin_Tokens_AccountType()}>
                    <select
                        id="token-account-type"
                        className="admin-filter-field"
                        value={accountType}
                        onChange={this.changeAccountType}
                        data-test-id="token-account-type-select"
                    >
                        <option value="user">{t.Admin_Tokens_AccountTypeUser()}</option>
                        <option value="expert">{t.Admin_Tokens_AccountTypeExpert()}</option>
                    </select>
                </TokenField>
                <TokenField id="token-ttl" label={t.Admin_Tokens_TTL()}>
                    <select
                        id="token-ttl"
                        className="admin-filter-field"
                        value={ttl}
                        onChange={this.changeTtl}
                        data-test-id="token-ttl-select"
                    >
                        {TTL_OPTIONS.map(renderTtlOption)}
                    </select>
                </TokenField>
                <TokenField id="token-max-uses" label={t.Admin_Tokens_MaxUses()}>
                    <input
                        id="token-max-uses"
                        type="number"
                        className="admin-filter-field"
                        value={maxUses}
                        onChange={this.changeMaxUses}
                        min={1}
                        data-test-id="token-max-uses-input"
                    />
                </TokenField>
            </>
        );
    }

    render() {
        const {onClose} = this.props;
        const state = this.useCarburetor(this.form);
        const {sending, createdToken} = state;
        if (createdToken) {
            return (
                <LogDetailModal title={t.Admin_Tokens_CreateTitle()} onClose={onClose}>
                    <CreatedLink url={createdToken.url} onCopy={this.copyCreated} onClose={onClose} />
                </LogDetailModal>
            );
        }
        return (
            <LogDetailModal title={t.Admin_Tokens_CreateTitle()} onClose={onClose}>
                <form onSubmit={this.submit} data-test-id="token-create-form">
                    {this.renderFields(state)}
                    <div className="token-link-actions">
                        <button type="submit" className="primary-action-button" disabled={sending} data-test-id="token-create-submit">
                            {t.Admin_Tokens_Create()}
                        </button>
                        <button type="button" className="confirm-modal-cancel" onClick={onClose} disabled={sending}>
                            {t.Action_Cancel()}
                        </button>
                    </div>
                </form>
            </LogDetailModal>
        );
    }
}
