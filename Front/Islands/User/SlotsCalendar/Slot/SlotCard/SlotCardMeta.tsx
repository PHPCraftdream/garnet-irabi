import * as React from 'react';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import {slotFormatLine} from '@/Common/booking/formatting/slotFormatLine';
import {SlotItem} from '@/Islands/User/SlotsCalendar/State/view/types';

const slotDurationMin = t.Slot_Duration_Min;

/** Показывает формат и длительность занятия в карточке. */
export function SlotCardMeta({slot}: {slot: SlotItem}) {
    return (
        <div
            className={
                slot.max_users > 1 ? 'slot-meta-group' : 'slot-meta-single'
            }
        >
            <span className="slot-meta-format">
                {slot.is_online ? (
                    <svg
                        width="11"
                        height="11"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                    >
                        <path d="M2 5a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V5z" />
                        <path d="M14 6l-2 2 2 2V6z" fill="currentColor" />
                    </svg>
                ) : (
                    <svg
                        width="11"
                        height="11"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                    >
                        <path d="M2 8L8 2l6 6" />
                        <path d="M3 7v7h10V7" />
                    </svg>
                )}
                {slotFormatLine(slot)}
            </span>
            {slot.duration_min && (
                <>
                    <span>·</span>
                    <span className="slot-meta-duration">
                        {slot.duration_min} {slotDurationMin()}
                    </span>
                </>
            )}
        </div>
    );
}
