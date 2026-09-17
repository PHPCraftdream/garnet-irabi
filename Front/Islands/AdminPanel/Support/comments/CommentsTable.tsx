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

const CommentsTableHead: React.FC = () => (
    <thead>
        <tr className="border-b border-subtle">
            {COLUMNS.map((label, i) => <th key={i} className="text-left p-3">{label()}</th>)}
        </tr>
    </thead>
);

interface Props {
    items: AdminCommentRow[];
    onOpenBody: (row: AdminCommentRow) => void;
    onModerate: (row: AdminCommentRow, approve: boolean) => void;
    onFlag: (row: AdminCommentRow) => void;
    onToggleHidden: (row: AdminCommentRow, hide: boolean) => void;
}

export const CommentsTable: React.FC<Props> = ({items, ...handlers}) => (
    <div className="card">
        <div className="overflow-x-auto">
            <table className="admin-table">
                <CommentsTableHead />
                <tbody>
                    {items.map(row => <CommentTableRow key={row.id} row={row} {...handlers} />)}
                </tbody>
            </table>
        </div>
    </div>
);
