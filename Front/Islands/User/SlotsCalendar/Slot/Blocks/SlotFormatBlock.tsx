import * as React from 'react';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {slotPlaceLabel} from '../../../../../Common/booking/formatting/slotPlaceLabel';
import {slotPlaceValue} from '../../../../../Common/booking/formatting/slotPlaceValue';
import {SlotItem} from '../../State/view/types';

const slotOffline = t.Slot_Offline;
const slotOnline = t.Slot_Online;

/**
 * Формат занятия и место.
 *
 * Место показывается, только если оно известно: у онлайн-слота без ссылки
 * подставлять сюда слово «Онлайн» значило бы повторять подпись слева.
 */
export const SlotFormatBlock: React.FC<{slot: SlotItem}> = ({slot}) => {
    const place = slotPlaceValue(slot);

    return (
        <div className="slot-format-panel" data-test-id="slot-detail-format">
            <span className="slot-format-badge" data-format={slot.is_online ? 'online' : 'offline'}>
                {slot.is_online ? slotOnline() : slotOffline()}
            </span>
            {place && (
                <div className="slot-format-place">
                    <span className="slot-format-place-label">{slotPlaceLabel(slot)}:</span> {place}
                </div>
            )}
        </div>
    );
};
