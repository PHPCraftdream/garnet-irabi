import * as React from 'react';
import {Settings} from 'lucide-react';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import {appUrl} from '@common/Utils/Url/appUrl';

const adminPublicProfile = t.Admin_PublicProfile;
const adminUsers = t.Admin_Users;

/** Ссылки на публичный профиль и карточку пользователя в админке.
 *
 * Навигация работает без React-контекста и подходит для виджетов админки.
 */
export const AdminUserDualLink: React.FC<{
    id: number;
    name: string;
    dataTestId?: string;
}> = ({id, name, dataTestId}) => {
    if (!id || id <= 0) return <span>{name || '—'}</span>;
    return (
        <span className="entity-person-group">
            <a
                href={appUrl(`/user/id~${id}`)}
                className="entity-person-link"
                data-test-id={dataTestId}
            >{name || `#${id}`}</a>
            <a
                href={appUrl(`/admin/#user=${id}`)}
                className="entity-person-admin"
                title={adminPublicProfile()}
                aria-label={adminUsers()}
            >
                <Settings size={14} aria-hidden="true" />
            </a>
        </span>
    );
};
