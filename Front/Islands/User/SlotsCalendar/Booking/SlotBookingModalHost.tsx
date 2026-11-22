import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import BookingModal from './BookingModal';
import type {ExpertMap} from '../types';
import type {SlotBookingController} from './SlotBookingController';

interface Props {
    controller: SlotBookingController;
    onBooked?: (bookedIds: number[]) => void;
}

export class SlotBookingModalHost extends AntiHookComponent<Props> {
    private readonly emptyBookedIds = new Set<number>();
    private readonly handleBooked = (bookedIds: number[]) => this.props.controller.handleModalBooked(bookedIds, this.props.onBooked);

    render() {
        const {bookData} = this.useCarburetor(this.props.controller);
        if (!bookData) return null;
        return (
            <BookingModal
                slot={bookData.slot}
                allSlots={[bookData.slot]}
                experts={{[String(bookData.expert.account_id)]: bookData.expert} as ExpertMap}
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
