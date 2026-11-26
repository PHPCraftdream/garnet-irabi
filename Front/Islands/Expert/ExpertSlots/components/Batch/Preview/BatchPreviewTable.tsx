import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {ProposedSlot, ExistingItem} from '@/Islands/Expert/ExpertSlots/types';
import {BatchPreviewRow} from './BatchPreviewRow';
import {findExistingOverlap} from './findExistingOverlap';
import {findProposedOverlap} from '@/Islands/Expert/ExpertSlots/components/Batch/logic/findProposedOverlap';
import {isDateInPast} from '@/Islands/Expert/ExpertSlots/components/Batch/logic/isDateInPast';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import {IGarnetWindow} from '@common/Support/Models';

const w: IGarnetWindow = window as IGarnetWindow;

const WEEKDAY_KEYS = () => [t.Cal_Sun(), t.Cal_Mon(), t.Cal_Tue(), t.Cal_Wed(), t.Cal_Thu(), t.Cal_Fri(), t.Cal_Sat()];

/** Получить или вычислить соответствующие данные. */
function getLocale(): string {
    const lang = (w.__GARNET_UI_LANG__ || 'RU').toUpperCase();
    return lang === 'RU' ? 'ru' : 'en';
}

/** Получить или вычислить соответствующие данные. */
function getWeekdayName(dateStr: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    const dow = d.getDay();
    return WEEKDAY_KEYS()[dow] || '';
}

/** Получить или вычислить соответствующие данные. */
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

        // D-219: for calendars without a "no era" convention (Hebrew among
        // them), Intl always appends one — "AM" (Anno Mundi) plus its lead-in
        // separator (e.g. "г. " in ru) — even though `era` was never
        // requested. Drop the era part and the literal glueing it to the
        // year rather than trust `.format()`'s string.
        const parts = fmt.formatToParts(d);
        let result = '';

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (part.type === 'era') continue;
            if (part.type === 'literal' && parts[i + 1]?.type === 'era') continue;
            result += part.value;
        }

        return result.trim();
    } catch {
        return '';
    }
}

interface Props {
    slots: readonly ProposedSlot[];
    existingSlots: readonly ExistingItem[];
    startDate: string;
    endDate: string;
    onDateChange: (index: number, date: string) => void;
    onTimeChange: (index: number, time: string) => void;
    onDurationChange: (index: number, duration: number) => void;
    onRemove: (index: number) => void;
}

/** Получить или вычислить соответствующие данные. */
function formatExistingItem(item: ExistingItem): string {
    return `${item.time} ${t.Slot_Label()} (${item.duration_min} ${t.Slot_Duration_Min()})`;
}

/** Получить или вычислить соответствующие данные. */
function isDateInRange(date: string, startDate: string, endDate: string): boolean {
    if (!startDate || !endDate || !date) return true;
    return date >= startDate && date <= endDate;
}

/** Получить или вычислить соответствующие данные. */
function dayItemsForDate(slots: readonly ExistingItem[], date: string): ExistingItem[] {
    return slots.filter(slot => slot.date === date);
}

export class BatchPreviewTable extends AntiHookComponent<Props> {
    private cachedSlots?: readonly ProposedSlot[];
    private hebrewDates: Record<string, string> = {};

    /** Обработать соответствующее действие пользователя. */
    shouldComponentUpdate(nextProps: Readonly<Props>, nextState: typeof this.state): boolean {
        // Сохраняем пересчёт предупреждений при рендере родителя.
        return super.shouldComponentUpdate(nextProps, nextState) || this.props !== nextProps;
    }

    /** Получить или вычислить соответствующие данные. */
    private getHebrewDates(slots: readonly ProposedSlot[]): Record<string, string> {
        if (slots === this.cachedSlots) return this.hebrewDates;
        const dates: Record<string, string> = {};
        for (const {date} of slots) {
            if (date && !dates[date]) dates[date] = formatHebrewDate(date);
        }
        this.cachedSlots = slots;
        this.hebrewDates = dates;
        return dates;
    }

    /** Отобразить соответствующую часть интерфейса. */
    private renderRows() {
        const rows: React.ReactNode[] = [];
        const {slots, existingSlots, startDate, endDate} = this.props;
        const {onDateChange, onTimeChange, onDurationChange, onRemove} = this.props;
        const hebrewDates = this.getHebrewDates(slots);
        for (const [index, slot] of slots.entries()) {
            const {date, time, duration} = slot;
            rows.push(
                <BatchPreviewRow
                    key={slot.id}
                    slot={slot}
                    index={index}
                    weekday={getWeekdayName(date)}
                    hebrewDate={hebrewDates[date] || ''}
                    startDate={startDate}
                    endDate={endDate}
                    dayItems={dayItemsForDate(existingSlots, date)}
                    warnings={{
                        existingOverlap: findExistingOverlap(existingSlots, date, time, duration),
                        proposedOverlap: findProposedOverlap(slots, date, time, duration, index),
                        outOfRange: !isDateInRange(date, startDate, endDate),
                        pastDate: isDateInPast(date, time),
                    }}
                    formatExistingItem={formatExistingItem}
                    onDateChange={onDateChange}
                    onTimeChange={onTimeChange}
                    onDurationChange={onDurationChange}
                    onRemove={onRemove}
                />
            );
        }
        return rows;
    }

    /** Отобразить соответствующую часть интерфейса. */
    render() {
        return (
            <table id="proposedTable" className="batch-preview-table">
                <thead>
                    <tr>
                        <th className="batch-preview-heading">{t.Slot_Date()}</th>
                        <th className="batch-preview-heading">{t.Batch_HebrewDate()}</th>
                        <th className="batch-preview-heading">{t.Slot_Time()}</th>
                        <th className="batch-preview-heading">{t.Slot_Duration()}</th>
                        <th className="batch-preview-heading">{t.Slots_Calendar()}</th>
                        <th className="batch-preview-heading"></th>
                    </tr>
                </thead>
                <tbody id="proposedBody">{this.renderRows()}</tbody>
            </table>
        );
    }
}
