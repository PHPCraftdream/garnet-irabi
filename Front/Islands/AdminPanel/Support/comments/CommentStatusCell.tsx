import * as React from 'react';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {UniversalBadge} from '../../../../Common/booking/status/StatusBadge';
import {AdminCommentRow} from './commentTypes';

const comment_StatusFlagged = t.Comment_StatusFlagged;
const comment_StatusHidden = t.Comment_StatusHidden;
const comment_StatusPending = t.Comment_StatusPending;
const comment_StatusRejected = t.Comment_StatusRejected;
const comment_StatusVisible = t.Comment_StatusVisible;

/**
 * Состояние отзыва одной плашкой.
 *
 * Порядок веток важен: **сначала проверка, потом видимость.** Непроверенный
 * отзыв читателям не показан независимо от `is_hidden`, и подпись «виден» о
 * нём была бы ложью.
 */
export const CommentStatusCell: React.FC<{row: AdminCommentRow}> = ({row}) => {
    if (row.moderation_status === 'flagged') {
        return <UniversalBadge status="cancelled" label={comment_StatusFlagged()} />;
    }
    if (row.moderation_status === 'pending') {
        return <UniversalBadge status="pending" label={comment_StatusPending()} />;
    }
    if (row.moderation_status === 'rejected') {
        return <UniversalBadge status="cancelled" label={comment_StatusRejected()} />;
    }
    if (row.is_hidden) {
        return <UniversalBadge status="cancelled" label={comment_StatusHidden()} />;
    }

    return <UniversalBadge status="active" label={comment_StatusVisible()} />;
};
