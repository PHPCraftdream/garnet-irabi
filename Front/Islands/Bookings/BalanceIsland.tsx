import * as React from 'react';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {formatTs} from '@common/Utils/DateUtils';
import {sendPost} from '@common/Api/sendPost';
import {useSending} from '@common/hooks/useSending';
import {appUrl} from '@common/Utils/appUrl';
import {showToast} from '@common/Components/GlobalToast';
import {usePagination, PageResponse} from '@common/hooks/usePagination';
import Pagination from '@common/Components/Pagination';
import {PageHeader} from '@common/Components/PageHeader';
import {Wallet} from 'lucide-react';
import {refreshLiveCounts} from '@common/Utils/liveCounts';
import {cancelActorLabel} from '../../Common/bookingAction';

/** Повод операции — приходит с сервера, см. LedgerContextService. */
interface LedgerContext {
    booking_id: number;
    other_name: string;
    start_at: number;
    /** Кто отменил бронь — пусто, если бронь не отменяли. */
    cancel_role?: 'user' | 'expert' | 'moderator' | 'system' | '';
    /** С чьей стороны читают строку: у ученика и у преподавателя одна роль значит разное. */
    viewer_is_student?: boolean;
    /**
     * Была ли бронь подтверждена до потери. Без этого «снятие» на входе
     * превращалось в «отмену» на выходе (D-135).
     */
    was_confirmed?: boolean;
}

interface LedgerEntry {
    id: number;
    is_credit: number;
    amount: number;
    entry_type: string;
    note: string | null;
    created_at: number;
    context?: LedgerContext | null;
}

interface BalanceIslandProps {
    balance: number;
    ledgerPagination: PageResponse<LedgerEntry>;
    ledgerPageUrl: string;
}

function entryTypeLabel(type: string): string {
    const map: Record<string, string> = {
        top_up:           t.Ledger_Type_TopUp(),
        booking_invoice:  t.Ledger_Type_Invoice(),
        booking_payment:  t.Ledger_Type_Payment(),
        booking_refund:   t.Ledger_Type_Refund(),
        manual:           t.Ledger_Type_Manual(),
    };
    return map[type] ?? type;
}

const paginationLabels = {
    prev: t.Pagination_Prev(),
    next: t.Pagination_Next(),
    of: t.Pagination_Of(),
    items: t.Pagination_Items(),
};

/** Текущий баланс крупной цифрой. */
const BalanceCard: React.FC<{amount: number}> = ({amount}) => (
    <div className="user-balance-card">
        <div className="card-body py-4">
            <div className="text-sm text-muted mb-1">{t.Balance_Amount()}</div>
            <div className="user-balance-amount" data-test-id="balance-amount">{amount} &#8381;</div>
        </div>
    </div>
);

interface TopUpProps {
    amount: string;
    sending: boolean;
    onAmountChange: (v: string) => void;
    onSubmit: () => void;
}

/**
 * Пополнение баланса.
 *
 * Подпись объясняет, что произойдёт, ДО нажатия: платёжной системы пока нет,
 * сумма просто зачисляется — и все, кто пробовал, ждали формы карты и потом не
 * понимали, двигались ли настоящие деньги.
 */
const TopUpForm: React.FC<TopUpProps> = ({amount, sending, onAmountChange, onSubmit}) => (
    <div className="card mb-6" data-test-id="topup-form">
        <div className="card-body">
            <h5 className="card-title mb-2">{t.Balance_TopUp()}</h5>
            <p className="text-sm text-secondary mb-4" data-test-id="topup-notice">{t.Balance_TopUpNotice()}</p>
            <label className="form-label text-sm text-secondary mb-1">{t.Balance_TopUpAmount()}</label>
            <div className="flex gap-3 items-end">
                <input
                    type="number"
                    min="1"
                    max="1000000"
                    step="1"
                    className="form-control flex-1"
                    placeholder={t.Balance_TopUpPlaceholder()}
                    data-test-id="topup-amount-input"
                    value={amount}
                    onChange={e => onAmountChange(e.target.value)}
                />
                <button
                    type="button"
                    className="btn btn-primary"
                    data-test-id="topup-submit"
                    disabled={sending || !amount || parseInt(amount, 10) <= 0}
                    onClick={onSubmit}
                >
                    {sending ? '...' : t.Balance_TopUp()}
                </button>
            </div>
        </div>
    </div>
);

interface LedgerTableProps {
    items: LedgerEntry[];
}

/**
 * Повод операции человеческими словами — и сохранённое примечание под ним.
 *
 * Повод именно **дополняет** примечание, а не заменяет его. Сначала он
 * заменял — и унёс с собой единственное место, где объяснялось удержание:
 * строка возврата стала «Занятие с N · дата», и «+750 ₽» больше не говорили,
 * куда делись остальные 750 из 1500. Нашёл user-7, отменив подтверждённое
 * занятие с неустойкой. Вместе с примечанием возвращается и номер брони, по
 * которому он и сверялся.
 *
 * Пока сервер повода не присылает (пополнение, ручная корректировка, старая
 * строка без ссылки на бронь) — остаётся одно примечание.
 */
const LedgerReason: React.FC<{entry: LedgerEntry}> = ({entry}) => {
    const ctx = entry.context;

    if (!ctx || !ctx.other_name) return <>{entry.note ?? '—'}</>;

    // Кто отменил — те же слова, что на карточке брони (D-094). В истории
    // операций этого не было, и по строке «Возврат» нельзя было понять,
    // почему вернули всю сумму, а не с удержанием, и чьё это было решение.
    const student = ctx.viewer_is_student !== false;
    const cancelledBy = cancelActorLabel({
        role: ctx.cancel_role,
        wasConfirmed: !!ctx.was_confirmed,
        viewerIsStudent: student,
    });

    return (
        <span data-test-id={`ledger-reason-${entry.id}`}>
            {t.Balance_LedgerReason_Lesson([ctx.other_name])}
            {ctx.start_at > 0 && <>{' · '}{formatTs(ctx.start_at)}</>}
            {cancelledBy && <span className="block text-xs opacity-75">{cancelledBy}</span>}
            {entry.note && <span className="block text-xs opacity-75">{entry.note}</span>}
        </span>
    );
};

const LedgerTr: React.FC<{entry: LedgerEntry}> = ({entry}) => {
    const sign = entry.is_credit ? '+' : '−';
    const cls = entry.is_credit ? 'text-success' : 'text-danger';

    return (
        <tr className="hover:bg-surface-hover" data-test-id="ledger-row">
            <td className="text-muted whitespace-nowrap">{formatTs(entry.created_at)}</td>
            <td><span className={`font-mono ${cls}`}>{sign} {entryTypeLabel(entry.entry_type)}</span></td>
            <td className="text-right font-medium"><span className={cls}>{sign}{entry.amount} &#8381;</span></td>
            <td className="text-muted"><LedgerReason entry={entry} /></td>
        </tr>
    );
};

/**
 * Одна операция на узком экране — карточкой, а не строкой таблицы.
 *
 * В таблице колонка «Примечание» стоит последней и на телефоне уходит за
 * край целиком: её не видно вовсе, и никакая горизонтальная прокрутка не
 * помогает, потому что человек не догадывается тянуть. А именно в этой
 * колонке лежит ответ на вопрос «почему сумма такая» — то, ради чего мы
 * её и наполняли. Отмечал Тимур, подтвердила Софья.
 */
const LedgerCard: React.FC<{entry: LedgerEntry}> = ({entry}) => {
    const sign = entry.is_credit ? '+' : '−';
    const cls = entry.is_credit ? 'text-success' : 'text-danger';

    // Отдельное имя: в разметке присутствуют обе раскладки, и общий
    // `ledger-row` заставил бы тест наткнуться на скрытую половину.
    return (
        <div className="border-b border-default px-4 py-3 last:border-b-0" data-test-id="ledger-row-narrow">
            <div className="flex items-baseline justify-between gap-3">
                <span className={`font-mono text-sm ${cls}`}>{sign} {entryTypeLabel(entry.entry_type)}</span>
                <span className={`font-medium whitespace-nowrap ${cls}`}>{sign}{entry.amount} &#8381;</span>
            </div>
            <div className="text-muted text-sm mt-1"><LedgerReason entry={entry} /></div>
            <div className="text-muted text-xs mt-1">{formatTs(entry.created_at)}</div>
        </div>
    );
};

/** История операций: дата, тип, сумма, примечание. */
const LedgerTable: React.FC<LedgerTableProps> = ({items}) => (
    <div className="rounded-lg border border-default bg-surface">
        <div className="md:hidden">
            {items.map(entry => <LedgerCard key={entry.id} entry={entry} />)}
        </div>
        <div className="hidden md:block overflow-x-auto">
            <table className="admin-table">
                <thead>
                    <tr>
                        <th>{t.Admin_Ledger_Date()}</th>
                        <th>{t.Admin_Ledger_Type()}</th>
                        <th className="text-right">{t.Admin_Ledger_Amount()}</th>
                        <th>{t.Admin_Ledger_Note()}</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map(entry => <LedgerTr key={entry.id} entry={entry} />)}
                </tbody>
            </table>
        </div>
    </div>
);

/** История операций со своей пагинацией сверху и снизу. */
const LedgerHistory: React.FC<{ledger: ReturnType<typeof usePagination<LedgerEntry>>}> = ({ledger}) => {
    const pager = (extra?: {pageSize: number; onPageSizeChange: (n: number) => void}) => (
        <Pagination
            page={ledger.page}
            totalPages={ledger.totalPages}
            total={ledger.total}
            loading={ledger.loading}
            onPageChange={ledger.goToPage}
            labels={paginationLabels}
            {...extra}
        />
    );

    return (
        <div data-test-id="ledger-section">
            <h5 className="mb-4">{t.Balance_History()}</h5>
            {ledger.items.length === 0 && !ledger.loading && <p className="text-muted">{t.Balance_NoHistory()}</p>}
            {(ledger.items.length > 0 || ledger.loading) && (
                <>
                    <div className="mb-4">{pager({pageSize: ledger.perPage, onPageSizeChange: ledger.setPerPage})}</div>
                    <LedgerTable items={ledger.items} />
                    <div className="mt-4">{pager()}</div>
                </>
            )}
        </div>
    );
};

export const BalanceIsland: React.FC<BalanceIslandProps> = ({balance: initialBalance, ledgerPagination, ledgerPageUrl}) => {
    const [currentBalance, setCurrentBalance] = React.useState(initialBalance);
    const [topupAmount, setTopupAmount] = React.useState('');
    const {sending, withSending} = useSending();
    

    const ledger = usePagination<LedgerEntry>({
        url: ledgerPageUrl,
        initialData: ledgerPagination,
    });

    const handleTopup = () => {
        const amount = parseInt(topupAmount, 10);
        if (!amount || amount <= 0 || amount > 1000000) return;

        withSending(async () => {
            try {
                const result = await sendPost(appUrl('/balance/~topup'), {amount}) as any;
                if (result?.success) {
                    setCurrentBalance(result.balance);
                    setTopupAmount('');
                    showToast(t.Balance_TopUpSuccess(), 'success');
                    ledger.refresh();
                    // The header pill holds the balance the page was rendered
                    // with. Without this it keeps showing the old amount —
                    // "0 ₽" right above the money that just arrived.
                    refreshLiveCounts();
                } else {
                    showToast(result?.error || t.General_Error(), 'danger');
                }
            } catch (e: any) {
                showToast(e?.message || t.General_Error(), 'danger');
            }
        });
    };

    return (
        <div className="page-narrow">
            <PageHeader title={t.Balance_Title()} icon={<Wallet size={22} aria-hidden="true" />} />

            <BalanceCard amount={currentBalance} />
            <TopUpForm
                amount={topupAmount}
                sending={sending}
                onAmountChange={setTopupAmount}
                onSubmit={handleTopup}
            />

            <LedgerHistory ledger={ledger} />
            
        </div>
    );
};
