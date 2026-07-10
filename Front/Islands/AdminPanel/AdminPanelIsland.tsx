import * as React from 'react';
import {useEffect, useState} from 'react';
import {AdminUser, GridConfig} from './types';
import {UsersSection} from './UsersSection';
import {AdminCommentsSection, AdminCommentRow, CommentsAccountOption} from './AdminCommentsSection';
import {AdminTokensSection} from './AdminTokensSection';
import {UserDetailContext} from './UserDetailContext';
import {UserDetailTab} from './UserDetailTab';
import {useUserTabs} from './useUserTabs';
import {ADMIN_URLS} from './AdminPageWrapper';
import {TabNav, TabDef} from '@common/Components/Navigation/TabNav';
import {PageResponse} from '@common/hooks/usePagination';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {PageHeader} from '@common/Components/PageHeader';
import {Users} from 'lucide-react';

interface Props {
    users: AdminUser[];
    setFlagUrl?: string;
    setUserTypeUrl?: string;
    gridConfig: GridConfig;
    userDetailUrl: string;
    createTicketUrl?: string;
    // Comments tab data
    commentsPageUrl: string;
    commentsHideUrl: string;
    commentsUnhideUrl: string;
    commentsExperts: CommentsAccountOption[];
    commentsAuthors: CommentsAccountOption[];
    commentsInitialPayload?: PageResponse<AdminCommentRow> | null;
    // Tokens tab URLs
    tokensListUrl: string;
    tokensCreateUrl: string;
    tokensDisableUrl: string;
    tokensEnableUrl: string;
    tokensDeleteUrl: string;
    tokensRegistrationsUrl: string;
    tokensUpdateUrl: string;
    initialTab?: StaticTabId;
}

const STATIC_TABS = ['users', 'comments', 'tokens'] as const;
type StaticTabId = typeof STATIC_TABS[number];

function isStaticTab(id: string): id is StaticTabId {
    return (STATIC_TABS as ReadonlyArray<string>).includes(id);
}

function readTabFromUrl(): StaticTabId | null {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    return tab !== null && isStaticTab(tab) ? tab : null;
}

function writeTabToUrl(tab: StaticTabId): void {
    const url = new URL(window.location.href);
    if (tab === 'users') {
        url.searchParams.delete('tab');
    } else {
        url.searchParams.set('tab', tab);
    }
    window.history.pushState(null, '', url.toString());
}

export const AdminPanelIsland: React.FC<Props> = (props) => {
    const {
        users,
        setFlagUrl,
        setUserTypeUrl,
        gridConfig,
        userDetailUrl,
        createTicketUrl,
        commentsPageUrl,
        commentsHideUrl,
        commentsUnhideUrl,
        commentsExperts,
        commentsAuthors,
        commentsInitialPayload,
        tokensListUrl,
        tokensCreateUrl,
        tokensDisableUrl,
        tokensEnableUrl,
        tokensDeleteUrl,
        tokensRegistrationsUrl,
        tokensUpdateUrl,
        initialTab,
    } = props;

    const [staticTab, setStaticTab] = useState<StaticTabId>(() => {
        const fromUrl = readTabFromUrl();
        if (fromUrl !== null) return fromUrl;
        if (initialTab !== undefined) return initialTab;
        return 'users';
    });

    const {userTabs, activeUserTabId, setActiveUserTabId, openUser, closeUser} = useUserTabs();

    // React to back/forward navigation
    useEffect(() => {
        const onPop = () => {
            const tab = readTabFromUrl();
            setStaticTab(tab ?? 'users');
        };
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, []);

    // On mount: hash #user={id} → auto-open user-detail tab (with name from users list)
    useEffect(() => {
        const hash = window.location.hash;
        if (hash.includes('user=')) {
            const userId = parseInt(hash.split('user=')[1]?.split('&')[0] || '0', 10);
            if (userId > 0) {
                const user = users.find(u => u.id === userId);
                openUser(userId, user?.name || `#${userId}`);
                window.history.replaceState(
                    null,
                    '',
                    window.location.pathname + window.location.search,
                );
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const activeId: string = activeUserTabId ?? staticTab;

    const allTabs: TabDef[] = [
        {id: 'users', label: t.Admin_Users(), closeable: false},
        {id: 'comments', label: t.Admin_Comments(), closeable: false},
        {id: 'tokens', label: t.Admin_Tokens(), closeable: false},
        ...userTabs,
    ];

    const handleSelect = (id: string) => {
        if (isStaticTab(id)) {
            setActiveUserTabId(null);
            setStaticTab(id);
            writeTabToUrl(id);
            return;
        }
        if (userTabs.find(ut => ut.id === id)) {
            setActiveUserTabId(id);
        }
    };

    const handleClose = (id: string) => {
        if (userTabs.find(ut => ut.id === id)) {
            closeUser(id);
        }
    };

    const showUsers = activeId === 'users';
    const showComments = activeId === 'comments';
    const showTokens = activeId === 'tokens';
    const activeUserTab = userTabs.find(ut => ut.id === activeId);

    return (
        <UserDetailContext.Provider value={{openUser}}>
            <PageHeader title={t.Admin_Users()} icon={<Users size={22} aria-hidden="true" />} />
            <div className="section-soft">
            <TabNav
                tabs={allTabs}
                activeId={activeId}
                onSelect={handleSelect}
                onClose={handleClose}
            />
            {showUsers && (
                <UsersSection users={users} setFlagUrl={setFlagUrl} setUserTypeUrl={setUserTypeUrl} config={gridConfig} />
            )}
            {showComments && (
                <AdminCommentsSection
                    commentsPayload={commentsInitialPayload ?? null}
                    commentsPageUrl={commentsPageUrl}
                    hideUrl={commentsHideUrl}
                    unhideUrl={commentsUnhideUrl}
                    experts={commentsExperts}
                    authors={commentsAuthors}
                />
            )}
            {showTokens && (
                <AdminTokensSection
                    listUrl={tokensListUrl}
                    createUrl={tokensCreateUrl}
                    disableUrl={tokensDisableUrl}
                    enableUrl={tokensEnableUrl}
                    deleteUrl={tokensDeleteUrl}
                    registrationsUrl={tokensRegistrationsUrl}
                    updateUrl={tokensUpdateUrl}
                />
            )}
            {activeUserTab && (
                <UserDetailTab
                    accountId={activeUserTab.tabKind.accountId}
                    detailUrl={userDetailUrl || ADMIN_URLS.detailUrl}
                    setFlagUrl={setFlagUrl ?? ADMIN_URLS.setFlagUrl}
                    createTicketUrl={createTicketUrl ?? ADMIN_URLS.createTicketUrl}
                />
            )}
            </div>
        </UserDetailContext.Provider>
    );
};
