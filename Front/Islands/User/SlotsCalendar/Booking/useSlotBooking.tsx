import * as React from 'react';
import {useState, useSyncExternalStore} from 'react';
import {SlotBookingController} from './SlotBookingController';
import {SlotBookingModalHost} from './SlotBookingModalHost';

interface UseSlotBookingOptions {
    /** Run after a successful booking (e.g. reload a list). The modal closes regardless. */
    onBooked?: (bookedIds: number[]) => void;
}

const createController = () => new SlotBookingController();

/**
 * Centralised "open the booking modal for a slot" behaviour.
 *
 * Any island that surfaces a bookable slot (news feed, recommended slots, …)
 * gets the SAME flow from one place: fetch the slot's booking context from
 * `/slots/~bookData`, surface a localized toast when the slot is gone / on
 * error, follow a server redirect when required, and otherwise pop the shared
 * <BookingModal> — instead of hard-navigating to a separate booking page.
 *
 * Returns `openBooking(slotId)` to wire to a button and `bookingModal` to drop
 * into the island's JSX (null until a slot is opened).
 */
export function useSlotBooking(options: UseSlotBookingOptions = {}) {
    const {onBooked} = options;
    const [controller] = useState(createController);
    const {bookData, loading} = useSyncExternalStore(controller.subscribeState, controller.getSnapshot, controller.getSnapshot);

    const bookingModal = bookData
        ? <SlotBookingModalHost controller={controller} onBooked={onBooked} />
        : null;

    return {openBooking: controller.openBooking, bookingModal, bookingLoading: loading};
}

export type {SlotBookingData} from './SlotBookingController';
