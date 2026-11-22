import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import {AdminUser, GridConfig, PageResponse, UserTab} from '../Shell/types';
import {AdminGrid, AdminGridHandle} from '../Grid/AdminGrid';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {sendPost} from '@common/Api/Send/sendPost';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {UserDetailContext, type UserDetailContextValue} from './UserDetailContext';
import {flag, roleFlagLabel} from './usersFlags';
import {FlagBtn, type FlagButtonTone} from './FlagBtn';

type TabCounts = Record<UserTab, number>;

interface Props {
    pageUrl: string;
    initialData: PageResponse<AdminUser> | null;
    tabCountsUrl?: string;
    initialTabCounts: TabCounts;
    setFlagUrl?: string;
    setUserTypeUrl?: string;
    config: GridConfig;
}

type TabDef = {key: UserTab; labelFn: () => string};

const tabs: TabDef[] = [
    {key: 'all',        labelFn: () => t.Admin_Tab_All()},
    {key: 'experts',   labelFn: () => t.Admin_Tab_Experts()},
    {key: 'users',   labelFn: () => t.Admin_Tab_Users()},
    {key: 'moderators', labelFn: () => t.Admin_Tab_Moderators()},
    {key: 'owners',     labelFn: () => t.Admin_Tab_Owners()},
    {key: 'admins',     labelFn: () => t.Admin_Tab_Admins()},
];

// Role flags/type changes can move a row out of the currently viewed tab
// (e.g. revoking IS_MODERATOR while on the "Moderators" tab) — those need a
// server refetch of the current page, not a local patch, or the row would
// linger until the next unrelated refresh.
const ROLE_TABS = new Set<UserTab>(['moderators', 'owners', 'admins']);
const TYPE_TABS = new Set<UserTab>(['experts', 'users']);

interface TabButtonProps {
    tabKey: UserTab;
    label: string;
    count: number;
    active: boolean;
    onSelect: (key: UserTab) => void;
}

class TabButton extends AntiHookComponent<TabButtonProps> {
    private readonly select = () => this.props.onSelect(this.props.tabKey);

    render() {
        const {tabKey, label, count, active} = this.props;
        return (
            <li className="admin-users-tab-item">
                <button type="button" data-test-id={`filter-tab-${tabKey}`} aria-selected={active}
                    className="admin-users-tab-button" onClick={this.select}>
                    {label} <span className="admin-users-tab-count">({count})</span>
                </button>
            </li>
        );
    }
}

/** Тип аккаунта и переключатель «сделать преподавателем». */
const UserTypeCell: React.FC<{
    row: {id: number; type: string};
    canChange: boolean;
    pending: boolean;
    onToggle: () => void;
}> = ({row, canChange, pending, onToggle}) => {
    const isExpert = row.type === 'expert';

    return (
        <div className="widget-header-actions">
            <span className="admin-user-role-badge" data-tone={isExpert ? 'info' : 'muted'}>
                {isExpert ? t.Reg_AccountTypeExpert() : t.Reg_AccountTypeUser()}
            </span>
            {canChange && (
                <FlagBtn
                    testId={`set-type-${row.id}`}
                    label={isExpert ? t.Admin_Flag_RevokeExpert() : t.Admin_Flag_GrantExpert()}
                    active={isExpert}
                    cls={['btn-outline-danger', 'btn-outline-primary']}
                    disabled={pending}
                    onClick={onToggle}
                />
            )}
        </div>
    );
};

type FlagKey = 'IS_APPROVED' | 'IS_DISABLED' | 'IS_MODERATOR' | 'IS_OWNER' | 'IS_ADMIN';

interface FlagDef {
    key: FlagKey;
    cls: [FlagButtonTone, FlagButtonTone];
    label: (r: AdminUser) => string;
    title?: (r: AdminUser) => string | undefined;
    expertOnly?: boolean;
    lockedBy?: (r: AdminUser) => boolean;
}

const flagDefs: Record<FlagKey, FlagDef> = {
    IS_APPROVED: {
        key: 'IS_APPROVED',
        cls: ['btn-outline-danger', 'btn-success'],
        label: r => flag(r.IS_APPROVED) ? t.Admin_Revoke() : t.Admin_Approve(),
        expertOnly: true,
        // D-237: сервер (actorMayActOn) отклоняет любой флаг для аккаунта
        // с более высоким рангом — кнопка раньше не намекала на это и
        // после клика показывала нелокализованный "Access denied".
        title: r => (flag(r.IS_ADMIN) || flag(r.IS_OWNER)) ? t.Admin_Flag_TargetOutranksYou() : undefined,
        lockedBy: r => flag(r.IS_ADMIN) || flag(r.IS_OWNER),
    },
    IS_DISABLED: {
        key: 'IS_DISABLED',
        cls: ['btn-secondary', 'btn-outline-danger'],
        label: r => flag(r.IS_DISABLED) ? t.Admin_Enable() : t.Admin_Disable(),
        title: r => (flag(r.IS_ADMIN) || flag(r.IS_OWNER)) ? t.Admin_Flag_TargetOutranksYou() : undefined,
        lockedBy: r => flag(r.IS_ADMIN) || flag(r.IS_OWNER),
    },
    IS_MODERATOR: {
        key: 'IS_MODERATOR',
        cls: ['btn-outline-danger', 'btn-outline-primary'],
        label: r => roleFlagLabel(t.Admin_Role_Moderator(), flag(r.IS_MODERATOR)),
        title: r => flag(r.IS_ADMIN) ? t.Admin_Flag_RemoveAdminFirst()
            : flag(r.IS_OWNER) ? t.Admin_Flag_OwnerHasModeratorRights()
                : flag(r.IS_MODERATOR) ? t.Admin_Flag_RevokeModerator() : t.Admin_Flag_GrantModerator(),
        lockedBy: r => flag(r.IS_ADMIN) || flag(r.IS_OWNER),
    },
    IS_OWNER: {
        key: 'IS_OWNER',
        cls: ['btn-outline-danger', 'btn-outline-primary'],
        label: r => roleFlagLabel(t.Admin_Role_Owner(), flag(r.IS_OWNER)),
        title: r => flag(r.IS_ADMIN) ? t.Admin_Flag_RemoveAdminFirst()
            : flag(r.IS_OWNER) ? t.Admin_Flag_RevokeOwner() : t.Admin_Flag_GrantOwner(),
        lockedBy: r => flag(r.IS_ADMIN),
    },
    IS_ADMIN: {
        key: 'IS_ADMIN',
        cls: ['btn-outline-danger', 'btn-outline-primary'],
        label: r => roleFlagLabel(t.Admin_Role_Admin(), flag(r.IS_ADMIN)),
        title: r => flag(r.IS_ADMIN) ? t.Admin_Flag_RevokeAdmin() : t.Admin_Flag_GrantAdmin(),
    },
};

/** Кнопка флага роли/статуса в строке таблицы. */
interface FlagCellProps {
    row: AdminUser;
    def: FlagDef;
    pending: boolean;
    onSetFlag: (userId: number, name: FlagKey, value: 0 | 1) => void;
}

class UserFlagCell extends AntiHookComponent<FlagCellProps> {
    private readonly toggle = () => {
        const {row, def, onSetFlag} = this.props;
        onSetFlag(row.id, def.key, flag(row[def.key]) ? 0 : 1);
    };

    render() {
        const {row, def, pending} = this.props;
        if (def.expertOnly && row.type !== 'expert') return null;
        return (
            <FlagBtn testId={`flag-${def.key}-${row.id}`} label={def.label(row)} title={def.title?.(row)}
                active={flag(row[def.key])} cls={def.cls} disabled={pending || (def.lockedBy?.(row) ?? false)}
                onClick={this.toggle} />
        );
    }
}

class UserLoginCell extends AntiHookComponent<{row: AdminUser; onOpen: (id: number, label: string) => void}> {
    private readonly open = () => {
        const {row, onOpen} = this.props;
        onOpen(row.id, row.name || row.login);
    };

    render() {
        const {row} = this.props;
        return (
            <button type="button" data-test-id={`user-login-${row.id}`} className="admin-users-login" onClick={this.open}>
                {row.login}
            </button>
        );
    }
}

interface ListState {
    activeTab: UserTab;
    tabCounts: TabCounts;
    pending: Record<number, boolean>;
}

class UsersListState extends Carburetor<ListState> {
    constructor(tabCounts: TabCounts) {
        super({activeTab: 'all', tabCounts, pending: {}});
    }

    readonly snapshot = () => this.getData();
    readonly subscribeSnapshot = (listener: () => void) => {
        const id = this.subscribe(listener);
        return () => this.unsubscribe(id);
    };

    readonly setActiveTab = (activeTab: UserTab) => {
        const state = this.getData();
        if (state.activeTab !== activeTab) this.setData({...state, activeTab});
    };

    readonly setTabCounts = (tabCounts: TabCounts) => this.setData({...this.getData(), tabCounts});

    setPending(id: number, pending: boolean): void {
        const state = this.getData();
        this.setData({...state, pending: {...state.pending, [id]: pending}});
    }
}

function isVisibleColumn(column: GridConfig['columns'][number]): boolean {
    return column.key !== 'IS_APPROVED';
}

function userRowKey(row: AdminUser): number {
    return row.id;
}

function renderUserId(row: AdminUser) {
    return <span className="token-cell-muted">{row.id}</span>;
}

function renderLastOnline(row: AdminUser) {
    return <span className="token-registration-ip">{formatTs(row.last_online_time)}</span>;
}

function patchUser(rows: AdminUser[], userId: number, patch: Partial<AdminUser>): AdminUser[] {
    const index = rows.findIndex(row => row.id === userId);
    if (index < 0) return rows;
    const next = rows.slice();
    next[index] = {...rows[index], ...patch};
    return next;
}

function renderTabButtons(activeTab: UserTab, counts: TabCounts, onSelect: (tab: UserTab) => void) {
    return tabs.map(tab => <TabButton key={tab.key} tabKey={tab.key} label={tab.labelFn()}
        count={counts[tab.key]} active={activeTab === tab.key} onSelect={onSelect} />);
}

class UsersListActions {
    constructor(private readonly ui: UsersListState, private readonly gridRef: React.RefObject<AdminGridHandle<AdminUser>>,
        private readonly readProps: () => Props) {}

    private async refreshTabCounts(): Promise<void> {
        const {tabCountsUrl} = this.readProps();
        const {ui} = this;
        if (!tabCountsUrl) return;
        try {
            const resp = await sendPost<{}, TabCounts>(tabCountsUrl, {});
            const data = ('data' in resp && resp.data) ? resp.data : (resp as unknown as TabCounts);
            ui.setTabCounts(data);
        } catch {
            // best-effort — stale counts are cosmetic, not worth surfacing an error for
        }
    }

    readonly setFlag = async (userId: number, flagName: FlagKey, value: 0 | 1) => {
        const {setFlagUrl} = this.readProps();
        const {ui, gridRef} = this;
        const {activeTab} = ui.getData();
        if (!setFlagUrl || ui.getData().pending[userId]) return;
        ui.setPending(userId, true);
        try {
            const csrf = (window as any).__GARNET_CSRF__ ?? '';
            await sendPost(setFlagUrl, {CSRF_TOKEN: csrf, user_id: userId, flag: flagName, value});
            const affectsTab = flagName === 'IS_MODERATOR' || flagName === 'IS_OWNER' || flagName === 'IS_ADMIN';
            if (affectsTab && ROLE_TABS.has(activeTab)) {
                gridRef.current?.refresh();
            } else {
                gridRef.current?.setItems(rows => patchUser(rows, userId, {[flagName]: value || null}));
            }
            if (affectsTab) void this.refreshTabCounts();
        } finally {
            ui.setPending(userId, false);
        }
    };

    readonly setUserType = async (userId: number, nextType: 'user' | 'expert') => {
        const {setUserTypeUrl} = this.readProps();
        const {ui, gridRef} = this;
        const {activeTab} = ui.getData();
        if (!setUserTypeUrl || ui.getData().pending[userId]) return;
        ui.setPending(userId, true);
        try {
            const csrf = (window as any).__GARNET_CSRF__ ?? '';
            await sendPost(setUserTypeUrl, {CSRF_TOKEN: csrf, user_id: userId, type: nextType});
            if (TYPE_TABS.has(activeTab)) {
                gridRef.current?.refresh();
            } else {
                gridRef.current?.setItems(rows => patchUser(rows, userId, {type: nextType}));
            }
            void this.refreshTabCounts();
        } finally {
            ui.setPending(userId, false);
        }
    };
}

export class UsersSection extends AntiHookComponent<Props> {
    static contextType = UserDetailContext;
    declare context: UserDetailContextValue;

    private readonly ui = new UsersListState(this.props.initialTabCounts);
    private readonly gridRef = React.createRef<AdminGridHandle<AdminUser>>();
    private readonly actions = new UsersListActions(this.ui, this.gridRef, () => this.props);

    private extraParams?: {tab: UserTab; value: {tab: UserTab}};
    private gridConfig?: {config: GridConfig; tab: UserTab; value: GridConfig};

    private readonly renderLogin = (row: AdminUser) => <UserLoginCell row={row} onOpen={this.context.openUser} />;

    private paramsFor(tab: UserTab): {tab: UserTab} {
        const cached = this.extraParams;
        if (cached?.tab === tab) return cached.value;
        const value = {tab};
        this.extraParams = {tab, value};
        return value;
    }

    private configFor(tab: UserTab): GridConfig {
        const {config} = this.props;
        if (tab === 'experts' || tab === 'all') return config;
        const cached = this.gridConfig;
        if (cached?.config === config && cached.tab === tab) return cached.value;
        const value = {...config, columns: config.columns.filter(isVisibleColumn)};
        this.gridConfig = {config, tab, value};
        return value;
    }

    private renderTabs(activeTab: UserTab, tabCounts: TabCounts) {
        return (
            <ul className="admin-users-tabs">
                {renderTabButtons(activeTab, tabCounts, this.ui.setActiveTab)}
            </ul>
        );
    }

    private renderGrid(activeTab: UserTab, pending: Record<number, boolean>) {
        const {pageUrl, initialData, setUserTypeUrl} = this.props;
        const extraParams = this.paramsFor(activeTab);
        const gridConfig = this.configFor(activeTab);
        return (
            <AdminGrid
                ref={this.gridRef}
                pageUrl={pageUrl}
                initialData={initialData}
                extraParams={extraParams}
                config={gridConfig}
                rowKey={userRowKey}
                emptyMessage={t.Admin_NoUsers()}
                renders={{
                    id:    renderUserId,
                    login: this.renderLogin,
                    type: r => <UserTypeCell row={r} canChange={!!setUserTypeUrl} pending={!!pending[r.id]} onToggle={() => this.actions.setUserType(r.id, r.type === 'expert' ? 'user' : 'expert')} />,
                    last_online_time: renderLastOnline,
                    IS_APPROVED: r => <UserFlagCell row={r} def={flagDefs.IS_APPROVED} pending={!!pending[r.id]} onSetFlag={this.actions.setFlag} />,
                    IS_DISABLED: r => <UserFlagCell row={r} def={flagDefs.IS_DISABLED} pending={!!pending[r.id]} onSetFlag={this.actions.setFlag} />,
                    IS_MODERATOR: r => <UserFlagCell row={r} def={flagDefs.IS_MODERATOR} pending={!!pending[r.id]} onSetFlag={this.actions.setFlag} />,
                    IS_OWNER: r => <UserFlagCell row={r} def={flagDefs.IS_OWNER} pending={!!pending[r.id]} onSetFlag={this.actions.setFlag} />,
                    IS_ADMIN: r => <UserFlagCell row={r} def={flagDefs.IS_ADMIN} pending={!!pending[r.id]} onSetFlag={this.actions.setFlag} />,
                }}
            />
        );
    }

    render() {
        const {activeTab, tabCounts, pending} = this.useCarburetor(this.ui);
        return (
            <div>
                {this.renderTabs(activeTab, tabCounts)}
                {this.renderGrid(activeTab, pending)}
            </div>
        );
    }
}
