import * as React from 'react';
import {useRef, useState} from 'react';
import {sendPost} from '@common/Api/Send/sendPost';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {PageHeader} from '@common/Components/Layout/PageHeader';
import {Mailbox} from 'lucide-react';
import {AdminGrid, AdminGridHandle} from '../../Grid/AdminGrid';
import {GridConfig, PageResponse} from '../../Shell/types';

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

interface Labels {
    title: string;
    deadLetter: string;
    empty: string;
    retry: string;
    retryDone: string;
    retryFail: string;
}

interface Props {
    pageUrl: string;
    initialData: PageResponse<EmailQueueRow> | null;
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
    const {pageUrl, initialData, gridConfig, retryUrl, labels} = props;
    const [deadLetterCount, setDeadLetterCount] = useState<number>(props.deadLetterCount);
    const [retryingId, setRetryingId] = useState<number | null>(null);
    const [error, setError] = useState<string>('');
    const gridRef = useRef<AdminGridHandle<EmailQueueRow>>(null);

    const handleRetry = async (id: number): Promise<void> => {
        setRetryingId(id);
        setError('');
        try {
            const res = await sendPost<{id: number}, RetryResponse>(retryUrl, {id});
            if (res.success && res.row) {
                gridRef.current?.setItems(prev => prev.map(r => (r.id === id ? res.row! : r)));
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

                <AdminGrid
                    ref={gridRef}
                    pageUrl={pageUrl}
                    initialData={initialData}
                    config={gridConfig}
                    rowKey={r => r.id}
                    emptyMessage={labels.empty}
                    rowTestId={r => `email-queue-row-${r.id}`}
                    renders={{
                        created_at: r => <span className="text-muted text-xs whitespace-nowrap">{formatTs(r.created_at)}</span>,
                        next_attempt_at: r => r.next_attempt_at !== null
                            ? <span className="text-muted text-xs whitespace-nowrap">{formatTs(r.next_attempt_at)}</span>
                            : <span className="text-muted">—</span>,
                        status: r => statusBadge(r.status),
                        retry: r => (
                            <button
                                type="button"
                                className="btn btn-sm btn-outline-primary"
                                data-test-id={`email-queue-retry-${r.id}`}
                                disabled={r.status !== 'error' || retryingId === r.id}
                                onClick={() => void handleRetry(r.id)}
                            >
                                {retryingId === r.id ? '…' : labels.retry}
                            </button>
                        ),
                    }}
                />
            </div>
        </div>
    );
};
