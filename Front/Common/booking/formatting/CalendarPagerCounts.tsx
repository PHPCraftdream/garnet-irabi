import * as React from 'react';

export type PagerCountKind = 'free' | 'pending' | 'booked' | 'mine' | 'completed';

/** One coloured count chip in a calendar pager (e.g. "3 Свободные"). */
export interface PagerCountItem {
    key: string;
    count: number;
    label: string;
    kind: PagerCountKind;
}

/**
 * Count chips shown next to a calendar pager arrow — one per non-zero kind, each
 * a coloured pill with the number and a label. Tells the viewer, at a glance,
 * how many (and what kind of) slots sit in the weeks beyond the current window,
 * so they know whether paging that way is worth it. Shared by the expert slot
 * calendar and the public slots calendar.
 */
/**
 * `activeKey` — какой вид подсвечен активным фильтром списка (напр. "free").
 * Без него, отфильтровав «Свободен», человек видел рядом со стрелкой все 4
 * вида вперемешку и не понимал, какое число относится к его фильтру
 * (нашли expert-2/user-7: счётчик есть, карточки не находятся ни в одной
 * ближайшей неделе). Остальные виды не убираем — они всё ещё говорят,
 * есть ли смысл листать вообще, — просто приглушаем.
 */
interface Props {
    items: PagerCountItem[];
    side: 'prev' | 'next' | 'now';
    activeKey?: string;
}

const hasCount = (item: PagerCountItem) => item.count > 0;

export class CalendarPagerCounts extends React.Component<Props> {
/** Рисует один счётчик календаря. */
    private readonly renderCount = (item: PagerCountItem) => {
        const {side, activeKey} = this.props;
        const dim = !!activeKey && item.key !== activeKey;
        return (
            <span
                key={item.key}
                className={dim ? 'calendar-count-chip-dim' : 'calendar-count-chip'}
                data-kind={item.kind}
                title={item.label}
                data-test-id={`week-${side}-count-${item.key}`}
            >
                <span className="calendar-count-number">{item.count}</span>
                <span className="calendar-count-label">{item.label}</span>
            </span>
        );
    };

/** Рисует счётчики для выбранной стороны календаря. */
    public render() {
        const shown = this.props.items.filter(hasCount);
        if (!shown.length) return null;
        return (
            <span className="calendar-counts" data-test-id={`week-${this.props.side}-counts`}>
                {shown.map(this.renderCount)}
            </span>
        );
    }
}
