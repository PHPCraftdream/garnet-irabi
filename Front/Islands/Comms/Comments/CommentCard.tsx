import * as React from 'react';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {UserLink} from '@common/Components/UserPreviewModal/UserLink';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {Comment} from './commentTypes';

interface Props {
    comment: Comment;
    /** Подпись состояния — пустая, когда сказать нечего. */
    statusLabel: string;
    canDelete: boolean;
    onDelete: (commentId: number) => void;
}

/**
 * Автор отзыва — или его отсутствие на экране.
 *
 * `author_id` приходит нулём для всех читателей: анонимность держится на
 * сервере, а не на вёрстке. Условие нельзя «упростить» до проверки имени —
 * тогда имя, случайно попавшее в ответ, немедленно окажется на экране.
 */
const CommentAuthor: React.FC<{comment: Comment}> = ({comment}) => {
    if (comment.author_id > 0) {
        return <UserLink id={comment.author_id} name={comment.author_name || t.User_Anonymous()} />;
    }

    return <>{comment.author_name || t.User_Anonymous()}</>;
};

export const CommentCard: React.FC<Props> = ({comment, statusLabel, canDelete, onDelete}) => (
    <div data-test-id={`comment-${comment.id}`} className="comment-card">
        <div className="comment-card-row">
            <div className="flex-1">
                <div className="comment-author">
                    <CommentAuthor comment={comment} />
                    {statusLabel && (
                        <span className="text-xs text-muted ml-2" data-test-id={`comment-status-${comment.id}`}>
                            {statusLabel}
                        </span>
                    )}
                </div>
                <div className="comment-body">{comment.body}</div>
                <div className="comment-time">{formatTs(comment.created_at)}</div>
            </div>
            {canDelete && (
                <button
                    type="button"
                    data-test-id={`comment-delete-${comment.id}`}
                    className="comment-delete-btn"
                    onClick={() => onDelete(comment.id)}
                >
                    {t.Comment_Delete()}
                </button>
            )}
        </div>
    </div>
);
