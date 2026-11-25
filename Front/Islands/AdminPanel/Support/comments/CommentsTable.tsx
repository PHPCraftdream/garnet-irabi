import * as React from 'react';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {AdminCommentRow} from './commentTypes';
import {CommentTableRow} from './CommentTableRow';

const COLUMNS = [
    () => t.Admin_Booking_Created(),
    () => t.Comment_Author(),
    () => t.Comment_Expert(),
    () => t.Comment_Body(),
    () => t.Comment_Status(),
    () => t.Comment_Moderation(),
    () => t.Comment_Actions(),
];

    /** Формирует представление данных для соответствующего раздела панели. */
function renderHeading(label: () => string, index: number) {
    return <th key={index} className="admin-grid-heading">{label()}</th>;
}

    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
function CommentsTableHead() {
    return <thead><tr>{COLUMNS.map(renderHeading)}</tr></thead>;
}

interface Props {
    items: readonly AdminCommentRow[];
    onOpenBody: (row: AdminCommentRow) => void;
    onModerate: (row: AdminCommentRow, approve: boolean) => void;
    onFlag: (row: AdminCommentRow) => void;
    onToggleHidden: (row: AdminCommentRow, hide: boolean) => void;
}

    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
export function CommentsTable({items, ...handlers}: Props) {
    const rows: React.ReactNode[] = [];
    for (const row of items) rows.push(<CommentTableRow key={row.id} row={row} {...handlers} />);
    return (
        <div className="booking-card-shell">
            <div className="token-table-scroll">
                <table className="admin-table">
                    <CommentsTableHead />
                    <tbody>{rows}</tbody>
                </table>
            </div>
        </div>
    );
}
