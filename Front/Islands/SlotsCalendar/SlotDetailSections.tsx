import * as React from 'react';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {UserLink} from '@common/Components/UserPreviewModal/UserLink';
import {appUrl} from '@common/Utils/appUrl';
import {formatTime, formatDateLong} from '@common/Utils/DateUtils';
import {slotPlaceLabel, slotPlaceValue} from '../../Common/booking/slotFormat';
import {SlotItem, ExpertInfo} from './types';

interface DateTimeProps {
    startAt: number;
    endTs: number;
    durationMin: number;
}

export const SlotDateTimeBlock: React.FC<DateTimeProps> = ({startAt, endTs, durationMin}) => (
    <div className="p-3 rounded-lg bg-accent-subtle" data-test-id="slot-detail-datetime">
        <div className="text-sm text-muted mb-1">{t.Slot_DateLabel()}</div>
        <div className="font-semibold">{formatDateLong(startAt)}</div>
        <div className="text-sm font-medium mt-0.5">{formatTime(startAt)} — {formatTime(endTs)}</div>
        <div className="text-xs text-muted mt-1">
            {t.Slot_Duration()}: {durationMin} {t.Slot_Duration_Min()}
        </div>
    </div>
);

export const SlotPriceBlock: React.FC<{cost: number}> = ({cost}) => (
    <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-alt" data-test-id="slot-detail-price">
        <span className="text-sm text-muted">{t.Slot_PricePaid()}</span>
        <span className="font-semibold text-lg">{cost} &#8381;</span>
    </div>
);

/**
 * Формат занятия и место.
 *
 * Место показывается, только если оно известно: у онлайн-слота без ссылки
 * подставлять сюда слово «Онлайн» значило бы повторять подпись слева.
 */
export const SlotFormatBlock: React.FC<{slot: SlotItem}> = ({slot}) => {
    const place = slotPlaceValue(slot);

    return (
        <div className="px-3 py-2 rounded-lg bg-surface-alt" data-test-id="slot-detail-format">
            <span className={`inline-block text-xs px-2 py-0.5 rounded ${slot.is_online ? 'status-success' : 'status-notice'}`}>
                {slot.is_online ? t.Slot_Online() : t.Slot_Offline()}
            </span>
            {place && (
                <div className="text-sm mt-1.5">
                    <span className="text-muted">{slotPlaceLabel(slot)}:</span> {place}
                </div>
            )}
        </div>
    );
};

export const SlotExpertBlock: React.FC<{expertId: number; expert: ExpertInfo}> = ({expertId, expert}) => (
    <div className="px-3 py-2 rounded-lg border border-default" data-test-id="slot-detail-expert">
        <div className="text-sm text-muted mb-1">{t.Slot_Expert()}</div>
        <div className="flex items-center justify-between">
            <span data-test-id="slot-detail-expert-link">
                <UserLink id={expertId} name={expert.display_name} isExpert className="text-accent hover:underline font-medium" />
            </span>
            <a
                href={appUrl(`/im/#to=${expertId}`)}
                className="text-sm text-accent hover:underline"
                data-test-id="slot-detail-message-expert"
            >
                {t.Im_GoToDialogs()}
            </a>
        </div>
    </div>
);
