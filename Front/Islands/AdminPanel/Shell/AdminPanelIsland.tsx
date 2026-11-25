import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import type {AdminUser, GridConfig, UserTab} from './shared/types';
import {UsersSection} from '../Users/UsersSection';
import {AdminCommentsSection, AdminCommentRow, CommentsAccountOption} from '../Support/AdminCommentsSection';
import {AdminTokensSection} from '../System/AdminTokensSection';
import {UserDetailContext} from '../Users/UserDetailContext';
import type {UserDetailContextValue} from '../Users/UserDetailContext';
import {UserDetailTab} from '../Users/UserDetailTab';
import {UserTabsStore} from './UserTabsStore';
import {ADMIN_URLS} from './navigation/adminUrls';
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

    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
function isStaticTab(id: string): id is StaticTabId {
    return (STATIC_TABS as ReadonlyArray<string>).includes(id);
}

    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
function readTabFromUrl(): StaticTabId | null {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    return tab !== null && isStaticTab(tab) ? tab : null;
}

    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
function writeTabToUrl(tab: StaticTabId): void {
    const url = new URL(window.location.href);
    if (tab === 'users') {
        url.searchParams.delete('tab');
    } else {
        url.searchParams.set('tab', tab);
    }
    window.history.pushState(null, '', url.toString());
}

interface PanelProps extends Props {
    tabs: UserTabsStore;
}

class AdminPanel extends AntiHookComponent<PanelProps> {
    private readonly ui = new Carburetor({staticTab: readTabFromUrl() ?? this.props.initialTab ?? 'users'});

    /** Синхронизирует жизненный цикл компонента с его внешними подписками. */
    componentDidMount(): void {
        super.componentDidMount();
        window.addEventListener('popstate', this.onPop);
    }

    /** Синхронизирует жизненный цикл компонента с его внешними подписками. */
    componentWillUnmount(): void {
        window.removeEventListener('popstate', this.onPop);
        super.componentWillUnmount();
    }

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly onPop = () => this.ui.setData({staticTab: readTabFromUrl() ?? 'users'});

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly handleSelect = (id: string) => {
        if (isStaticTab(id)) {
            this.props.tabs.setActiveId(null);
            this.ui.setData({staticTab: id});
            writeTabToUrl(id);
        } else if (this.props.tabs.getData().tabs.some(ut => ut.id === id)) {
            this.props.tabs.setActiveId(id);
        }
    };

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly handleClose = (id: string) => {
        if (this.props.tabs.getData().tabs.some(ut => ut.id === id)) this.props.tabs.closeUser(id);
    };

    /** Формирует представление данных для соответствующего раздела панели. */
    private renderContent(activeId: string, activeAccountId: number | undefined) {
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
                {activeAccountId !== undefined && (
                    <UserDetailTab
                        accountId={activeAccountId}
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

    /** Формирует представление данных для соответствующего раздела панели. */
    render() {
        const {staticTab} = this.useCarburetor(this.ui);
        const {tabs: userTabs, activeId: activeUserTabId} = this.useCarburetor(this.props.tabs);

        const activeId: string = activeUserTabId ?? staticTab;

        // Плоские копии: TabNav — класс, его собственные чтения не записываются,
        // поэтому нужные ему поля читаются здесь.
        const userTabDefs: TabDef[] = [];
        let activeAccountId: number | undefined;
        for (const tab of userTabs) {
            userTabDefs.push({id: tab.id, label: tab.label, closeable: tab.closeable});
            if (tab.id === activeId) activeAccountId = tab.tabKind.accountId;
        }
        const allTabs: TabDef[] = [
            {id: 'users', label: t.Admin_Users(), closeable: false},
            {id: 'comments', label: t.Admin_Comments(), closeable: false},
            {id: 'tokens', label: t.Admin_Tokens(), closeable: false},
            ...userTabDefs,
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
                    {this.renderContent(activeId, activeAccountId)}
                </div>
            </>
        );
    }
}

export class AdminPanelIsland extends AntiHookComponent<Props> {
    private readonly userTabs = new UserTabsStore();
    private readonly contextValue: UserDetailContextValue = {openUser: this.userTabs.openUser};

    /** Синхронизирует жизненный цикл компонента с его внешними подписками. */
    componentDidMount(): void {
        super.componentDidMount();
        const hash = window.location.hash;
        if (!hash.includes('user=')) return;
        const userId = parseInt(hash.split('user=')[1]?.split('&')[0] || '0', 10);
        if (!(userId > 0)) return;
        this.userTabs.openUser(userId, `#${userId}`);
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    /** Формирует представление данных для соответствующего раздела панели. */
    render() {
        return (
            <UserDetailContext.Provider value={this.contextValue}>
                <AdminPanel {...this.props} tabs={this.userTabs} />
            </UserDetailContext.Provider>
        );
    }
}
