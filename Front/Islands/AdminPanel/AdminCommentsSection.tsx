import * as React from 'react';
import {sendPost} from '@common/Api/sendPost';
import {showToast} from '@common/Components/GlobalToast';
import Pagination from '@common/Components/Pagination';
import {PageResponse} from '@common/hooks/usePagination';
import {formatTs} from '@common/Utils/DateUtils';
import {Combobox} from '@common/Components/ui/Combobox';
import {DateInput} from '@common/Components/ui/DateInput';
import {useConfirm} from '@common/hooks/useConfirm';
import {ConfirmModal} from '@common/Components/ConfirmModal';
import {LogDetailModal} from '@common/Components/AdminLog/LogDetailModal';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {EntityLink, userLinks} from '../../Common/EntityLinks';
import {UniversalBadge} from '../../Common/StatusBadge';

export interface AdminCommentRow {
    id: number;
    author_id: number;
    author_name: string;
    entity_type: string;
    entity_id: number;
    entity_name: string;
    expert_has_profile: boolean;
    body: string;
    is_hidden: boolean;
    created_at: number;
}

export interface CommentsAccountOption {
    id: number;
    name: string;
}

export interface AdminCommentsSectionProps {
    commentsPayload: PageResponse<AdminCommentRow> | null;
    commentsPageUrl: string;
    hideUrl: string;
    unhideUrl: string;
    experts: CommentsAccountOption[];
    authors: CommentsAccountOption[];
}

interface CommentsFetchBody {
    page: number;
    perPage: number;
    author_id: number;
    expert_id: number;
    date_from: string;
    date_to: string;
    search: string;
    hidden_only: string;
}

interface ToggleResponse {
    success: boolean;
    id: number;
    is_hidden: boolean;
}

const PER_PAGE = 50;
const BODY_TRUNC = 160;

const paginationLabels = {
    prev: t.Pagination_Prev(),
    next: t.Pagination_Next(),
    of: t.Pagination_Of(),
    items: t.Pagination_Items(),
};

function buildAccountOptions(items: CommentsAccountOption[]): {value: string; label: string}[] {
    const out: {value: string; label: string}[] = [{value: '0', label: t.Admin_Filter_All()}];
    for (const a of items) {
        out.push({value: String(a.id), label: a.name});
    }
    return out;
}

function truncate(s: string, n: number): string {
    if (s.length <= n) return s;
    return s.slice(0, n).trimEnd() + '…';
}

export const AdminCommentsSection: React.FC<AdminCommentsSectionProps> = (props) => {
    const {commentsPayload, commentsPageUrl, hideUrl, unhideUrl, experts, authors} = props;

    const [items, setItems] = React.useState<AdminCommentRow[]>(commentsPayload?.items ?? []);
    const [page, setPage] = React.useState<number>(commentsPayload?.page ?? 1);
    const [totalPages, setTotalPages] = React.useState<number>(commentsPayload?.totalPages ?? 1);
    const [total, setTotal] = React.useState<number>(commentsPayload?.total ?? 0);
    const [loading, setLoading] = React.useState<boolean>(false);
    const [loadedOnce, setLoadedOnce] = React.useState<boolean>(commentsPayload !== null);

    const [authorId, setAuthorId] = React.useState<number>(0);
    const [expertId, setExpertId] = React.useState<number>(0);
    const [dateFrom, setDateFrom] = React.useState<string>('');
    const [dateTo, setDateTo] = React.useState<string>('');
    const [search, setSearch] = React.useState<string>('');
    const [hiddenOnly, setHiddenOnly] = React.useState<boolean>(false);

    const [bodyModal, setBodyModal] = React.useState<AdminCommentRow | null>(null);
    const {confirmState, confirm, handleConfirm, handleCancel} = useConfirm();

    const stateRef = React.useRef({authorId, expertId, dateFrom, dateTo, search, hiddenOnly});
    stateRef.current = {authorId, expertId, dateFrom, dateTo, search, hiddenOnly};

    const fetchPage = React.useCallback(async (params: Partial<CommentsFetchBody> = {}) => {
        const cur = stateRef.current;
        const body: CommentsFetchBody = {
            page: params.page ?? 1,
            perPage: PER_PAGE,
            author_id: params.author_id ?? cur.authorId,
            expert_id: params.expert_id ?? cur.expertId,
            date_from: params.date_from ?? cur.dateFrom,
            date_to: params.date_to ?? cur.dateTo,
            search: params.search ?? cur.search,
            hidden_only: params.hidden_only ?? (cur.hiddenOnly ? '1' : '0'),
        };
        setLoading(true);
        try {
            const resp = await sendPost<CommentsFetchBody, PageResponse<AdminCommentRow>>(commentsPageUrl, body);
            const data = ('data' in resp && resp.data) ? resp.data : (resp as unknown as PageResponse<AdminCommentRow>);
            setItems(data.items);
            setPage(data.page);
            setTotalPages(data.totalPages);
            setTotal(data.total);
            setLoadedOnce(true);
        } catch {
            showToast(t.User_LoadError(), 'danger');
        } finally {
            setLoading(false);
        }
    }, [commentsPageUrl]);

    // Initial load if no SSR payload
    React.useEffect(() => {
        if (commentsPayload === null && !loadedOnce) {
            void fetchPage({page: 1});
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Auto-apply filters with debounce when any filter changes (skip first render).
    const isFirstRunRef = React.useRef(true);
    React.useEffect(() => {
        if (isFirstRunRef.current) {
            isFirstRunRef.current = false;
            return;
        }
        const handle = setTimeout(() => {
            void fetchPage({page: 1});
        }, 300);
        return () => clearTimeout(handle);
    }, [authorId, expertId, dateFrom, dateTo, search, hiddenOnly, fetchPage]);

    const handleResetFilters = React.useCallback(() => {
        setAuthorId(0);
        setExpertId(0);
        setDateFrom('');
        setDateTo('');
        setSearch('');
        setHiddenOnly(false);
    }, []);

    const handlePageChange = React.useCallback((p: number) => {
        if (p < 1 || p > totalPages || (p === page && !loading)) return;
        void fetchPage({page: p});
    }, [fetchPage, totalPages, page, loading]);

    const expertOptions = React.useMemo(() => buildAccountOptions(experts), [experts]);
    const authorOptions = React.useMemo(() => buildAccountOptions(authors), [authors]);

    const toggleHidden = React.useCallback(async (row: AdminCommentRow, hide: boolean) => {
        const message = hide ? t.Comment_HideConfirm() : t.Comment_UnhideConfirm();
        const ok = await confirm(message, {
            confirmLabel: hide ? t.Comment_Hide() : t.Comment_Unhide(),
            variant: hide ? 'danger' : 'success',
        });
        if (!ok) return;
        try {
            const url = hide ? hideUrl : unhideUrl;
            const resp = await sendPost<{id: number}, ToggleResponse>(url, {id: row.id});
            const data = ('data' in resp && resp.data) ? resp.data : (resp as unknown as ToggleResponse);
            if (data?.success) {
                setItems(prev => prev.map(it => it.id === row.id ? {...it, is_hidden: data.is_hidden} : it));
            } else {
                showToast(t.General_Error(), 'danger');
            }
        } catch {
            showToast(t.General_Error(), 'danger');
        }
    }, [confirm, hideUrl, unhideUrl]);

    return (
        <div data-test-id="admin-comments">
            <div data-test-id="admin-comments-tab">
                <div className="admin-bookings-filters">
                    <div className="filter-cell">
                        <label>{t.Comment_Author()}</label>
                        <Combobox
                            options={authorOptions}
                            value={String(authorId)}
                            onChange={v => setAuthorId(parseInt(v, 10) || 0)}
                            placeholder={t.Admin_Filter_SelectUser()}
                            searchPlaceholder={t.Admin_Filter_SearchUser()}
                            emptyText={t.Admin_Filter_All()}
                            testId="comments-author-filter"
                        />
                    </div>
                    <div className="filter-cell">
                        <label>{t.Comment_Expert()}</label>
                        <Combobox
                            options={expertOptions}
                            value={String(expertId)}
                            onChange={v => setExpertId(parseInt(v, 10) || 0)}
                            placeholder={t.Admin_Filter_SelectExpert()}
                            searchPlaceholder={t.Admin_Filter_SearchExpert()}
                            emptyText={t.Admin_Filter_All()}
                            testId="comments-expert-filter"
                        />
                    </div>
                    <div className="filter-cell">
                        <label htmlFor="comments-date-from">{t.Admin_Filter_DateFrom()}</label>
                        <DateInput
                            id="comments-date-from"
                            value={dateFrom}
                            onChange={e => setDateFrom(e.target.value)}
                            data-test-id="comments-date-from"
                        />
                    </div>
                    <div className="filter-cell">
                        <label htmlFor="comments-date-to">{t.Admin_Filter_DateTo()}</label>
                        <DateInput
                            id="comments-date-to"
                            value={dateTo}
                            onChange={e => setDateTo(e.target.value)}
                            data-test-id="comments-date-to"
                        />
                    </div>
                    <div className="filter-cell">
                        <label htmlFor="comments-search">{t.Comment_Filter_Search()}</label>
                        <input
                            id="comments-search"
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="form-control"
                            data-test-id="comments-search"
                        />
                    </div>
                    <div className="filter-cell">
                        <label htmlFor="comments-hidden-only" className="flex items-center gap-2">
                            <input
                                id="comments-hidden-only"
                                type="checkbox"
                                checked={hiddenOnly}
                                onChange={e => setHiddenOnly(e.target.checked)}
                                data-test-id="comments-hidden-only"
                            />
                            <span>{t.Comment_Filter_HiddenOnly()}</span>
                        </label>
                    </div>
                    <div className="filter-actions">
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={handleResetFilters}
                            disabled={loading}
                            data-test-id="comments-reset"
                            aria-label={t.Admin_Filter_ResetAll()}
                            title={t.Admin_Filter_ResetAll()}
                        >
                            {'× '}{t.Admin_Filter_ResetAll()}
                        </button>
                    </div>
                </div>

                <div className="mb-3">
                    <Pagination
                        page={page}
                        totalPages={totalPages}
                        total={total}
                        loading={loading}
                        onPageChange={handlePageChange}
                        labels={paginationLabels}
                    />
                </div>

                {items.length === 0 ? (
                    <p className="text-muted">{t.Comment_NoComments()}</p>
                ) : (
                    <div className="card">
                        <div className="overflow-x-auto">
                            <table className="admin-table">
                                <thead>
                                    <tr className="border-b border-subtle">
                                        <th className="text-left p-3">{t.Admin_Booking_Created()}</th>
                                        <th className="text-left p-3">{t.Comment_Author()}</th>
                                        <th className="text-left p-3">{t.Comment_Expert()}</th>
                                        <th className="text-left p-3">{t.Comment_Body()}</th>
                                        <th className="text-left p-3">{t.Comment_Status()}</th>
                                        <th className="text-left p-3">{t.Comment_Actions()}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map(row => (
                                        <tr
                                            key={row.id}
                                            className="border-b border-subtle"
                                            data-test-id={`comment-row-${row.id}`}
                                        >
                                            <td className="p-3 whitespace-nowrap text-muted text-xs">
                                                {formatTs(row.created_at)}
                                            </td>
                                            <td className="p-3">
                                                {row.author_id > 0 ? (
                                                    <EntityLink
                                                        name={row.author_name}
                                                        {...userLinks(row.author_id, false)}
                                                        isModerator={true}
                                                    />
                                                ) : <span className="text-muted">—</span>}
                                            </td>
                                            <td className="p-3">
                                                {row.entity_id > 0 ? (
                                                    <EntityLink
                                                        name={row.entity_name}
                                                        {...userLinks(row.entity_id, row.expert_has_profile)}
                                                        isModerator={true}
                                                    />
                                                ) : <span className="text-muted">—</span>}
                                            </td>
                                            <td className="p-3">
                                                <button
                                                    type="button"
                                                    className="common-link text-left"
                                                    onClick={() => setBodyModal(row)}
                                                    title={row.body}
                                                    data-test-id={`comment-body-${row.id}`}
                                                >
                                                    {truncate(row.body, BODY_TRUNC)}
                                                </button>
                                            </td>
                                            <td className="p-3">
                                                {row.is_hidden ? (
                                                    <UniversalBadge status="cancelled" label={t.Comment_StatusHidden()} />
                                                ) : (
                                                    <UniversalBadge status="active" label={t.Comment_StatusVisible()} />
                                                )}
                                            </td>
                                            <td className="p-3">
                                                {row.is_hidden ? (
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm btn-outline-warning"
                                                        onClick={() => void toggleHidden(row, false)}
                                                        data-test-id={`comment-unhide-${row.id}`}
                                                    >
                                                        {t.Comment_Unhide()}
                                                    </button>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm btn-outline-warning"
                                                        onClick={() => void toggleHidden(row, true)}
                                                        data-test-id={`comment-hide-${row.id}`}
                                                    >
                                                        {t.Comment_Hide()}
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                <div className="mt-3">
                    <Pagination
                        page={page}
                        totalPages={totalPages}
                        total={total}
                        loading={loading}
                        onPageChange={handlePageChange}
                        labels={paginationLabels}
                    />
                </div>
            </div>

            {bodyModal && (
                <LogDetailModal
                    title={t.Comment_Body() + ' #' + bodyModal.id}
                    onClose={() => setBodyModal(null)}
                >
                    <div className="whitespace-pre-wrap" data-test-id="comment-body-modal-content">
                        {bodyModal.body}
                    </div>
                </LogDetailModal>
            )}

            <ConfirmModal state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
        </div>
    );
};
