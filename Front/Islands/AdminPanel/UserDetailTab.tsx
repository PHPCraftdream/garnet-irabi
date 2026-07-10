import * as React from 'react';
import {Suspense, lazy} from 'react';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';

const UserDetailPanel = lazy(() => import(/* webpackChunkName: "user-detail" */ './UserDetailPanel'));

interface Props {
    accountId: number;
    detailUrl: string;
    setFlagUrl?: string;
    createTicketUrl?: string;
}

export const UserDetailTab: React.FC<Props> = (props) => (
    <Suspense fallback={<div className="p-6 text-muted text-sm">{t.User_Loading()}</div>}>
        <UserDetailPanel {...props} />
    </Suspense>
);
