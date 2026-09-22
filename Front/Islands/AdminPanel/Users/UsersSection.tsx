import * as React from 'react';
import {useMemo, useRef, useState} from 'react';
import {AdminUser, GridConfig, PageResponse, UserTab} from '../Shell/types';
import {AdminGrid, AdminGridHandle} from '../Grid/AdminGrid';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {sendPost} from '@common/Api/Send/sendPost';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {useOpenUser} from './UserDetailContext';
import {flag, roleFlagLabel} from './usersFlags';
import {FlagBtn} from './FlagBtn';

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

const TabButton: React.FC<{
    tabKey: string;
    label: string;
    count: number;
    active: boolean;
    onSelect: (key: any) => void;
}> = ({tabKey, label, count, active, onSelect}) => (
    <li className="admin-tabnav-item">
        <button
            type="button"
            data-test-id={`filter-tab-${tabKey}`}
            aria-selected={active}
            className={`admin-tabnav-btn ${active ? 'admin-tabnav-btn-active' : ''}`}
            onClick={() => onSelect(tabKey)}
        >
            {label} <span className="admin-tabnav-count">({count})</span>
        </button>
    </li>
);

/** Тип аккаунта и переключатель «сделать преподавателем». */
const UserTypeCell: React.FC<{
    row: {id: number; type: string};
    canChange: boolean;
    pending: boolean;
    onToggle: () => void;
}> = ({row, canChange, pending, onToggle}) => {
    const isExpert = row.type === 'expert';

    return (
        <div className="flex items-center gap-2">
            <span className={`badge ${isExpert ? 'status-info' : 'status-muted'}`}>
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
    cls: [string, string];
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
const UserFlagCell: React.FC<{
    row: AdminUser;
    def: FlagDef;
    pending: boolean;
    onSetFlag: (userId: number, name: FlagKey, value: 0 | 1) => void;
}> = ({row, def, pending, onSetFlag}) => {
    if (def.expertOnly && row.type !== 'expert') return null;
    const active = flag(row[def.key]);

    return (
        <FlagBtn
            testId={`flag-${def.key}-${row.id}`}
            label={def.label(row)}
            title={def.title?.(row)}
            active={active}
            cls={def.cls}
            disabled={pending || (def.lockedBy?.(row) ?? false)}
            onClick={() => onSetFlag(row.id, def.key, active ? 0 : 1)}
        />
    );
};

const UserLoginCell: React.FC<{
    row: AdminUser;
    onOpen: (id: number, label: string) => void;
}> = ({row, onOpen}) => (
    <button
        type="button"
        data-test-id={`user-login-${row.id}`}
        className="admin-link-btn-md font-mono"
        onClick={() => onOpen(row.id, row.name || row.login)}
    >
        {row.login}
    </button>
);

export const UsersSection: React.FC<Props> = ({
    pageUrl, initialData, tabCountsUrl, initialTabCounts, setFlagUrl, setUserTypeUrl, config,
}) => {
    const [activeTab, setActiveTab] = useState<UserTab>('all');
    const [tabCounts, setTabCounts] = useState<TabCounts>(initialTabCounts);
    const [pending, setPending]     = useState<Record<number, boolean>>({});
    const gridRef = useRef<AdminGridHandle<AdminUser>>(null);
    const openUser = useOpenUser();

    const extraParams = useMemo(() => ({tab: activeTab}), [activeTab]);

    const gridConfig = useMemo(() => {
        if (activeTab === 'experts' || activeTab === 'all') return config;
        return {
            ...config,
            columns: config.columns.filter(c => c.key !== 'IS_APPROVED'),
        };
    }, [config, activeTab]);

    const refreshTabCounts = async () => {
        if (!tabCountsUrl) return;
        try {
            const resp = await sendPost<{}, TabCounts>(tabCountsUrl, {});
            const data = ('data' in resp && resp.data) ? resp.data : (resp as unknown as TabCounts);
            setTabCounts(data);
        } catch {
            // best-effort — stale counts are cosmetic, not worth surfacing an error for
        }
    };

    const setFlag = async (userId: number, flagName: FlagKey, value: 0 | 1) => {
        if (!setFlagUrl || pending[userId]) return;
        setPending(p => ({...p, [userId]: true}));
        try {
            const csrf = (window as any).__GARNET_CSRF__ ?? '';
            await sendPost(setFlagUrl, {CSRF_TOKEN: csrf, user_id: userId, flag: flagName, value});
            const affectsTab = flagName === 'IS_MODERATOR' || flagName === 'IS_OWNER' || flagName === 'IS_ADMIN';
            if (affectsTab && ROLE_TABS.has(activeTab)) {
                gridRef.current?.refresh();
            } else {
                gridRef.current?.setItems(prev => prev.map(u => u.id === userId ? {...u, [flagName]: value || null} : u));
            }
            if (affectsTab) void refreshTabCounts();
        } finally {
            setPending(p => ({...p, [userId]: false}));
        }
    };

    const setUserType = async (userId: number, nextType: 'user' | 'expert') => {
        if (!setUserTypeUrl || pending[userId]) return;
        setPending(p => ({...p, [userId]: true}));
        try {
            const csrf = (window as any).__GARNET_CSRF__ ?? '';
            await sendPost(setUserTypeUrl, {CSRF_TOKEN: csrf, user_id: userId, type: nextType});
            if (TYPE_TABS.has(activeTab)) {
                gridRef.current?.refresh();
            } else {
                gridRef.current?.setItems(prev => prev.map(u => u.id === userId ? {...u, type: nextType} : u));
            }
            void refreshTabCounts();
        } finally {
            setPending(p => ({...p, [userId]: false}));
        }
    };

    return (
        <div>
            <ul className="admin-tabnav">
                {tabs.map(tab => (
                    <TabButton
                        key={tab.key}
                        tabKey={tab.key}
                        label={tab.labelFn()}
                        count={tabCounts[tab.key]}
                        active={activeTab === tab.key}
                        onSelect={setActiveTab}
                    />
                ))}
            </ul>

            <AdminGrid
                ref={gridRef}
                pageUrl={pageUrl}
                initialData={initialData}
                extraParams={extraParams}
                config={gridConfig}
                rowKey={r => r.id}
                emptyMessage={t.Admin_NoUsers()}
                renders={{
                    id:    r => <span className="text-muted">{r.id}</span>,
                    login: r => <UserLoginCell row={r} onOpen={openUser} />,
                    type: r => <UserTypeCell row={r} canChange={!!setUserTypeUrl} pending={!!pending[r.id]} onToggle={() => setUserType(r.id, r.type === 'expert' ? 'user' : 'expert')} />,
                    last_online_time: r => <span className="text-muted text-xs">{formatTs(r.last_online_time)}</span>,
                    IS_APPROVED: r => <UserFlagCell row={r} def={flagDefs.IS_APPROVED} pending={!!pending[r.id]} onSetFlag={setFlag} />,
                    IS_DISABLED: r => <UserFlagCell row={r} def={flagDefs.IS_DISABLED} pending={!!pending[r.id]} onSetFlag={setFlag} />,
                    IS_MODERATOR: r => <UserFlagCell row={r} def={flagDefs.IS_MODERATOR} pending={!!pending[r.id]} onSetFlag={setFlag} />,
                    IS_OWNER: r => <UserFlagCell row={r} def={flagDefs.IS_OWNER} pending={!!pending[r.id]} onSetFlag={setFlag} />,
                    IS_ADMIN: r => <UserFlagCell row={r} def={flagDefs.IS_ADMIN} pending={!!pending[r.id]} onSetFlag={setFlag} />,
                }}
            />
        </div>
    );
};
