import * as React from 'react';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';

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
        <div className="admin-user-meta">
            {expertDeclineCount > 0 && <span className="text-warning">{t.User_ExpertDeclines()}: {expertDeclineCount}</span>}
            {expertCancelCount > 0 && <span className="text-danger">{t.User_ExpertCancellations()}: {expertCancelCount}</span>}
            {userDeclineCount > 0 && <span className="text-warning">{t.User_UserDeclines()}: {userDeclineCount}</span>}
            {userCancelCount > 0 && <span className="text-danger">{t.User_UserCancellations()}: {userCancelCount}</span>}
        </div>
    );
};
