import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
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

export class CommentCard extends AntiHookComponent<Props> {
    private readonly remove = () => this.props.onDelete(this.props.comment.id);

    private renderContent() {
        const {comment, statusLabel} = this.props;
        return (
            <div className="review-content">
                <div className="review-author">
                    <CommentAuthor comment={comment} />
                    {statusLabel && <span className="review-status" data-test-id={`comment-status-${comment.id}`}>{statusLabel}</span>}
                </div>
                <div className="review-body">{comment.body}</div>
                <div className="review-time">{formatTs(comment.created_at)}</div>
            </div>
        );
    }

    render() {
        const {comment, canDelete} = this.props;
        return (
            <div data-test-id={`comment-${comment.id}`} className="review-card">
                <div className="review-row">
                    {this.renderContent()}
                    {canDelete && (
                        <button type="button" data-test-id={`comment-delete-${comment.id}`} className="review-delete" onClick={this.remove}>
                            {t.Comment_Delete()}
                        </button>
                    )}
                </div>
            </div>
        );
    }
}
