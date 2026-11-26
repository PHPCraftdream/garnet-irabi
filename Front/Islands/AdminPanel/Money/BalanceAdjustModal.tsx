import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import {sendPost} from '@common/Api/Send/sendPost';
import {useSending} from '@common/hooks/data/useSending';
import {useBodyScrollLock} from '@common/hooks/ui/internal/useBodyScrollLock';
import {showToast} from '@common/Components/Feedback/GlobalToast';
import {Portal} from '@common/Components/Layout/Portal';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import {AccountBalanceRow} from '@/Islands/AdminPanel/Shell/shared/types';

const admin_Balance_AdjustAmount = t.Admin_Balance_AdjustAmount;
const admin_Balance_AdjustCancel = t.Admin_Balance_AdjustCancel;
const admin_Balance_AdjustCredit = t.Admin_Balance_AdjustCredit;
const admin_Balance_AdjustDebit = t.Admin_Balance_AdjustDebit;
const admin_Balance_AdjustDirection = t.Admin_Balance_AdjustDirection;
const admin_Balance_AdjustNote = t.Admin_Balance_AdjustNote;
const admin_Balance_AdjustNoteHint = t.Admin_Balance_AdjustNoteHint;
const admin_Balance_AdjustNoteRequired = t.Admin_Balance_AdjustNoteRequired;
const admin_Balance_AdjustSave = t.Admin_Balance_AdjustSave;

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
    <div className="admin-money-modal-actions">
        <button
            type="submit"
            className="primary-action-button"
            disabled={!canSubmit}
            aria-busy={sending}
            data-test-id="balance-adjust-submit"
        >
            {sending
                ? (
                    <span className="admin-money-spinner-wrap">
                        <span className="admin-money-spinner" aria-hidden="true" />
                        {admin_Balance_AdjustSave()}
                    </span>
                )
                : admin_Balance_AdjustSave()}
        </button>
        <button
            type="button"
            className="booking-cancel-dismiss-regular" data-booking-action="regular"
            onClick={onClose}
            data-test-id="balance-adjust-cancel"
        >
            {admin_Balance_AdjustCancel()}
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
        <div className="admin-money-field-caption">{label}</div>
        <div className="admin-money-field-value" data-strong={strong} data-test-id={testId}>{value}</div>
    </div>
);

const AmountField: React.FC<{value: string; onChange: React.ChangeEventHandler<HTMLInputElement>}> = ({value,
        onChange}) => (
    <div>
        <label htmlFor="balance-adjust-amount" className="admin-ticket-control-label">
            {admin_Balance_AdjustAmount()}
        </label>
        <input
            id="balance-adjust-amount"
            type="number"
            min={1}
            step={1}
            className="admin-filter-field"
            value={value}
            onChange={onChange}
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
const NoteField: React.FC<{value: string; valid: boolean; onChange:
        React.ChangeEventHandler<HTMLTextAreaElement>}> = ({value, valid, onChange}) => (
    <div>
        <label htmlFor="balance-adjust-note" className="admin-ticket-control-label">
            {admin_Balance_AdjustNote()}
        </label>
        <textarea
            id="balance-adjust-note"
            className="admin-filter-field"
            rows={3}
            placeholder={admin_Balance_AdjustNoteHint()}
            value={value}
            onChange={onChange}
            data-test-id="balance-adjust-note"
        />
        {!valid && value.length > 0 && (
            <div className="admin-money-note-hint">{admin_Balance_AdjustNoteRequired()}</div>
        )}
    </div>
);

const DirectionOption: React.FC<{
    checked: boolean;
    testId: string;
    label: string;
    credit: boolean;
    onSelect: () => void;
}> = ({checked, testId, label, credit, onSelect}) => (
    <label className="slot-format-option">
        <input
            type="radio"
            name="balance-adjust-direction"
            checked={checked}
            onChange={onSelect}
            data-test-id={testId}
            className="slot-format-radio"
        />
        <span className="admin-money-direction" data-credit={credit}>{label}</span>
    </label>
);

/**
 * Начислить или списать.
 *
 * Цвет здесь не украшение: зачисление и списание с чужого счёта — разные по
 * последствиям действия, и различать их надо до нажатия, а не по результату.
 */
const DirectionPicker: React.FC<{isCredit: boolean; onCredit: () => void; onDebit: () => void}> = ({isCredit,
        onCredit, onDebit}) => (
    <div>
        <div className="admin-money-field-caption">{admin_Balance_AdjustDirection()}</div>
        <div className="slot-format-options">
            <DirectionOption
                checked={isCredit}
                testId="balance-adjust-direction-credit"
                label={admin_Balance_AdjustCredit()}
                credit
                onSelect={onCredit}
            />
            <DirectionOption
                checked={!isCredit}
                testId="balance-adjust-direction-debit"
                label={admin_Balance_AdjustDebit()}
                credit={false}
                onSelect={onDebit}
            />
        </div>
    </div>
);

interface AdjustState {amountStr: string; isCredit: boolean; note: string; error: string}

    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
function validate({amountStr, note}: AdjustState) {
    const amount = parseInt(amountStr, 10);
    const noteTrimmed = note.trim();
    return {amount, noteTrimmed, amountValid: !isNaN(amount) && amount > 0, noteValid: noteTrimmed.length >= 3
        && noteTrimmed.length <= 500};
}

    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
function stopDialogClick(event: React.MouseEvent<HTMLFormElement>): void {
    event.stopPropagation();
}

class BalanceAdjustView extends AntiHookComponent<Props & ReturnType<typeof useSending>> {
    private readonly ui = new Carburetor<AdjustState>({amountStr: '', isCredit: true, note: '', error: ''});

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private update(patch: Partial<AdjustState>): void {
        this.ui.setData({...this.ui.getData(), ...patch});
    }

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly setAmount = (event: React.ChangeEvent<HTMLInputElement>) => this.update({amountStr:
        event.target.value});
    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
    private readonly credit = () => this.update({isCredit: true});
    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
    private readonly debit = () => this.update({isCredit: false});
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly setNote = (event: React.ChangeEvent<HTMLTextAreaElement>) => this.update({note:
        event.target.value});
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private setError(error: string): void { this.update({error}); }

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly submit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const {amountValid, noteValid} = validate(this.ui.getData());
        if (amountValid && noteValid && !this.props.sending) void this.props.withSending(this.save);
    };

    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
    private readonly save = async () => {
        const {row, adjustUrl, onClose, onAdjusted} = this.props;
        const state = this.ui.getData();
        const {isCredit} = state;
        const {amount, noteTrimmed} = validate(state);
        this.setError('');
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
                this.setError(r.error);
                return;
            }
            if (r.success && typeof r.new_balance === 'number') {
                onAdjusted(row.account_id, r.new_balance, r.updated_at || Math.floor(Date.now() / 1000));
                showToast(t.Admin_Balance_AdjustSuccess(), 'success');
                onClose();
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : t.General_Error();
            this.setError(msg);
        }
    };

    /** Формирует представление данных для соответствующего раздела панели. */
    private renderFields({amountStr, isCredit, note, error}: AdjustState, noteValid: boolean) {
        const {row} = this.props;
        const accountLabel = row.name ? `${row.name}${row.login ? ` (${row.login})` : ''}` : (row.login ||
        `#${row.account_id}`);
        return (
            <div className="admin-money-modal-fields">
                <ReadonlyRow label={t.Admin_Balance_Account()} testId="balance-adjust-account" value={accountLabel} />
                <ReadonlyRow
                    label={t.Admin_Balance_AdjustCurrentBalance()}
                    testId="balance-adjust-current"
                    value={`${row.balance} ₽`}
                    strong
                />
                <AmountField value={amountStr} onChange={this.setAmount} />
                <DirectionPicker isCredit={isCredit} onCredit={this.credit} onDebit={this.debit} />
                <NoteField value={note} valid={noteValid} onChange={this.setNote} />
                {error && <div className="admin-money-note-error">{error}</div>}
            </div>
        );
    }

    /** Формирует представление данных для соответствующего раздела панели. */
    render() {
        const {onClose, sending} = this.props;
        const state = this.useCarburetor(this.ui);
        const {amountValid, noteValid} = validate(state);
        const canSubmit = amountValid && noteValid && !sending;
        return (
            <Portal><div className="fg-modal-overlay-high" onClick={onClose}>
                <form
                    role="dialog"
                    aria-modal="true"
                    aria-label={t.Admin_Balance_AdjustTitle()}
                    className="booking-dialog"
                    onClick={stopDialogClick}
                    onSubmit={this.submit}
                    data-test-id="balance-adjust-modal"
                >
                    <div className="booking-dialog-header">
                        <h3 className="booking-dialog-title">{t.Admin_Balance_AdjustTitle()}</h3>
                        <button
                            type="button"
                            className="booking-dialog-close"
                            title={admin_Balance_AdjustCancel()}
                            aria-label={admin_Balance_AdjustCancel()}
                            onClick={onClose}
                        >&times;</button>
                    </div>

                    {this.renderFields(state, noteValid)}
                    <ModalFooter canSubmit={canSubmit} sending={sending} onClose={onClose} />
                </form>
            </div></Portal>
        );
    }
}

    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
export function BalanceAdjustModal(props: Props) {
    useBodyScrollLock(true);
    return <BalanceAdjustView {...props} {...useSending()} />;
}
