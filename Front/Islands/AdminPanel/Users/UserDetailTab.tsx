import * as React from 'react';
import {Suspense, lazy} from 'react';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';

const user_Loading = t.User_Loading;

const UserDetailPanel = lazy(() => import(/* webpackChunkName: "user-detail" */ './UserDetailPanel'));

interface Props {
    accountId: number;
    detailUrl: string;
    setFlagUrl?: string;
    createTicketUrl?: string;
    callerIsOwner?: boolean;
    /**
     * Only an admin may grant or revoke the owner rank, so the panel needs
     * to know this separately from callerIsOwner — an owner sees the same
     * screen but must not be offered that particular switch.
     */
    callerIsAdmin?: boolean;
}

/** Отображает данные раздела и передаёт действия пользователя обработчикам. */
export const UserDetailTab: React.FC<Props> = (props) => (
    <Suspense fallback={<div className="admin-support-detail-loading">{user_Loading()}</div>}>
        <UserDetailPanel {...props} />
    </Suspense>
);
