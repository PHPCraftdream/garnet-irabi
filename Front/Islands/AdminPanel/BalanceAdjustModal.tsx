import * as React from 'react';
import {useState} from 'react';
import {sendPost} from '@common/Api/sendPost';
import {useSending} from '@common/hooks/useSending';
import {useBodyScrollLock} from '@common/hooks/useBodyScrollLock';
import {showToast} from '@common/Components/GlobalToast';
import {Portal} from '@common/Components/Portal';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {AccountBalanceRow} from './types';

interface AdjustResponse {
    success?: boolean;
    error?: string;
    account_id?: number;
    new_balance?: number;
    updated_at?: number;
}

interface Props {
    row: AccountBalanceRow;
    adjustUrl: string;
    onClose: () => void;
    onAdjusted: (accountId: number, newBalance: number, updatedAt: number) => void;
}

export const BalanceAdjustModal: React.FC<Props> = ({row, adjustUrl, onClose, onAdjusted}) => {
    useBodyScrollLock(true);

    const [amountStr, setAmountStr] = useState<string>('');
    const [isCredit, setIsCredit] = useState<boolean>(true);
    const [note, setNote] = useState<string>('');
    const [error, setError] = useState<string>('');
    const {sending, withSending} = useSending();

    const amount = parseInt(amountStr, 10);
    const noteTrimmed = note.trim();
    const amountValid = !isNaN(amount) && amount > 0;
    const noteValid = noteTrimmed.length >= 3 && noteTrimmed.length <= 500;
    const canSubmit = amountValid && noteValid && !sending;

    const accountLabel = row.name
        ? `${row.name}${row.login ? ` (${row.login})` : ''}`
        : (row.login || `#${row.account_id}`);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit) return;
        withSending(async () => {
            setError('');
            try {
                const r: AdjustResponse = await sendPost(adjustUrl, {
                    account_id: row.account_id,
                    amount,
                    is_credit: isCredit ? 1 : 0,
                    note: noteTrimmed,
                }) as AdjustResponse;

                if (r.error) {
                    setError(r.error);
                    return;
                }
                if (r.success && typeof r.new_balance === 'number') {
                    onAdjusted(row.account_id, r.new_balance, r.updated_at || Math.floor(Date.now() / 1000));
                    showToast(t.Admin_Balance_AdjustSuccess(), 'success');
                    onClose();
                }
            } catch (err) {
                const msg = err instanceof Error ? err.message : t.General_Error();
                setError(msg);
            }
        });
    };

    return (
        <Portal><div className="fg-modal-overlay-high" onClick={onClose}>
            <form
                role="dialog"
                aria-modal="true"
                aria-label={t.Admin_Balance_AdjustTitle()}
                className="fg-modal-card fg-modal-card-md"
                onClick={e => e.stopPropagation()}
                onSubmit={handleSubmit}
                data-test-id="balance-adjust-modal"
            >
                <div className="fg-modal-header-row">
                    <h3 className="fg-modal-title">{t.Admin_Balance_AdjustTitle()}</h3>
                    <button
                        type="button"
                        className="fg-modal-close-x"
                        title={t.Admin_Balance_AdjustCancel()}
                        aria-label={t.Admin_Balance_AdjustCancel()}
                        onClick={onClose}
                    >&times;</button>
                </div>

                <div className="space-y-3">
                    <div>
                        <div className="text-xs text-muted mb-1">{t.Admin_Balance_Account()}</div>
                        <div className="text-sm text-on-surface" data-test-id="balance-adjust-account">{accountLabel}</div>
                    </div>

                    <div>
                        <div className="text-xs text-muted mb-1">{t.Admin_Balance_AdjustCurrentBalance()}</div>
                        <div className="text-sm font-medium text-on-surface" data-test-id="balance-adjust-current">
                            {row.balance} &#8381;
                        </div>
                    </div>

                    <div>
                        <label htmlFor="balance-adjust-amount" className="text-xs text-muted block mb-1">
                            {t.Admin_Balance_AdjustAmount()}
                        </label>
                        <input
                            id="balance-adjust-amount"
                            type="number"
                            min={1}
                            step={1}
                            className="form-control"
                            value={amountStr}
                            onChange={e => setAmountStr(e.target.value)}
                            data-test-id="balance-adjust-amount"
                            autoFocus
                        />
                    </div>

                    <div>
                        <div className="text-xs text-muted mb-1">{t.Admin_Balance_AdjustDirection()}</div>
                        <div className="flex gap-3">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="balance-adjust-direction"
                                    checked={isCredit}
                                    onChange={() => setIsCredit(true)}
                                    data-test-id="balance-adjust-direction-credit"
                                    className="accent-theme"
                                />
                                <span className="text-sm text-success">{t.Admin_Balance_AdjustCredit()}</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="balance-adjust-direction"
                                    checked={!isCredit}
                                    onChange={() => setIsCredit(false)}
                                    data-test-id="balance-adjust-direction-debit"
                                    className="accent-theme"
                                />
                                <span className="text-sm text-danger">{t.Admin_Balance_AdjustDebit()}</span>
                            </label>
                        </div>
                    </div>

                    <div>
                        <label htmlFor="balance-adjust-note" className="text-xs text-muted block mb-1">
                            {t.Admin_Balance_AdjustNote()}
                        </label>
                        <textarea
                            id="balance-adjust-note"
                            className="form-control"
                            rows={3}
                            placeholder={t.Admin_Balance_AdjustNoteHint()}
                            value={note}
                            onChange={e => setNote(e.target.value)}
                            data-test-id="balance-adjust-note"
                        />
                        {!noteValid && note.length > 0 && (
                            <div className="text-xs text-danger mt-1">{t.Admin_Balance_AdjustNoteRequired()}</div>
                        )}
                    </div>

                    {error && <div className="text-danger text-sm">{error}</div>}
                </div>

                <div className="flex gap-3 mt-4">
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={!canSubmit}
                        aria-busy={sending}
                        data-test-id="balance-adjust-submit"
                    >
                        {sending ? (
                            <span className="common-send-spinner-wrap">
                                <span className="common-spinner" aria-hidden="true" />
                                {t.Admin_Balance_AdjustSave()}
                            </span>
                        ) : t.Admin_Balance_AdjustSave()}
                    </button>
                    <button
                        type="button"
                        className="btn btn-outline-secondary"
                        onClick={onClose}
                        data-test-id="balance-adjust-cancel"
                    >
                        {t.Admin_Balance_AdjustCancel()}
                    </button>
                </div>
            </form>
        </div></Portal>
    );
};
