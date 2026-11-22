import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import {sendPost} from '@common/Api/Send/sendPost';
import {refreshLiveCounts} from '@common/Utils/Data/liveCounts';
import {GridConfig, PageResponse} from '../Shell/types';
import {TabNav, TabDef} from '@common/Components/Layout/Navigation/TabNav';
import {AdminGrid, AdminGridHandle} from '../Grid/AdminGrid';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {SupportTicket, SupportStatus} from '../../Comms/Support/parts/supportTypes';
import {StatusBadge} from '../../Comms/Support/parts/supportRenders';
import {statusLabel, ALL_STATUSES} from '../../Comms/Support/parts/render/supportStatus';
import SupportTicketTab from './SupportTicketTab';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {AdminUserLink} from '../../../Common/people/EntityLinks';
import {UserDetailContext, type UserDetailContextValue} from '../Users/UserDetailContext';
import {UserDetailTab} from '../Users/UserDetailTab';
import {UserTabsStore} from '../Shell/UserTabsStore';
import {ADMIN_URLS} from '../Shell/adminShared';
import {SupportTicketFilters} from './SupportTicket/Forms/SupportTicketFilters';
import {SupportStatusBar} from './SupportTicket/Forms/SupportStatusBar';
import {PageHeader} from '@common/Components/Layout/PageHeader';
import {LifeBuoy, Paperclip} from 'lucide-react';

const ASSIGNEE_UNASSIGNED = '__none__';
type DateField = 'created_at' | 'updated_at';

interface Moderator {
    id: number;
    login: string;
    name: string;
}

interface TicketFilterOptions {
    // Только чтение: опции приходят из снапшота стора и мутировать их нельзя.
    users: readonly {value: string; label: string}[];
    assignees: readonly {value: string; label: string}[];
    hasUnassigned: boolean;
    statusCounts: Partial<Record<SupportStatus, number>>;
}

interface Props {
    ticketsPageUrl: string;
    ticketsInitialData: PageResponse<SupportTicket> | null;
    filterOptionsUrl?: string;
    initialFilterOptions: TicketFilterOptions;
    gridConfig: GridConfig;
    ticketDetailUrl: string;
    clientContextUrl?: string;
    replyUrl: string;
    internalCommentUrl: string;
    changeStatusUrl: string;
    assignUrl: string;
    moderators: Moderator[];
    userDetailUrl: string;
}

interface TicketTabKind {
    kind: 'ticket-detail';
    ticketId: number;
    subject: string;
}

interface UserTabKind {
    kind: 'user-detail';
    accountId: number;
}

interface InternalTab extends TabDef {
    tabKind: TicketTabKind | UserTabKind | null;
}

const MAIN_TAB_ID = 'main';

interface QueueTabs {
    dynamicTabs: InternalTab[];
    activeId: string;
}

class QueueTabStore extends Carburetor<QueueTabs> {
    constructor() {
        super({dynamicTabs: [], activeId: MAIN_TAB_ID});
    }

    readonly snapshot = () => this.getData();
    readonly subscribeSnapshot = (listener: () => void) => {
        const id = this.subscribe(listener);
        return () => this.unsubscribe(id);
    };

    readonly select = (activeId: string) => {
        const state = this.getData();
        if (state.activeId !== activeId) this.setData({...state, activeId});
    };

    open(ticketId: number, subject: string): void {
        const state = this.getData();
        const activeId = `ticket-${ticketId}`;
        if (state.dynamicTabs.some(tab => tab.id === activeId)) {
            this.select(activeId);
            return;
        }
        this.setData({activeId, dynamicTabs: [...state.dynamicTabs, {
            id: activeId,
            label: subject.length > 20 ? subject.slice(0, 20) + '...' : subject,
            closeable: true,
            parentId: MAIN_TAB_ID,
            tabKind: {kind: 'ticket-detail', ticketId, subject},
        }]});
    }

    close(id: string): void {
        const state = this.getData();
        const index = state.dynamicTabs.findIndex(tab => tab.id === id);
        if (index < 0) return;
        const dynamicTabs = state.dynamicTabs.filter(tab => tab.id !== id);
        const activeId = state.activeId === id ? state.dynamicTabs[index - 1]?.id ?? MAIN_TAB_ID : state.activeId;
        this.setData({dynamicTabs, activeId});
    }
}

interface QueueFilters {
    statusFilter: SupportStatus | 'all';
    userId: string;
    assigneeId: string;
    dateField: DateField;
    dateFrom: string;
    dateTo: string;
}

class QueueFilterStore extends Carburetor<QueueFilters> {
    constructor() {
        super({statusFilter: 'all', userId: '', assigneeId: '', dateField: 'updated_at', dateFrom: '', dateTo: ''});
    }

    readonly snapshot = () => this.getData();
    readonly subscribeSnapshot = (listener: () => void) => {
        const id = this.subscribe(listener);
        return () => this.unsubscribe(id);
    };

    // Не update: это имя занято методом базы Carburetor.
    private patch(patch: Partial<QueueFilters>): void {
        const before = this.getData();
        const next = {...before, ...patch};
        if (before.statusFilter === next.statusFilter && before.userId === next.userId &&
            before.assigneeId === next.assigneeId && before.dateField === next.dateField &&
            before.dateFrom === next.dateFrom && before.dateTo === next.dateTo) return;
        this.setData(next);
    }

    readonly setStatusFilter = (statusFilter: QueueFilters['statusFilter']) => this.patch({statusFilter});
    readonly setUserId = (userId: string) => this.patch({userId});
    readonly setAssigneeId = (assigneeId: string) => this.patch({assigneeId});
    readonly setDateField = (dateField: DateField) => this.patch({dateField});
    readonly setDateFrom = (dateFrom: string) => this.patch({dateFrom});
    readonly setDateTo = (dateTo: string) => this.patch({dateTo});
    readonly reset = () => this.patch({userId: '', assigneeId: '', dateFrom: '', dateTo: ''});
}

const SUPPORT_ICON = <LifeBuoy size={22} aria-hidden="true" />;
const rowKey = (row: SupportTicket) => row.id;

interface SubjectProps {
    row: SupportTicket;
    open: (id: number, subject: string) => void;
}

class TicketSubject extends AntiHookComponent<SubjectProps> {
    private readonly open = (event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        const {row, open} = this.props;
        open(row.id, row.subject);
    };

    render() {
        const {row} = this.props;
        const count = row.attachments_count ?? 0;
        return (
            <span className="admin-support-queue-subject">
                <button type="button" className="admin-support-queue-link" data-test-id={`support-ticket-${row.id}`} onClick={this.open}>
                    {row.subject}
                </button>
                {count > 0 && (
                    <span className="conversation-attachments" data-test-id={`support-ticket-attachments-${row.id}`}
                        title={t.Support_HasAttachments([count])}>
                        <Paperclip size={12} aria-hidden="true" />{count}
                    </span>
                )}
            </span>
        );
    }
}

const ticketCellRenderers = {
    user_login: (row: SupportTicket) => (
        <AdminUserLink id={row.account_id} name={row.user_name || row.user_login} role={(row as any).user_role} />
    ),
    status: (row: SupportTicket) => <StatusBadge status={row.status} />,
    updated_at: (row: SupportTicket) => (
        <span className="admin-support-history-time">{formatTs(row.updated_at)}</span>
    ),
    created_at: (row: SupportTicket) => (
        <span className="admin-support-history-time">{formatTs(row.created_at)}</span>
    ),
    unread_staff: (row: SupportTicket) => (
        row.unread_staff > 0
            ? <span className="admin-support-queue-unread">{row.unread_staff}</span>
            : <span className="admin-support-history-party">0</span>
    ),
    assignee_name: (row: SupportTicket) => (
        <span className={row.assignee_name ? 'widget-im-label' : 'admin-support-history-party'}>
            {row.assignee_name || t.Support_Unassigned()}
        </span>
    ),
};

type UserTabs = ReturnType<UserTabsStore['snapshot']>['tabs'];
const OPEN_TICKETS_KEY = 'admin-support-open-tickets';

function saveTicketTabs(dynamicTabs: InternalTab[], activeId: string): void {
    const ticketIds: number[] = [];
    for (const tab of dynamicTabs) if (tab.tabKind?.kind === 'ticket-detail') ticketIds.push(tab.tabKind.ticketId);
    if (ticketIds.length === 0) sessionStorage.removeItem(OPEN_TICKETS_KEY);
    else sessionStorage.setItem(OPEN_TICKETS_KEY, JSON.stringify({ticketIds, activeId}));
}

function totalOf(counts: TicketFilterOptions['statusCounts']): number {
    return Object.values(counts).reduce(addCount, 0);
}

function addCount(sum: number, value: number | undefined): number { return sum + (value ?? 0); }

function visibleStatuses(counts: TicketFilterOptions['statusCounts']): SupportStatus[] {
    return ALL_STATUSES.filter(status => (counts[status] || 0) > 0);
}

function userTabDefinition(tab: UserTabs[number]): InternalTab {
    return {...tab, tabKind: {kind: 'user-detail', accountId: tab.tabKind.accountId}};
}

function hasUserTab(tabs: UserTabs, id: string): boolean {
    return tabs.some(tab => tab.id === id);
}

function findTab(tabs: InternalTab[], id: string): InternalTab | undefined {
    return tabs.find(tab => tab.id === id);
}

type UserTabControls = UserTabsStore;

function openQueueTicket(tabs: QueueTabStore, setActive: UserTabControls['setActiveId'], id: number, subject: string) {
    tabs.open(id, subject);
    setActive(null);
}

function keepFilterOptions(): void {
    // Повторим обновление при следующем действии модератора.
}

function restoreTicketTabs(tabs: QueueTabStore, openUser: UserTabControls['openUser'], setActive: UserTabControls['setActiveId']): void {
    const hash = window.location.hash;
    if (hash.includes('ticket=')) {
        const ticketId = parseInt(hash.split('ticket=')[1]?.split('&')[0] || '0', 10);
        if (ticketId > 0) {
            openQueueTicket(tabs, setActive, ticketId, `#${ticketId}`);
            window.history.replaceState(null, '', window.location.pathname);
        }
        return;
    }
    if (hash.includes('user=')) {
        const userId = parseInt(hash.split('user=')[1]?.split('&')[0] || '0', 10);
        if (userId > 0) {
            openUser(userId, `#${userId}`);
            window.history.replaceState(null, '', window.location.pathname);
        }
        return;
    }
    try {
        const saved = JSON.parse(sessionStorage.getItem(OPEN_TICKETS_KEY) || 'null');
        const savedIds: number[] = Array.isArray(saved?.ticketIds) ? saved.ticketIds : [];
        for (const id of savedIds) openQueueTicket(tabs, setActive, id, `#${id}`);
        if (savedIds.length && typeof saved.activeId === 'string') tabs.select(saved.activeId);
    } catch { /* Устаревшие данные вкладок не восстанавливаем. */ }
}

function queueParams({statusFilter, userId, assigneeId, dateField, dateFrom, dateTo}: QueueFilters) {
    return {
        status: statusFilter === 'all' ? undefined : statusFilter,
        accountId: userId || undefined,
        assigneeId: assigneeId || undefined,
        dateField,
        dateFrom: dateFrom ? Math.floor(new Date(dateFrom + 'T00:00:00Z').getTime() / 1000) : undefined,
        dateTo: dateTo ? Math.floor(new Date(dateTo + 'T23:59:59Z').getTime() / 1000) : undefined,
    };
}

export class AdminSupportIsland extends AntiHookComponent<Props> {
    private readonly tabs = new QueueTabStore();
    private readonly filters = new QueueFilterStore();
    private readonly userTabs = new UserTabsStore();
    private readonly userDetail: UserDetailContextValue = {openUser: this.userTabs.openUser};
    private readonly gridRef = React.createRef<AdminGridHandle<SupportTicket>>();
    private readonly filterOptions = new Carburetor({value: this.props.initialFilterOptions});
    private readonly optionsSnapshot = this.connectSelection(this.filterOptions, state => state.value);
    // AdminGrid перезапрашивает данные при смене identity extraParams: держим объект, пока не сменился снапшот фильтров.
    private paramsCache?: {filters: Readonly<QueueFilters>; value: ReturnType<typeof queueParams>};

    private readonly applyOptions = (response: Awaited<ReturnType<typeof sendPost<{}, TicketFilterOptions>>>) => {
        const value = ('data' in response && response.data) ? response.data : (response as unknown as TicketFilterOptions);
        this.filterOptions.setData({value});
    };

    private readonly reloadTickets = () => {
        this.gridRef.current?.refresh();
        const {filterOptionsUrl} = this.props;
        if (filterOptionsUrl) void sendPost<{}, TicketFilterOptions>(filterOptionsUrl, {}).then(this.applyOptions).catch(keepFilterOptions);
        refreshLiveCounts();
    };

    private extraParams(filters: Readonly<QueueFilters>): ReturnType<typeof queueParams> {
        if (this.paramsCache?.filters === filters) return this.paramsCache.value;
        const value = queueParams(filters);
        this.paramsCache = {filters, value};
        return value;
    }

    private readonly openTicket = (id: number, subject: string) =>
        openQueueTicket(this.tabs, this.userTabs.setActiveId, id, subject);

    private readonly renderSubject = (row: SupportTicket) => <TicketSubject row={row} open={this.openTicket} />;
    private readonly ticketRenders = {...ticketCellRenderers, subject: this.renderSubject};

    private readonly handleSelect = (id: string) => {
        const {tabs, userTabs} = this;
        if (hasUserTab(userTabs.snapshot().tabs, id)) userTabs.setActiveId(id);
        else {
            userTabs.setActiveId(null);
            tabs.select(id);
        }
    };

    private readonly handleClose = (id: string) => {
        const {tabs, userTabs} = this;
        if (hasUserTab(userTabs.snapshot().tabs, id)) userTabs.closeUser(id);
        else tabs.close(id);
    };

    private renderContent(activeTab: InternalTab | undefined, filterOptions: TicketFilterOptions,
        filterState: Readonly<QueueFilters>, extraParams: ReturnType<typeof queueParams>) {
        const {userDetailUrl, ticketDetailUrl, clientContextUrl, replyUrl, internalCommentUrl,
            changeStatusUrl, assignUrl, moderators} = this.props;
        if (!activeTab) return null;

        // User detail tab
        if (activeTab.tabKind && activeTab.tabKind.kind === 'user-detail') {
            return (
                <UserDetailTab
                    accountId={activeTab.tabKind.accountId}
                    detailUrl={userDetailUrl || ADMIN_URLS.detailUrl}
                    setFlagUrl={ADMIN_URLS.setFlagUrl}
                    createTicketUrl={ADMIN_URLS.createTicketUrl}
                />
            );
        }

        if (activeTab.id === MAIN_TAB_ID) return this.renderQueue(filterOptions, filterState, extraParams);

        const tabKind = activeTab.tabKind;
        if (tabKind && tabKind.kind === 'ticket-detail') {
            return (
                <SupportTicketTab
                    ticketId={tabKind.ticketId}
                    ticketDetailUrl={ticketDetailUrl}
                    clientContextUrl={clientContextUrl}
                    replyUrl={replyUrl}
                    internalCommentUrl={internalCommentUrl}
                    changeStatusUrl={changeStatusUrl}
                    assignUrl={assignUrl}
                    moderators={moderators}
                    onTicketChanged={this.reloadTickets}
                />
            );
        }

        return null;
    }

    private renderQueue(options: TicketFilterOptions, filterState: Readonly<QueueFilters>,
        extraParams: ReturnType<typeof queueParams>) {
        const {ticketsPageUrl, ticketsInitialData, gridConfig} = this.props;
        const {statusFilter, userId, assigneeId, dateField, dateFrom, dateTo} = filterState;
        const {statusCounts} = options;
        const all = {value: '', label: t.Admin_Filter_All()};
        const userOptions = [all, ...options.users];
        const assigneeOptions = [all];
        if (options.hasUnassigned) assigneeOptions.push({value: ASSIGNEE_UNASSIGNED, label: t.Support_Unassigned()});
        assigneeOptions.push(...options.assignees);
        return (
            <div>
                <SupportStatusBar total={totalOf(statusCounts)} statuses={visibleStatuses(statusCounts)}
                    counts={statusCounts} active={statusFilter} statusLabel={statusLabel} onSelect={this.filters.setStatusFilter} />
                <SupportTicketFilters userOptions={userOptions} assigneeOptions={assigneeOptions}
                    userId={userId} assigneeId={assigneeId} dateField={dateField} dateFrom={dateFrom} dateTo={dateTo}
                    onUserId={this.filters.setUserId} onAssigneeId={this.filters.setAssigneeId} onDateField={this.filters.setDateField}
                    onDateFrom={this.filters.setDateFrom} onDateTo={this.filters.setDateTo} onReset={this.filters.reset} />
                <AdminGrid<SupportTicket> ref={this.gridRef} pageUrl={ticketsPageUrl} initialData={ticketsInitialData}
                    extraParams={extraParams} config={gridConfig} rowKey={rowKey} renders={this.ticketRenders}
                    emptyMessage={t.Support_NoTickets()} />
            </div>
        );
    }

    protected override useEffects(): void {
        const {dynamicTabs, activeId} = this.tabs.snapshot();
        this.useEffect('restore', () => {
            restoreTicketTabs(this.tabs, this.userTabs.openUser, this.userTabs.setActiveId);
        }, []);
        this.useEffect('save', () => {
            saveTicketTabs(dynamicTabs, activeId);
        }, [dynamicTabs, activeId]);
    }

    render() {
        const options = this.optionsSnapshot();
        const tabState = this.useCarburetor(this.tabs);
        const filterState = this.useCarburetor(this.filters);
        const user = this.useCarburetor(this.userTabs);
        const activeId = user.activeId ?? tabState.activeId;
        const allTabs: InternalTab[] = [
            {id: MAIN_TAB_ID, label: t.Admin_Support(), closeable: false, tabKind: null},
            ...tabState.dynamicTabs,
            ...user.tabs.map(userTabDefinition),
        ];
        return (
            <UserDetailContext.Provider value={this.userDetail}>
                <PageHeader title={t.Admin_Support()} icon={SUPPORT_ICON} />
                <div className="section-soft">
                    <TabNav tabs={allTabs} activeId={activeId} onSelect={this.handleSelect} onClose={this.handleClose} />
                    {this.renderContent(findTab(allTabs, activeId), options, filterState, this.extraParams(filterState))}
                </div>
            </UserDetailContext.Provider>
        );
    }
}
