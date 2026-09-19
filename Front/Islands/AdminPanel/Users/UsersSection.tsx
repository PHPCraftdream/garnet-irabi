import * as React from 'react';
import {useState, useMemo} from 'react';
import {AdminUser, GridConfig, UserTab} from '../Shell/types';
import {AdminGrid} from '../Grid/AdminGrid';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {sendPost} from '@common/Api/Send/sendPost';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {useOpenUser} from './UserDetailContext';

interface Props {
    users: AdminUser[];
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

export function flag(val: string | number | null | undefined): boolean {
    return val !== null && val !== undefined && Number(val) > 0;
}

function filterByTab(users: AdminUser[], tab: UserTab): AdminUser[] {
    switch (tab) {
        case 'experts':   return users.filter(u => u.type === 'expert');
        case 'users':   return users.filter(u => u.type === 'user');
        case 'moderators': return users.filter(u => flag(u.IS_MODERATOR) && !flag(u.IS_OWNER) && !flag(u.IS_ADMIN));
        case 'owners':     return users.filter(u => flag(u.IS_OWNER) && !flag(u.IS_ADMIN));
        case 'admins':     return users.filter(u => flag(u.IS_ADMIN));
        default:           return users;
    }
}

/**
 * Подпись кнопки роли: «+ Модератор» / «− Модератор».
 *
 * Раньше во всех колонках-флагах стояло одинаковое «Назначить», и в тесной
 * строке владелец, целясь в «Модератор», попадал в соседнюю колонку —
 * ровно так один из наших владельцев случайно сделал человека
 * преподавателем. Название роли прямо на кнопке снимает вопрос, а знак
 * говорит, что произойдёт. Полная фраза остаётся в `title`.
 *
 * Собирается из существующих строк, а не из новых: знак и название роли
 * читаются одинаково и по-русски, и по-английски.
 */
export function roleFlagLabel(role: string, granted: boolean): string {
    return `${granted ? '−' : '+'} ${role}`;
}

export function FlagBtn({label, active, cls, disabled, onClick, testId, title}: {
    label: string;
    active: boolean;
    cls: [string, string]; // [active class, inactive class]
    disabled: boolean;
    onClick: () => void;
    testId?: string;
    title?: string;
}) {
    return (
        <button
            type="button"
            data-test-id={testId}
            title={title}
            className={`btn btn-sm ${active ? cls[0] : cls[1]}`}
            disabled={disabled}
            onClick={onClick}
        >
            {label}
        </button>
    );
}

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
    title?: (r: AdminUser) => string;
    expertOnly?: boolean;
    lockedBy?: (r: AdminUser) => boolean;
}

const flagDefs: Record<FlagKey, FlagDef> = {
    IS_APPROVED: {
        key: 'IS_APPROVED',
        cls: ['btn-outline-danger', 'btn-success'],
        label: r => flag(r.IS_APPROVED) ? t.Admin_Revoke() : t.Admin_Approve(),
        expertOnly: true,
    },
    IS_DISABLED: {
        key: 'IS_DISABLED',
        cls: ['btn-secondary', 'btn-outline-danger'],
        label: r => flag(r.IS_DISABLED) ? t.Admin_Enable() : t.Admin_Disable(),
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
    users: initialUsers, setFlagUrl, setUserTypeUrl, config,
}) => {
    const [activeTab, setActiveTab] = useState<UserTab>('all');
    const [users, setUsers]         = useState<AdminUser[]>(initialUsers);
    const [pending, setPending]     = useState<Record<number, boolean>>({});
    const openUser = useOpenUser();

    const tabCounts = useMemo(() => ({
        all:        users.length,
        experts:   users.filter(u => u.type === 'expert').length,
        users:   users.filter(u => u.type === 'user').length,
        moderators: users.filter(u => flag(u.IS_MODERATOR) && !flag(u.IS_OWNER) && !flag(u.IS_ADMIN)).length,
        owners:     users.filter(u => flag(u.IS_OWNER) && !flag(u.IS_ADMIN)).length,
        admins:     users.filter(u => flag(u.IS_ADMIN)).length,
    }), [users]);

    const tabFiltered = useMemo(() => filterByTab(users, activeTab), [users, activeTab]);

    const gridConfig = useMemo(() => {
        if (activeTab === 'experts' || activeTab === 'all') return config;
        return {
            ...config,
            columns: config.columns.filter(c => c.key !== 'IS_APPROVED'),
        };
    }, [config, activeTab]);

    const setFlag = async (userId: number, flagName: string, value: 0 | 1) => {
        if (!setFlagUrl || pending[userId]) return;
        setPending(p => ({...p, [userId]: true}));
        try {
            const csrf = (window as any).__GARNET_CSRF__ ?? '';
            await sendPost(setFlagUrl, {CSRF_TOKEN: csrf, user_id: userId, flag: flagName, value});
            setUsers(prev => prev.map(u => u.id === userId ? {...u, [flagName]: value || null} : u));
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
            setUsers(prev => prev.map(u => u.id === userId ? {...u, type: nextType} : u));
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
                rows={tabFiltered}
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
