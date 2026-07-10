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

interface LedgerEntry {
    id: number;
    is_credit: number;
    amount: number;
    entry_type: string;
    note: string | null;
    created_at: number;
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

            {/* Balance display */}
            <div className="user-balance-card">
                <div className="card-body py-4">
                    <div className="flex items-center gap-4">
                        <div>
                            <div className="text-sm text-muted mb-1">{t.Balance_Amount()}</div>
                            <div className="user-balance-amount" data-test-id="balance-amount">
                                {currentBalance} &#8381;
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Top-up form */}
            <div className="card mb-6" data-test-id="topup-form">
                <div className="card-body">
                    <h5 className="card-title mb-4">{t.Balance_TopUp()}</h5>
                    <div className="flex gap-3 items-end">
                        <div className="flex-1">
                            <label className="form-label text-sm text-secondary mb-1">{t.Balance_TopUpAmount()}</label>
                            <input
                                type="number"
                                min="1"
                                max="1000000"
                                step="1"
                                className="form-control"
                                placeholder={t.Balance_TopUpPlaceholder()}
                                data-test-id="topup-amount-input"
                                value={topupAmount}
                                onChange={e => setTopupAmount(e.target.value)}
                            />
                        </div>
                        <button
                            type="button"
                            className="btn btn-primary"
                            data-test-id="topup-submit"
                            disabled={sending || !topupAmount || parseInt(topupAmount, 10) <= 0}
                            onClick={handleTopup}
                        >
                            {sending ? '...' : t.Balance_TopUp()}
                        </button>
                    </div>
                </div>
            </div>

            {/* Ledger history */}
            <div data-test-id="ledger-section">
                <h5 className="mb-4">{t.Balance_History()}</h5>
                {ledger.items.length === 0 && !ledger.loading ? (
                    <p className="text-muted">{t.Balance_NoHistory()}</p>
                ) : (
                    <>
                        <div className="mb-4">
                            <Pagination
                                page={ledger.page}
                                totalPages={ledger.totalPages}
                                total={ledger.total}
                                loading={ledger.loading}
                                onPageChange={ledger.goToPage}
                                labels={paginationLabels}
                                pageSize={ledger.perPage}
                                onPageSizeChange={ledger.setPerPage}
                            />
                        </div>
                        <div className="overflow-x-auto rounded-lg border border-default bg-surface">
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
                                    {ledger.items.map(entry => (
                                        <tr key={entry.id} className="hover:bg-surface-hover" data-test-id="ledger-row">
                                            <td className="text-muted whitespace-nowrap">{formatTs(entry.created_at)}</td>
                                            <td>
                                                <span className={`font-mono ${entry.is_credit ? 'text-success' : 'text-danger'}`}>
                                                    {entry.is_credit ? '+' : '−'} {entryTypeLabel(entry.entry_type)}
                                                </span>
                                            </td>
                                            <td className="text-right font-medium">
                                                <span className={entry.is_credit ? 'text-success' : 'text-danger'}>
                                                    {entry.is_credit ? '+' : '−'}{entry.amount} &#8381;
                                                </span>
                                            </td>
                                            <td className="text-muted">{entry.note ?? '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="mt-4">
                            <Pagination
                                page={ledger.page}
                                totalPages={ledger.totalPages}
                                total={ledger.total}
                                loading={ledger.loading}
                                onPageChange={ledger.goToPage}
                                labels={paginationLabels}
                            />
                        </div>
                    </>
                )}
            </div>

            
        </div>
    );
};
