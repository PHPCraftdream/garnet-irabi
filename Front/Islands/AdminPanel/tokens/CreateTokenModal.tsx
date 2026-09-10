import * as React from 'react';
import {sendPost} from '@common/Api/sendPost';
import {showToast} from '@common/Components/GlobalToast';
import {useSending} from '@common/hooks/useSending';
import {LogDetailModal} from '@common/Components/AdminLog/LogDetailModal';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {TokenRow, TTL_OPTIONS} from './tokenTypes';
import {TokenField} from './TokenField';

interface CreatedProps {
    url: string;
    onCopy: () => void;
    onClose: () => void;
}

/** Готовая ссылка сразу после создания — её нужно куда-то унести. */
const CreatedLink: React.FC<CreatedProps> = ({url, onCopy, onClose}) => (
    <div data-test-id="token-created-result">
        <label className="label-mini mb-1">{t.Admin_Tokens_Link()}</label>
        <div className="flex gap-2 items-center mb-3">
            <input type="text" className="form-control" readOnly value={url} data-test-id="token-created-url" />
            {/*
              * Кнопка называет действие, а не столбец: раньше здесь стояло
              * слово «Ссылка», и было непонятно, копирует она или открывает.
              */}
            <button type="button" className="btn btn-primary" onClick={onCopy} data-test-id="token-created-copy">
                {t.Admin_Tokens_CopyLink()}
            </button>
        </div>
        <button type="button" className="btn btn-secondary" onClick={onClose}>{t.Action_Close()}</button>
    </div>
);

interface Props {
    createUrl: string;
    onCreated: (token: TokenRow) => void;
    onClose: () => void;
}

export const CreateTokenModal: React.FC<Props> = ({createUrl, onCreated, onClose}) => {
    const [label, setLabel] = React.useState('');
    const [maxUses, setMaxUses] = React.useState(1);
    // Неделя, а не «без срока»: приглашение выписывают конкретному человеку,
    // и забытая бессрочная ссылка остаётся действующим входом в систему
    // навсегда. Кому нужна вечная — выберет её осознанно, одним кликом.
    const [ttl, setTtl] = React.useState(604800);
    const [accountType, setAccountType] = React.useState<'user' | 'expert'>('user');
    const [createdToken, setCreatedToken] = React.useState<TokenRow | null>(null);
    const {sending, withSending} = useSending();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        void withSending(async () => {
            try {
                const resp = await sendPost<
                    {label: string; max_uses: number; ttl: number; account_type: string},
                    {success: boolean; token: TokenRow}
                >(createUrl, {label, max_uses: maxUses, ttl, account_type: accountType});
                const data = ('data' in resp && resp.data) ? resp.data : (resp as unknown as {success: boolean; token: TokenRow});
                if (data?.success && data.token) {
                    setCreatedToken(data.token);
                    onCreated(data.token);
                    return;
                }
                showToast(t.General_Error(), 'danger');
            } catch {
                showToast(t.General_Error(), 'danger');
            }
        });
    };

    const handleCopyCreated = () => {
        if (!createdToken) return;
        void navigator.clipboard.writeText(createdToken.url).then(() => showToast(t.Admin_Tokens_Copied(), 'success'));
    };

    if (createdToken) {
        return (
            <LogDetailModal title={t.Admin_Tokens_CreateTitle()} onClose={onClose}>
                <CreatedLink url={createdToken.url} onCopy={handleCopyCreated} onClose={onClose} />
            </LogDetailModal>
        );
    }

    return (
        <LogDetailModal title={t.Admin_Tokens_CreateTitle()} onClose={onClose}>
            <form onSubmit={handleSubmit} data-test-id="token-create-form">
                <TokenField id="token-label" label={t.Admin_Tokens_Label()}>
                    <input
                        id="token-label"
                        type="text"
                        className="form-control"
                        value={label}
                        onChange={e => setLabel(e.target.value)}
                        placeholder={t.Admin_Tokens_LabelPlaceholder()}
                        data-test-id="token-label-input"
                    />
                </TokenField>
                <TokenField id="token-account-type" label={t.Admin_Tokens_AccountType()}>
                    <select
                        id="token-account-type"
                        className="form-control"
                        value={accountType}
                        onChange={e => setAccountType(e.target.value as 'user' | 'expert')}
                        data-test-id="token-account-type-select"
                    >
                        <option value="user">{t.Admin_Tokens_AccountTypeUser()}</option>
                        <option value="expert">{t.Admin_Tokens_AccountTypeExpert()}</option>
                    </select>
                </TokenField>
                <TokenField id="token-ttl" label={t.Admin_Tokens_TTL()}>
                    <select
                        id="token-ttl"
                        className="form-control"
                        value={ttl}
                        onChange={e => setTtl(Number(e.target.value))}
                        data-test-id="token-ttl-select"
                    >
                        {TTL_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label()}</option>)}
                    </select>
                </TokenField>
                <TokenField id="token-max-uses" label={t.Admin_Tokens_MaxUses()}>
                    <input
                        id="token-max-uses"
                        type="number"
                        className="form-control"
                        value={maxUses}
                        onChange={e => setMaxUses(Math.max(1, parseInt(e.target.value, 10) || 1))}
                        min={1}
                        data-test-id="token-max-uses-input"
                    />
                </TokenField>
                <div className="flex gap-2">
                    <button type="submit" className="btn btn-primary" disabled={sending} data-test-id="token-create-submit">
                        {t.Admin_Tokens_Create()}
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={onClose} disabled={sending}>
                        {t.Action_Cancel()}
                    </button>
                </div>
            </form>
        </LogDetailModal>
    );
};
