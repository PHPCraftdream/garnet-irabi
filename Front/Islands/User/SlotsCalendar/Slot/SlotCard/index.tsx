import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import {createPortal} from 'react-dom';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {SlotItem, ExpertMap, ExpertInfo} from '../../State/view/types';
import {EntityLink} from '../../../../../Common/people/links/EntityLink';
import {userLinks} from '../../../../../Common/people/links/userLinks';
import {formatTime} from '@common/Utils/Time/DateUtils';
import {slotSeatsLeftLine} from '../../../../../Common/booking/formatting/slotSeatsLeftLine';
import {translateStatus} from '../../../../../Common/booking/status/statusHelpers';
import {statusClass} from '../../../../../Common/booking/status/statusClass';
import {SlotTooltip} from './SlotTooltip';
import {SlotCardMeta} from './SlotCardMeta';

const slotDetails = t.Slot_Details;
const slotGroupBadge = t.Slot_GroupBadge;
const slotBook = t.Slot_Book;

interface SlotCardProps {
    slot: SlotItem;
    experts: ExpertMap;
    isBooked?: boolean;
    /** Статус брони этого посетителя: pending | confirmed | cancelled | completed. */
    bookingStatus?: string;
    onBookClick?: (slot: SlotItem) => void;
    isModerator?: boolean;
    canBook?: boolean;
}

/** Рисует бейдж группового занятия и остаток мест. */
function SlotGroupBadge({slot}: {slot: SlotItem}) {
    return (
        <div className="slot-group-block">
            <span
                className="slot-group-badge"
                data-test-id={`slot-group-badge-${slot.id}`}
            >
                {slotGroupBadge([slot.max_users])}
            </span>
            {/* D-186: бейдж называл только вместимость, и остаток мест
                был не виден нигде. Ученик не понимал, успевает ли он,
                а при неудачной брони не мог отличить «место только что
                заняли» от поломки. Считается общим помощником — рядом
                в тултипе та же строка, и разойтись им нечем (D-196). */}
            {slotSeatsLeftLine(slot) && (
                <span
                    className="slot-group-seats"
                    data-test-id={`slot-seats-left-${slot.id}`}
                >
                    {slotSeatsLeftLine(slot)}
                </span>
            )}
        </div>
    );
}

export class SlotCard extends AntiHookComponent<SlotCardProps> {
    private readonly cardRef = React.createRef<HTMLDivElement>();
    private readonly tooltipState = new Carburetor({visible: false});
    /** Показывает подсказку при наведении на карточку. */
    private readonly showTooltip = () =>
        this.tooltipState.setData({visible: true});
    /** Скрывает подсказку при уходе курсора с карточки. */
    private readonly hideTooltip = () =>
        this.tooltipState.setData({visible: false});
    /** Открывает выбранное занятие для бронирования. */
    private readonly book = () => this.props.onBookClick?.(this.props.slot);

    /** Вычисляет положение всплывающей подсказки. */
    private getTooltipStyle(): React.CSSProperties {
        if (!this.cardRef.current) return {display: 'none'};
        const rect = this.cardRef.current.getBoundingClientRect();
        const left = rect.right + 8;
        const top = rect.top;
        const useLeft = left + 230 > window.innerWidth;
        return {
            position: 'fixed',
            top: Math.max(8, Math.min(top, window.innerHeight - 250)),
            left: useLeft ? rect.left - 238 : left,
            zIndex: 9999,
        };
    }

    /** Рисует время и стоимость занятия. */
    private renderHeading(startTime: string, endTime: string) {
        return (
            <div className="slot-card-heading">
                <div className="slot-card-time">
                    {startTime}
                    <span className="slot-card-dash">–</span>
                    {endTime}
                </div>
                <span className="slot-card-price">
                    {this.props.slot.cost}&nbsp;₽
                </span>
            </div>
        );
    }

    /** Рисует кнопку брони или текущий статус. */
    private renderAction() {
        const {slot, isBooked, bookingStatus, canBook} = this.props;
        if (isBooked) {
            return (
                <button
                    type="button"
                    className="slot-booked-action"
                    data-status={statusClass(bookingStatus || 'pending')}
                    title={slotDetails()}
                    data-test-id={`slot-booked-${slot.id}`}
                    onClick={this.book}
                >
                    {translateStatus(bookingStatus || 'pending')}
                </button>
            );
        }
        if (!canBook) return null;
        return (
            <button
                type="button"
                className="slot-book-action"
                title={slotBook()}
                data-test-id={`slot-book-btn-${slot.id}`}
                onClick={this.book}
            >
                {slotBook()}
            </button>
        );
    }

    /** Рисует сведения, кнопки и подсказку карточки. */
    private renderContent(
        expert: ExpertInfo | undefined,
        startTime: string,
        endTime: string,
        visible: boolean,
    ) {
        const {slot} = this.props;
        const isModerator = this.props.isModerator ?? false;
        return (
            <>
                {this.renderHeading(startTime, endTime)}
                {expert && (
                    <div
                        className="slot-card-expert"
                        data-test-id={`slot-expert-link-${slot.id}`}
                    >
                        <EntityLink
                            name={expert.display_name}
                            {...userLinks(slot.expert_id, true)}
                            isModerator={isModerator}
                        />
                    </div>
                )}
                <SlotCardMeta slot={slot} />
                {slot.max_users > 1 && <SlotGroupBadge slot={slot} />}
                {this.renderAction()}
                {visible && createPortal(
                    <SlotTooltip
                        slot={slot}
                        expert={expert}
                        startTime={startTime}
                        endTime={endTime}
                        style={this.getTooltipStyle()}
                    />,
                    document.body,
                )}
            </>
        );
    }

    /** Рисует карточку занятия и подсказку. */
    public render() {
        const {slot, experts} = this.props;
        const {visible} = this.useCarburetor(this.tooltipState);
        const startTime = formatTime(slot.start_at);
        const endTime = formatTime(
            slot.end_at || slot.start_at + (slot.duration_min || 60) * 60,
        );
        const expert: ExpertInfo | undefined = experts[slot.expert_id];

        return (
            <div
                ref={this.cardRef}
                className="time-slot-card"
                data-test-id={`slot-card-${slot.id}`}
                onMouseEnter={this.showTooltip}
                onMouseLeave={this.hideTooltip}
            >
                {this.renderContent(expert, startTime, endTime, visible)}
            </div>
        );
    }
}
