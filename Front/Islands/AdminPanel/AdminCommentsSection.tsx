import * as React from 'react';
import {sendPost} from '@common/Api/Send/sendPost';
import {showToast} from '@common/Components/Feedback/GlobalToast';
import Pagination from '@common/Components/Layout/Paging/Pagination';
import {PageResponse} from '@common/hooks/data/usePagination';
import {useConfirm} from '@common/hooks/ui/useConfirm';
import {ConfirmModal} from '@common/Components/Feedback/ConfirmModal';
import {LogDetailModal} from '@common/Components/Admin/AdminLog/LogDetailModal';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {
    AdminCommentRow,
    COMMENTS_PER_PAGE,
    CommentsAccountOption,
    CommentsFetchBody,
    ModerationResponse,
    ToggleResponse,
} from './comments/commentTypes';
import {adminPaginationLabels, buildAccountOptions} from './adminShared';
import {useAdminPage} from './useAdminPage';
import {CommentsFilterState, CommentsFilters} from './comments/CommentsFilters';
import {CommentsTable} from './comments/CommentsTable';

export type {AdminCommentRow, CommentsAccountOption} from './comments/commentTypes';

export interface AdminCommentsSectionProps {
    commentsPayload: PageResponse<AdminCommentRow> | null;
    commentsPageUrl: string;
    hideUrl: string;
    unhideUrl: string;
    approveUrl: string;
    rejectUrl: string;
    flagUrl: string;
    experts: CommentsAccountOption[];
    authors: CommentsAccountOption[];
}

const EMPTY_FILTERS: CommentsFilterState = {
    authorId: 0,
    expertId: 0,
    dateFrom: '',
    dateTo: '',
    search: '',
    hiddenOnly: false,
};

/**
 * Отзывы в админке: фильтры, таблица и три решения по каждому отзыву.
 *
 * Разметка живёт в `comments/`. Здесь — загрузка и действия; в отдельном месте
 * держится и правило анонимности (`CommentAuthorCell`), чтобы его нельзя было
 * задеть, поправляя вёрстку таблицы.
 */
export const AdminCommentsSection: React.FC<AdminCommentsSectionProps> = (props) => {
    const {commentsPayload, commentsPageUrl, hideUrl, unhideUrl, approveUrl, rejectUrl, flagUrl, experts, authors} = props;

    const [filters, setFilters] = React.useState<CommentsFilterState>(EMPTY_FILTERS);
    const [bodyModal, setBodyModal] = React.useState<AdminCommentRow | null>(null);
    const {confirmState, confirm, handleConfirm, handleCancel} = useConfirm();

    const buildBody = React.useCallback((f: CommentsFilterState, page: number): CommentsFetchBody => ({
        page,
        perPage: COMMENTS_PER_PAGE,
        author_id: f.authorId,
        expert_id: f.expertId,
        date_from: f.dateFrom,
        date_to: f.dateTo,
        search: f.search,
        hidden_only: f.hiddenOnly ? '1' : '0',
    }), []);

    const {items, page, totalPages, total, loading, goToPage, setItems} =
        useAdminPage<AdminCommentRow, CommentsFilterState, CommentsFetchBody>({
            url: commentsPageUrl,
            initialData: commentsPayload,
            filters,
            buildBody,
        });

    const expertOptions = React.useMemo(() => buildAccountOptions(experts), [experts]);
    const authorOptions = React.useMemo(() => buildAccountOptions(authors), [authors]);

    const patchRow = (id: number, patch: Partial<AdminCommentRow>) =>
        setItems(prev => prev.map(it => it.id === id ? {...it, ...patch} : it));

    const toggleHidden = React.useCallback(async (row: AdminCommentRow, hide: boolean) => {
        const ok = await confirm(hide ? t.Comment_HideConfirm() : t.Comment_UnhideConfirm(), {
            confirmLabel: hide ? t.Comment_Hide() : t.Comment_Unhide(),
            variant: hide ? 'danger' : 'success',
        });
        if (!ok) return;
        try {
            const resp = await sendPost<{id: number}, ToggleResponse>(hide ? hideUrl : unhideUrl, {id: row.id});
            const data = ('data' in resp && resp.data) ? resp.data : (resp as unknown as ToggleResponse);
            if (!data?.success) {
                showToast(t.General_Error(), 'danger');
                return;
            }
            patchRow(row.id, {is_hidden: data.is_hidden});
        } catch {
            showToast(t.General_Error(), 'danger');
        }
    }, [confirm, hideUrl, unhideUrl]);

    /**
     * Решение по непроверенному отзыву.
     *
     * Отдельно от «скрыть/показать»: отклонённый отзыв читатели не видели
     * никогда, а скрытый — видели и он пропал. Смешивать их нельзя, иначе из
     * списка не понять, что уже разобрано.
     */
    const setModeration = React.useCallback(async (row: AdminCommentRow, approve: boolean) => {
        const ok = await confirm(approve ? t.Comment_ApproveConfirm() : t.Comment_RejectConfirm(), {
            confirmLabel: approve ? t.Comment_Approve() : t.Comment_Reject(),
            variant: approve ? 'success' : 'danger',
        });
        if (!ok) return;
        try {
            const resp = await sendPost<{id: number}, ModerationResponse>(approve ? approveUrl : rejectUrl, {id: row.id});
            const data = ('data' in resp && resp.data) ? resp.data : (resp as unknown as ModerationResponse);
            if (!data?.success) {
                showToast(t.General_Error(), 'danger');
                return;
            }
            patchRow(row.id, {moderation_status: data.moderation_status});
        } catch {
            showToast(t.General_Error(), 'danger');
        }
    }, [confirm, approveUrl, rejectUrl]);

    /**
     * Пометить отзыв как опасный — единственное действие во всей системе,
     * которое снимает анонимность автора. Поэтому подтверждение говорит об
     * этом прямо и отдельно предупреждает: не помечать отзыв за резкость.
     */
    const flagComment = React.useCallback(async (row: AdminCommentRow) => {
        const ok = await confirm(t.Comment_FlagConfirm(), {confirmLabel: t.Comment_Flag(), variant: 'danger'});
        if (!ok) return;
        try {
            const resp = await sendPost<{id: number}, ModerationResponse>(flagUrl, {id: row.id});
            const data = ('data' in resp && resp.data) ? resp.data : (resp as unknown as ModerationResponse);
            if (!data?.success) {
                showToast(t.General_Error(), 'danger');
                return;
            }
            patchRow(row.id, {moderation_status: data.moderation_status});
        } catch {
            showToast(t.General_Error(), 'danger');
        }
    }, [confirm, flagUrl]);

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
        <div data-test-id="admin-comments">
            <div data-test-id="admin-comments-tab">
                <CommentsFilters
                    state={filters}
                    authorOptions={authorOptions}
                    expertOptions={expertOptions}
                    loading={loading}
                    onChange={patch => setFilters(prev => ({...prev, ...patch}))}
                    onReset={() => setFilters(EMPTY_FILTERS)}
                />
                <div className="mb-3">{pager}</div>
                {items.length === 0 && <p className="text-muted">{t.Comment_NoComments()}</p>}
                {items.length > 0 && (
                    <CommentsTable
                        items={items}
                        onOpenBody={setBodyModal}
                        onModerate={(row, approve) => void setModeration(row, approve)}
                        onFlag={row => void flagComment(row)}
                        onToggleHidden={(row, hide) => void toggleHidden(row, hide)}
                    />
                )}
                <div className="mt-3">{pager}</div>
            </div>

            {bodyModal && (
                <LogDetailModal title={t.Comment_Body() + ' #' + bodyModal.id} onClose={() => setBodyModal(null)}>
                    <div className="whitespace-pre-wrap" data-test-id="comment-body-modal-content">
                        {bodyModal.body}
                    </div>
                </LogDetailModal>
            )}

            <ConfirmModal state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
        </div>
    );
};
