import * as React from 'react';

/** One coloured count chip in a calendar pager (e.g. "3 Свободные"). */
export interface PagerCountItem {
    key: string;
    count: number;
    label: string;
    /** colour modifier class, e.g. 'cal-nav-badge--free' */
    cls: string;
}

/**
 * Count chips shown next to a calendar pager arrow — one per non-zero kind, each
 * a coloured pill with the number and a label. Tells the viewer, at a glance,
 * how many (and what kind of) slots sit in the weeks beyond the current window,
 * so they know whether paging that way is worth it. Shared by the expert slot
 * calendar and the public slots calendar.
 */
export const CalendarPagerCounts: React.FC<{items: PagerCountItem[]; side: 'prev' | 'next' | 'now'}> = ({items, side}) => {
    const shown = items.filter(i => i.count > 0);
    if (!shown.length) return null;
    return (
        <span className="cal-nav-counts" data-test-id={`week-${side}-counts`}>
            {shown.map(i => (
                <span
                    key={i.key}
                    className={`cal-nav-badge ${i.cls}`}
                    title={i.label}
                    data-test-id={`week-${side}-count-${i.key}`}
                >
                    <span className="cal-nav-badge-num">{i.count}</span>
                    <span className="cal-nav-badge-label">{i.label}</span>
                </span>
            ))}
        </span>
    );
};
