import * as React from 'react';
import {formatTs} from '@common/Utils/DateUtils';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {SlotFormatSource, slotFormatLine} from '../../Common/slotFormat';

interface SlotLike extends SlotFormatSource {
    id: number;
    start_at: number;
    cost: number;
}

interface Props {
    slot: SlotLike;
    isOwnProfile: boolean;
    canBook: boolean;
    onBook: (slotId: number) => void;
}

/**
 * Занятие на публичной странице преподавателя.
 *
 * Формат виден до записи: очное показывает адрес, онлайн — имя площадки, но
 * не ссылку. Ссылку получает только записавшийся.
 */
export const ExpertSlotCard: React.FC<Props> = ({slot, isOwnProfile, canBook, onBook}) => (
    <div data-test-id={`slot-card-${slot.id}`}>
        <div className="card">
            <div className="card-body">
                <h5 className="card-title">{formatTs(slot.start_at)}</h5>
                <p className="card-text mb-2"><strong>{t.Slot_Cost()}:</strong> {slot.cost} &#8381;</p>
                <p className="card-text mb-3"><strong>{t.Slot_Type()}:</strong> {slotFormatLine(slot)}</p>
                {/* Забронировать себя нельзя — на своей же странице вместо
                    кнопки стоит пояснение, а не молчание. */}
                {isOwnProfile && (
                    <span className="text-xs text-muted" data-test-id={`slot-own-${slot.id}`}>{t.Slot_OwnSlot()}</span>
                )}
                {!isOwnProfile && canBook && (
                    <button
                        type="button"
                        onClick={() => onBook(slot.id)}
                        className="btn btn-primary btn-sm"
                        data-test-id={`slot-book-${slot.id}`}
                    >
                        {t.Slot_Book()}
                    </button>
                )}
            </div>
        </div>
    </div>
);
