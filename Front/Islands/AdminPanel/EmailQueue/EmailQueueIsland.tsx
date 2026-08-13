import * as React from 'react';
import {useState} from 'react';
import {sendPost} from '@common/Api/sendPost';
import {formatTs} from '@common/Utils/DateUtils';
import {PageHeader} from '@common/Components/PageHeader';
import {Mailbox} from 'lucide-react';

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
    rows: EmailQueueRow[];
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

export const EmailQueueIsland: React.FC<Props> = (props) => {
    const {gridConfig, retryUrl, labels} = props;
    const [rows, setRows] = useState<EmailQueueRow[]>(props.rows);
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

                {rows.length === 0 ? (
                    <p className="text-muted">{labels.empty}</p>
                ) : (
                    <div className="table-responsive">
                        <table className="table">
                            <thead>
                                <tr>
                                    {gridConfig.columns.map(col => (
                                        <th key={col.key}>{col.label}</th>
                                    ))}
                                    <th>{labels.retry}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(row => {
                                    const isRetryable = row.status === 'error';
                                    return (
                                        <tr key={row.id} data-test-id={`email-queue-row-${row.id}`}>
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
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-outline-primary"
                                                    data-test-id={`email-queue-retry-${row.id}`}
                                                    disabled={!isRetryable || retryingId === row.id}
                                                    onClick={() => handleRetry(row.id)}
                                                >
                                                    {retryingId === row.id ? '…' : labels.retry}
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};
