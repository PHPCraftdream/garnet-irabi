import * as React from 'react';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {AccountData} from '../userDetailTypes';

/** Регистрация, последний визит, номер. */
export const UserHeaderMeta: React.FC<{account: AccountData}> = ({account}) => (
    <div className="admin-user-meta">
        {account.reg_time && <span>{t.User_RegTime()}: {formatTs(account.reg_time)}</span>}
        {account.last_online_time && <span>{t.User_LastOnline()}: {formatTs(account.last_online_time)}</span>}
        <span>ID: {account.id}</span>
    </div>
);
