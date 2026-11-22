import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import {sendPost} from '@common/Api/Send/sendPost';
import {D} from '@common/Support/Debug/D';
import {CTRL_ENTER_HINT} from '@common/hooks/ui/useCtrlEnter';
import SendButton from '@common/Components/Controls/SendButton';
import {ConfirmModal} from '@common/Components/Feedback/ConfirmModal';
import {PaginationController} from '@common/hooks/data/PaginationController';
import Pagination, {PaginationLabels} from '@common/Components/Layout/Paging/Pagination';

import {showToast} from '@common/Components/Feedback/GlobalToast';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {Comment} from './commentTypes';
import {CommentCard} from './CommentCard';
import {SupportSending} from '../Support/parts/thread/supportSending';
import {ConfirmController} from './confirmController';

interface CommentsSectionProps {
    entityType: 'expert';
    entityId: number;
    listUrl: string;
    createUrl: string;
    deleteUrl: string;
    currentAccountId: number;
    isModerator: boolean;
    canCreate?: boolean;
}

// Свой отзыв узнаётся по `is_mine`, а не по author_id: для читателей
// author_id обнулён, иначе анонимность держалась бы только на вёрстке.
const isMine = (comment: Comment, currentAccountId: number): boolean =>
    comment.is_mine ?? (comment.author_id > 0 && comment.author_id === currentAccountId);

/**
 * Подпись состояния — только автору и только когда есть что сказать.
 * Одобренный чужой отзыв никакой пометки не несёт: она бы намекала
 * читателю на то, чего он знать не должен.
 */
const statusLabel = (comment: Comment, currentAccountId: number, isModerator: boolean): string => {
    // Модератор видит на публичной странице всё, включая непроверенное,
    // отклонённое и помеченное. Без подписи состояния эти отзывы выглядят
    // ровно как опубликованные — mod-1 отклонила и пометила два отзыва,
    // открыла страницу преподавателя, увидела их на месте и решила, что её
    // действия не сработали. Ничего не сломалось: обычный посетитель их не
    // видит (проверено под чужой сессией). Молчал не сервер, а подпись.
    if (isModerator && comment.moderation_status && comment.moderation_status !== 'approved') {
        return {
            pending: t.Comment_StatusPending(),
            rejected: t.Comment_StatusRejected(),
            flagged: t.Comment_StatusFlagged(),
        }[comment.moderation_status] ?? '';
    }

    if (!isMine(comment, currentAccountId)) {
        return '';
    }

    if (comment.moderation_status === 'pending') {
        return `${t.Comment_StatusMine()} · ${t.Comment_StatusPending()}`;
    }

    if (comment.moderation_status === 'rejected') {
        return `${t.Comment_StatusMine()} · ${t.Comment_StatusRejected()}`;
    }

    // D-191: раньше одобренный отзыв автор видел просто как «Ваш отзыв»,
    // и отличить его от ждущего проверки было нельзя — отсутствие
    // подписи читается как «статус неизвестен», а не как «всё хорошо».
    // Живой пользователь из-за этого решил, что его отзывы неделю
    // игнорируют, хотя все они были опубликованы.
    if (comment.moderation_status === 'approved') {
        return `${t.Comment_StatusMine()} · ${t.Comment_StatusApproved()}`;
    }

    return t.Comment_StatusMine();
};

/** Значения пагинатора, которые нужны вёрстке. */
interface PagerView {
    page: number;
    totalPages: number;
    total: number;
    loading: boolean;
    perPage: number;
}

/** `useCarburetor` отдаёт данные только для чтения, а модалке нужен изменяемый ConfirmState. */
type ConfirmView = ReturnType<ConfirmController['snapshot']>;

export class CommentsSection extends AntiHookComponent<CommentsSectionProps> {
    // Кэш params объявлен до pagination: контролёр сравнивает params по ссылке.
    private paramsCache: {entityType: 'expert'; entityId: number; value: Record<string, unknown>} | null = null;
    private readonly pagination = new PaginationController<Comment>({url: this.props.listUrl, params: this.cachedParams()});
    private readonly ui = new Carburetor<{body: string}>({body: ''});
    private readonly sending = new SupportSending();
    private readonly confirm = new ConfirmController();
    /*
     * Страница приходит заменой `items` целиком, а `setData` диффит замену до листьев:
     * подписка на маркер `items.~p` такого не видит, и карточки остаются с прежними
     * прокси. Снимок читает поля строк и меняет идентичность только вместе с
     * содержимым (RULES.md, «Подписки useCarburetor»).
     */
    private readonly rows = this.connectSelection(this.pagination, state => state.items);

    // Обёртки как в usePagination: его сторожа отличаются от сторожа контролёра.
    private readonly goToPage = (p: number) => {
        const {page, totalPages} = this.pagination.snapshot();
        if (p < 1 || p > totalPages || p === page) return;
        void this.pagination.fetchPage(p);
    };
    private readonly setPerPage = this.pagination.setPerPage;

    // Уборка вынесена в поле: ссылка на неё должна быть стабильной.
    private readonly disposePagination = () => this.pagination.dispose();

    /**
     * Один и тот же объект params, пока не сменилась пара entity_type/entity_id:
     * новый объект на каждый вызов `setParams` запускал бы лишний запрос.
     */
    private cachedParams(): Record<string, unknown> {
        const {entityType, entityId} = this.props;
        const cache = this.paramsCache;
        if (cache !== null && cache.entityType === entityType && cache.entityId === entityId) return cache.value;
        const value = {entity_type: entityType, entity_id: entityId};
        this.paramsCache = {entityType, entityId, value};
        return value;
    }

    protected override useEffects(): void {
        this.useEffect('pagination', () => {
            this.pagination.start();

            return this.disposePagination;
        }, []);

        this.useEffect('params', () => {
            this.pagination.setUrl(this.props.listUrl);
            this.pagination.setParams(this.cachedParams());
        }, [this.props.listUrl, this.props.entityType, this.props.entityId]);
    }

    private readonly changeBody = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        this.ui.setData({body: event.target.value});
    };

    private readonly submitOnShortcut = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey) || this.sending.snapshot().sending || !this.ui.getData().body.trim()) return;
        event.preventDefault();
        this.handleCreate();
    };

    private readonly handleCreate = () => {
        if (this.ui.getData().body.trim()) void this.sending.withSending(this.create);
    };

    private readonly create = async () => {
        // Страница запоминается до await: usePagination замыкал её по рендеру,
        // а чтение после await перенацеливало действие на новую страницу.
        const page = this.pagination.snapshot().page;
        const {body} = this.ui.getData();
        const {entityType, entityId, createUrl} = this.props;
        D('comments.create', {entityType, entityId, bodyLength: body.trim().length});
        const r = await sendPost<any, any>(createUrl, {
            entity_type: entityType,
            entity_id: entityId,
            body: body.trim(),
        });
        if (r?.comment) {
            D('comments.created', {commentId: r.comment.id});
            this.ui.setData({body: ''});
            // Отзыв уходит на проверку и на странице сразу не появляется.
            // Без этой строки человек видит, что его текста нет, и делает
            // единственный доступный вывод: отправка не сработала.
            showToast(t.Comment_SentForReview(), 'success');
            if (page === 1) void this.pagination.fetchPage(page); else void this.pagination.fetchPage(1);
        }
    };

    private readonly handleDelete = async (commentId: number) => {
        // Страница запоминается до await: usePagination замыкал её по рендеру,
        // а чтение после await перенацеливало действие на новую страницу.
        const page = this.pagination.snapshot().page;
        const {deleteUrl} = this.props;
        const ok = await this.confirm.confirm(t.Comment_DeleteConfirm());
        if (!ok) return;
        D('comments.delete', {commentId});
        try {
            const r = await sendPost<any, any>(deleteUrl, {id: commentId});
            if (r?.success) {
                D('comments.deleted', {commentId});
                void this.pagination.fetchPage(page);
            }
        } catch (err) {
            D('comments.error', {action: 'delete', commentId, error: err});
            showToast(t.General_Error(), 'danger');
        }
    };

    private renderPager(pager: PagerView, withSize: boolean) {
        const {page, totalPages, total, loading, perPage} = pager;
        if (totalPages <= 1) return null;
        const labels: PaginationLabels = {prev: t.Pagination_Prev(), next: t.Pagination_Next(), of: t.Pagination_Of(), items: t.Pagination_Items()};
        return (
            <div className="admin-support-form">
                <Pagination page={page} totalPages={totalPages} total={total} loading={loading} compact onPageChange={this.goToPage}
                    labels={labels} pageSize={withSize ? perPage : undefined} onPageSizeChange={withSize ? this.setPerPage : undefined} />
            </div>
        );
    }

    private renderList(items: readonly Comment[], loading: boolean) {
        const {currentAccountId, isModerator} = this.props;
        if (loading || items.length === 0) {
            return <div className="review-empty">{loading ? t.User_Loading() : t.Comment_NoComments()}</div>;
        }
        const cards: React.ReactNode[] = [];
        for (const comment of items) {
            cards.push(<CommentCard key={comment.id} comment={comment} statusLabel={statusLabel(comment, currentAccountId, isModerator)}
                canDelete={isMine(comment, currentAccountId) || isModerator} onDelete={this.handleDelete} />);
        }
        return <div className="review-list">{cards}</div>;
    }

    private renderForm(body: string, sending: boolean) {
        const {canCreate = true} = this.props;
        if (!canCreate) return null;
        return (
            <>
                <div className="review-notice" data-accent="true" data-test-id="comment-moderation-notice">{t.Comment_ModerationNotice()}</div>
                <div className="review-form">
                    <textarea data-test-id="comment-input" className="review-input" rows={2} aria-label={t.A11y_WriteComment()}
                        placeholder={t.Comment_Write() + CTRL_ENTER_HINT} value={body} onChange={this.changeBody} onKeyDown={this.submitOnShortcut} />
                    <div className="review-send">
                        <SendButton onClick={this.handleCreate} disabled={!body.trim()} sending={sending} label={t.Comment_Send()} testId="comment-submit-btn" />
                    </div>
                </div>
            </>
        );
    }

    render() {
        const {body} = this.useCarburetor(this.ui);
        const {page, perPage, totalPages, total, loading} = this.useCarburetor(this.pagination);
        const items = this.rows() as Comment[];
        const {sending} = this.useCarburetor(this.sending);
        const confirmState = this.useCarburetor(this.confirm) as ConfirmView;
        const {isModerator} = this.props;
        return (
            <div data-test-id="comments-section" className="review-section">
                <h3 className="review-heading">{t.Comment_Title()}</h3>
                {isModerator && <div className="review-notice" data-test-id="comments-moderator-notice">{t.Comment_ModeratorViewNotice()}</div>}
                {this.renderPager({page, totalPages, total, loading, perPage}, true)}
                {this.renderList(items, loading)}
                {this.renderPager({page, totalPages, total, loading, perPage}, false)}
                {this.renderForm(body, sending)}
                {/* Плоская копия: поле, прочитанное здесь, и есть подписка — прокси в state её не даёт. */}
                <ConfirmModal state={{...confirmState, items: [...confirmState.items]}} onConfirm={this.confirm.handleConfirm} onCancel={this.confirm.handleCancel} />
            </div>
        );
    }
}
