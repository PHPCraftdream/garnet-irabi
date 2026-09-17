import * as React from 'react';
import {formatTs} from '@common/Utils/DateUtils';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {EntityLink, userLinks} from '../../../Common/people/EntityLinks';
import {AdminCommentRow, COMMENT_BODY_TRUNC, truncate} from './commentTypes';
import {CommentAuthorCell} from './CommentAuthorCell';
import {CommentStatusCell} from './CommentStatusCell';

interface Handlers {
    onOpenBody: (row: AdminCommentRow) => void;
    onModerate: (row: AdminCommentRow, approve: boolean) => void;
    onFlag: (row: AdminCommentRow) => void;
    onToggleHidden: (row: AdminCommentRow, hide: boolean) => void;
}

const ModerationCell: React.FC<{row: AdminCommentRow} & Pick<Handlers, 'onModerate' | 'onFlag'>> = ({row, onModerate, onFlag}) => (
    <>
        {row.moderation_status !== 'approved' && (
            <button
                type="button"
                className="btn btn-sm btn-outline-success"
                onClick={() => onModerate(row, true)}
                data-test-id={`comment-approve-${row.id}`}
            >
                {t.Comment_Approve()}
            </button>
        )}
        {row.moderation_status !== 'rejected' && (
            <button
                type="button"
                className="btn btn-sm btn-outline-danger ml-2"
                onClick={() => onModerate(row, false)}
                data-test-id={`comment-reject-${row.id}`}
            >
                {t.Comment_Reject()}
            </button>
        )}
        {row.moderation_status !== 'flagged' && (
            <button
                type="button"
                className="btn btn-sm btn-outline-danger ml-2"
                onClick={() => onFlag(row)}
                data-test-id={`comment-flag-${row.id}`}
            >
                {t.Comment_Flag()}
            </button>
        )}
    </>
);

const VisibilityCell: React.FC<{row: AdminCommentRow} & Pick<Handlers, 'onToggleHidden'>> = ({row, onToggleHidden}) => (
    <button
        type="button"
        className="btn btn-sm btn-outline-warning"
        onClick={() => onToggleHidden(row, !row.is_hidden)}
        data-test-id={row.is_hidden ? `comment-unhide-${row.id}` : `comment-hide-${row.id}`}
    >
        {row.is_hidden ? t.Comment_Unhide() : t.Comment_Hide()}
    </button>
);

export const CommentTableRow: React.FC<{row: AdminCommentRow} & Handlers> = ({
    row,
    onOpenBody,
    onModerate,
    onFlag,
    onToggleHidden,
}) => (
    <tr className="border-b border-subtle" data-test-id={`comment-row-${row.id}`}>
        <td className="p-3 whitespace-nowrap text-muted text-xs">{formatTs(row.created_at)}</td>
        <td className="p-3"><CommentAuthorCell row={row} /></td>
        <td className="p-3">
            {row.entity_id > 0
                ? <EntityLink name={row.entity_name} {...userLinks(row.entity_id, row.expert_has_profile)} isModerator={true} />
                : <span className="text-muted">—</span>}
        </td>
        <td className="p-3">
            <button
                type="button"
                className="common-link text-left"
                onClick={() => onOpenBody(row)}
                title={row.body}
                data-test-id={`comment-body-${row.id}`}
            >
                {truncate(row.body, COMMENT_BODY_TRUNC)}
            </button>
        </td>
        <td className="p-3"><CommentStatusCell row={row} /></td>
        <td className="p-3"><ModerationCell row={row} onModerate={onModerate} onFlag={onFlag} /></td>
        <td className="p-3"><VisibilityCell row={row} onToggleHidden={onToggleHidden} /></td>
    </tr>
);
