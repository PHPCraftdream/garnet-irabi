import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import {sendPost} from '@common/Api/Send/sendPost';
import {showToast} from '@common/Components/Feedback/GlobalToast';
import Pagination from '@common/Components/Layout/Paging/Pagination';
import {PageResponse} from '@common/hooks/data/usePagination';
import {useConfirm} from '@common/hooks/ui/useConfirm';
import {ConfirmModal} from '@common/Components/Feedback/ConfirmModal';
import {LogDetailModal} from '@common/Components/Admin/AdminLog/LogDetailModal';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {
    AdminCommentRow,
    CommentsAccountOption,
    CommentsFetchBody,
    ModerationResponse,
    ToggleResponse,
} from './comments/commentTypes';
import {adminPaginationLabels, buildAccountOptions} from '../Shell/adminShared';
import {useAdminPage} from '../Shell/useAdminPage';
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

class CommentsUI extends Carburetor<{filters: CommentsFilterState; bodyModal: AdminCommentRow | null}> {
    constructor() {
        super({filters: EMPTY_FILTERS, bodyModal: null});
    }

    readonly snapshot = () => this.getData();
    readonly subscribeSnapshot = (listener: () => void) => {
        const id = this.subscribe(listener);
        return () => this.unsubscribe(id);
    };

    private update(patch: Partial<ReturnType<CommentsUI['snapshot']>>): void {
        const before = this.getData();
        const version = this.getVersion();
        this.setData({...before, ...patch});
        if (this.getData() !== before && this.getVersion() === version) {
            this.markAllChanged();
            this.emitUpdate();
        }
    }

    readonly changeFilters = (patch: Partial<CommentsFilterState>) => this.update({filters: {...this.getData().filters, ...patch}});
    readonly resetFilters = () => this.update({filters: EMPTY_FILTERS});
    readonly openBody = (bodyModal: AdminCommentRow) => this.update({bodyModal});
    readonly closeBody = () => this.update({bodyModal: null});
}

function createCommentsUI(): CommentsUI {
    return new CommentsUI();
}

function buildBody(filters: CommentsFilterState, page: number, perPage: number): CommentsFetchBody {
    return {page, perPage, author_id: filters.authorId, expert_id: filters.expertId,
        date_from: filters.dateFrom, date_to: filters.dateTo, search: filters.search, hidden_only: filters.hiddenOnly ? '1' : '0'};
}

/**
 * Отзывы в админке: фильтры, таблица и три решения по каждому отзыву.
 *
 * Разметка живёт в `comments/`. Здесь — загрузка и действия; в отдельном месте
 * держится и правило анонимности (`CommentAuthorCell`), чтобы его нельзя было
 * задеть, поправляя вёрстку таблицы.
 */
export const AdminCommentsSection: React.FC<AdminCommentsSectionProps> = (props) => {
    const {commentsPayload, commentsPageUrl, experts, authors} = props;

    const [ui] = React.useState(createCommentsUI);
    const {filters, bodyModal} = React.useSyncExternalStore(ui.subscribeSnapshot, ui.snapshot, ui.snapshot);
    const {confirmState, confirm, handleConfirm, handleCancel} = useConfirm();

    const {items, page, perPage, totalPages, total, loading, goToPage, setPerPage, setItems} =
        useAdminPage<AdminCommentRow, CommentsFilterState, CommentsFetchBody>({
            url: commentsPageUrl,
            initialData: commentsPayload,
            filters,
            buildBody,
        });

    const expertOptions = React.useMemo(() => buildAccountOptions(experts), [experts]);
    const authorOptions = React.useMemo(() => buildAccountOptions(authors), [authors]);

    return <AdminCommentsView {...{hideUrl: props.hideUrl, unhideUrl: props.unhideUrl, approveUrl: props.approveUrl,
        rejectUrl: props.rejectUrl, flagUrl: props.flagUrl, ui, filters, bodyModal, confirm, confirmState, handleConfirm, handleCancel,
        page, totalPages, total, loading, goToPage, perPage, setPerPage, setItems, items, authorOptions, expertOptions}} />;
};

interface AdminCommentsViewProps extends Pick<AdminCommentsSectionProps, 'hideUrl' | 'unhideUrl' | 'approveUrl' | 'rejectUrl' | 'flagUrl'>, ReturnType<typeof useConfirm> {
    ui: CommentsUI;
    filters: CommentsFilterState;
    bodyModal: AdminCommentRow | null;
    page: number;
    totalPages: number;
    total: number;
    loading: boolean;
    goToPage: (page: number) => void;
    perPage: number;
    setPerPage: (perPage: number) => void;
    setItems: React.Dispatch<React.SetStateAction<AdminCommentRow[]>>;
    items: AdminCommentRow[];
    authorOptions: ReturnType<typeof buildAccountOptions>;
    expertOptions: ReturnType<typeof buildAccountOptions>;
}

class AdminCommentsView extends AntiHookComponent<AdminCommentsViewProps> {
    private patchRow(id: number, patch: Partial<AdminCommentRow>): void {
        this.props.setItems(previous => {
            const index = previous.findIndex(row => row.id === id);
            if (index < 0) return previous;
            const items = previous.slice();
            items[index] = {...items[index], ...patch};
            return items;
        });
    }

    private readonly toggleHidden = async (row: AdminCommentRow, hide: boolean) => {
        const {confirm, hideUrl, unhideUrl} = this.props;
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
            this.patchRow(row.id, {is_hidden: data.is_hidden});
        } catch {
            showToast(t.General_Error(), 'danger');
        }
    };

    /**
     * Решение по непроверенному отзыву.
     *
     * Отдельно от «скрыть/показать»: отклонённый отзыв читатели не видели
     * никогда, а скрытый — видели и он пропал. Смешивать их нельзя, иначе из
     * списка не понять, что уже разобрано.
     */
    private readonly setModeration = async (row: AdminCommentRow, approve: boolean) => {
        const {confirm, approveUrl, rejectUrl} = this.props;
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
            this.patchRow(row.id, {moderation_status: data.moderation_status});
        } catch {
            showToast(t.General_Error(), 'danger');
        }
    };

    /**
     * Пометить отзыв как опасный — единственное действие во всей системе,
     * которое снимает анонимность автора. Поэтому подтверждение говорит об
     * этом прямо и отдельно предупреждает: не помечать отзыв за резкость.
     */
    private readonly flagComment = async (row: AdminCommentRow) => {
        const {confirm, flagUrl} = this.props;
        const ok = await confirm(t.Comment_FlagConfirm(), {confirmLabel: t.Comment_Flag(), variant: 'danger'});
        if (!ok) return;
        try {
            const resp = await sendPost<{id: number}, ModerationResponse>(flagUrl, {id: row.id});
            const data = ('data' in resp && resp.data) ? resp.data : (resp as unknown as ModerationResponse);
            if (!data?.success) {
                showToast(t.General_Error(), 'danger');
                return;
            }
            this.patchRow(row.id, {moderation_status: data.moderation_status});
        } catch {
            showToast(t.General_Error(), 'danger');
        }
    };


    private renderTable() {
        const {page, totalPages, total, loading, goToPage, perPage, setPerPage, ui, filters,
            items, authorOptions, expertOptions} = this.props;
        const pager = (
            <Pagination
                page={page}
                totalPages={totalPages}
                total={total}
                loading={loading}
                onPageChange={goToPage}
                labels={adminPaginationLabels}
                pageSize={perPage}
                onPageSizeChange={setPerPage}
            />
        );

        return (
            <div data-test-id="admin-comments-tab">
                <CommentsFilters
                    state={filters}
                    authorOptions={authorOptions}
                    expertOptions={expertOptions}
                    loading={loading}
                    onChange={ui.changeFilters}
                    onReset={ui.resetFilters}
                />
                <div className="admin-comments-pager-top">{pager}</div>
                {items.length === 0 && <p className="token-cell-muted">{t.Comment_NoComments()}</p>}
                {items.length > 0 && (
                    <CommentsTable
                        items={items}
                        onOpenBody={ui.openBody}
                        onModerate={this.setModeration}
                        onFlag={this.flagComment}
                        onToggleHidden={this.toggleHidden}
                    />
                )}
                <div className="admin-comments-pager-bottom">{pager}</div>
            </div>
        );
    }

    render() {
        const {ui, bodyModal, confirmState, handleConfirm, handleCancel} = this.props;
        return (
            <div data-test-id="admin-comments">
                {this.renderTable()}
                {bodyModal && (
                    <LogDetailModal title={t.Comment_Body() + ' #' + bodyModal.id} onClose={ui.closeBody}>
                        <div className="admin-comments-body" data-test-id="comment-body-modal-content">
                            {bodyModal.body}
                        </div>
                    </LogDetailModal>
                )}

                <ConfirmModal state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
            </div>
        );
    }
}
