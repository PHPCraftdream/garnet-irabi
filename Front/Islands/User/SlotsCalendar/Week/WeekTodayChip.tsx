import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';

const slotsToday = t.Slots_Today;

interface WeekTodayChipProps {
    weekStartUnix: number;
    weekEndUnix: number;
    onToday: () => void;
}

/** Отображает переход к текущей неделе. */
export class WeekTodayChip extends AntiHookComponent<WeekTodayChipProps> {
    /** Формирует кнопку перехода к текущей неделе. */
    render() {
        const {weekStartUnix, weekEndUnix, onToday} = this.props;
        const nowSec = Math.floor(Date.now() / 1000);
        const isCurrentWeek = nowSec >= weekStartUnix && nowSec < weekEndUnix;
        if (isCurrentWeek) return null;

        return (
            <button
                className="slot-filter-chip"
                onClick={onToday}
                title={slotsToday()}
                data-test-id="week-today"
            >
                {slotsToday()}
            </button>
        );
    }
}
