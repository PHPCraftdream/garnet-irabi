import * as React from 'react';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {UniversalBadge} from '../../../../Common/booking/StatusBadge';
import {AdminCommentRow} from './commentTypes';

/**
 * Состояние отзыва одной плашкой.
 *
 * Порядок веток важен: **сначала проверка, потом видимость.** Непроверенный
 * отзыв читателям не показан независимо от `is_hidden`, и подпись «виден» о
 * нём была бы ложью.
 */
export const CommentStatusCell: React.FC<{row: AdminCommentRow}> = ({row}) => {
    if (row.moderation_status === 'flagged') {
        return <UniversalBadge status="cancelled" label={t.Comment_StatusFlagged()} />;
    }
    if (row.moderation_status === 'pending') {
        return <UniversalBadge status="pending" label={t.Comment_StatusPending()} />;
    }
    if (row.moderation_status === 'rejected') {
        return <UniversalBadge status="cancelled" label={t.Comment_StatusRejected()} />;
    }
    if (row.is_hidden) {
        return <UniversalBadge status="cancelled" label={t.Comment_StatusHidden()} />;
    }

    return <UniversalBadge status="active" label={t.Comment_StatusVisible()} />;
};
