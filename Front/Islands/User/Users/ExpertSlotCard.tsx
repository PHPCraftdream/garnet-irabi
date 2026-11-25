import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {translateStatus} from '../../../Common/booking/status/statusHelpers';
import type {SeatsSource} from '../../../Common/booking/formatting/slotFormat';
import type {SlotFormatSource} from '../../../Common/booking/formatting/slotFormat';
import {slotFormatLine} from '../../../Common/booking/formatting/slotFormatLine';
import {slotSeatsLeftLine} from '../../../Common/booking/formatting/slotSeatsLeftLine';

const slotCost = t.Slot_Cost;
const slotGroupBadge = t.Slot_GroupBadge;
const slotType = t.Slot_Type;

interface SlotLike extends SlotFormatSource, SeatsSource {
    id: number;
    start_at: number;
    cost: number;
    /** D-187: своя открытая заявка на слот — сервер отдаёт то же условие, которым отклоняет повторную бронь. */
    booking_status?: string | null;
}

interface Props {
    slot: SlotLike;
    isOwnProfile: boolean;
    canBook: boolean;
    onBook: (slotId: number) => void;
}

const SlotCardTitle: React.FC<{slot: SlotLike}> = ({slot}) => (
    <h5 className="expert-slot-card-title">
        {formatTs(slot.start_at)}
        {(slot.max_users ?? 1) > 1 && (
            <span className="slot-group-badge" data-test-id={`slot-group-badge-${slot.id}`}>
                {slotGroupBadge([slot.max_users ?? 1])}
            </span>
        )}
        {/* D-200: остаток мест появился в каталоге и не появился
            здесь — контроллер этой страницы не отдавал занятость
            вовсе. Четвёртый экран подряд, где признак слота решала
            показать сама витрина. */}
        {slotSeatsLeftLine(slot) && (
            <span className="profile-slot-seats" data-test-id={`slot-seats-left-${slot.id}`}>
                {slotSeatsLeftLine(slot)}
            </span>
        )}
    </h5>
);

type ActionProps = Pick<Props, 'slot' | 'isOwnProfile' | 'canBook' | 'onBook'>;

class SlotBookingAction extends AntiHookComponent<ActionProps> {
    /** Передаёт идентификатор слота обработчику бронирования. */
    private readonly book = () => this.props.onBook(this.props.slot.id);

    /** Отображает кнопку записи или пояснение её недоступности. */
    render() {
        const {slot, isOwnProfile, canBook} = this.props;
        return (
            <>
                {/* Забронировать себя нельзя — на своей же странице вместо
                    кнопки стоит пояснение, а не молчание. */}
                {isOwnProfile && (
                    <span className="support-ticket-time" data-test-id={`slot-own-${slot.id}`}>{t.Slot_OwnSlot()}</span>
                )}
                {/* D-187: на групповом слоте status остаётся 'free', пока есть
                    свободные места, даже если ЭТОТ человек уже записан —
                    страница не знала об этом и предлагала забронировать
                    снова тому, у кого уже есть подтверждённая заявка. */}
                {!isOwnProfile && slot.booking_status && (
                    <span className="support-ticket-time" data-test-id={`slot-already-booked-${slot.id}`}>
                        {translateStatus(slot.booking_status)}
                    </span>
                )}
                {!isOwnProfile && !slot.booking_status && canBook && (
                    <button
                        type="button"
                        onClick={this.book}
                        className="profile-slot-book"
                        data-test-id={`slot-book-${slot.id}`}
                    >
                        {t.Slot_Book()}
                    </button>
                )}
            </>
        );
    }
}

/**
 * Занятие на публичной странице преподавателя.
 *
 * Формат виден до записи: очное показывает адрес, онлайн — имя площадки, но
 * не ссылку. Ссылку получает только записавшийся.
 */
export const ExpertSlotCard: React.FC<Props> = ({slot, isOwnProfile, canBook, onBook}) => (
    <div data-test-id={`slot-card-${slot.id}`}>
        <div className="booking-card-shell">
            <div className="expert-slot-card-body">
                <SlotCardTitle slot={slot} />
                <p className="expert-profile-slot-cost"><strong>{slotCost()}:</strong> {slot.cost} &#8381;</p>
                <p className="expert-profile-slot-format"><strong>{slotType()}:</strong> {slotFormatLine(slot)}</p>
                <SlotBookingAction slot={slot} isOwnProfile={isOwnProfile} canBook={canBook} onBook={onBook} />
            </div>
        </div>
    </div>
);
