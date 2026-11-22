import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import {sendPost} from '@common/Api/Send/sendPost';
import {D} from '@common/Support/Debug/D';
import {useSending} from '@common/hooks/data/useSending';
import {CTRL_ENTER_HINT} from '@common/hooks/ui/useCtrlEnter';
import {useConfirm} from '@common/hooks/ui/useConfirm';
import SendButton from '@common/Components/Controls/SendButton';
import {ConfirmModal} from '@common/Components/Feedback/ConfirmModal';
import {usePagination} from '@common/hooks/data/usePagination';
import Pagination, {PaginationLabels} from '@common/Components/Layout/Paging/Pagination';

import {showToast} from '@common/Components/Feedback/GlobalToast';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {Comment} from './commentTypes';
import {CommentCard} from './CommentCard';

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

type Props = CommentsSectionProps & ReturnType<typeof useSending> & ReturnType<typeof useConfirm> & {
    pagination: ReturnType<typeof usePagination<Comment>>;
};

class CommentsView extends AntiHookComponent<Props> {
    private readonly ui = new Carburetor({body: ''});

    private readonly changeBody = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        this.ui.setData({body: event.target.value});
    };

    private readonly submitOnShortcut = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey) || this.props.sending || !this.ui.getData().body.trim()) return;
        event.preventDefault();
        this.handleCreate();
    };

    private readonly handleCreate = () => {
        if (this.ui.getData().body.trim()) void this.props.withSending(this.create);
    };

    private readonly create = async () => {
        const {body} = this.ui.getData();
        const {entityType, entityId, createUrl, pagination: {page, refresh, goToPage}} = this.props;
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
            if (page === 1) refresh(); else goToPage(1);
        }
    };

    private readonly handleDelete = async (commentId: number) => {
        const {confirm, deleteUrl, pagination: {refresh}} = this.props;
        const ok = await confirm(t.Comment_DeleteConfirm());
        if (!ok) return;
        D('comments.delete', {commentId});
        try {
            const r = await sendPost<any, any>(deleteUrl, {id: commentId});
            if (r?.success) {
                D('comments.deleted', {commentId});
                refresh();
            }
        } catch (err) {
            D('comments.error', {action: 'delete', commentId, error: err});
            showToast(t.General_Error(), 'danger');
        }
    };

    private renderPager(withSize: boolean) {
        const {page, totalPages, total, loading, goToPage, perPage, setPerPage} = this.props.pagination;
        if (totalPages <= 1) return null;
        const labels: PaginationLabels = {prev: t.Pagination_Prev(), next: t.Pagination_Next(), of: t.Pagination_Of(), items: t.Pagination_Items()};
        return (
            <div className="admin-support-form">
                <Pagination page={page} totalPages={totalPages} total={total} loading={loading} compact onPageChange={goToPage}
                    labels={labels} pageSize={withSize ? perPage : undefined} onPageSizeChange={withSize ? setPerPage : undefined} />
            </div>
        );
    }

    private renderList() {
        const {currentAccountId, isModerator, pagination: {items, loading}} = this.props;
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

    private renderForm(body: string) {
        const {canCreate = true, sending} = this.props;
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
        const {isModerator, confirmState, handleConfirm, handleCancel} = this.props;
        return (
            <div data-test-id="comments-section" className="review-section">
                <h3 className="review-heading">{t.Comment_Title()}</h3>
                {isModerator && <div className="review-notice" data-test-id="comments-moderator-notice">{t.Comment_ModeratorViewNotice()}</div>}
                {this.renderPager(true)}
                {this.renderList()}
                {this.renderPager(false)}
                {this.renderForm(body)}
                <ConfirmModal state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
            </div>
        );
    }
}

export function CommentsSection(props: CommentsSectionProps) {
    const {entityType, entityId, listUrl} = props;
    const params = React.useMemo(() => ({entity_type: entityType, entity_id: entityId}), [entityType, entityId]);
    const pagination = usePagination<Comment>({url: listUrl, params});
    const sending = useSending();
    const confirmation = useConfirm();
    return <CommentsView {...props} {...sending} {...confirmation} pagination={pagination} />;
}
