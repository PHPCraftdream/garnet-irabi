import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {UserLink} from '@common/Components/UserPreviewModal/UserLink';
import {appUrl} from '@common/Utils/Url/appUrl';
import {SlotBookingController} from '../../SlotsCalendar/Booking/logic/SlotBookingController';
import {SlotBookingModalHost} from '../../SlotsCalendar/Booking/components/SlotBookingModalHost';

const USER_DASH_LINK_TEMPLATE = <a className="user-dash-link" />;

interface SlotTeaser {
    id: number;
    start_at: number;
    duration_min: number;
    cost: number;
    expert_id: number;
    expert_name: string;
    label: string;
}

const stopPropagation = (event: React.MouseEvent) => event.stopPropagation();
const reloadPage = () => window.location.reload();

class SlotTeaserRow extends AntiHookComponent<{slot: SlotTeaser; onBook: (id: number) => void}> {
    /** Открывает форму бронирования выбранного занятия. */
    private readonly handleBook = () => this.props.onBook(this.props.slot.id);

    /** Рисует цену и кнопку записи рядом с описанием занятия. */
    private renderAside() {
        const {slot} = this.props;
        return (
            <div className="user-dash-slot-aside">
                <span className="user-dash-slot-cost">{slot.cost} &#8381;</span>
                <button
                    type="button"
                    onClick={this.handleBook}
                    className="primary-action-button" data-user-dash-compact="nowrap"
                    data-test-id="book-btn"
                >
                    {t.Slot_Book()}
                </button>
            </div>
        );
    }

    /** Отображает занятие с преподавателем, временем и длительностью. */
    render() {
        const {slot} = this.props;
        return (
            <div>
                <div className="user-dash-row-main">
                    <div className="user-dash-row-title">{slot.label}</div>
                    <div className="user-dash-row-meta">
                        {slot.expert_id > 0 ? (
                            <UserLink
                                id={slot.expert_id}
                                name={slot.expert_name}
                                isExpert
                                anchor={USER_DASH_LINK_TEMPLATE}
                                onClick={stopPropagation}
                            />
                        ) : (
                            slot.expert_name
                        )}{' '}
                        &middot; {formatTs(slot.start_at, {weekday: true})}
                    </div>
                    <div className="user-dash-row-meta">
                        {slot.duration_min} {t.Slot_Duration_Min()}
                    </div>
                </div>
                {this.renderAside()}
            </div>
        );
    }
}

interface Props {
    slots: SlotTeaser[];
}

/** Подборка занятий на главной. */
export class RecommendedSlots extends AntiHookComponent<Props> {
    // Общий поток бронирования: занятие открывается окном, а не уводит на
    // отдельную страницу. После успеха страница перезагружается, чтобы
    // ближайшие занятия и баланс показали новую бронь.
    private readonly controller = new SlotBookingController();
    /** Запускает бронирование из окна рекомендуемых занятий. */
    private readonly book = (slotId: number) => void this.controller.openBooking(slotId);

    /** Показывает карточку с подходящими занятиями. */
    render() {
        const {slots} = this.props;
        if (slots.length === 0) return null;
        const rows: React.ReactNode[] = [];
        for (const slot of slots) rows.push(<SlotTeaserRow key={slot.id} slot={slot} onBook={this.book} />);

        return (
            <div data-test-id="recommended-slots">
                <div className="user-dash-section-header">
                    <h2 className="user-dash-section-heading">{t.Dash_Recommendations()}</h2>
                    <a href={appUrl('/slots')} className="user-dash-view-all">{t.Dash_ViewAll()}</a>
                </div>
                <div className="user-dash-list">
                    {rows}
                </div>
                <SlotBookingModalHost controller={this.controller} onBooked={reloadPage} />
            </div>
        );
    }
}
