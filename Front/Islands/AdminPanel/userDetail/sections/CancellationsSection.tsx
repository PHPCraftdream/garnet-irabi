import * as React from 'react';
import {formatTs} from '@common/Utils/DateUtils';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {DetailTable} from '../DetailTable';
import {PersonCell} from '../PersonCell';

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
    className?: string;
    onOpenUser: (id: number, name: string) => void;
}

const CancellationTr: React.FC<{item: CancellationItem; onOpenUser: Props['onOpenUser']}> = ({item, onOpenUser}) => (
    <tr>
        <td className="admin-cell-date">{formatTs(item.created_at)}</td>
        <td><PersonCell id={item.counterpartId} name={item.counterpartName} onOpen={onOpenUser} /></td>
        <td className="admin-cell-date">{item.slot_start_at ? formatTs(item.slot_start_at) : '—'}</td>
        <td className="text-sm">{item.reason || '—'}</td>
    </tr>
);

export const CancellationsSection: React.FC<Props> = ({title, counterpartColumn, count, items, className, onOpenUser}) => {
    if (items.length === 0) return null;

    return (
        <DetailTable
            title={title}
            count={count}
            className={className}
            columns={[t.Admin_Cancel_Date(), counterpartColumn, t.Admin_Cancel_SlotTime(), t.Admin_Cancel_Reason()]}
        >
            {items.map(item => <CancellationTr key={item.id} item={item} onOpenUser={onOpenUser} />)}
        </DetailTable>
    );
};
