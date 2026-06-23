import {useEffect} from 'react';
import * as React from 'react';
import {UserDetailTab} from './UserDetailTab';
import {useUserTabs} from './useUserTabs';
import {TabNav} from '@common/Components/Navigation/TabNav';
import {appUrl} from '@common/Utils/appUrl';

// ── Hardcoded admin API URLs (consistent across all admin pages) ──

export const ADMIN_URLS = {
    detailUrl: appUrl('/admin/~userDetail'),
    setFlagUrl: appUrl('/admin/~setUserFlag'),
    createTicketUrl: appUrl('/admin/support/~createForUser'),
};

interface SimpleWrapperConfig {
    mainLabel: string;
    mainTabId?: string;
    userDetailUrl?: string;
    setFlagUrl?: string;
    createTicketUrl?: string;
}

/**
 * Hook for admin islands that need main content + user detail tabs.
 *
 * Provides: TabNav rendering, user tab rendering, openUser callback,
 * hash-based auto-open (#user={id}), and active tab state.
 *
 * For complex islands with their own dynamic tabs (AdminSupportIsland),
 * use useUserTabs() directly and merge tabs manually.
 */
export function useAdminPageWrapper(config: SimpleWrapperConfig) {
    const mainTabId = config.mainTabId ?? 'main';
    const {userTabs, activeUserTabId, setActiveUserTabId, openUser, closeUser} = useUserTabs();

    const activeId = activeUserTabId ?? mainTabId;

    const allTabs = [
        {id: mainTabId, label: config.mainLabel, closeable: false, tabKind: null},
        ...userTabs,
    ];

    const handleSelect = (id: string) => setActiveUserTabId(id === mainTabId ? null : id);
    const handleClose = (id: string) => closeUser(id);

    // Read #user={id} from URL hash on mount
    useEffect(() => {
        const hash = window.location.hash;
        if (hash.includes('user=')) {
            const userId = parseInt(hash.split('user=')[1]?.split('&')[0] || '0', 10);
            if (userId > 0) {
                openUser(userId, `#${userId}`);
                window.history.replaceState(null, '', window.location.pathname);
            }
        }
    }, []);

    const isMainActive = activeId === mainTabId;

    const renderTabs = () => (
        <TabNav tabs={allTabs} activeId={activeId} onSelect={handleSelect} onClose={handleClose} />
    );

    const renderUserPanels = () => (
        <>
            {userTabs.map(tab => (
                activeId === tab.id && (
                    <UserDetailTab
                        key={tab.id}
                        accountId={tab.tabKind.accountId}
                        detailUrl={config.userDetailUrl ?? ADMIN_URLS.detailUrl}
                        setFlagUrl={config.setFlagUrl ?? ADMIN_URLS.setFlagUrl}
                        createTicketUrl={config.createTicketUrl ?? ADMIN_URLS.createTicketUrl}
                    />
                )
            ))}
        </>
    );

    return {
        mainTabId,
        activeId,
        isMainActive,
        openUser,
        userTabs,
        allTabs,
        handleSelect,
        handleClose,
        renderTabs,
        renderUserPanels,
    };
}
