import * as React from 'react';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {UserLink} from '@common/Components/UserPreviewModal/UserLink';
import {formatTime as fmtTime, formatDateShort as fmtDate} from '@common/Utils/Time/DateUtils';
import {slotFormatLine} from '../../../../Common/booking/slotFormat';
import {SlotItem, ExpertInfo} from '../types';

export const BookingSlotSummary: React.FC<{slot: SlotItem; expert?: ExpertInfo}> = ({slot, expert}) => (
    <div className="p-3 rounded-lg bg-accent-subtle mb-4" data-test-id="booking-main-slot">
        <div className="font-medium">{fmtDate(slot.start_at)}, {fmtTime(slot.start_at)} — {fmtTime(slot.end_at || (slot.start_at + (slot.duration_min || 60) * 60))}</div>
        {expert && (
            <div className="text-sm text-secondary">
                <UserLink id={slot.expert_id} name={expert.display_name} isExpert className="text-accent hover:underline" onClick={e => e.stopPropagation()} />
            </div>
        )}
        {/* Формат — на экране, где человек решает платить.
            Он был добавлен в карточку каталога и в форму брони, а
            эта модалка осталась без него: платишь за очное занятие
            и не видишь адреса. Нашёл user-7 в первый же час после
            выката — ровно тот случай, когда правку внесли не во все
            копии одного экрана. */}
        <div className="text-sm mt-1" data-test-id="booking-format">{slotFormatLine(slot)}</div>
        {/* D-162 (продолжение D-149): каталог с D-149 уже помечает
            групповые карточки значком, а эта модалка — тот самый
            экран, где человек решает платить за место в группе,
            не за персональное занятие, — молчала. */}
        {slot.max_users > 1 && (
            <div className="mt-1">
                <span className="badge text-bg-primary" data-test-id="booking-group-badge">
                    {t.Slot_GroupBadge([slot.max_users])}
                </span>
            </div>
        )}
        <div className="text-sm font-medium mt-1">{slot.cost} &#8381;</div>
        {slot.cancellation_penalty_percent > 0 && slot.cost > 0 && (
            <div className="text-xs text-warning mt-1" data-test-id="booking-penalty-warning">
                {t.Booking_PenaltyWarning([
                    slot.cancellation_penalty_percent,
                    Math.floor(slot.cost * slot.cancellation_penalty_percent / 100),
                ])}
            </div>
        )}
        {/* «А если преподаватель откажет?» — вопрос задают здесь, до
            оплаты, а ответ до сих пор был только на карточке уже
            оплаченной заявки. Отказ преподавателя всегда возвращает
            всю сумму (ExpertBookingsService: «no penalty branch»). */}
        <div className="text-xs text-muted mt-1" data-test-id="booking-refund-note">
            {t.Booking_CancelTerms_Unanswered()}
        </div>
    </div>
);
