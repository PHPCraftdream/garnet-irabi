import * as React from 'react';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';

const user_ExpertCancellations = t.User_ExpertCancellations;
const user_ExpertDeclines = t.User_ExpertDeclines;
const user_UserCancellations = t.User_UserCancellations;
const user_UserDeclines = t.User_UserDeclines;

interface CountersProps {
    expertCancelCount: number;
    userCancelCount: number;
    expertDeclineCount: number;
    userDeclineCount: number;
}

/**
 * Счётчики отказов и отмен.
 *
 * Отказ и отмена разведены намеренно: отказ по неподтверждённой заявке стоит
 * человеку куда меньше, чем отмена уже подтверждённого занятия. Показывается
 * только то, что не ноль, — пустые счётчики ничего не сообщают.
 */
export const UserHeaderCounters: React.FC<CountersProps> = ({
    expertCancelCount,
    userCancelCount,
    expertDeclineCount,
    userDeclineCount,
}) => {
    if (!expertCancelCount && !userCancelCount && !expertDeclineCount && !userDeclineCount) return null;

    return (
        <div className="admin-ticket-meta">
            {expertDeclineCount > 0 && <span className="admin-user-count-warning">{user_ExpertDeclines()}:{' '}
        {expertDeclineCount}</span>}
            {expertCancelCount > 0 && <span
        className="admin-user-count-danger">{user_ExpertCancellations()}: {expertCancelCount}</span>}
            {userDeclineCount > 0 && <span className="admin-user-count-warning">{user_UserDeclines()}:{' '}
        {userDeclineCount}</span>}
            {userCancelCount > 0 && <span className="admin-user-count-danger">{user_UserCancellations()}:{' '}
        {userCancelCount}</span>}
        </div>
    );
};
