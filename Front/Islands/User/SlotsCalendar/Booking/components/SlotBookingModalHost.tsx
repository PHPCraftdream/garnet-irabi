import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import BookingModal from './BookingModal';
import type {ExpertMap, SlotItem} from '@/Islands/User/SlotsCalendar/State/view/types';
import type {SlotBookingController} from '@/Islands/User/SlotsCalendar/Booking/logic/SlotBookingController';

interface Props {
    controller: SlotBookingController;
    onBooked?: (bookedIds: number[]) => void;
}

export class SlotBookingModalHost extends AntiHookComponent<Props> {
    private readonly emptyBookedIds = new Set<number>();
    /** Обрабатывает успешное бронирование. */
    private readonly handleBooked = (bookedIds: number[]) =>
        this.props.controller.handleModalBooked(bookedIds, this.props.onBooked);

    /** Отрисовывает содержимое компонента. */
    render() {
        const { bookData } = this.useCarburetor(this.props.controller);
        if (!bookData) return null;
        // Модалка рисует поля слота и эксперта в своём render: библиотека
        // записывает такие чтения только владельцу прокси, поэтому копируем
        // их здесь — обычные объекты со свежей ссылкой.
        const slot: SlotItem = { ...bookData.slot };
        const expert = { ...bookData.expert };
        return (
            <BookingModal
                controller={this.props.controller}
                slot={slot}
                allSlots={[slot]}
                experts={{ [String(expert.account_id)]: expert } as ExpertMap}
                bookedIds={this.emptyBookedIds}
                balance={bookData.balance}
                bookUrl={bookData.bookUrl}
                csrf={bookData.csrf}
                onClose={this.props.controller.closeModal}
                onBooked={this.handleBooked}
            />
        );
    }
}
