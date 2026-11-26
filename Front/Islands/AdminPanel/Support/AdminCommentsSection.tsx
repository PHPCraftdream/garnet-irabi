import * as React from 'react';
import {AntiHookComponent, Carburetor, type TReadonly} from '@react-carburetor/core';
import {sendPost} from '@common/Api/Send/sendPost';
import {showToast} from '@common/Components/Feedback/GlobalToast';
import Pagination from '@common/Components/Layout/Paging/Pagination';
import {PageResponse} from '@common/hooks/data/usePagination';
import {ConfirmModal} from '@common/Components/Feedback/ConfirmModal';
import {LogDetailModal} from '@common/Components/Admin/AdminLog/LogDetailModal';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import {
    AdminCommentRow,
    CommentsAccountOption,
    CommentsFetchBody,
    ModerationResponse,
    ToggleResponse,
} from './comments/commentTypes';
import {buildAccountOptions} from '@/Islands/AdminPanel/Shell/shared/adminShared';
import {adminPaginationLabels} from '@/Islands/AdminPanel/Shell/navigation/adminPaginationLabels';
import {CommentsFilterState, CommentsFilters} from './comments/CommentsFilters';
import {CommentsTable} from './comments/CommentsTable';
import {AdminPageController} from '@/Islands/AdminPanel/Shell/AdminPageController';
import {ConfirmController} from '@/Islands/Comms/Comments/confirmController';

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
    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
    constructor() {
        super({filters: EMPTY_FILTERS, bodyModal: null});
    }

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    readonly snapshot = () => this.getData();
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    readonly subscribeSnapshot = (listener: () => void) => {
        const id = this.subscribe(listener);
        return () => this.unsubscribe(id);
    };

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private patch(patch: Partial<ReturnType<CommentsUI['snapshot']>>): void {
        const before = this.getData();
        const version = this.getVersion();
        this.setData({...before, ...patch});
        if (this.getData() !== before && this.getVersion() === version) {
            this.markAllChanged();
            this.emitUpdate();
        }
    }

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    readonly changeFilters = (patch: Partial<CommentsFilterState>) => this.patch({filters:
        {...this.getData().filters, ...patch}});
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    readonly resetFilters = () => this.patch({filters: EMPTY_FILTERS});
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    readonly openBody = (bodyModal: AdminCommentRow) => this.patch({bodyModal});
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    readonly closeBody = () => this.patch({bodyModal: null});
}

    /** Формирует представление данных для соответствующего раздела панели. */
function buildBody(filters: CommentsFilterState, page: number, perPage: number): CommentsFetchBody {
    return {page, perPage, author_id: filters.authorId, expert_id: filters.expertId,
        date_from: filters.dateFrom, date_to: filters.dateTo, search: filters.search, hidden_only:
            filters.hiddenOnly ? '1' : '0'};
}

/** Поля, которые таблица получает от пагинатора; плюс подписи фильтров из props. */
interface CommentsTableView {
    items: readonly AdminCommentRow[];
    page: number;
    perPage: number;
    totalPages: number;
    total: number;
    loading: boolean;
    filters: CommentsFilterState;
    authorOptions: ReturnType<typeof buildAccountOptions>;
    expertOptions: ReturnType<typeof buildAccountOptions>;
}

/** `useCarburetor` отдаёт данные только для чтения, а модалке нужен изменяемый ConfirmState. */
type ConfirmView = ReturnType<ConfirmController['snapshot']>;

/** Фильтры менять нельзя, но копия нужна: дочерняя панель читает поля не через прокси. */
function readFilters(filters: TReadonly<CommentsFilterState>): CommentsFilterState {
    return {
        authorId: filters.authorId,
        expertId: filters.expertId,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        search: filters.search,
        hiddenOnly: filters.hiddenOnly,
    };
}

/**
 * Отзывы в админке: фильтры, таблица и три решения по каждому отзыву.
 *
 * Разметка живёт в `comments/`. Здесь — загрузка и действия; в отдельном месте
 * держится и правило анонимности (`CommentAuthorCell`), чтобы его нельзя было
 * задеть, поправляя вёрстку таблицы.
 */
export class AdminCommentsSection extends AntiHookComponent<AdminCommentsSectionProps> {
    private readonly ui = new CommentsUI();
    private readonly confirm = new ConfirmController();
    private readonly pager = new AdminPageController<AdminCommentRow, CommentsFilterState, CommentsFetchBody>({
        url: this.props.commentsPageUrl,
        initialData: this.props.commentsPayload,
        filters: EMPTY_FILTERS,
        buildBody,
    });
    /*
     * Страница, смена решения и скрытие приходят заменой `items` целиком, а `setData`
     * диффит замену до листьев: подписка на маркер `items.~p` такого не видит, и строки
     * остаются прежними. Снимок читает поля строк и меняет идентичность только вместе с
     * содержимым (RULES.md, «Подписки useCarburetor»).
     */
    private readonly rows = this.connectSelection(this.pager, state => state.items);
    private unsubscribeFilters?: () => void;

    // Новый массив на каждом рендере перерисовывал бы CommentsFilters,
    // а `experts`/`authors` после монтирования не меняются.
    private accountOptionsCache: {
        experts: CommentsAccountOption[];
        authors: CommentsAccountOption[];
        authorOptions: ReturnType<typeof buildAccountOptions>;
        expertOptions: ReturnType<typeof buildAccountOptions>;
    } | null = null;

    /** Синхронизирует жизненный цикл компонента с его внешними подписками. */
    componentDidMount(): void {
        super.componentDidMount();
        // Подписка на стор заменяет прежний эффект с debounce: срабатывает на каждую запись фильтров.
        this.unsubscribeFilters = this.ui.subscribeSnapshot(this.onFiltersChanged);
        this.pager.start();
    }

    /** Синхронизирует жизненный цикл компонента с его внешними подписками. */
    componentWillUnmount(): void {
        this.unsubscribeFilters?.();
        this.unsubscribeFilters = undefined;
        this.pager.stop();
        super.componentWillUnmount();
    }

    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
    private readonly onFiltersChanged = () => this.pager.setFilters(this.ui.getData().filters);

    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
    private accountOptions() {
        const {experts, authors} = this.props;
        const cache = this.accountOptionsCache;
        if (cache !== null && cache.experts === experts && cache.authors === authors) return cache;
        const built = {
            experts,
            authors,
            authorOptions: buildAccountOptions(authors),
            expertOptions: buildAccountOptions(experts),
        };
        this.accountOptionsCache = built;
        return built;
    }

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private patchRow(id: number, patch: Partial<AdminCommentRow>): void {
        this.pager.setItems(previous => {
            const index = previous.findIndex(row => row.id === id);
            if (index < 0) return previous;
            const items = previous.slice();
            items[index] = {...items[index], ...patch};
            return items;
        });
    }

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly toggleHidden = async (row: AdminCommentRow, hide: boolean) => {
        const {hideUrl, unhideUrl} = this.props;
        const ok = await this.confirm.confirm(hide ? t.Comment_HideConfirm() : t.Comment_UnhideConfirm(), {
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
        const {approveUrl, rejectUrl} = this.props;
        const ok = await this.confirm.confirm(approve ? t.Comment_ApproveConfirm() : t.Comment_RejectConfirm(), {
            confirmLabel: approve ? t.Comment_Approve() : t.Comment_Reject(),
            variant: approve ? 'success' : 'danger',
        });
        if (!ok) return;
        try {
            const resp = await sendPost<{id: number}, ModerationResponse>(approve ? approveUrl : rejectUrl,
        {id: row.id});
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
        const {flagUrl} = this.props;
        const ok = await this.confirm.confirm(t.Comment_FlagConfirm(), {confirmLabel: t.Comment_Flag(),
            variant: 'danger'});
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


    /** Формирует представление данных для соответствующего раздела панели. */
    private renderTable(view: CommentsTableView) {
        const {page, perPage, totalPages, total, loading, filters, items, authorOptions, expertOptions} = view;
        const {goToPage, setPerPage} = this.pager;
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
                    onChange={this.ui.changeFilters}
                    onReset={this.ui.resetFilters}
                />
                <div className="admin-comments-pager-top">{pager}</div>
                {items.length === 0 && <p className="token-cell-muted">{t.Comment_NoComments()}</p>}
                {items.length > 0 && (
                    <CommentsTable
                        items={items}
                        onOpenBody={this.ui.openBody}
                        onModerate={this.setModeration}
                        onFlag={this.flagComment}
                        onToggleHidden={this.toggleHidden}
                    />
                )}
                <div className="admin-comments-pager-bottom">{pager}</div>
            </div>
        );
    }

    /** Формирует представление данных для соответствующего раздела панели. */
    render() {
        const {page, perPage, totalPages, total, loading} = this.useCarburetor(this.pager);
        const items = this.rows() as AdminCommentRow[];
        const {filters, bodyModal} = this.useCarburetor(this.ui);
        const confirmState = this.useCarburetor(this.confirm) as ConfirmView;
        const {authorOptions, expertOptions} = this.accountOptions();
        return (
            <div data-test-id="admin-comments">
                {this.renderTable({items, page, perPage, totalPages, total, loading, filters: readFilters(filters),
                    authorOptions, expertOptions})}
                {bodyModal && (
                    <LogDetailModal title={t.Comment_Body() + ' #' + bodyModal.id} onClose={this.ui.closeBody}>
                        <div className="admin-comments-body" data-test-id="comment-body-modal-content">
                            {bodyModal.body}
                        </div>
                    </LogDetailModal>
                )}

                <ConfirmModal state={{...confirmState, items: [...confirmState.items]}}
        onConfirm={this.confirm.handleConfirm} onCancel={this.confirm.handleCancel} />
            </div>
        );
    }
}
