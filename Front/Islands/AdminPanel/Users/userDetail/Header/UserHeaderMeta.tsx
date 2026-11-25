import * as React from 'react';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {AccountData} from '../status/userDetailTypes';

const user_LastOnline = t.User_LastOnline;
const user_RegTime = t.User_RegTime;

/** Регистрация, последний визит, номер. */
export const UserHeaderMeta: React.FC<{account: AccountData}> = ({account}) => (
    <div className="admin-ticket-meta">
        {account.reg_time && <span>{user_RegTime()}: {formatTs(account.reg_time)}</span>}
        {account.last_online_time && <span>{user_LastOnline()}: {formatTs(account.last_online_time)}</span>}
        <span>ID: {account.id}</span>
    </div>
);
