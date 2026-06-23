import * as React from 'react';
import {sendPost} from '@common/Api/sendPost';
import {showToast} from '@common/Components/GlobalToast';
import {useConfirm} from '@common/hooks/useConfirm';
import {useSending} from '@common/hooks/useSending';
import SendButton from '@common/Components/SendButton';
import {ConfirmModal} from '@common/Components/ConfirmModal';
import {LogDetailModal} from '@common/Components/AdminLog/LogDetailModal';
import {formatTs, tsToInputDateTime} from '@common/Utils/DateUtils';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {AdminUserLink} from '../../Common/EntityLinks';

// ── Types ────────────────────────────────────────────────────────────────

interface TokenRow {
    id: number;
    token: string;
    label: string;
    url: string;
    expires_at: number | null;
    max_uses: number;
    uses_left: number;
    used: number;
    is_disabled: boolean;
    status: string;
    created_at: number;
    created_by: number;
    created_by_name: string | null;
    account_type: string;
}

const ACCOUNT_TYPE_LABEL = (type: string): string => {
    switch (type) {
        case 'expert': return t.Admin_Tokens_AccountTypeExpert();
        case 'user':
        default:       return t.Admin_Tokens_AccountTypeUser();
    }
};

interface Registration {
    id: number;
    account_id: number;
    account_name: string;
    account_login: string;
    registered_at: number;
    ip: string;
    user_agent: string;
}

export interface AdminTokensSectionProps {
    listUrl: string;
    createUrl: string;
    disableUrl: string;
    enableUrl: string;
    deleteUrl: string;
    registrationsUrl: string;
    updateUrl: string;
}

// ── Status badge helper ──────────────────────────────────────────────────

const STATUS_CLASS: Record<string, string> = {
    active: 'status-success',
    disabled: 'status-muted',
    expired: 'status-warning',
    exhausted: 'status-danger',
};

const statusLabel = (s: string): string => {
    switch (s) {
        case 'active': return t.Admin_Tokens_Status_Active();
        case 'disabled': return t.Admin_Tokens_Status_Disabled();
        case 'expired': return t.Admin_Tokens_Status_Expired();
        case 'exhausted': return t.Admin_Tokens_Status_Exhausted();
        default: return s;
    }
};

// ── TTL presets ──────────────────────────────────────────────────────────

const TTL_OPTIONS = [
    {value: 0, label: () => t.Admin_Tokens_TTL_None()},
    {value: 3600, label: () => t.Admin_Tokens_TTL_1h()},
    {value: 86400, label: () => t.Admin_Tokens_TTL_1d()},
    {value: 604800, label: () => t.Admin_Tokens_TTL_1w()},
    {value: 2592000, label: () => t.Admin_Tokens_TTL_30d()},
];

// ── Filter options ───────────────────────────────────────────────────────

const FILTER_OPTIONS = [
    {value: '', label: () => t.Admin_Tokens_FilterAll()},
    {value: 'active', label: () => t.Admin_Tokens_FilterActive()},
    {value: 'disabled', label: () => t.Admin_Tokens_FilterDisabled()},
    {value: 'expired', label: () => t.Admin_Tokens_FilterExpired()},
    {value: 'exhausted', label: () => t.Admin_Tokens_FilterExhausted()},
];

// ── Component ────────────────────────────────────────────────────────────

export const AdminTokensSection: React.FC<AdminTokensSectionProps> = (props) => {
    const {listUrl, createUrl, disableUrl, enableUrl, deleteUrl, registrationsUrl, updateUrl} = props;

    const [tokens, setTokens] = React.useState<TokenRow[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [search, setSearch] = React.useState('');
    const [statusFilter, setStatusFilter] = React.useState('');
    const [showCreate, setShowCreate] = React.useState(false);
    const [regsModal, setRegsModal] = React.useState<TokenRow | null>(null);
    const [linkModal, setLinkModal] = React.useState<string | null>(null);
    const [editModal, setEditModal] = React.useState<TokenRow | null>(null);

    const {confirmState, confirm, handleConfirm, handleCancel} = useConfirm();

    // ── Fetch tokens ─────────────────────────────────────────────────────
    const stateRef = React.useRef({search, statusFilter});
    stateRef.current = {search, statusFilter};

    const fetchTokens = React.useCallback(async (overrides: {search?: string; status?: string} = {}) => {
        const cur = stateRef.current;
        setLoading(true);
        try {
            const resp = await sendPost<{search: string; status: string}, {tokens: TokenRow[]}>(listUrl, {
                search: overrides.search ?? cur.search,
                status: overrides.status ?? cur.statusFilter,
            });
            const data = ('data' in resp && resp.data) ? resp.data : (resp as unknown as {tokens: TokenRow[]});
            setTokens(data.tokens ?? []);
        } catch {
            showToast(t.User_LoadError(), 'danger');
        } finally {
            setLoading(false);
        }
    }, [listUrl]);

    // Initial load
    React.useEffect(() => {
        void fetchTokens();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Debounced filter
    const isFirstRef = React.useRef(true);
    React.useEffect(() => {
        if (isFirstRef.current) {
            isFirstRef.current = false;
            return;
        }
        const handle = setTimeout(() => {
            void fetchTokens();
        }, 300);
        return () => clearTimeout(handle);
    }, [search, statusFilter, fetchTokens]);

    // ── Toggle disable/enable ────────────────────────────────────────────
    const handleToggleDisable = React.useCallback(async (row: TokenRow) => {
        if (row.is_disabled) {
            // Enable directly — no confirm needed
            try {
                const resp = await sendPost<{id: number}, {success: boolean}>(enableUrl, {id: row.id});
                const data = ('data' in resp && resp.data) ? resp.data : (resp as unknown as {success: boolean});
                if (data?.success) {
                    setTokens(prev => prev.map(tk => tk.id === row.id ? {...tk, is_disabled: false, status: 'active'} : tk));
                } else {
                    showToast(t.General_Error(), 'danger');
                }
            } catch {
                showToast(t.General_Error(), 'danger');
            }
        } else {
            // Disable — confirm first
            const ok = await confirm(t.Admin_Tokens_DisableConfirm(), {variant: 'danger', confirmLabel: t.Admin_Tokens_Disable()});
            if (!ok) return;
            try {
                const resp = await sendPost<{id: number}, {success: boolean}>(disableUrl, {id: row.id});
                const data = ('data' in resp && resp.data) ? resp.data : (resp as unknown as {success: boolean});
                if (data?.success) {
                    setTokens(prev => prev.map(tk => tk.id === row.id ? {...tk, is_disabled: true, status: 'disabled'} : tk));
                } else {
                    showToast(t.General_Error(), 'danger');
                }
            } catch {
                showToast(t.General_Error(), 'danger');
            }
        }
    }, [confirm, disableUrl, enableUrl]);

    // ── Delete ───────────────────────────────────────────────────────────
    const handleDelete = React.useCallback(async (row: TokenRow) => {
        const ok = await confirm(t.Admin_Tokens_DeleteConfirm(), {variant: 'danger', confirmLabel: t.Action_Delete()});
        if (!ok) return;
        try {
            const resp = await sendPost<{id: number}, {success: boolean}>(deleteUrl, {id: row.id});
            const data = ('data' in resp && resp.data) ? resp.data : (resp as unknown as {success: boolean});
            if (data?.success) {
                setTokens(prev => prev.filter(tk => tk.id !== row.id));
            } else {
                showToast(t.General_Error(), 'danger');
            }
        } catch {
            showToast(t.General_Error(), 'danger');
        }
    }, [confirm, deleteUrl]);

    return (
        <div data-test-id="admin-tokens">
            {/* Filters + Create button */}
            <div className="admin-bookings-filters">
                <div className="filter-cell">
                    <label htmlFor="tokens-search">{t.Admin_Tokens_Label()}</label>
                    <input
                        id="tokens-search"
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="form-control"
                        placeholder={t.Admin_Tokens_LabelPlaceholder()}
                        data-test-id="tokens-search"
                    />
                </div>
                <div className="filter-cell">
                    <label htmlFor="tokens-status">{t.Admin_Tokens_Status()}</label>
                    <select
                        id="tokens-status"
                        className="form-control"
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        data-test-id="tokens-status-filter"
                    >
                        {FILTER_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label()}</option>
                        ))}
                    </select>
                </div>
                <div className="filter-actions">
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => setShowCreate(true)}
                        data-test-id="tokens-create-btn"
                    >
                        {t.Admin_Tokens_Create()}
                    </button>
                </div>
            </div>

            {/* Token list */}
            {tokens.length === 0 ? (
                <p className="text-muted">{loading ? t.User_Loading() : t.Admin_Tokens_Empty()}</p>
            ) : (
                <div className="card">
                    <div className="overflow-x-auto">
                        <table className="admin-table">
                            <thead>
                                <tr className="border-b border-subtle">
                                    <th className="text-left p-3">{t.Admin_Tokens_Label()}</th>
                                    <th className="text-left p-3">{t.Admin_Tokens_AccountType()}</th>
                                    <th className="text-left p-3">{t.Admin_Tokens_Link()}</th>
                                    <th className="text-left p-3">{t.Admin_Tokens_Uses()}</th>
                                    <th className="text-left p-3">{t.Admin_Tokens_Status()}</th>
                                    <th className="text-left p-3">{t.Admin_Tokens_ExpiresAt()}</th>
                                    <th className="text-left p-3">{t.Admin_Tokens_CreatedAt()}</th>
                                    <th className="text-left p-3">{t.Admin_Tokens_CreatedBy()}</th>
                                    <th className="text-left p-3">{t.Admin_Tokens_Actions()}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tokens.map(row => (
                                    <tr key={row.id} className="border-b border-subtle" data-test-id={`token-row-${row.id}`}>
                                        <td className="p-3">{row.label || '—'}</td>
                                        <td className="p-3" data-test-id={`token-account-type-${row.id}`}>{ACCOUNT_TYPE_LABEL(row.account_type)}</td>
                                        <td className="p-3">
                                            <button
                                                type="button"
                                                className="btn btn-sm btn-outline-secondary"
                                                onClick={() => setLinkModal(row.url)}
                                                title={row.url}
                                                data-test-id={`token-copy-${row.id}`}
                                            >
                                                {t.Admin_Tokens_Link()}
                                            </button>
                                        </td>
                                        <td className="p-3 whitespace-nowrap">
                                            {row.used} / {row.max_uses}
                                        </td>
                                        <td className="p-3">
                                            <span className={`common-status-pill ${STATUS_CLASS[row.status] || 'status-muted'}`}>
                                                {statusLabel(row.status)}
                                            </span>
                                        </td>
                                        <td className="p-3 whitespace-nowrap text-muted text-xs">
                                            {row.expires_at ? formatTs(row.expires_at) : t.Admin_Tokens_NoExpiry()}
                                        </td>
                                        <td className="p-3 whitespace-nowrap text-muted text-xs">
                                            {formatTs(row.created_at)}
                                        </td>
                                        <td className="p-3">
                                            {row.created_by > 0 ? (
                                                <AdminUserLink id={row.created_by} name={row.created_by_name || `#${row.created_by}`} />
                                            ) : (
                                                <span className="text-muted">—</span>
                                            )}
                                        </td>
                                        <td className="p-3">
                                            <div className="flex gap-1 flex-wrap">
                                                {row.used > 0 && (
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm btn-outline-secondary"
                                                        onClick={() => setRegsModal(row)}
                                                        data-test-id={`token-regs-${row.id}`}
                                                    >
                                                        {t.Admin_Tokens_Registrations()}
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-outline-secondary"
                                                    onClick={() => setEditModal(row)}
                                                    data-test-id={`token-edit-${row.id}`}
                                                >
                                                    {t.Action_Edit()}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-outline-warning"
                                                    onClick={() => void handleToggleDisable(row)}
                                                    data-test-id={`token-toggle-${row.id}`}
                                                >
                                                    {row.is_disabled ? t.Admin_Tokens_Enable() : t.Admin_Tokens_Disable()}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-outline-danger"
                                                    onClick={() => void handleDelete(row)}
                                                    data-test-id={`token-delete-${row.id}`}
                                                >
                                                    {t.Action_Delete()}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Create modal */}
            {showCreate && (
                <CreateTokenModal
                    createUrl={createUrl}
                    onCreated={(newToken) => {
                        setTokens(prev => [newToken, ...prev]);
                        setShowCreate(false);
                    }}
                    onClose={() => setShowCreate(false)}
                />
            )}

            {/* Registrations modal */}
            {regsModal && (
                <RegistrationsModal
                    token={regsModal}
                    registrationsUrl={registrationsUrl}
                    onClose={() => setRegsModal(null)}
                />
            )}

            {linkModal && <LinkModal url={linkModal} onClose={() => setLinkModal(null)} />}

            {editModal && (
                <EditTokenModal
                    token={editModal}
                    updateUrl={updateUrl}
                    onUpdated={(updated) => {
                        setTokens(prev => prev.map(tk => tk.id === updated.id ? {...tk, ...updated} : tk));
                        setEditModal(null);
                    }}
                    onClose={() => setEditModal(null)}
                />
            )}

            <ConfirmModal state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
        </div>
    );
};

// ── Create Token Modal (T11) ─────────────────────────────────────────────

interface CreateTokenModalProps {
    createUrl: string;
    onCreated: (token: TokenRow) => void;
    onClose: () => void;
}

const CreateTokenModal: React.FC<CreateTokenModalProps> = ({createUrl, onCreated, onClose}) => {
    const [label, setLabel] = React.useState('');
    const [maxUses, setMaxUses] = React.useState(1);
    const [ttl, setTtl] = React.useState(0);
    const [accountType, setAccountType] = React.useState<'user' | 'expert'>('user');
    const [createdToken, setCreatedToken] = React.useState<TokenRow | null>(null);
    const {sending, withSending} = useSending();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        void withSending(async () => {
            try {
                const resp = await sendPost<{label: string; max_uses: number; ttl: number; account_type: string}, {success: boolean; token: TokenRow}>(createUrl, {
                    label,
                    max_uses: maxUses,
                    ttl,
                    account_type: accountType,
                });
                const data = ('data' in resp && resp.data) ? resp.data : (resp as unknown as {success: boolean; token: TokenRow});
                if (data?.success && data.token) {
                    setCreatedToken(data.token);
                    onCreated(data.token);
                } else {
                    showToast(t.General_Error(), 'danger');
                }
            } catch {
                showToast(t.General_Error(), 'danger');
            }
        });
    };

    const handleCopyCreated = () => {
        if (createdToken) {
            void navigator.clipboard.writeText(createdToken.url).then(() => {
                showToast(t.Admin_Tokens_Copied(), 'success');
            });
        }
    };

    return (
        <LogDetailModal title={t.Admin_Tokens_CreateTitle()} onClose={onClose}>
            {createdToken ? (
                <div data-test-id="token-created-result">
                    <div className="mb-3">
                        <label className="label-mini mb-1">{t.Admin_Tokens_Link()}</label>
                        <div className="flex gap-2 items-center">
                            <input
                                type="text"
                                className="form-control"
                                readOnly
                                value={createdToken.url}
                                data-test-id="token-created-url"
                            />
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={handleCopyCreated}
                                data-test-id="token-created-copy"
                            >
                                {t.Admin_Tokens_Link()}
                            </button>
                        </div>
                    </div>
                    <button type="button" className="btn btn-secondary" onClick={onClose}>
                        {t.Action_Close()}
                    </button>
                </div>
            ) : (
                <form onSubmit={handleSubmit} data-test-id="token-create-form">
                    <div className="mb-3">
                        <label htmlFor="token-label" className="label-mini mb-1">{t.Admin_Tokens_Label()}</label>
                        <input
                            id="token-label"
                            type="text"
                            className="form-control"
                            value={label}
                            onChange={e => setLabel(e.target.value)}
                            placeholder={t.Admin_Tokens_LabelPlaceholder()}
                            data-test-id="token-label-input"
                        />
                    </div>
                    <div className="mb-3">
                        <label htmlFor="token-account-type" className="label-mini mb-1">{t.Admin_Tokens_AccountType()}</label>
                        <select
                            id="token-account-type"
                            className="form-control"
                            value={accountType}
                            onChange={e => setAccountType(e.target.value as 'user' | 'expert')}
                            data-test-id="token-account-type-select"
                        >
                            <option value="user">{t.Admin_Tokens_AccountTypeUser()}</option>
                            <option value="expert">{t.Admin_Tokens_AccountTypeExpert()}</option>
                        </select>
                    </div>
                    <div className="mb-3">
                        <label htmlFor="token-ttl" className="label-mini mb-1">{t.Admin_Tokens_TTL()}</label>
                        <select
                            id="token-ttl"
                            className="form-control"
                            value={ttl}
                            onChange={e => setTtl(Number(e.target.value))}
                            data-test-id="token-ttl-select"
                        >
                            {TTL_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label()}</option>
                            ))}
                        </select>
                    </div>
                    <div className="mb-3">
                        <label htmlFor="token-max-uses" className="label-mini mb-1">{t.Admin_Tokens_MaxUses()}</label>
                        <input
                            id="token-max-uses"
                            type="number"
                            className="form-control"
                            value={maxUses}
                            onChange={e => setMaxUses(Math.max(1, parseInt(e.target.value, 10) || 1))}
                            min={1}
                            data-test-id="token-max-uses-input"
                        />
                    </div>
                    <div className="flex gap-2">
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={sending}
                            data-test-id="token-create-submit"
                        >
                            {t.Admin_Tokens_Create()}
                        </button>
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={onClose}
                            disabled={sending}
                        >
                            {t.Action_Cancel()}
                        </button>
                    </div>
                </form>
            )}
        </LogDetailModal>
    );
};

// ── Registrations Modal (T12) ────────────────────────────────────────────

interface RegistrationsModalProps {
    token: TokenRow;
    registrationsUrl: string;
    onClose: () => void;
}

const RegistrationsModal: React.FC<RegistrationsModalProps> = ({token, registrationsUrl, onClose}) => {
    const [registrations, setRegistrations] = React.useState<Registration[]>([]);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const resp = await sendPost<{token_id: number}, {registrations: Registration[]}>(registrationsUrl, {
                    token_id: token.id,
                });
                const data = ('data' in resp && resp.data) ? resp.data : (resp as unknown as {registrations: Registration[]});
                setRegistrations(data.registrations ?? []);
            } catch {
                showToast(t.User_LoadError(), 'danger');
            } finally {
                setLoading(false);
            }
        };
        void load();
    }, [registrationsUrl, token.id]);

    const title = `${t.Admin_Tokens_Registrations()} — ${token.label || token.token.slice(0, 8)}`;

    return (
        <LogDetailModal title={title} onClose={onClose}>
            {loading ? (
                <p className="text-muted">{t.User_Loading()}</p>
            ) : registrations.length === 0 ? (
                <p className="text-muted">{t.Admin_Tokens_RegEmpty()}</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="admin-table" data-test-id="token-registrations-table">
                        <thead>
                            <tr className="border-b border-subtle">
                                <th className="text-left p-3">{t.Admin_Tokens_RegAccount()}</th>
                                <th className="text-left p-3">{t.Admin_Tokens_RegDate()}</th>
                                <th className="text-left p-3">{t.Admin_Tokens_RegIp()}</th>
                                <th className="text-left p-3">{t.Admin_Tokens_RegUa()}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {registrations.map(reg => (
                                <tr key={reg.id} className="border-b border-subtle">
                                    <td className="p-3">
                                        <AdminUserLink id={reg.account_id} name={reg.account_name} />
                                    </td>
                                    <td className="p-3 whitespace-nowrap text-muted text-xs">
                                        {formatTs(reg.registered_at)}
                                    </td>
                                    <td className="p-3 text-muted text-xs">{reg.ip}</td>
                                    <td className="p-3 text-muted text-xs max-w-xs truncate" title={reg.user_agent}>
                                        {reg.user_agent}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </LogDetailModal>
    );
};

// ── Link Modal ────────────────────────────────────────────────────────────

interface LinkModalProps {
    url: string;
    onClose: () => void;
}

const LinkModal: React.FC<LinkModalProps> = ({url, onClose}) => {
    const handleCopy = () => {
        void navigator.clipboard.writeText(url).then(() => {
            showToast(t.Admin_Tokens_Copied(), 'success');
        });
    };

    return (
        <LogDetailModal title={t.Admin_Tokens_Link()} onClose={onClose}>
            <div className="mb-4">
                <input
                    type="text"
                    className="form-control w-full"
                    readOnly
                    value={url}
                    data-test-id="token-link-url"
                    onClick={e => (e.target as HTMLInputElement).select()}
                />
            </div>
            <div className="flex gap-2">
                <button type="button" className="btn btn-primary" onClick={handleCopy} data-test-id="token-link-copy">
                    {t.Admin_Tokens_CopyLink()}
                </button>
                <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" data-test-id="token-link-open">
                    {t.Admin_Tokens_OpenLink()}
                </a>
                <button type="button" className="btn btn-secondary" onClick={onClose}>
                    {t.Action_Close()}
                </button>
            </div>
        </LogDetailModal>
    );
};

// ── Edit Token Modal ──────────────────────────────────────────────────────

interface EditTokenModalProps {
    token: TokenRow;
    updateUrl: string;
    onUpdated: (updated: {id: number; label: string; max_uses: number; uses_left: number; expires_at: number | null}) => void;
    onClose: () => void;
}

const EditTokenModal: React.FC<EditTokenModalProps> = ({token, updateUrl, onUpdated, onClose}) => {
    const [label, setLabel] = React.useState(token.label);
    const [maxUses, setMaxUses] = React.useState(token.max_uses);
    const [expiresAt, setExpiresAt] = React.useState<string>(() =>
        token.expires_at ? tsToInputDateTime(token.expires_at) : ''
    );
    const {sending, withSending} = useSending();

    const used = token.max_uses - token.uses_left;

    const onFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        handleSubmit();
    };

    const handleSubmit = () => {
        void withSending(async () => {
            // Send the raw `YYYY-MM-DDTHH:mm` string — backend parses it in the
            // user's TZ via DateTimeZone (see AGENTS.md §12). Empty string = no expiry.
            try {
                const resp = await sendPost<{id: number; label: string; max_uses: number; expires_at: string}, {success: boolean; expires_at: number | null}>(updateUrl, {
                    id: token.id,
                    label,
                    max_uses: maxUses,
                    expires_at: expiresAt,
                });
                const data = ('data' in resp && resp.data) ? resp.data : (resp as unknown as {success: boolean; expires_at: number | null});
                if (data?.success) {
                    const newUsesLeft = Math.max(0, maxUses - used);
                    onUpdated({
                        id: token.id,
                        label,
                        max_uses: maxUses,
                        uses_left: newUsesLeft,
                        expires_at: data.expires_at ?? null,
                    });
                    showToast(t.Admin_SaveSettings_Success(), 'success');
                } else {
                    showToast(t.General_Error(), 'danger');
                }
            } catch {
                showToast(t.General_Error(), 'danger');
            }
        });
    };

    return (
        <LogDetailModal title={t.Admin_Tokens_EditTitle()} onClose={onClose}>
            <form onSubmit={onFormSubmit} data-test-id="token-edit-form">
                <div className="mb-3">
                    <label htmlFor="edit-token-label" className="label-mini mb-1">{t.Admin_Tokens_Label()}</label>
                    <input
                        id="edit-token-label"
                        type="text"
                        className="form-control"
                        value={label}
                        onChange={e => setLabel(e.target.value)}
                        placeholder={t.Admin_Tokens_LabelPlaceholder()}
                        data-test-id="token-edit-label"
                    />
                </div>
                <div className="mb-3">
                    <label htmlFor="edit-token-expires" className="label-mini mb-1">{t.Admin_Tokens_ExpiresAt()}</label>
                    <input
                        id="edit-token-expires"
                        type="datetime-local"
                        className="form-control"
                        value={expiresAt}
                        onChange={e => setExpiresAt(e.target.value)}
                        onClick={e => (e.target as HTMLInputElement).showPicker?.()}
                        data-test-id="token-edit-expires"
                    />
                    <p className="text-xs text-muted mt-1">{t.Admin_Tokens_EditExpiresHint()}</p>
                </div>
                <div className="mb-3">
                    <label htmlFor="edit-token-max-uses" className="label-mini mb-1">{t.Admin_Tokens_MaxUses()}</label>
                    <input
                        id="edit-token-max-uses"
                        type="number"
                        className="form-control"
                        value={maxUses}
                        onChange={e => setMaxUses(Math.max(1, parseInt(e.target.value, 10) || 1))}
                        min={Math.max(1, used)}
                        data-test-id="token-edit-max-uses"
                    />
                    <p className="text-xs text-muted mt-1">{t.Admin_Tokens_EditUsedInfo([used])}</p>
                </div>
                <div className="flex gap-2">
                    <SendButton
                        onClick={handleSubmit}
                        sending={sending}
                        label={sending ? t.Admin_SaveSettings_Saving() : t.Admin_SaveSettings()}
                        testId="token-edit-submit"
                    />
                    <button type="button" className="btn btn-secondary" onClick={onClose} disabled={sending}>
                        {t.Action_Cancel()}
                    </button>
                </div>
            </form>
        </LogDetailModal>
    );
};
