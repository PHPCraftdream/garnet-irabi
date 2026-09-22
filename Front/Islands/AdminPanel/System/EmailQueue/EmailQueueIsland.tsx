import * as React from 'react';
import {useState} from 'react';
import {sendPost} from '@common/Api/Send/sendPost';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {PageHeader} from '@common/Components/Layout/PageHeader';
import {Mailbox} from 'lucide-react';
import Pagination from '@common/Components/Layout/Paging/Pagination';
import {PageResponse} from '@common/hooks/data/usePagination';
import {DEFAULT_PAGE_SIZE} from '@common/Utils/Data/pagination';
import {adminPaginationLabels} from '../../Shell/adminShared';
import {useAdminPage} from '../../Shell/useAdminPage';

interface EmailQueueRow {
    id: number;
    recipient_email: string;
    subject: string;
    status: string;
    attempts: number;
    max_attempts: number;
    next_attempt_at: number | null;
    sent_at: number | null;
    created_at: number;
}

interface GridColumn {
    key: string;
    label: string;
}

interface GridConfig {
    columns: GridColumn[];
}

interface Labels {
    title: string;
    deadLetter: string;
    empty: string;
    retry: string;
    retryDone: string;
    retryFail: string;
}

interface Props {
    emailQueuePayload: PageResponse<EmailQueueRow> | null;
    pageUrl: string;
    gridConfig: GridConfig;
    deadLetterCount: number;
    retryUrl: string;
    labels: Labels;
}

interface RetryResponse {
    success: boolean;
    row?: EmailQueueRow | null;
    deadLetterCount: number;
}

const STATUS_BADGE: Record<string, string> = {
    queued: 'status-warning',
    sending: 'status-info',
    sent: 'status-success',
    error: 'status-danger',
};

const statusBadge = (status: string): React.ReactNode => (
    <span className={`badge ${STATUS_BADGE[status] ?? 'status-muted'}`}>{status}</span>
);

/** No filters on this page — a stable reference so useAdminPage's debounce effect doesn't refire every render. */
const NO_FILTERS = {};

interface RowProps {
    row: EmailQueueRow;
    retryLabel: string;
    busy: boolean;
    onRetry: (id: number) => void;
}

const EmailQueueTr: React.FC<RowProps> = ({row, retryLabel, busy, onRetry}) => (
    <tr data-test-id={`email-queue-row-${row.id}`}>
        <td className="text-muted text-xs whitespace-nowrap">{formatTs(row.created_at)}</td>
        <td className="text-sm">{row.recipient_email}</td>
        <td className="text-sm">{row.subject}</td>
        <td>{statusBadge(row.status)}</td>
        <td className="text-sm">{row.attempts}</td>
        <td className="text-sm">{row.max_attempts}</td>
        <td className="text-muted text-xs whitespace-nowrap">
            {row.next_attempt_at !== null ? formatTs(row.next_attempt_at) : '—'}
        </td>
        <td>
            {/* Повторить можно только упавшее письмо: у остальных попытка либо
                ещё впереди, либо уже увенчалась успехом. */}
            <button
                type="button"
                className="btn btn-sm btn-outline-primary"
                data-test-id={`email-queue-retry-${row.id}`}
                disabled={row.status !== 'error' || busy}
                onClick={() => onRetry(row.id)}
            >
                {busy ? '…' : retryLabel}
            </button>
        </td>
    </tr>
);

interface TableProps {
    rows: EmailQueueRow[];
    columns: GridColumn[];
    retryLabel: string;
    retryingId: number | null;
    onRetry: (id: number) => void;
}

const EmailQueueTable: React.FC<TableProps> = ({rows, columns, retryLabel, retryingId, onRetry}) => (
    <div className="table-responsive">
        <table className="table">
            <thead>
                <tr>
                    {columns.map(col => <th key={col.key}>{col.label}</th>)}
                    <th>{retryLabel}</th>
                </tr>
            </thead>
            <tbody>
                {rows.map(row => (
                    <EmailQueueTr
                        key={row.id}
                        row={row}
                        retryLabel={retryLabel}
                        busy={retryingId === row.id}
                        onRetry={onRetry}
                    />
                ))}
            </tbody>
        </table>
    </div>
);

export const EmailQueueIsland: React.FC<Props> = (props) => {
    const {emailQueuePayload, pageUrl, gridConfig, retryUrl, labels} = props;
    const {items: rows, setItems: setRows, page, totalPages, total, loading, goToPage} =
        useAdminPage<EmailQueueRow, typeof NO_FILTERS, {page: number; perPage: number}>({
            url: pageUrl,
            initialData: emailQueuePayload,
            filters: NO_FILTERS,
            buildBody: (_filters, page) => ({page, perPage: DEFAULT_PAGE_SIZE}),
        });
    const [deadLetterCount, setDeadLetterCount] = useState<number>(props.deadLetterCount);
    const [retryingId, setRetryingId] = useState<number | null>(null);
    const [error, setError] = useState<string>('');

    const handleRetry = async (id: number): Promise<void> => {
        setRetryingId(id);
        setError('');
        try {
            const res = await sendPost<{id: number}, RetryResponse>(retryUrl, {id});
            if (res.success && res.row) {
                setRows(prev => prev.map(r => (r.id === id ? res.row! : r)));
            }
            setDeadLetterCount(res.deadLetterCount);
            if (!res.success) {
                setError(labels.retryFail);
            }
        } catch {
            setError(labels.retryFail);
        } finally {
            setRetryingId(null);
        }
    };

    const pager = (
        <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            loading={loading}
            onPageChange={goToPage}
            labels={adminPaginationLabels}
        />
    );

    return (
        <div data-test-id="admin-email-queue">
            <PageHeader title={labels.title} icon={<Mailbox size={22} aria-hidden="true" />} />

            <div className="section-soft">
                {deadLetterCount > 0 && (
                    <div className="alert alert-danger mb-4" data-test-id="email-queue-deadletter-banner">
                        {labels.deadLetter.replace('{0}', String(deadLetterCount))}
                    </div>
                )}

                {error && (
                    <div className="alert alert-warning mb-4" data-test-id="email-queue-retry-error">
                        {error}
                    </div>
                )}

                <div className="mb-3">{pager}</div>

                {rows.length === 0 && <p className="text-muted">{labels.empty}</p>}
                {rows.length > 0 && (
                    <EmailQueueTable
                        rows={rows}
                        columns={gridConfig.columns}
                        retryLabel={labels.retry}
                        retryingId={retryingId}
                        onRetry={handleRetry}
                    />
                )}

                <div className="mt-3">{pager}</div>
            </div>
        </div>
    );
};
