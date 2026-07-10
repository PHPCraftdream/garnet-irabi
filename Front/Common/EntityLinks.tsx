import * as React from 'react';
import {Settings} from 'lucide-react';
import {I18nForeground as t} from '../I18nGen/I18nForeground';
import {UserDetailContext} from '../Islands/AdminPanel/UserDetailContext';
import {usePreview} from '@common/Components/UserPreviewModal/PreviewContext';
import {appUrl} from '@common/Utils/appUrl';

/**
 * Dual links for moderators: public view + admin view.
 *
 * Behaviour by context:
 *  - In an island wrapped with <PreviewProvider> the main link opens a foreground
 *    preview modal instead of navigating (compat: still <a href> for middle-click,
 *    open-in-new-tab, etc — but left-click is intercepted).
 *  - Without a provider (e.g. admin grids) it behaves as a plain navigation link.
 *
 * Usage:
 *   <EntityLink name="Anna" publicUrl="/expert/id~16" adminUrl="/admin/#user=16" isModerator userId={16} />
 */

interface EntityLinkProps {
    name: string;
    publicUrl?: string;
    adminUrl?: string;
    isModerator: boolean;
    /** When true, main link uses adminUrl instead of publicUrl (for admin panel context) */
    adminMode?: boolean;
    /** Account id used to open the inline preview modal (foreground only). */
    userId?: number;
    className?: string;
    adminTitle?: string;
}

export const EntityLink: React.FC<EntityLinkProps> = ({name, publicUrl, adminUrl, isModerator, adminMode, userId, className = '', adminTitle}) => {
    const {openPreview} = usePreview();

    // In admin mode: main link = adminUrl, no gear icon
    const mainUrl = adminMode ? adminUrl : publicUrl;

    if (!mainUrl && !adminUrl) return <span className={className}>{name}</span>;

    const previewEligible = !adminMode && !!openPreview && !!userId && userId > 0;

    const handleMainClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!previewEligible) return;
        // Allow modifier-clicks (open in new tab, etc.) to fall through to navigation.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (e as any).button === 1) return;
        e.preventDefault();
        openPreview!(userId!, name);
    };

    return (
        <span className={`common-entity-link ${className}`}>
            {mainUrl ? (
                <a
                    href={mainUrl}
                    className="common-link"
                    onClick={handleMainClick}
                    data-test-id={previewEligible ? `entity-link-preview-${userId}` : undefined}
                >
                    {name}
                </a>
            ) : (
                <span>{name}</span>
            )}
            {!adminMode && isModerator && adminUrl && (
                <a
                    href={adminUrl}
                    className="common-link-admin-tag"
                    onClick={e => e.stopPropagation()}
                    title={adminTitle}
                >
                    <Settings size={14} aria-hidden="true" />
                </a>
            )}
        </span>
    );
};

/** Helper to build public + admin URLs for common entity types */
export function userLinks(accountId: number, hasExpertProfile?: boolean) {
    return {
        publicUrl: appUrl(hasExpertProfile ? `/expert/id~${accountId}` : `/user/id~${accountId}`),
        adminUrl: appUrl(`/admin/#user=${accountId}`),
        userId: accountId,
    };
}

/** Simple user link for public pages — links to /expert/id~ or /user/id~ */
export const UserLink: React.FC<{id: number; name: string; hasExpertProfile?: boolean; className?: string}> = ({id, name, hasExpertProfile, className = ''}) => {
    const {openPreview} = usePreview();
    if (!id || !name) return <span className={className}>{name || '—'}</span>;
    const url = appUrl(hasExpertProfile ? `/expert/id~${id}` : `/user/id~${id}`);

    const onClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!openPreview) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (e as any).button === 1) return;
        e.preventDefault();
        openPreview(id, name);
    };

    return <a href={url} className={`common-link ${className}`} onClick={onClick}>{name}</a>;
};

/** Admin user link — opens user detail tab via context, falls back to href navigation */
export const AdminUserLink: React.FC<{id: number; name: string; role?: string; className?: string; dataTestId?: string}> = ({id, name, role, className = '', dataTestId}) => {
    const {openUser} = React.useContext(UserDetailContext);
    if (!id) return <span className={className}>{name || '—'}</span>;

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        // Allow modifier-clicks (Cmd/Ctrl/Shift/Alt or middle-click) to fall
        // through to native navigation — opens /admin/#user=X in a new tab.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (e as any).button === 1) return;
        e.preventDefault();
        openUser(id, name || `#${id}`);
    };

    return (
        <span className={`common-entity-link ${className}`}>
            <a
                href={appUrl(`/admin/#user=${id}`)}
                className="common-link"
                onClick={handleClick}
                data-test-id={dataTestId}
            >{name || `#${id}`}</a>
            {role && <span className="common-role-tag">{role}</span>}
        </span>
    );
};

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

export function ticketLinks(_ticketId: number) {
    return {
        publicUrl: appUrl(`/support/`),
        adminUrl: appUrl(`/admin/support/`),
    };
}
