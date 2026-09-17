import * as React from 'react';
import {useState} from 'react';
import {sendPost} from '@common/Api/Send/sendPost';
import {useSending} from '@common/hooks/data/useSending';
import {useBodyScrollLock} from '@common/hooks/ui/useBodyScrollLock';
import {showToast} from '@common/Components/Feedback/GlobalToast';
import {Portal} from '@common/Components/Layout/Portal';
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

const ModalFooter: React.FC<{canSubmit: boolean; sending: boolean; onClose: () => void}> = ({
    canSubmit,
    sending,
    onClose,
}) => (
    <div className="flex gap-3 mt-4">
        <button
            type="submit"
            className="btn btn-primary"
            disabled={!canSubmit}
            aria-busy={sending}
            data-test-id="balance-adjust-submit"
        >
            {sending
                ? (
                    <span className="common-send-spinner-wrap">
                        <span className="common-spinner" aria-hidden="true" />
                        {t.Admin_Balance_AdjustSave()}
                    </span>
                )
                : t.Admin_Balance_AdjustSave()}
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
);

const ReadonlyRow: React.FC<{label: string; testId: string; value: string; strong?: boolean}> = ({
    label,
    testId,
    value,
    strong = false,
}) => (
    <div>
        <div className="text-xs text-muted mb-1">{label}</div>
        <div className={`text-sm text-on-surface ${strong ? 'font-medium' : ''}`} data-test-id={testId}>{value}</div>
    </div>
);

const AmountField: React.FC<{value: string; onChange: (v: string) => void}> = ({value, onChange}) => (
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
            value={value}
            onChange={e => onChange(e.target.value)}
            data-test-id="balance-adjust-amount"
            autoFocus
        />
    </div>
);

/**
 * Примечание обязательно.
 *
 * Правка чужого баланса руками — действие, за которое кто-то потом будет
 * отвечать; без объяснения в журнале останется только сумма и имя.
 */
const NoteField: React.FC<{value: string; valid: boolean; onChange: (v: string) => void}> = ({value, valid, onChange}) => (
    <div>
        <label htmlFor="balance-adjust-note" className="text-xs text-muted block mb-1">
            {t.Admin_Balance_AdjustNote()}
        </label>
        <textarea
            id="balance-adjust-note"
            className="form-control"
            rows={3}
            placeholder={t.Admin_Balance_AdjustNoteHint()}
            value={value}
            onChange={e => onChange(e.target.value)}
            data-test-id="balance-adjust-note"
        />
        {!valid && value.length > 0 && (
            <div className="text-xs text-danger mt-1">{t.Admin_Balance_AdjustNoteRequired()}</div>
        )}
    </div>
);

const DirectionOption: React.FC<{
    checked: boolean;
    testId: string;
    label: string;
    labelClass: string;
    onSelect: () => void;
}> = ({checked, testId, label, labelClass, onSelect}) => (
    <label className="flex items-center gap-2 cursor-pointer">
        <input
            type="radio"
            name="balance-adjust-direction"
            checked={checked}
            onChange={onSelect}
            data-test-id={testId}
            className="accent-theme"
        />
        <span className={`text-sm ${labelClass}`}>{label}</span>
    </label>
);

/**
 * Начислить или списать.
 *
 * Цвет здесь не украшение: зачисление и списание с чужого счёта — разные по
 * последствиям действия, и различать их надо до нажатия, а не по результату.
 */
const DirectionPicker: React.FC<{isCredit: boolean; onChange: (v: boolean) => void}> = ({isCredit, onChange}) => (
    <div>
        <div className="text-xs text-muted mb-1">{t.Admin_Balance_AdjustDirection()}</div>
        <div className="flex gap-3">
            <DirectionOption
                checked={isCredit}
                testId="balance-adjust-direction-credit"
                label={t.Admin_Balance_AdjustCredit()}
                labelClass="text-success"
                onSelect={() => onChange(true)}
            />
            <DirectionOption
                checked={!isCredit}
                testId="balance-adjust-direction-debit"
                label={t.Admin_Balance_AdjustDebit()}
                labelClass="text-danger"
                onSelect={() => onChange(false)}
            />
        </div>
    </div>
);

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
                const csrf = (window as any).__GARNET_CSRF__ ?? '';
                const r: AdjustResponse = await sendPost(adjustUrl, {
                    CSRF_TOKEN: csrf,
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
                    <ReadonlyRow label={t.Admin_Balance_Account()} testId="balance-adjust-account" value={accountLabel} />
                    <ReadonlyRow
                        label={t.Admin_Balance_AdjustCurrentBalance()}
                        testId="balance-adjust-current"
                        value={`${row.balance} ₽`}
                        strong
                    />
                    <AmountField value={amountStr} onChange={setAmountStr} />
                    <DirectionPicker isCredit={isCredit} onChange={setIsCredit} />
                    <NoteField value={note} valid={noteValid} onChange={setNote} />
                    {error && <div className="text-danger text-sm">{error}</div>}
                </div>

                <ModalFooter canSubmit={canSubmit} sending={sending} onClose={onClose} />
            </form>
        </div></Portal>
    );
};
