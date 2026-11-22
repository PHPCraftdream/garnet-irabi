import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
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

const QUEUE_ICON = <Mailbox size={22} aria-hidden="true" />;

function rowKey(row: EmailQueueRow) { return row.id; }
function rowTestId(row: EmailQueueRow) { return 'email-queue-row-' + row.id; }
function renderCreated(row: EmailQueueRow) {
    return <span className="admin-email-queue-time">{formatTs(row.created_at)}</span>;
}
function renderNext(row: EmailQueueRow) {
    return row.next_attempt_at !== null
        ? <span className="admin-email-queue-time">{formatTs(row.next_attempt_at)}</span>
        : <span className="admin-email-queue-muted">—</span>;
}
function renderStatus(row: EmailQueueRow) {
    return <span className="admin-email-queue-status" data-status={row.status}>{row.status}</span>;
}

interface RetryProps {
    row: EmailQueueRow;
    retrying: boolean;
    label: string;
    onRetry: (id: number) => Promise<void>;
}

class RetryButton extends AntiHookComponent<RetryProps> {
    private readonly retry = () => { void this.props.onRetry(this.props.row.id); };

    render() {
        const {row, retrying, label} = this.props;
        return <button type="button" className="compact-outline-action" data-test-id={'email-queue-retry-' + row.id}
            disabled={row.status !== 'error' || retrying} onClick={this.retry}>{retrying ? '…' : label}</button>;
    }
}

function createRenders(retryingId: number | null, label: string, onRetry: RetryProps['onRetry']) {
    return {created_at: renderCreated, next_attempt_at: renderNext, status: renderStatus,
        retry: (row: EmailQueueRow) => <RetryButton row={row} retrying={retryingId === row.id} label={label} onRetry={onRetry} />};
}

interface QueueState {
    deadLetterCount: number;
    retryingId: number | null;
    error: string;
}

export class EmailQueueIsland extends AntiHookComponent<Props> {
    private readonly ui = new Carburetor<QueueState>({
        deadLetterCount: this.props.deadLetterCount,
        retryingId: null,
        error: '',
    });
    private readonly gridRef = React.createRef<AdminGridHandle<EmailQueueRow>>();

    private cachedRenders?: {retryingId: number | null; label: string; value: ReturnType<typeof createRenders>};

    private getRenders(retryingId: number | null, label: string) {
        const cached = this.cachedRenders;
        if (cached?.retryingId === retryingId && cached.label === label) return cached.value;
        const value = createRenders(retryingId, label, this.handleRetry);
        this.cachedRenders = {retryingId, label, value};
        return value;
    }

    private readonly handleRetry = async (id: number): Promise<void> => {
        this.ui.setData({...this.ui.getData(), retryingId: id, error: ''});
        try {
            const res = await sendPost<{id: number}, RetryResponse>(this.props.retryUrl, {id});
            if (res.success && res.row) {
                this.gridRef.current?.setItems(prev => prev.map(r => (r.id === id ? res.row! : r)));
            }
            this.ui.setData({...this.ui.getData(), deadLetterCount: res.deadLetterCount,
                error: res.success ? this.ui.getData().error : this.props.labels.retryFail});
        } catch {
            this.ui.setData({...this.ui.getData(), error: this.props.labels.retryFail});
        } finally {
            this.ui.setData({...this.ui.getData(), retryingId: null});
        }
    };

    render() {
        const {pageUrl, initialData, gridConfig, labels} = this.props;
        const {deadLetterCount, retryingId, error} = this.useCarburetor(this.ui);
        return (
            <div data-test-id="admin-email-queue">
                <PageHeader title={labels.title} icon={QUEUE_ICON} />

                <div className="section-soft">
                    {deadLetterCount > 0 && (
                        <div className="admin-email-queue-notice" data-test-id="email-queue-deadletter-banner">
                            {labels.deadLetter.replace('{0}', String(deadLetterCount))}
                        </div>
                    )}

                    {error && (
                        <div className="admin-email-queue-notice" data-test-id="email-queue-retry-error">
                            {error}
                        </div>
                    )}

                    <AdminGrid
                        ref={this.gridRef}
                        pageUrl={pageUrl}
                        initialData={initialData}
                        config={gridConfig}
                        rowKey={rowKey}
                        emptyMessage={labels.empty}
                        rowTestId={rowTestId}
                        renders={this.getRenders(retryingId, labels.retry)}
                    />
                </div>
            </div>
        );
    }
}
