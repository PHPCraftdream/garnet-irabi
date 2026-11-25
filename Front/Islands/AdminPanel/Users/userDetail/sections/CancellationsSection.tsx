import * as React from 'react';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {DetailTable} from '../DetailTable';
import {PersonCell} from '../PersonCell';

const admin_Cancel_Date = t.Admin_Cancel_Date;
const admin_Cancel_Reason = t.Admin_Cancel_Reason;
const admin_Cancel_SlotTime = t.Admin_Cancel_SlotTime;

/**
 * Отмены — одна таблица на два случая.
 *
 * Отмены учеником и отмены преподавателем отличались только тем, чьё имя
 * стоит во втором столбце и как он подписан; вёрстка была написана дважды.
 */
export interface CancellationItem {
    id: number;
    created_at: number;
    slot_start_at: number | null;
    reason: string;
    /** Другая сторона: у отмен ученика это преподаватель, и наоборот. */
    counterpartId?: number | null;
    counterpartName?: string | null;
}

interface Props {
    title: string;
    counterpartColumn: string;
    count: number;
    items: CancellationItem[];
    spacing?: 'after';
    onOpenUser: (id: number, name: string) => void;
}

const CancellationTr: React.FC<{item: CancellationItem; onOpenUser: Props['onOpenUser']}> = ({item, onOpenUser}) => (
    <tr className="admin-user-history-row">
        <td className="admin-user-history-cell-time">{formatTs(item.created_at)}</td>
        <td className="admin-user-history-cell"><PersonCell id={item.counterpartId}
        name={item.counterpartName} onOpen={onOpenUser} /></td>
        <td className="admin-user-history-cell-time">{item.slot_start_at ? formatTs(item.slot_start_at) : '—'}</td>
        <td className="admin-user-history-cell-context">{item.reason || '—'}</td>
    </tr>
);

/** Отображает данные раздела и передаёт действия пользователя обработчикам. */
export const CancellationsSection: React.FC<Props> = ({title, counterpartColumn, count, items, spacing,
        onOpenUser}) => {
    if (items.length === 0) return null;

    const rows: React.ReactNode[] = [];
    for (const item of items) rows.push(<CancellationTr key={item.id} item={item} onOpenUser={onOpenUser} />);

    return (
        <DetailTable
            title={title}
            count={count}
            spacing={spacing}
            columns={[admin_Cancel_Date(), counterpartColumn, admin_Cancel_SlotTime(), admin_Cancel_Reason()]}
        >
            {rows}
        </DetailTable>
    );
};
