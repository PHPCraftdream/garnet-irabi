import * as React from 'react';
import {Settings} from 'lucide-react';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {appUrl} from '@common/Utils/Url/appUrl';

/**
 * Dual user link for admin dashboard widgets (open tickets, recent activity,
 * pending approvals): the name links to the public profile and a gear icon links
 * to the admin user card. BOTH are plain `<a href>` navigations — no React
 * context required — so they work in any island and ride the central hot-click
 * smooth navigation. (AdminUserLink, by contrast, needs a UserDetailContext
 * provider to do anything, which dashboard widgets don't have — that's why its
 * links were dead there.)
 */
export const AdminUserDualLink: React.FC<{
    id: number;
    name: string;
    className?: string;
    dataTestId?: string;
}> = ({id, name, className = '', dataTestId}) => {
    if (!id || id <= 0) {
        return <span className={className}>{name || '—'}</span>;
    }
    return (
        <span className={`common-entity-link ${className}`}>
            <a
                href={appUrl(`/user/id~${id}`)}
                className="common-link"
                data-test-id={dataTestId}
            >{name || `#${id}`}</a>
            <a
                href={appUrl(`/admin/#user=${id}`)}
                className="common-link-admin-tag"
                title={t.Admin_PublicProfile()}
                aria-label={t.Admin_Users()}
            >
                <Settings size={14} aria-hidden="true" />
            </a>
        </span>
    );
};
