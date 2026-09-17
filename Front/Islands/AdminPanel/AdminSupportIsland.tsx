import * as React from 'react';
import {useState, useMemo, useEffect} from 'react';
import {sendPost} from '@common/Api/Send/sendPost';
import {refreshLiveCounts} from '@common/Utils/Data/liveCounts';
import {GridConfig} from './types';
import {TabNav, TabDef} from '@common/Components/Layout/Navigation/TabNav';
import {AdminGrid} from './AdminGrid';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {SupportTicket, SupportStatus} from '../Support/supportTypes';
import {StatusBadge, statusLabel, ALL_STATUSES} from '../Support/supportRenders';
import SupportTicketTab from './SupportTicketTab';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {AdminUserLink} from '../../Common/people/EntityLinks';
import {UserDetailContext} from './UserDetailContext';
import {UserDetailTab} from './UserDetailTab';
import {useUserTabs} from './useUserTabs';
import {ADMIN_URLS} from './AdminPageWrapper';
import {SupportStatusBar, SupportTicketFilters} from './SupportTicket/SupportTicketFilters';
import {PageHeader} from '@common/Components/Layout/PageHeader';
import {LifeBuoy, Paperclip} from 'lucide-react';
import {DateInput} from '@common/Components/ui/DateInput';

const ASSIGNEE_UNASSIGNED = '__none__';
type DateField = 'created_at' | 'updated_at';

interface Moderator {
    id: number;
    login: string;
    name: string;
}

interface Props {
    tickets: SupportTicket[];
    gridConfig: GridConfig;
    ticketDetailUrl: string;
    clientContextUrl?: string;
    replyUrl: string;
    internalCommentUrl: string;
    changeStatusUrl: string;
    assignUrl: string;
    moderators: Moderator[];
    userDetailUrl: string;
    ticketsListUrl: string;
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

export const AdminSupportIsland: React.FC<Props> = ({
    tickets: initialTickets, gridConfig, ticketDetailUrl, clientContextUrl, replyUrl, internalCommentUrl,
    changeStatusUrl, assignUrl, moderators, userDetailUrl, ticketsListUrl,
}) => {
    const mainTabId = 'main';

    // D-198: очередь больше не заморожена в HTML. Перечитывается ровно тогда,
    // когда открытая вкладка сообщает, что обращение изменилось.
    const [tickets, setTickets] = useState<SupportTicket[]>(initialTickets);

    const reloadTickets = React.useCallback(() => {
        sendPost(ticketsListUrl, {}).then((r: any) => {
            if (Array.isArray(r?.tickets)) setTickets(r.tickets);
        }).catch(() => {
            // Очередь осталась прежней — врать ей нечем, следующее действие
            // модератора попробует снова.
        });
        // Значок непрочитанных обращений в шапке считает тот же сервер.
        refreshLiveCounts();
    }, [ticketsListUrl]);

    const [dynamicTabs, setDynamicTabs] = useState<InternalTab[]>([]);
    const [activeId, setActiveId]       = useState<string>(mainTabId);
    const [statusFilter, setStatusFilter] = useState<SupportStatus | 'all'>('all');
    const [userId, setUserId]         = useState<string>('');
    const [assigneeId, setAssigneeId] = useState<string>('');
    const [dateField, setDateField]   = useState<DateField>('updated_at');
    const [dateFrom, setDateFrom]     = useState<string>('');
    const [dateTo, setDateTo]         = useState<string>('');

    // User tabs via shared hook
    const {userTabs, activeUserTabId, setActiveUserTabId, openUser, closeUser} = useUserTabs();

    // Which open tickets survive a trip away from this page (e.g. checking a
    // slot/booking in a different admin section) and back — a moderator
    // mid-investigation on ticket #9 used to have to re-find and reopen it
    // from the queue every time, since dynamicTabs is plain React state that
    // resets on remount. sessionStorage (not localStorage) so it clears with
    // the tab/session, matching how long this context should realistically live.
    const OPEN_TICKETS_KEY = 'admin-support-open-tickets';

    // Read #user={id} or #ticket={id} from URL hash on mount (explicit deep
    // link, e.g. from an email notification) — falls back to whatever ticket
    // tabs were open before navigating to another admin section.
    useEffect(() => {
        const hash = window.location.hash;
        if (hash.includes('ticket=')) {
            const ticketId = parseInt(hash.split('ticket=')[1]?.split('&')[0] || '0', 10);
            if (ticketId > 0) {
                const ticket = tickets.find(x => x.id === ticketId);
                openTicket(ticketId, ticket?.subject || `#${ticketId}`);
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
            for (const ticketId of savedIds) {
                // fetchTickets() caps at the 200 most recently updated — under
                // active queue traffic a ticket that's been open a while can
                // fall out of that window before the moderator comes back
                // (D-168). Same fallback as the #ticket= hash path below:
                // open with a placeholder label, SupportTicketTab fetches the
                // real subject independently once mounted.
                const ticket = tickets.find(x => x.id === ticketId);
                openTicket(ticketId, ticket?.subject || `#${ticketId}`);
            }
            if (savedIds.length > 0 && typeof saved.activeId === 'string') {
                setActiveId(saved.activeId);
            }
        } catch { /* corrupt/old shape — ignore, start clean */ }
    }, []);

    // Keep the saved set in sync with whichever ticket tabs are actually open.
    useEffect(() => {
        const ticketIds = dynamicTabs
            .filter((tab): tab is InternalTab & {tabKind: TicketTabKind} => tab.tabKind?.kind === 'ticket-detail')
            .map(tab => tab.tabKind.ticketId);
        if (ticketIds.length === 0) {
            sessionStorage.removeItem(OPEN_TICKETS_KEY);
        } else {
            sessionStorage.setItem(OPEN_TICKETS_KEY, JSON.stringify({ticketIds, activeId}));
        }
    }, [dynamicTabs, activeId]);

    // Sync active tab: user tabs take priority when active
    const effectiveActiveId = activeUserTabId ?? activeId;

    const statusCounts = useMemo(() => {
        const counts: Partial<Record<SupportStatus, number>> = {};
        for (const ticket of tickets) {
            counts[ticket.status] = (counts[ticket.status] || 0) + 1;
        }
        return counts;
    }, [tickets]);

    const visibleFilters = useMemo(() => {
        return ALL_STATUSES.filter(s => (statusCounts[s] || 0) > 0);
    }, [statusCounts]);

    const userOptions = useMemo(() => {
        const map = new Map<string, string>();
        for (const r of tickets) {
            const id = String(r.account_id);
            if (!map.has(id)) {
                map.set(id, r.user_name || r.user_login || `#${r.account_id}`);
            }
        }
        const arr = Array.from(map.entries()).map(([value, label]) => ({value, label}));
        arr.sort((a, b) => a.label.localeCompare(b.label));
        return [{value: '', label: t.Admin_Filter_All()}, ...arr];
    }, [tickets]);

    const assigneeOptions = useMemo(() => {
        const map = new Map<string, string>();
        let hasUnassigned = false;
        for (const r of tickets) {
            if (r.assignee_id === null) { hasUnassigned = true; continue; }
            const id = String(r.assignee_id);
            if (!map.has(id)) {
                map.set(id, r.assignee_name || r.assignee_login || `#${r.assignee_id}`);
            }
        }
        const arr = Array.from(map.entries()).map(([value, label]) => ({value, label}));
        arr.sort((a, b) => a.label.localeCompare(b.label));
        const out: {value: string; label: string}[] = [{value: '', label: t.Admin_Filter_All()}];
        if (hasUnassigned) out.push({value: ASSIGNEE_UNASSIGNED, label: t.Support_Unassigned()});
        out.push(...arr);
        return out;
    }, [tickets]);

    const filteredTickets = useMemo(() => {
        let res = tickets;
        if (statusFilter !== 'all') res = res.filter(ticket => ticket.status === statusFilter);
        if (userId) res = res.filter(ticket => String(ticket.account_id) === userId);
        if (assigneeId) {
            if (assigneeId === ASSIGNEE_UNASSIGNED) {
                res = res.filter(ticket => ticket.assignee_id === null);
            } else {
                res = res.filter(ticket => String(ticket.assignee_id ?? '') === assigneeId);
            }
        }
        if (dateFrom) {
            const tsFrom = Math.floor(new Date(dateFrom + 'T00:00:00Z').getTime() / 1000);
            res = res.filter(ticket => (ticket[dateField] ?? 0) >= tsFrom);
        }
        if (dateTo) {
            const tsTo = Math.floor(new Date(dateTo + 'T23:59:59Z').getTime() / 1000);
            res = res.filter(ticket => (ticket[dateField] ?? 0) <= tsTo);
        }
        return res;
    }, [tickets, statusFilter, userId, assigneeId, dateField, dateFrom, dateTo]);

    const staticTabs: InternalTab[] = [
        {id: mainTabId, label: t.Admin_Support(), closeable: false, tabKind: null},
    ];

    const allTabs: InternalTab[] = [
        ...staticTabs,
        ...dynamicTabs,
        ...userTabs.map(ut => ({...ut, tabKind: {kind: 'user-detail' as const, accountId: ut.tabKind.accountId}})),
    ];

    const openTicket = (ticketId: number, subject: string) => {
        const tabId = `ticket-${ticketId}`;
        setDynamicTabs(prev => {
            if (prev.find(tab => tab.id === tabId)) {
                setActiveId(tabId);
                return prev;
            }
            return [...prev, {
                id: tabId,
                label: subject.length > 20 ? subject.slice(0, 20) + '...' : subject,
                closeable: true,
                parentId: mainTabId,
                tabKind: {kind: 'ticket-detail', ticketId, subject},
            }];
        });
        setActiveId(tabId);
        setActiveUserTabId(null); // Deactivate any user tab
    };

    const handleSelect = (id: string) => {
        // Check if it's a user tab
        if (userTabs.find(ut => ut.id === id)) {
            setActiveUserTabId(id);
        } else {
            setActiveUserTabId(null);
            setActiveId(id);
        }
    };

    const handleClose = (id: string) => {
        // Check if it's a user tab
        if (userTabs.find(ut => ut.id === id)) {
            closeUser(id);
            return;
        }
        setDynamicTabs(prev => {
            const next = prev.filter(tab => tab.id !== id);
            if (activeId === id) {
                const allBefore = [...staticTabs, ...prev];
                const idx = allBefore.findIndex(tab => tab.id === id);
                const allAfter = [...staticTabs, ...next];
                setActiveId(allAfter[Math.max(0, idx - 1)]?.id ?? mainTabId);
            }
            return next;
        });
    };

    const activeTab = allTabs.find(tab => tab.id === effectiveActiveId);

    const ticketRenders = {
        subject: (row: SupportTicket) => (
            <span className="inline-flex items-center gap-1">
                <button
                    type="button"
                    className="admin-link-btn-strong"
                    data-test-id={`support-ticket-${row.id}`}
                    onClick={e => { e.stopPropagation(); openTicket(row.id, row.subject); }}
                >
                    {row.subject}
                </button>
                {/* Whether a ticket carries files used to be discoverable only
                    by opening it — a queue of two hundred rows said nothing. */}
                {(row.attachments_count ?? 0) > 0 && (
                    <span
                        className="text-muted text-xs inline-flex items-center gap-0.5"
                        data-test-id={`support-ticket-attachments-${row.id}`}
                        title={t.Support_HasAttachments([row.attachments_count as number])}
                    >
                        <Paperclip size={12} aria-hidden="true" />
                        {row.attachments_count}
                    </span>
                )}
            </span>
        ),
        user_login: (row: SupportTicket) => (
            <AdminUserLink id={row.account_id} name={row.user_name || row.user_login} role={(row as any).user_role} />
        ),
        status: (row: SupportTicket) => <StatusBadge status={row.status} />,
        updated_at: (row: SupportTicket) => (
            <span className="text-muted text-xs whitespace-nowrap">{formatTs(row.updated_at)}</span>
        ),
        created_at: (row: SupportTicket) => (
            <span className="text-muted text-xs whitespace-nowrap">{formatTs(row.created_at)}</span>
        ),
        unread_staff: (row: SupportTicket) => (
            row.unread_staff > 0
                ? <span className="status-danger admin-unread-pill">{row.unread_staff}</span>
                : <span className="text-muted">0</span>
        ),
        assignee_name: (row: SupportTicket) => (
            <span className={row.assignee_name ? 'text-on-surface' : 'text-muted'}>
                {row.assignee_name || t.Support_Unassigned()}
            </span>
        ),
    };

    const renderContent = () => {
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

        if (effectiveActiveId === mainTabId) {
            return (
                <div>
                    <SupportStatusBar
                        total={tickets.length}
                        statuses={visibleFilters}
                        counts={statusCounts}
                        active={statusFilter}
                        statusLabel={statusLabel}
                        onSelect={setStatusFilter}
                    />
                    <SupportTicketFilters
                        userOptions={userOptions}
                        assigneeOptions={assigneeOptions}
                        userId={userId}
                        assigneeId={assigneeId}
                        dateField={dateField}
                        dateFrom={dateFrom}
                        dateTo={dateTo}
                        onUserId={setUserId}
                        onAssigneeId={setAssigneeId}
                        onDateField={setDateField}
                        onDateFrom={setDateFrom}
                        onDateTo={setDateTo}
                        onReset={() => { setUserId(''); setAssigneeId(''); setDateFrom(''); setDateTo(''); }}
                    />
                    <AdminGrid<SupportTicket>
                        rows={filteredTickets}
                        config={gridConfig}
                        rowKey={row => row.id}
                        renders={ticketRenders}
                        emptyMessage={t.Support_NoTickets()}
                    />
                </div>
            );
        }

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
                    onTicketChanged={reloadTickets}
                />
            );
        }

        return null;
    };

    return (
        <UserDetailContext.Provider value={{openUser}}>
            <PageHeader title={t.Admin_Support()} icon={<LifeBuoy size={22} aria-hidden="true" />} />
            <div className="section-soft">
                <TabNav
                    tabs={allTabs}
                    activeId={effectiveActiveId}
                    onSelect={handleSelect}
                    onClose={handleClose}
                />
                {renderContent()}
            </div>
        </UserDetailContext.Provider>
    );
};
