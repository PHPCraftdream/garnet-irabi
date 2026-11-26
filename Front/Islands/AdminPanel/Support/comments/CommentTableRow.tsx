import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {formatTs} from '@common/Utils/Time/DateUtils/format/formatTs';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import {EntityLink} from '@/Common/people/links/EntityLink';
import {userLinks} from '@/Common/people/links/userLinks';
import {AdminCommentRow, truncate} from './commentTypes';
import {COMMENT_BODY_TRUNC} from './commentBodyTrunc';
import {CommentAuthorCell} from './CommentAuthorCell';
import {CommentStatusCell} from './CommentStatusCell';

interface Handlers {
    onOpenBody: (row: AdminCommentRow) => void;
    onModerate: (row: AdminCommentRow, approve: boolean) => void;
    onFlag: (row: AdminCommentRow) => void;
    onToggleHidden: (row: AdminCommentRow, hide: boolean) => void;
}

export class CommentTableRow extends AntiHookComponent<{row: AdminCommentRow} & Handlers> {
    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
    private readonly approve = () => this.props.onModerate(this.props.row, true);
    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
    private readonly reject = () => this.props.onModerate(this.props.row, false);
    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
    private readonly flag = () => this.props.onFlag(this.props.row);
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly open = () => this.props.onOpenBody(this.props.row);
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly toggle = () => this.props.onToggleHidden(this.props.row, !this.props.row.is_hidden);

    /** Формирует представление данных для соответствующего раздела панели. */
    private renderModeration() {
        const {row} = this.props;
        return (
            <>
                {row.moderation_status !== 'approved' && (
                    <button
                        type="button"
                        className="admin-comment-approve"
                        onClick={this.approve}
                        data-test-id={`comment-approve-${row.id}`}
                    >
                        {t.Comment_Approve()}
                    </button>
                )}
                {row.moderation_status !== 'rejected' && (
                    <button
                        type="button"
                        className="slot-remove-btn" data-comment-action="offset"
                        onClick={this.reject}
                        data-test-id={`comment-reject-${row.id}`}
                    >
                        {t.Comment_Reject()}
                    </button>
                )}
                {row.moderation_status !== 'flagged' && (
                    <button
                        type="button"
                        className="slot-remove-btn" data-comment-action="offset"
                        onClick={this.flag}
                        data-test-id={`comment-flag-${row.id}`}
                    >
                        {t.Comment_Flag()}
                    </button>
                )}
            </>
        );
    }

    /** Формирует строку таблицы комментариев для просмотра и модерации. */
    private renderRow() {
        const {row} = this.props;
        return (
            <tr data-test-id={`comment-row-${row.id}`}>
                <td className="token-cell-time">{formatTs(row.created_at)}</td>
                <td className="token-cell"><CommentAuthorCell row={row} /></td>
                <td className="token-cell">
                    {row.entity_id > 0
                        ? <EntityLink
                            name={row.entity_name}
                            {...userLinks(row.entity_id, row.expert_has_profile)}
                            isModerator={true}
                        />
                        : <span className="token-cell-muted">—</span>}
                </td>
                <td className="token-cell">
                    <button type="button" className="admin-support-queue-link" onClick={this.open}
                        title={row.body} data-test-id={`comment-body-${row.id}`}>
                        {truncate(row.body, COMMENT_BODY_TRUNC)}
                    </button>
                </td>
                <td className="token-cell"><CommentStatusCell row={row} /></td>
                <td className="token-cell">{this.renderModeration()}</td>
                <td className="token-cell">
                    <button type="button" className="btn-outline-warning-full" data-token-action="compact"
                        onClick={this.toggle}
                        data-test-id={row.is_hidden ? `comment-unhide-${row.id}` : `comment-hide-${row.id}`}>
                        {row.is_hidden ? t.Comment_Unhide() : t.Comment_Hide()}
                    </button>
                </td>
            </tr>
        );
    }

    /** Формирует строку таблицы комментариев. */
    render() {
        return this.renderRow();
    }
}
