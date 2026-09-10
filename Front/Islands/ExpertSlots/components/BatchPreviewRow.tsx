import * as React from 'react';
import {DateInput} from '@common/Components/ui/DateInput';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {DurationSelect} from '@common/Components/DurationSelect';
import {ExistingItem, ProposedSlot} from '../types';

export interface RowWarnings {
    existingOverlap: boolean;
    proposedOverlap: boolean;
    outOfRange: boolean;
    pastDate: boolean;
}

/**
 * Значки предупреждений.
 *
 * Их четыре, и они разные: пересечение с уже созданным занятием, пересечение с
 * другой строкой этой же партии, дата вне выбранного периода и дата в прошлом.
 * Один общий значок «что-то не так» заставлял бы гадать, что именно.
 */
const Warnings: React.FC<RowWarnings> = ({existingOverlap, proposedOverlap, outOfRange, pastDate}) => (
    <>
        {existingOverlap && <span className="badge status-warning mr-1" title={t.Batch_Overlap()}>&#9888;</span>}
        {proposedOverlap && <span className="badge status-warning mr-1" title={t.Batch_ProposedOverlap()}>&#9888;</span>}
        {outOfRange && <span className="badge status-warning mr-1" title={t.Batch_DateOutOfRange()}>&#9888;</span>}
        {pastDate && <span className="badge status-warning mr-1" title={t.Batch_PastDate()}>&#9888;</span>}
    </>
);

const DayItems: React.FC<{items: ExistingItem[]; format: (item: ExistingItem) => string}> = ({items, format}) => (
    <>
        {items.map(item => (
            <span
                key={`${item.time}-${item.duration_min}`}
                className="badge bg-secondary mr-1 mb-1"
                style={{fontSize: '0.7rem'}}
            >
                {format(item)}
            </span>
        ))}
    </>
);

interface Props {
    slot: ProposedSlot;
    index: number;
    weekday: string;
    hebrewDate: string;
    startDate: string;
    endDate: string;
    dayItems: ExistingItem[];
    warnings: RowWarnings;
    formatExistingItem: (item: ExistingItem) => string;
    onDateChange: (index: number, value: string) => void;
    onTimeChange: (index: number, value: string) => void;
    onDurationChange: (index: number, value: number) => void;
    onRemove: (index: number) => void;
}

/** Одна предлагаемая строка в партии создаваемых занятий. */
export const BatchPreviewRow: React.FC<Props> = ({
    slot,
    index,
    weekday,
    hebrewDate,
    startDate,
    endDate,
    dayItems,
    warnings,
    formatExistingItem,
    onDateChange,
    onTimeChange,
    onDurationChange,
    onRemove,
}) => {
    const hasWarning = warnings.existingOverlap || warnings.proposedOverlap || warnings.outOfRange || warnings.pastDate;

    return (
        <tr data-index={index} className={hasWarning ? 'table-warning' : ''}>
            <td>
                <span className="text-muted text-xs mr-1">{weekday}</span>
                <DateInput
                    className="form-control-sm inline-block"
                    value={slot.date}
                    min={startDate}
                    max={endDate}
                    data-index={index}
                    onChange={e => onDateChange(index, e.target.value)}
                />
            </td>
            <td>{hebrewDate}</td>
            <td>
                <DateInput
                    type="time"
                    className="form-control-sm slot-time-input"
                    value={slot.time}
                    data-index={index}
                    onChange={e => onTimeChange(index, e.target.value)}
                />
            </td>
            <td>
                <DurationSelect
                    value={slot.duration}
                    onChange={v => onDurationChange(index, v)}
                    className="form-select form-select-sm slot-duration-select"
                />
            </td>
            <td><DayItems items={dayItems} format={formatExistingItem} /></td>
            <td>
                <Warnings {...warnings} />
                <button
                    type="button"
                    className="btn btn-sm btn-outline-danger slot-remove-btn"
                    title={t.Action_Remove()}
                    data-index={index}
                    onClick={() => onRemove(index)}
                >
                    &times;
                </button>
            </td>
        </tr>
    );
};
