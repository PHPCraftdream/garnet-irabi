import * as React from 'react';
import {useState, useMemo} from 'react';
import {sendPost} from '@common/Api/sendPost';
import {D} from '@common/Debug/D';
import {formatTs} from '@common/Utils/DateUtils';
import {useSending} from '@common/hooks/useSending';
import {useCtrlEnter, CTRL_ENTER_HINT} from '@common/hooks/useCtrlEnter';
import {useConfirm} from '@common/hooks/useConfirm';
import SendButton from '@common/Components/SendButton';
import {ConfirmModal} from '@common/Components/ConfirmModal';
import {usePagination} from '@common/hooks/usePagination';
import Pagination, {PaginationLabels} from '@common/Components/Pagination';

import {showToast} from '@common/Components/GlobalToast';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {Comment} from './commentTypes';
import {UserLink} from '@common/Components/UserPreviewModal/UserLink';

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

    const canDelete = (comment: Comment): boolean => {
        return comment.author_id === currentAccountId || isModerator;
    };

    return (
        <div data-test-id="comments-section" className="mt-6">
            <h3 className="mb-4">{t.Comment_Title()}</h3>

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
                        <div
                            key={comment.id}
                            data-test-id={`comment-${comment.id}`}
                            className="comment-card"
                        >
                            <div className="comment-card-row">
                                <div className="flex-1">
                                    <div className="comment-author">
                                        {comment.author_id > 0 ? (
                                            <UserLink id={comment.author_id} name={comment.author_name || t.User_Anonymous()} />
                                        ) : (comment.author_name || t.User_Anonymous())}
                                    </div>
                                    <div className="comment-body">
                                        {comment.body}
                                    </div>
                                    <div className="comment-time">
                                        {formatTs(comment.created_at)}
                                    </div>
                                </div>
                                {canDelete(comment) && (
                                    <button
                                        type="button"
                                        data-test-id={`comment-delete-${comment.id}`}
                                        className="comment-delete-btn"
                                        onClick={() => handleDelete(comment.id)}
                                    >
                                        {t.Comment_Delete()}
                                    </button>
                                )}
                            </div>
                        </div>
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
