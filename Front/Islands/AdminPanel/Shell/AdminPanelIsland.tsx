import * as React from 'react';
import {useEffect, useMemo} from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import {AdminUser, GridConfig, UserTab} from './types';
import {UsersSection} from '../Users/UsersSection';
import {AdminCommentsSection, AdminCommentRow, CommentsAccountOption} from '../Support/AdminCommentsSection';
import {AdminTokensSection} from '../System/AdminTokensSection';
import {UserDetailContext} from '../Users/UserDetailContext';
import {UserDetailTab} from '../Users/UserDetailTab';
import {useUserTabs} from './useUserTabs';
import {ADMIN_URLS} from './adminShared';
import {TabNav, TabDef} from '@common/Components/Layout/Navigation/TabNav';
import {PageResponse} from '@common/hooks/data/usePagination';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {PageHeader} from '@common/Components/Layout/PageHeader';
import {Users} from 'lucide-react';

interface Props {
    usersPageUrl: string;
    usersInitialData: PageResponse<AdminUser> | null;
    usersTabCountsUrl?: string;
    usersTabCounts: Record<UserTab, number>;
    setFlagUrl?: string;
    setUserTypeUrl?: string;
    gridConfig: GridConfig;
    userDetailUrl: string;
    createTicketUrl?: string;
    // When true, the user-detail panel renders the irreversible
    // "clear account (ПДн)" danger button. Computed server-side from
    // UserEntityConfig::isOwner() — admin OR owner, NOT plain moderator.
    callerIsOwner?: boolean;
    // Отдельно от callerIsOwner: роли владельца и админа выдаёт только
    // админ, и карточка обязана скрывать эти переключатели от всех
    // остальных — иначе предлагает действие, которое сервер отвергнет.
    callerIsAdmin?: boolean;
    // Comments tab data
    commentsPageUrl: string;
    commentsHideUrl: string;
    commentsUnhideUrl: string;
    commentsApproveUrl: string;
    commentsRejectUrl: string;
    commentsFlagUrl: string;
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

type UserTabs = ReturnType<typeof useUserTabs>;

interface PanelProps extends Props {
    tabs: UserTabs;
}

class AdminPanel extends AntiHookComponent<PanelProps> {
    private readonly ui = new Carburetor({staticTab: readTabFromUrl() ?? this.props.initialTab ?? 'users'});

    componentDidMount(): void {
        super.componentDidMount();
        window.addEventListener('popstate', this.onPop);
    }

    componentWillUnmount(): void {
        window.removeEventListener('popstate', this.onPop);
        super.componentWillUnmount();
    }

    private readonly onPop = () => this.ui.setData({staticTab: readTabFromUrl() ?? 'users'});

    private readonly handleSelect = (id: string) => {
        const {userTabs, setActiveUserTabId} = this.props.tabs;
        if (isStaticTab(id)) {
            setActiveUserTabId(null);
            this.ui.setData({staticTab: id});
            writeTabToUrl(id);
        } else if (userTabs.find(ut => ut.id === id)) {
            setActiveUserTabId(id);
        }
    };

    private readonly handleClose = (id: string) => {
        const {userTabs, closeUser} = this.props.tabs;
        if (userTabs.find(ut => ut.id === id)) closeUser(id);
    };

    private renderContent(activeId: string, userTabs: UserTabs["userTabs"]) {
        const {
            usersPageUrl,
            usersInitialData,
            usersTabCountsUrl,
            usersTabCounts,
            setFlagUrl,
            setUserTypeUrl,
            gridConfig,
            userDetailUrl,
            createTicketUrl,
            callerIsOwner,
            callerIsAdmin,
            commentsPageUrl,
            commentsHideUrl,
            commentsUnhideUrl,
            commentsApproveUrl,
            commentsRejectUrl,
            commentsFlagUrl,
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
        } = this.props;
        const showUsers = activeId === 'users';
        const showComments = activeId === 'comments';
        const showTokens = activeId === 'tokens';
        let activeUserTab: UserTabs['userTabs'][number] | undefined;
        for (const tab of userTabs) {
            if (tab.id === activeId) {
                activeUserTab = tab;
                break;
            }
        }

        return (
            <>
                {showUsers && (
                    <UsersSection
                        pageUrl={usersPageUrl}
                        initialData={usersInitialData}
                        tabCountsUrl={usersTabCountsUrl}
                        initialTabCounts={usersTabCounts}
                        setFlagUrl={setFlagUrl}
                        setUserTypeUrl={setUserTypeUrl}
                        config={gridConfig}
                    />
                )}
                {showComments && (
                    <AdminCommentsSection
                        commentsPayload={commentsInitialPayload ?? null}
                        commentsPageUrl={commentsPageUrl}
                        hideUrl={commentsHideUrl}
                        unhideUrl={commentsUnhideUrl}
                        approveUrl={commentsApproveUrl}
                        rejectUrl={commentsRejectUrl}
                        flagUrl={commentsFlagUrl}
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
                        callerIsOwner={callerIsOwner}
                        callerIsAdmin={callerIsAdmin}
                    />
                )}
            </>
        );
    }

    render() {
        const {staticTab} = this.useCarburetor(this.ui);
        const {userTabs, activeUserTabId} = this.props.tabs;

        const activeId: string = activeUserTabId ?? staticTab;

        const allTabs: TabDef[] = [
            {id: 'users', label: t.Admin_Users(), closeable: false},
            {id: 'comments', label: t.Admin_Comments(), closeable: false},
            {id: 'tokens', label: t.Admin_Tokens(), closeable: false},
            ...userTabs,
        ];

        return (
            <>
                <PageHeader title={t.Admin_Users()} icon={<Users size={22} aria-hidden="true" />} />
                <div className="section-soft">
                    <TabNav
                        tabs={allTabs}
                        activeId={activeId}
                        onSelect={this.handleSelect}
                        onClose={this.handleClose}
                    />
                    {this.renderContent(activeId, userTabs)}
                </div>
            </>
        );
    }
}

export const AdminPanelIsland: React.FC<Props> = (props) => {
    const tabs = useUserTabs();
    const {openUser} = tabs;
    const context = useMemo(() => ({openUser}), [openUser]);

    useEffect(() => {
        const hash = window.location.hash;
        if (hash.includes('user=')) {
            const userId = parseInt(hash.split('user=')[1]?.split('&')[0] || '0', 10);
            if (userId > 0) {
                openUser(userId, `#${userId}`);
                window.history.replaceState(null, '', window.location.pathname + window.location.search);
            }
        }
    }, [openUser]);

    return <UserDetailContext.Provider value={context}><AdminPanel {...props} tabs={tabs} /></UserDetailContext.Provider>;
};
