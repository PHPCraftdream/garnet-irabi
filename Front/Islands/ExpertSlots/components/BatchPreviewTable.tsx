import * as React from 'react';
import {useMemo} from 'react';
import {ProposedSlot, ExistingItem} from '../types';
import {BatchPreviewRow} from './BatchPreviewRow';
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
                {slots.map((s, i) => (
                    <BatchPreviewRow
                        key={s.id}
                        slot={s}
                        index={i}
                        weekday={getWeekdayName(s.date)}
                        hebrewDate={hebrewDates[s.date] || ''}
                        startDate={startDate}
                        endDate={endDate}
                        dayItems={getDayItems(s.date)}
                        warnings={{
                            existingOverlap: hasOverlap(s.date, s.time, s.duration),
                            proposedOverlap: hasProposedOverlap(s.date, s.time, s.duration, i),
                            outOfRange: !isDateInRange(s.date, startDate, endDate),
                            pastDate: isDateInPast(s.date, s.time),
                        }}
                        formatExistingItem={formatExistingItem}
                        onDateChange={onDateChange}
                        onTimeChange={onTimeChange}
                        onDurationChange={onDurationChange}
                        onRemove={onRemove}
                    />
                ))}
            </tbody>
        </table>
    );
};
