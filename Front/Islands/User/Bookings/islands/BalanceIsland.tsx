import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {sendPost} from '@common/Api/Send/sendPost';
import {useSending} from '@common/hooks/data/useSending';
import {appUrl} from '@common/Utils/Url/appUrl';
import {showToast} from '@common/Components/Feedback/GlobalToast';
import {usePagination, PageResponse} from '@common/hooks/data/usePagination';
import Pagination from '@common/Components/Layout/Paging/Pagination';
import {PageHeader} from '@common/Components/Layout/PageHeader';
import {Wallet} from 'lucide-react';
import {refreshLiveCounts} from '@common/Utils/Data/liveCounts';
import {cancelActorLabel} from '../../../../Common/booking/actions/outcomes/cancelActorLabel';

const adminLedgerAmount = t.Admin_Ledger_Amount;
const adminLedgerDate = t.Admin_Ledger_Date;
const adminLedgerNote = t.Admin_Ledger_Note;
const adminLedgerType = t.Admin_Ledger_Type;
const balanceAmount = t.Balance_Amount;
const balanceHistory = t.Balance_History;
const balanceLedgerReasonLesson = t.Balance_LedgerReason_Lesson;
const balanceNoHistory = t.Balance_NoHistory;
const balanceTopUp = t.Balance_TopUp;
const balanceTopUpAmount = t.Balance_TopUpAmount;
const balanceTopUpNotice = t.Balance_TopUpNotice;
const balanceTopUpPlaceholder = t.Balance_TopUpPlaceholder;

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

/** Возвращает человекочитаемое название типа операции из истории баланса. */
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
        <div className="booking-form-body">
            <div className="balance-caption">{balanceAmount()}</div>
            <div className="balance-amount" data-test-id="balance-amount">{amount} &#8381;</div>
        </div>
    </div>
);

interface TopUpProps {
    amount: string;
    sending: boolean;
    onAmountChange: React.ChangeEventHandler<HTMLInputElement>;
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
    <div className="booking-card-shell" data-balance-topup data-test-id="topup-form">
        <div className="booking-form-body">
            <h5 className="booking-form-title">{balanceTopUp()}</h5>
            <p className="balance-notice" data-test-id="topup-notice">{balanceTopUpNotice()}</p>
            <label className="balance-label">{balanceTopUpAmount()}</label>
            <div className="balance-topup-controls">
                <input
                    type="number"
                    min="1"
                    max="1000000"
                    step="1"
                    className="balance-input"
                    placeholder={balanceTopUpPlaceholder()}
                    data-test-id="topup-amount-input"
                    value={amount}
                    onChange={onAmountChange}
                />
                <button
                    type="button"
                    className="primary-action-button"
                    data-test-id="topup-submit"
                    disabled={sending || !amount || parseInt(amount, 10) <= 0}
                    onClick={onSubmit}
                >
                    {sending ? '...' : balanceTopUp()}
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
            {balanceLedgerReasonLesson([ctx.other_name])}
            {ctx.start_at > 0 && <>{' · '}{formatTs(ctx.start_at)}</>}
            {cancelledBy && <span className="balance-reason-detail">{cancelledBy}</span>}
            {entry.note && <span className="balance-reason-detail">{entry.note}</span>}
        </span>
    );
};

const LedgerTr: React.FC<{entry: LedgerEntry}> = ({entry}) => {
    const sign = entry.is_credit ? '+' : '−';
    const tone = entry.is_credit ? 'credit' : 'debit';

    return (
        <tr className="balance-ledger-row" data-test-id="ledger-row">
            <td className="balance-ledger-date">{formatTs(entry.created_at)}</td>
            <td>
                <span className="balance-ledger-type" data-tone={tone}>
                    {sign} {entryTypeLabel(entry.entry_type)}
                </span>
            </td>
            <td className="balance-ledger-amount-cell">
                <span className="balance-ledger-value" data-tone={tone}>
                    {sign}{entry.amount} &#8381;
                </span>
            </td>
            <td className="balance-muted"><LedgerReason entry={entry} /></td>
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
    const tone = entry.is_credit ? 'credit' : 'debit';

    // Отдельное имя: в разметке присутствуют обе раскладки, и общий
    // `ledger-row` заставил бы тест наткнуться на скрытую половину.
    return (
        <div className="balance-ledger-card" data-test-id="ledger-row-narrow">
            <div className="balance-ledger-card-heading">
                <span className="balance-ledger-card-type" data-tone={tone}>
                    {sign} {entryTypeLabel(entry.entry_type)}
                </span>
                <span className="balance-ledger-card-value" data-tone={tone}>{sign}{entry.amount} &#8381;</span>
            </div>
            <div className="balance-ledger-card-reason"><LedgerReason entry={entry} /></div>
            <div className="balance-ledger-card-date">{formatTs(entry.created_at)}</div>
        </div>
    );
};

/** История операций: дата, тип, сумма, примечание. */
function renderLedgerCard(entry: LedgerEntry) { return <LedgerCard key={entry.id} entry={entry} />; }
/** Создаёт строку таблицы для одной записи истории операций. */
function renderLedgerRow(entry: LedgerEntry) { return <LedgerTr key={entry.id} entry={entry} />; }

const LedgerTable: React.FC<LedgerTableProps> = ({items}) => (
    <div className="balance-ledger-table">
        <div className="balance-ledger-narrow">
            {items.map(renderLedgerCard)}
        </div>
        <div className="balance-ledger-wide">
            <table className="admin-table">
                <thead>
                    <tr>
                        <th>{adminLedgerDate()}</th>
                        <th>{adminLedgerType()}</th>
                        <th className="balance-align-right">{adminLedgerAmount()}</th>
                        <th>{adminLedgerNote()}</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map(renderLedgerRow)}
                </tbody>
            </table>
        </div>
    </div>
);

/** История операций со своей пагинацией сверху и снизу. */
function renderPager(
    ledger: ReturnType<typeof usePagination<LedgerEntry>>,
    extra?: {pageSize: number; onPageSizeChange: (n: number) => void},
) {
    return (
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
}

const LedgerHistory: React.FC<{ledger: ReturnType<typeof usePagination<LedgerEntry>>}> = ({ledger}) => {
    return (
        <div data-test-id="ledger-section">
            <h5 className="balance-space-after">{balanceHistory()}</h5>
            {ledger.items.length === 0 && !ledger.loading && <p className="balance-muted">{balanceNoHistory()}</p>}
            {(ledger.items.length > 0 || ledger.loading) && (
                <>
                    <div className="balance-space-after">
                        {renderPager(ledger, {pageSize: ledger.perPage, onPageSizeChange: ledger.setPerPage})}
                    </div>
                    <LedgerTable items={ledger.items} />
                    <div className="balance-space-before">{renderPager(ledger)}</div>
                </>
            )}
        </div>
    );
};

interface BalanceState {
    currentBalance: number;
    topupAmount: string;
}

interface BalanceViewProps extends BalanceIslandProps {
    ui: Carburetor<BalanceState>;
    currentBalance: number;
    topupAmount: string;
    onAmountChange: React.ChangeEventHandler<HTMLInputElement>;
}

/** Проверяет сумму, отправляет запрос пополнения и обновляет баланс при успехе. */
function submitTopup(
    topupAmount: string,
    ui: Carburetor<BalanceState>,
    refresh: () => void,
    withSending: ReturnType<typeof useSending>['withSending'],
): void {
    const amount = parseInt(topupAmount, 10);
    if (!amount || amount <= 0 || amount > 1000000) return;

    withSending(async () => {
        try {
            const result = await sendPost(appUrl('/balance/~topup'), {amount}) as any;
            if (result?.success) {
                ui.setData({currentBalance: result.balance, topupAmount: ''});
                showToast(t.Balance_TopUpSuccess(), 'success');
                refresh();
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
}

const BalanceView: React.FC<BalanceViewProps> = ({
    ledgerPagination, ledgerPageUrl, ui, currentBalance, topupAmount, onAmountChange,
}) => {
    const {sending, withSending} = useSending();


    const ledger = usePagination<LedgerEntry>({
        url: ledgerPageUrl,
        initialData: ledgerPagination,
    });

    return <BalanceScreen {...{ui, currentBalance, topupAmount, onAmountChange, ledger, sending, withSending}} />;
};

type ScreenProps = Pick<BalanceViewProps, 'ui' | 'currentBalance' | 'topupAmount' | 'onAmountChange'> &
    ReturnType<typeof useSending> & {ledger: ReturnType<typeof usePagination<LedgerEntry>>};

class BalanceScreen extends AntiHookComponent<ScreenProps> {
    /** Отправляет введённую сумму и обновляет баланс с историей операций. */
    private readonly handleTopup = () => {
        const {topupAmount, ui, ledger, withSending} = this.props;
        submitTopup(topupAmount, ui, ledger.refresh, withSending);
    };

    /** Отображает баланс, форму пополнения и историю операций. */
    render() {
        const {currentBalance, topupAmount, sending, onAmountChange, ledger} = this.props;
        return (
            <div className="comms-page">
                <PageHeader title={t.Balance_Title()} icon={<Wallet size={22} aria-hidden="true" />} />

                <BalanceCard amount={currentBalance} />
                <TopUpForm
                    amount={topupAmount}
                    sending={sending}
                    onAmountChange={onAmountChange}
                    onSubmit={this.handleTopup}
                />

                <LedgerHistory ledger={ledger} />

            </div>
        );
    }
}

export class BalanceIsland extends AntiHookComponent<BalanceIslandProps> {
    private readonly ui = new Carburetor<BalanceState>({currentBalance: this.props.balance, topupAmount: ''});

    /** Сохраняет введённую сумму в локальном состоянии острова. */
    private readonly changeAmount = (event: React.ChangeEvent<HTMLInputElement>) =>
        this.ui.setData({...this.ui.getData(), topupAmount: event.target.value});

    /** Передаёт данные состояния дочернему экрану баланса. */
    render() {
        const {currentBalance, topupAmount} = this.useCarburetor(this.ui);
        return (
            <BalanceView
                {...this.props}
                ui={this.ui}
                currentBalance={currentBalance}
                topupAmount={topupAmount}
                onAmountChange={this.changeAmount}
            />
        );
    }
}
