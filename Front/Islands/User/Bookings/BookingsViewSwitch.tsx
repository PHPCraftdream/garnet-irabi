import * as React from 'react';
import type {BookingsViewAs} from './card/bookingCardTypes';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';

const bookingsIncomingTitle = t.Bookings_IncomingTitle;
const bookingsTitle = t.Bookings_Title;

interface BookingsViewSwitchProps {
    viewAs: BookingsViewAs;
    onExpert: () => void;
    onUser: () => void;
}

/** Переключатель стороны списка броней преподавателя. */
export const BookingsViewSwitch: React.FC<BookingsViewSwitchProps> = ({viewAs, onExpert, onUser}) => (
    <div className="bookings-view-switch" data-test-id="bookings-view-switch">
        <button
            type="button"
            className="bookings-view-button" data-tone={viewAs === 'expert' ? 'active' : 'neutral'}
            aria-pressed={viewAs === 'expert'}
            data-test-id="bookings-view-expert"
            onClick={onExpert}
        >
            {bookingsIncomingTitle()}
        </button>
        <button
            type="button"
            className="bookings-view-button" data-tone={viewAs === 'user' ? 'active' : 'neutral'}
            aria-pressed={viewAs === 'user'}
            data-test-id="bookings-view-user"
            onClick={onUser}
        >
            {bookingsTitle()}
        </button>
    </div>
);
