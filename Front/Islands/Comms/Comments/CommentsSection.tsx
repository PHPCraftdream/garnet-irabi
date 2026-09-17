import * as React from 'react';
import {useState, useMemo} from 'react';
import {sendPost} from '@common/Api/Send/sendPost';
import {D} from '@common/Support/Debug/D';
import {useSending} from '@common/hooks/data/useSending';
import {useCtrlEnter, CTRL_ENTER_HINT} from '@common/hooks/ui/useCtrlEnter';
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

export const CommentsSection: React.FC<CommentsSectionProps> = ({
    entityType,
    entityId,
    listUrl,
    createUrl,
    deleteUrl,
    currentAccountId,
    isModerator,
    canCreate = true,
}) => {
    const [body, setBody] = useState('');
    const {sending, withSending} = useSending();
    const {confirmState, confirm, handleConfirm: onConfirm, handleCancel: onCancel} = useConfirm();
    

    const extraParams = useMemo(() => ({entity_type: entityType, entity_id: entityId}), [entityType, entityId]);

    const {items: comments, page, totalPages, total, loading, goToPage, refresh, perPage, setPerPage} = usePagination<Comment>({
        url: listUrl,
        params: extraParams,
    });

    const paginationLabels: PaginationLabels = {
        prev: t.Pagination_Prev(),
        next: t.Pagination_Next(),
        of: t.Pagination_Of(),
        items: t.Pagination_Items(),
    };

    const handleCreate = () => {
        if (!body.trim()) return;
        withSending(async () => {
            D('comments.create', {entityType, entityId, bodyLength: body.trim().length});
            const r = await sendPost<any, any>(createUrl, {
                entity_type: entityType,
                entity_id: entityId,
                body: body.trim(),
            });
            if (r?.comment) {
                D('comments.created', {commentId: r.comment.id});
                setBody('');
                // Отзыв уходит на проверку и на странице сразу не появляется.
                // Без этой строки человек видит, что его текста нет, и делает
                // единственный доступный вывод: отправка не сработала.
                showToast(t.Comment_SentForReview(), 'success');
                if (page === 1) refresh(); else goToPage(1);
            }
        });
    };

    const handleDelete = async (commentId: number) => {
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

    // Свой отзыв узнаётся по `is_mine`, а не по author_id: для читателей
    // author_id обнулён, иначе анонимность держалась бы только на вёрстке.
    const isMine = (comment: Comment): boolean =>
        comment.is_mine ?? (comment.author_id > 0 && comment.author_id === currentAccountId);

    const canDelete = (comment: Comment): boolean => isMine(comment) || isModerator;

    /**
     * Подпись состояния — только автору и только когда есть что сказать.
     * Одобренный чужой отзыв никакой пометки не несёт: она бы намекала
     * читателю на то, чего он знать не должен.
     */
    const statusLabel = (comment: Comment): string => {
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

        if (!isMine(comment)) {
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

    return (
        <div data-test-id="comments-section" className="mt-6">
            <h3 className="mb-4">{t.Comment_Title()}</h3>

            {isModerator && (
                // D-119: a moderator sees every review here, approved or not —
                // without this, the page looks identical to what anyone else
                // sees, and a moderator reading it concludes hidden content is
                // leaking rather than realizing it's their own extended view.
                <div
                    className="text-sm p-3 mb-3 rounded-lg border border-default bg-surface-alt"
                    data-test-id="comments-moderator-notice"
                >
                    {t.Comment_ModeratorViewNotice()}
                </div>
            )}

            {totalPages > 1 && (
                <div className="mb-4">
                    <Pagination
                        page={page}
                        totalPages={totalPages}
                        total={total}
                        loading={loading}
                        compact
                        onPageChange={goToPage}
                        labels={paginationLabels}
                        pageSize={perPage}
                        onPageSizeChange={setPerPage}
                    />
                </div>
            )}

            {/* Comments list */}
            {loading ? (
                <div className="text-muted text-sm py-4">{t.User_Loading()}</div>
            ) : comments.length === 0 ? (
                <div className="text-muted text-sm py-4">{t.Comment_NoComments()}</div>
            ) : (
                <div className="comment-list">
                    {comments.map(comment => (
                        <CommentCard
                            key={comment.id}
                            comment={comment}
                            statusLabel={statusLabel(comment)}
                            canDelete={canDelete(comment)}
                            onDelete={handleDelete}
                        />
                    ))}
                </div>
            )}

            {totalPages > 1 && (
                <div className="mb-4">
                    <Pagination
                        page={page}
                        totalPages={totalPages}
                        total={total}
                        loading={loading}
                        compact
                        onPageChange={goToPage}
                        labels={paginationLabels}
                    />
                </div>
            )}

            {/* New comment form */}
            {canCreate && (
                // Обещание приватности подано как обещание, а не как сноска.
                //
                // Было набрано тем же `text-xs text-muted`, что и «Нет
                // комментариев» рядом, — user-3 заметила, что текст сливается с
                // служебной мелочью и его пролистывают не читая, хотя по
                // важности он выше баннера про часовой пояс, который подан
                // цветной плашкой с иконкой. Обещание, которого не прочли,
                // ничем не лучше отсутствующего.
                <div
                    className="text-sm p-3 mb-3 rounded-lg border border-accent bg-surface-alt"
                    data-test-id="comment-moderation-notice"
                >
                    {t.Comment_ModerationNotice()}
                </div>
            )}

            {canCreate && (
                <div className="comment-form">
                    <textarea
                        data-test-id="comment-input"
                        className="form-control flex-1 text-sm"
                        rows={2}
                        aria-label={t.A11y_WriteComment()}
                        placeholder={t.Comment_Write() + CTRL_ENTER_HINT}
                        value={body}
                        onChange={e => setBody(e.target.value)}
                        onKeyDown={useCtrlEnter(handleCreate, sending || !body.trim())}
                    />
                    <div className="self-end">
                        <SendButton
                            onClick={handleCreate}
                            disabled={!body.trim()}
                            sending={sending}
                            label={t.Comment_Send()}
                            testId="comment-submit-btn"
                        />
                    </div>
                </div>
            )}
            <ConfirmModal state={confirmState} onConfirm={onConfirm} onCancel={onCancel} />
            
        </div>
    );
};
