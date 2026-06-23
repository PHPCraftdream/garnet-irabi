import * as React from 'react';
import {useMemo} from 'react';
import {ProposedSlot, ExistingItem} from '../types';
import {DurationSelect} from '@common/Components/DurationSelect';
import {DateInput} from '@common/Components/ui/DateInput';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {IGarnetWindow} from '@common/Models';

const w: IGarnetWindow = window as IGarnetWindow;

const WEEKDAY_KEYS = () => [t.Cal_Sun(), t.Cal_Mon(), t.Cal_Tue(), t.Cal_Wed(), t.Cal_Thu(), t.Cal_Fri(), t.Cal_Sat()];

function getLocale(): string {
    const lang = (w.__GARNET_UI_LANG__ || 'RU').toUpperCase();
    return lang === 'RU' ? 'ru' : 'en';
}

function getWeekdayName(dateStr: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    const dow = d.getDay();
    return WEEKDAY_KEYS()[dow] || '';
}

function formatHebrewDate(dateStr: string): string {
    if (!dateStr) return '';
    const locale = getLocale();
    try {
        const d = new Date(dateStr + 'T12:00:00');
        const fmt = new Intl.DateTimeFormat(locale, {
            calendar: 'hebrew',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        });
        return fmt.format(d);
    } catch {
        return '';
    }
}

interface Props {
    slots: ProposedSlot[];
    startDate: string;
    endDate: string;
    hasOverlap: (date: string, time: string, duration: number) => boolean;
    hasProposedOverlap: (date: string, time: string, duration: number, excludeIndex: number) => boolean;
    getDayItems: (date: string) => ExistingItem[];
    onDateChange: (index: number, date: string) => void;
    onTimeChange: (index: number, time: string) => void;
    onDurationChange: (index: number, duration: number) => void;
    onRemove: (index: number) => void;
}

function formatExistingItem(item: ExistingItem): string {
    return `${item.time} ${t.Slot_Label()} (${item.duration_min} ${t.Slot_Duration_Min()})`;
}

function isDateInPast(date: string, time: string): boolean {
    const now = new Date();
    const slotDate = new Date(date + 'T' + (time || '00:00'));
    return slotDate < now;
}

function isDateInRange(date: string, startDate: string, endDate: string): boolean {
    if (!startDate || !endDate || !date) return true;
    return date >= startDate && date <= endDate;
}

export const BatchPreviewTable: React.FC<Props> = ({slots, startDate, endDate, hasOverlap, hasProposedOverlap, getDayItems, onDateChange, onTimeChange, onDurationChange, onRemove}) => {
    const hebrewDates = useMemo(() => {
        const map: Record<string, string> = {};
        for (const s of slots) {
            if (s.date && !map[s.date]) {
                map[s.date] = formatHebrewDate(s.date);
            }
        }
        return map;
    }, [slots]);

    return (
        <table id="proposedTable" className="table table-sm table-bordered mb-3">
            <thead>
                <tr>
                    <th>{t.Slot_Date()}</th>
                    <th>{t.Batch_HebrewDate()}</th>
                    <th>{t.Slot_Time()}</th>
                    <th>{t.Slot_Duration()}</th>
                    <th>{t.Slots_Calendar()}</th>
                    <th></th>
                </tr>
            </thead>
            <tbody id="proposedBody">
                {slots.map((s, i) => {
                    const existingOverlap = hasOverlap(s.date, s.time, s.duration);
                    const proposedOverlap = hasProposedOverlap(s.date, s.time, s.duration, i);
                    const overlap = existingOverlap || proposedOverlap;
                    const pastDate = isDateInPast(s.date, s.time);
                    const outOfRange = !isDateInRange(s.date, startDate, endDate);
                    const dayItems = getDayItems(s.date);
                    const hasWarning = overlap || pastDate || outOfRange;
                    return (
                        <tr key={`${s.date}-${i}`} data-index={i} className={hasWarning ? 'table-warning' : ''}>
                            <td>
                                <span className="text-muted text-xs mr-1">{getWeekdayName(s.date)}</span>
                                <DateInput
                                    className="form-control-sm inline-block"
                                    value={s.date}
                                    min={startDate}
                                    max={endDate}
                                    data-index={i}
                                    onChange={e => onDateChange(i, e.target.value)}
                                />
                            </td>
                            <td>{hebrewDates[s.date] || ''}</td>
                            <td>
                                <DateInput
                                    type="time"
                                    className="form-control-sm slot-time-input"
                                    value={s.time}
                                    data-index={i}
                                    onChange={e => onTimeChange(i, e.target.value)}
                                />
                            </td>
                            <td>
                                <DurationSelect
                                    value={s.duration}
                                    onChange={v => onDurationChange(i, v)}
                                    className="form-select form-select-sm slot-duration-select"
                                />
                            </td>
                            <td>
                                {dayItems.map((item, di) => (
                                    <span key={di} className="badge bg-secondary mr-1 mb-1" style={{fontSize: '0.7rem'}}>
                                        {formatExistingItem(item)}
                                    </span>
                                ))}
                            </td>
                            <td>
                                {existingOverlap && (
                                    <span className="badge status-warning mr-1" title={t.Batch_Overlap()}>&#9888;</span>
                                )}
                                {proposedOverlap && (
                                    <span className="badge status-warning mr-1" title={t.Batch_ProposedOverlap()}>&#9888;</span>
                                )}
                                {outOfRange && (
                                    <span className="badge status-warning mr-1" title={t.Batch_DateOutOfRange()}>&#9888;</span>
                                )}
                                {pastDate && (
                                    <span className="badge status-warning mr-1" title={t.Batch_PastDate()}>&#9888;</span>
                                )}
                                <button type="button" className="btn btn-sm btn-outline-danger slot-remove-btn" title={t.Action_Remove()} data-index={i} onClick={() => onRemove(i)}>&times;</button>
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
};
