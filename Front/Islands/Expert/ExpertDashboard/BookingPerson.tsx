import * as React from 'react';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {UserLink} from '@common/Components/UserPreviewModal/UserLink';
import {getInitials} from './getInitials';

/** Кто записался и когда занятие. */
export const BookingPerson: React.FC<{
    userId: number;
    userName: string;
    startAt: number;
    durationMin: number;
    cost: number;
    testId: string;
}> = ({userId, userName, startAt, durationMin, cost, testId}) => (
    <div className="flex items-center gap-3">
        <div className="avatar-circle">{getInitials(userName)}</div>
        <div>
            <div className="text-sm font-medium text-on-surface" data-test-id={testId}>
                <UserLink id={userId} name={userName} className="text-accent hover:underline" />
            </div>
            <div className="text-xs text-muted">
                {formatTs(startAt)} &middot; {durationMin} {t.Slot_Duration_Min()}
                {cost > 0 && <> &middot; {cost} &#8381;</>}
            </div>
        </div>
    </div>
);
