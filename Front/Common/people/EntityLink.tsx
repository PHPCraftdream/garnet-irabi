import * as React from 'react';
import {Settings} from 'lucide-react';
import {usePreview} from '@common/Components/UserPreviewModal/PreviewContext';

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
