import * as React from 'react';
import {useState, useMemo} from 'react';
import {AdminUser, GridConfig, UserTab} from './types';
import {AdminGrid} from './AdminGrid';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {sendPost} from '@common/Api/sendPost';
import {formatTs} from '@common/Utils/DateUtils';
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
            await sendPost(setFlagUrl, {user_id: userId, flag: flagName, value});
            setUsers(prev => prev.map(u => u.id === userId ? {...u, [flagName]: value || null} : u));
        } finally {
            setPending(p => ({...p, [userId]: false}));
        }
    };

    const setUserType = async (userId: number, nextType: 'user' | 'expert') => {
        if (!setUserTypeUrl || pending[userId]) return;
        setPending(p => ({...p, [userId]: true}));
        try {
            await sendPost(setUserTypeUrl, {user_id: userId, type: nextType});
            setUsers(prev => prev.map(u => u.id === userId ? {...u, type: nextType} : u));
        } finally {
            setPending(p => ({...p, [userId]: false}));
        }
    };

    return (
        <div>
            {/* Tabs */}
            <ul className="admin-tabnav">
                {tabs.map(tab => (
                    <li key={tab.key} className="admin-tabnav-item">
                        <button
                            type="button"
                            data-test-id={`filter-tab-${tab.key}`}
                            aria-selected={activeTab === tab.key}
                            className={`admin-tabnav-btn ${activeTab === tab.key ? 'admin-tabnav-btn-active' : ''}`}
                            onClick={() => setActiveTab(tab.key)}
                        >
                            {tab.labelFn()} <span className="admin-tabnav-count">({tabCounts[tab.key]})</span>
                        </button>
                    </li>
                ))}
            </ul>

            <AdminGrid
                rows={tabFiltered}
                config={gridConfig}
                rowKey={r => r.id}
                emptyMessage={t.Admin_NoUsers()}
                renders={{
                    id:    r => <span className="text-muted">{r.id}</span>,
                    login: r => (
                        <button type="button" data-test-id={`user-login-${r.id}`} className="admin-link-btn-md font-mono"
                            onClick={() => openUser(r.id, r.name || r.login)}>
                            {r.login}
                        </button>
                    ),
                    type: r => (
                        <div className="flex items-center gap-2">
                            <span className={`badge ${r.type === 'expert' ? 'status-info' : 'status-muted'}`}>
                                {r.type === 'expert' ? t.Reg_AccountTypeExpert() : t.Reg_AccountTypeUser()}
                            </span>
                            {setUserTypeUrl && (
                                <FlagBtn
                                    testId={`set-type-${r.id}`}
                                    label={r.type === 'expert' ? t.Admin_Flag_RevokeExpert() : t.Admin_Flag_GrantExpert()}
                                    active={r.type === 'expert'}
                                    cls={['btn-outline-danger', 'btn-outline-primary']}
                                    disabled={pending[r.id]}
                                    onClick={() => setUserType(r.id, r.type === 'expert' ? 'user' : 'expert')}
                                />
                            )}
                        </div>
                    ),
                    last_online_time: r => <span className="text-muted text-xs">{formatTs(r.last_online_time)}</span>,

                    IS_APPROVED: r => r.type !== 'expert' ? null : (
                        <FlagBtn
                            testId={`flag-IS_APPROVED-${r.id}`}
                            label={flag(r.IS_APPROVED) ? t.Admin_Revoke() : t.Admin_Approve()}
                            active={flag(r.IS_APPROVED)}
                            cls={['btn-outline-danger', 'btn-success']}
                            disabled={pending[r.id]}
                            onClick={() => setFlag(r.id, 'IS_APPROVED', flag(r.IS_APPROVED) ? 0 : 1)}
                        />
                    ),
                    IS_DISABLED: r => (
                        <FlagBtn
                            testId={`flag-IS_DISABLED-${r.id}`}
                            label={flag(r.IS_DISABLED) ? t.Admin_Enable() : t.Admin_Disable()}
                            active={flag(r.IS_DISABLED)}
                            cls={['btn-secondary', 'btn-outline-danger']}
                            disabled={pending[r.id]}
                            onClick={() => setFlag(r.id, 'IS_DISABLED', flag(r.IS_DISABLED) ? 0 : 1)}
                        />
                    ),
                    IS_MODERATOR: r => (
                        <FlagBtn
                            testId={`flag-IS_MODERATOR-${r.id}`}
                            label={flag(r.IS_MODERATOR) ? t.Admin_Revoke() : t.Admin_Grant()}
                            active={flag(r.IS_MODERATOR)}
                            cls={['btn-outline-danger', 'btn-outline-primary']}
                            disabled={pending[r.id] || flag(r.IS_ADMIN) || flag(r.IS_OWNER)}
                            onClick={() => setFlag(r.id, 'IS_MODERATOR', flag(r.IS_MODERATOR) ? 0 : 1)}
                        />
                    ),
                    IS_OWNER: r => (
                        <FlagBtn
                            testId={`flag-IS_OWNER-${r.id}`}
                            label={flag(r.IS_OWNER) ? t.Admin_Revoke() : t.Admin_Grant()}
                            active={flag(r.IS_OWNER)}
                            cls={['btn-outline-danger', 'btn-outline-primary']}
                            disabled={pending[r.id] || flag(r.IS_ADMIN)}
                            onClick={() => setFlag(r.id, 'IS_OWNER', flag(r.IS_OWNER) ? 0 : 1)}
                        />
                    ),
                    IS_ADMIN: r => (
                        <FlagBtn
                            testId={`flag-IS_ADMIN-${r.id}`}
                            label={flag(r.IS_ADMIN) ? t.Admin_Revoke() : t.Admin_Grant()}
                            active={flag(r.IS_ADMIN)}
                            cls={['btn-outline-danger', 'btn-outline-primary']}
                            disabled={pending[r.id]}
                            onClick={() => setFlag(r.id, 'IS_ADMIN', flag(r.IS_ADMIN) ? 0 : 1)}
                        />
                    ),
                }}
            />
        </div>
    );
};
