import * as React from 'react';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {UserLink} from '@common/Components/UserPreviewModal/UserLink';
import {getInitials} from './getInitials';

const USER_DASH_LINK_TEMPLATE = <a className="user-dash-link" />;

/** Кто записался и когда занятие. */
export const BookingPerson: React.FC<{
    userId: number;
    userName: string;
    startAt: number;
    durationMin: number;
    cost: number;
    testId: string;
}> = ({userId, userName, startAt, durationMin, cost, testId}) => (
    <div className="expert-booking-person">
        <div className="expert-booking-avatar">{getInitials(userName)}</div>
        <div>
            <div className="user-dash-row-title" data-test-id={testId}>
                <UserLink id={userId} name={userName} anchor={USER_DASH_LINK_TEMPLATE} />
            </div>
            <div className="user-dash-row-small">
                {formatTs(startAt)} &middot; {durationMin} {t.Slot_Duration_Min()}
                {cost > 0 && <> &middot; {cost} &#8381;</>}
            </div>
        </div>
    </div>
);
