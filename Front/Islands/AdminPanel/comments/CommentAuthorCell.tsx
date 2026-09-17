import * as React from 'react';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {EntityLink, userLinks} from '../../../Common/people/EntityLinks';
import {AdminCommentRow} from './commentTypes';

/**
 * Автор отзыва — или отсутствие автора на экране.
 *
 * Модерация слепая: имя приходит только владельцу платформы и только у
 * отзывов, помеченных как опасные. В остальных случаях здесь стоит «Аноним» с
 * пояснением, а **не прочерк**: прочерк читается как «автора нет», а он есть,
 * просто его не показывают.
 *
 * Условие менять нельзя без понимания, что за ним стоит: это единственное
 * место, где решается, увидит ли модератор имя человека, который написал
 * отзыв о своём преподавателе.
 */
export const CommentAuthorCell: React.FC<{row: AdminCommentRow}> = ({row}) => {
    if (row.author_id > 0 && row.author_name !== '') {
        return <EntityLink name={row.author_name} {...userLinks(row.author_id, false)} isModerator={true} />;
    }

    return (
        <span className="text-muted" title={t.Comment_AuthorHiddenHint()} data-test-id={`comment-author-hidden-${row.id}`}>
            {t.Comment_AuthorHidden()}
        </span>
    );
};
