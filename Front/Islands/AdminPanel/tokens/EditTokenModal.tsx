import * as React from 'react';
import {sendPost} from '@common/Api/sendPost';
import {showToast} from '@common/Components/GlobalToast';
import {useSending} from '@common/hooks/useSending';
import SendButton from '@common/Components/SendButton';
import {LogDetailModal} from '@common/Components/AdminLog/LogDetailModal';
import {tsToInputDateTime} from '@common/Utils/DateUtils';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {TokenRow} from './tokenTypes';
import {TokenField} from './TokenField';

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

export const EditTokenModal: React.FC<Props> = ({token, updateUrl, onUpdated, onClose}) => {
    const [label, setLabel] = React.useState(token.label);
    const [maxUses, setMaxUses] = React.useState(token.max_uses);
    const [expiresAt, setExpiresAt] = React.useState<string>(() =>
        token.expires_at ? tsToInputDateTime(token.expires_at) : ''
    );
    const {sending, withSending} = useSending();

    const used = token.max_uses - token.uses_left;

    const handleSubmit = () => {
        void withSending(async () => {
            // Строка `YYYY-MM-DDTHH:mm` уходит как есть — сервер разбирает её в
            // поясе пользователя через DateTimeZone (AGENTS.md §12). Пустая
            // строка означает «без срока».
            try {
                const resp = await sendPost<
                    {id: number; label: string; max_uses: number; expires_at: string},
                    {success: boolean; expires_at: number | null}
                >(updateUrl, {id: token.id, label, max_uses: maxUses, expires_at: expiresAt});
                const data = ('data' in resp && resp.data) ? resp.data : (resp as unknown as {success: boolean; expires_at: number | null});
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
            }
        });
    };

    const onFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        handleSubmit();
    };

    return (
        <LogDetailModal title={t.Admin_Tokens_EditTitle()} onClose={onClose}>
            <form onSubmit={onFormSubmit} data-test-id="token-edit-form">
                <TokenField id="edit-token-label" label={t.Admin_Tokens_Label()}>
                    <input
                        id="edit-token-label"
                        type="text"
                        className="form-control"
                        value={label}
                        onChange={e => setLabel(e.target.value)}
                        placeholder={t.Admin_Tokens_LabelPlaceholder()}
                        data-test-id="token-edit-label"
                    />
                </TokenField>
                <TokenField id="edit-token-expires" label={t.Admin_Tokens_ExpiresAt()} hint={t.Admin_Tokens_EditExpiresHint()}>
                    <input
                        id="edit-token-expires"
                        type="datetime-local"
                        className="form-control"
                        value={expiresAt}
                        onChange={e => setExpiresAt(e.target.value)}
                        onClick={e => (e.target as HTMLInputElement).showPicker?.()}
                        data-test-id="token-edit-expires"
                    />
                </TokenField>
                <TokenField id="edit-token-max-uses" label={t.Admin_Tokens_MaxUses()} hint={t.Admin_Tokens_EditUsedInfo([used])}>
                    <input
                        id="edit-token-max-uses"
                        type="number"
                        className="form-control"
                        value={maxUses}
                        onChange={e => setMaxUses(Math.max(1, parseInt(e.target.value, 10) || 1))}
                        min={Math.max(1, used)}
                        data-test-id="token-edit-max-uses"
                    />
                </TokenField>
                <div className="flex gap-2">
                    <SendButton
                        onClick={handleSubmit}
                        sending={sending}
                        label={sending ? t.Admin_SaveSettings_Saving() : t.Admin_SaveSettings()}
                        testId="token-edit-submit"
                    />
                    <button type="button" className="btn btn-secondary" onClick={onClose} disabled={sending}>
                        {t.Action_Cancel()}
                    </button>
                </div>
            </form>
        </LogDetailModal>
    );
};
