import * as React from 'react';
import {useState, useEffect} from 'react';
import {sendPost} from '@common/Api/sendPost';
import {showToast} from '@common/Components/GlobalToast';
import {EntityHistoryButton} from '@common/Components/EntityHistory/EntityHistoryButton';
import SendButton from '@common/Components/SendButton';
import {Portal} from '@common/Components/Portal';
import {formatTs} from '@common/Utils/DateUtils';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {appUrl} from '@common/Utils/appUrl';
import {flag, FlagBtn} from './UsersSection';
import {statusLabel, entryTypeLabel} from './gridRenders';
import {useOpenUser} from './UserDetailContext';
import ImageLightbox from '../../Common/ImageLightbox';

interface AccountData {
    id: number;
    login: string;
    name: string;
    type: string;
    IS_ADMIN: string | number | null;
    IS_OWNER: string | number | null;
    IS_MODERATOR: string | number | null;
    IS_APPROVED: string | number | null;
    IS_DISABLED: string | number | null;
    reg_time?: number;
    last_online_time?: number;
    photo?: string;
    avatar?: string | null;
    avatar_full?: string | null;
}

interface ExpertProfile {
    display_name: string;
    bio: string;
    specialization: string;
    photo: string | null;
}

interface SlotRow {
    id: number;
    start_at: number | null;
    duration_min: number;
    cost: number;
    status: string;
    is_online: number | null;
    location: string | null;
}

interface BookingRow {
    id: number;
    bookable_type: string;
    bookable_id: number;
    status: string;
    created_at: number;
    expert_id?: number;
    expert_name?: string;
    slot: {start_at: number; duration_min: number; cost: number} | null;
}

interface LedgerRow {
    id: number;
    is_credit: number;
    amount: number;
    entry_type: string;
    note: string | null;
    created_at: number;
    party_id?: number | null;
    party_name?: string | null;
}

interface BalanceRow {
    balance: number;
    updated_at: number;
}

interface TicketRow {
    id: number;
    subject: string;
    status: string;
    created_at: number;
    updated_at: number;
}

interface ExpertCancellationRow {
    id: number;
    slot_id: number;
    booking_id: number;
    user_id: number;
    reason: string;
    created_at: number;
    slot_start_at: number | null;
    user_name: string | null;
}

interface UserCancellationRow {
    id: number;
    slot_id: number;
    booking_id: number;
    expert_id: number;
    reason: string;
    created_at: number;
    slot_start_at: number | null;
    expert_name: string | null;
}

interface UserDetailData {
    account: AccountData;
    expertProfile: ExpertProfile | null;
    slots: SlotRow[];
    balance: BalanceRow | null;
    ledger: LedgerRow[];
    bookings: BookingRow[];
    tickets: TicketRow[];
    expertCancelCount: number;
    userCancelCount: number;
    expertDeclineCount: number;
    userDeclineCount: number;
    expertCancellations: ExpertCancellationRow[];
    userCancellations: UserCancellationRow[];
}

const BOOKING_STATUS_CLS: Record<string, string> = {
    pending:   'status-warning',
    confirmed: 'bg-success',
    completed: 'status-info',
    cancelled: 'bg-secondary',
};

const SLOT_STATUS_CLS: Record<string, string> = {
    free:      'status-muted',
    booked:    'bg-primary',
    completed: 'status-info',
    cancelled: 'bg-secondary',
};

const TICKET_STATUS_CLS: Record<string, string> = {
    open:             'status-warning',
    investigation:    'status-info',
    in_progress:      'bg-primary',
    waiting_user:     'status-warning',
    waiting_support:  'status-warning',
    escalated:        'bg-danger',
    on_hold:          'bg-secondary',
    deferred:         'bg-secondary',
    low_priority:     'bg-secondary',
    resolved:         'bg-success',
    rejected:         'bg-secondary',
};

function ticketStatusLabel(status: string): string {
    switch (status) {
        case 'open':             return t.Support_Status_Open();
        case 'investigation':    return t.Support_Status_Investigation();
        case 'in_progress':      return t.Support_Status_InProgress();
        case 'waiting_user':     return t.Support_Status_WaitingUser();
        case 'waiting_support':  return t.Support_Status_WaitingSupport();
        case 'escalated':        return t.Support_Status_Escalated();
        case 'on_hold':          return t.Support_Status_OnHold();
        case 'deferred':         return t.Support_Status_Deferred();
        case 'low_priority':     return t.Support_Status_LowPriority();
        case 'resolved':         return t.Support_Status_Resolved();
        case 'rejected':         return t.Support_Status_Rejected();
        default:                 return status;
    }
}

const Avatar: React.FC<{name: string; photo: string | null; onView?: () => void}> = ({name, photo, onView}) => {
    const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
    if (photo) {
        const img = <img src={photo} alt={name} className="admin-user-avatar-img" />;
        return onView ? (
            <button
                type="button"
                className="p-0 border-0 bg-transparent cursor-pointer"
                onClick={onView}
                title={name}
                data-test-id="admin-user-avatar"
            >
                {img}
            </button>
        ) : img;
    }
    return (
        <div className="admin-user-avatar-fallback">
            {initials}
        </div>
    );
};

const SectionTitle: React.FC<{children: React.ReactNode}> = ({children}) => (
    <h3 className="admin-section-title">{children}</h3>
);

/* ---- Write-to-user modal ---- */
const WriteToUserModal: React.FC<{
    accountId: number;
    accountName: string;
    createTicketUrl: string;
    onClose: () => void;
    onSuccess: () => void;
}> = ({accountId, accountName, createTicketUrl, onClose, onSuccess}) => {
    const [subject, setSubject] = useState('');
    const [body, setBody]       = useState('');
    const [sending, setSending] = useState(false);
    const [error, setError]     = useState<string | null>(null);

    const handleSend = async () => {
        if (!subject.trim() || !body.trim()) return;
        setSending(true);
        setError(null);
        try {
            const r: any = await sendPost(createTicketUrl, {
                account_id: accountId,
                subject: subject.trim(),
                message: body.trim(),
            });
            if (r?.error) {
                setError(r.error);
            } else {
                onSuccess();
            }
        } catch {
            setError(t.General_Error());
        } finally {
            setSending(false);
        }
    };

    return (
        <Portal><div className="fg-modal-overlay" onClick={onClose}>
            <div className="fg-modal-card fg-modal-card-lg" onClick={e => e.stopPropagation()}>
                <div className="fg-modal-header-row">
                    <h3 className="fg-modal-title">{t.Admin_WriteToUser()}</h3>
                    <button type="button" className="fg-modal-close-x" onClick={onClose}
                        aria-label={t.A11y_CloseModal()}>&times;</button>
                </div>
                <div className="fg-modal-subtitle">{accountName} (ID: {accountId})</div>
                {error && <div className="fg-modal-error">{error}</div>}
                <div className="mb-3">
                    <label className="block text-sm font-medium mb-1">{t.Admin_MessageSubject()}</label>
                    <input
                        type="text"
                        className="form-control w-full"
                        value={subject}
                        onChange={e => setSubject(e.target.value)}
                        disabled={sending}
                    />
                </div>
                <div className="mb-4">
                    <label className="block text-sm font-medium mb-1">{t.Admin_MessageBody()}</label>
                    <textarea
                        className="form-control w-full"
                        rows={5}
                        value={body}
                        onChange={e => setBody(e.target.value)}
                        disabled={sending}
                    />
                </div>
                <div className="fg-modal-actions">
                    <button type="button" className="btn btn-sm btn-secondary" onClick={onClose} disabled={sending}>
                        {t.Action_Cancel()}
                    </button>
                    <SendButton
                        onClick={handleSend}
                        sending={sending}
                        disabled={!subject.trim() || !body.trim()}
                        label={sending ? t.User_Loading() : t.Support_Send()}
                        testId={`write-to-user-send-${accountId}`}
                        size="sm"
                    />
                </div>
            </div>
        </div></Portal>
    );
};

interface Props {
    accountId: number;
    detailUrl: string;
    setFlagUrl?: string;
    createTicketUrl?: string;
}

export default function UserDetailPanel({accountId, detailUrl, setFlagUrl, createTicketUrl}: Props) {
    const [data, setData]         = useState<UserDetailData | null>(null);
    const [error, setError]       = useState<string | null>(null);
    const [flagPending, setFlagPending] = useState(false);
    const [photoRemovePending, setPhotoRemovePending] = useState(false);
    const [showWriteModal, setShowWriteModal] = useState(false);
    const [toastMsg, setToastMsg] = useState<string | null>(null);
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const openUser = useOpenUser();

    useEffect(() => {
        setData(null);
        setError(null);
        sendPost(detailUrl, {account_id: accountId})
            .then((r: any) => {
                if (r?.error) setError(r.error);
                else setData(r as UserDetailData);
            })
            .catch(() => setError(t.User_LoadError()));
    }, [accountId, detailUrl]);

    // Auto-dismiss toast
    useEffect(() => {
        if (!toastMsg) return;
        const timer = setTimeout(() => setToastMsg(null), 3000);
        return () => clearTimeout(timer);
    }, [toastMsg]);

    const setFlag = async (flagName: string, value: 0 | 1) => {
        if (!setFlagUrl || flagPending || !data) return;
        setFlagPending(true);
        try {
            const resp = await sendPost(setFlagUrl, {user_id: data.account.id, flag: flagName, value}) as any;
            if (resp?.error) {
                showToast(resp.error, 'danger');
                return;
            }
            setData(prev => prev ? {
                ...prev,
                account: {...prev.account, [flagName]: value ? '1' : null},
            } : prev);
        } catch (err: any) {
            showToast(err?.response?.error || err?.message || t.General_Error(), 'danger');
        } finally {
            setFlagPending(false);
        }
    };

    const removePhoto = async () => {
        if (!data || photoRemovePending) return;
        if (!window.confirm(t.Admin_RemovePhotoConfirm())) return;
        setPhotoRemovePending(true);
        try {
            const resp = await sendPost(appUrl('/admin/~removeUserPhoto'), {user_id: data.account.id}) as any;
            if (resp?.error) {
                showToast(resp.error, 'danger');
                return;
            }
            setData(prev => prev ? {
                ...prev,
                account: {...prev.account, avatar: null, photo: undefined},
            } : prev);
            showToast(t.Admin_RemovePhotoDone(), 'success');
        } catch (err: any) {
            showToast(err?.response?.error || err?.message || t.General_Error(), 'danger');
        } finally {
            setPhotoRemovePending(false);
        }
    };

    if (error) return <div className="admin-detail-error">{error}</div>;
    if (!data)  return <div className="admin-detail-loading">{t.User_Loading()}</div>;

    const {account, expertProfile, slots, balance, ledger, bookings, tickets, expertCancelCount, userCancelCount, expertDeclineCount, userDeclineCount, expertCancellations, userCancellations} = data;
    const isExpert   = account.type === 'expert';
    const photo       = account.avatar ?? expertProfile?.photo ?? null;
    const fullPhoto   = account.avatar_full ?? photo;
    const displayName = expertProfile?.display_name || account.name || account.login;

    const header = (
        <div className="admin-user-header">
            <Avatar name={displayName} photo={photo} onView={photo ? () => setLightboxOpen(true) : undefined} />
            {lightboxOpen && fullPhoto && (
                <ImageLightbox
                    src={fullPhoto}
                    alt={displayName}
                    onClose={() => setLightboxOpen(false)}
                />
            )}
            <div className="flex-1 min-w-0">
                <div className="admin-header-badges">
                    <span className="text-lg font-semibold">{displayName}</span>
                    {account.login !== displayName && (
                        <span className="text-muted text-sm">{account.login}</span>
                    )}
                    <span className={`badge ${isExpert ? 'status-info' : 'status-muted'}`}>
                        {isExpert ? t.Reg_AccountTypeExpert() : t.Reg_AccountTypeUser()}
                    </span>
                    {flag(account.IS_ADMIN)     && <span className="badge bg-danger">{t.Admin_Role_Admin()}</span>}
                    {flag(account.IS_OWNER)     && <span className="badge status-warning">{t.Admin_Role_Owner()}</span>}
                    {flag(account.IS_MODERATOR) && <span className="badge bg-primary">{t.Admin_Role_Moderator()}</span>}
                    {flag(account.IS_APPROVED)  && <span className="badge bg-success">{t.User_Status_Approved()}</span>}
                    {flag(account.IS_DISABLED)  && <span className="badge bg-secondary">{t.User_Status_Disabled()}</span>}
                </div>
                <div className="admin-user-meta">
                    {account.reg_time         && <span>{t.User_RegTime()}: {formatTs(account.reg_time)}</span>}
                    {account.last_online_time && <span>{t.User_LastOnline()}: {formatTs(account.last_online_time)}</span>}
                    <span>ID: {account.id}</span>
                </div>
                {/* Cancellation / decline counts */}
                {(expertCancelCount > 0 || userCancelCount > 0 || expertDeclineCount > 0 || userDeclineCount > 0) && (
                    <div className="admin-user-meta">
                        {expertDeclineCount > 0 && (
                            <span className="text-warning">{t.User_ExpertDeclines()}: {expertDeclineCount}</span>
                        )}
                        {expertCancelCount > 0 && (
                            <span className="text-danger">{t.User_ExpertCancellations()}: {expertCancelCount}</span>
                        )}
                        {userDeclineCount > 0 && (
                            <span className="text-warning">{t.User_UserDeclines()}: {userDeclineCount}</span>
                        )}
                        {userCancelCount > 0 && (
                            <span className="text-danger">{t.User_UserCancellations()}: {userCancelCount}</span>
                        )}
                    </div>
                )}
                {/* Flag toggles + write-to-user */}
                {setFlagUrl && (
                    <div className="admin-header-actions">
                        {isExpert && (
                            <FlagBtn
                                testId={`flag-IS_APPROVED-${account.id}`}
                                label={flag(account.IS_APPROVED) ? t.Admin_Revoke() : t.Admin_Approve()}
                                title={flag(account.IS_APPROVED) ? t.Admin_Flag_RevokeApproval() : t.Admin_Flag_Approve()}
                                active={flag(account.IS_APPROVED)}
                                cls={['btn-outline-danger', 'btn-success']}
                                disabled={flagPending}
                                onClick={() => setFlag('IS_APPROVED', flag(account.IS_APPROVED) ? 0 : 1)}
                            />
                        )}
                        <FlagBtn
                            testId={`flag-IS_DISABLED-${account.id}`}
                            label={flag(account.IS_DISABLED) ? t.Admin_Enable() : t.Admin_Disable()}
                            title={flag(account.IS_DISABLED) ? t.Admin_Flag_Enable() : t.Admin_Flag_Disable()}
                            active={flag(account.IS_DISABLED)}
                            cls={['btn-secondary', 'btn-outline-danger']}
                            disabled={flagPending}
                            onClick={() => setFlag('IS_DISABLED', flag(account.IS_DISABLED) ? 0 : 1)}
                        />
                        <FlagBtn
                            testId={`flag-IS_MODERATOR-${account.id}`}
                            label={t.Admin_Role_Moderator()}
                            title={flag(account.IS_MODERATOR) ? t.Admin_Flag_RevokeModerator() : t.Admin_Flag_GrantModerator()}
                            active={flag(account.IS_MODERATOR)}
                            cls={['btn-success', 'btn-outline-secondary']}
                            disabled={flagPending}
                            onClick={() => setFlag('IS_MODERATOR', flag(account.IS_MODERATOR) ? 0 : 1)}
                        />
                        <FlagBtn
                            testId={`flag-IS_OWNER-${account.id}`}
                            label={t.Admin_Role_Owner()}
                            title={flag(account.IS_OWNER) ? t.Admin_Flag_RevokeOwner() : t.Admin_Flag_GrantOwner()}
                            active={flag(account.IS_OWNER)}
                            cls={['btn-success', 'btn-outline-secondary']}
                            disabled={flagPending}
                            onClick={() => setFlag('IS_OWNER', flag(account.IS_OWNER) ? 0 : 1)}
                        />
                        <FlagBtn
                            testId={`flag-IS_ADMIN-${account.id}`}
                            label={t.Admin_Role_Admin()}
                            title={flag(account.IS_ADMIN) ? t.Admin_Flag_RevokeAdmin() : t.Admin_Flag_GrantAdmin()}
                            active={flag(account.IS_ADMIN)}
                            cls={['btn-success', 'btn-outline-secondary']}
                            disabled={flagPending}
                            onClick={() => setFlag('IS_ADMIN', flag(account.IS_ADMIN) ? 0 : 1)}
                        />
                        {createTicketUrl && (
                            <button
                                type="button"
                                className="btn btn-sm btn-outline-primary ml-2"
                                data-test-id={`write-to-user-${account.id}`}
                                onClick={() => setShowWriteModal(true)}
                            >
                                {t.Admin_WriteToUser()}
                            </button>
                        )}
                        {photo && (
                            <button
                                type="button"
                                className="btn btn-sm btn-outline-danger ml-2"
                                data-test-id={`remove-user-photo-${account.id}`}
                                onClick={removePhoto}
                                disabled={photoRemovePending}
                            >
                                {t.Admin_RemovePhoto()}
                            </button>
                        )}
                        <a
                            href={isExpert ? `/expert/id~${account.id}` : `/user/id~${account.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-sm btn-outline-secondary ml-2"
                            data-test-id={`view-public-profile-${account.id}`}
                            title={t.Admin_PublicProfile()}
                        >
                            {t.Admin_PublicProfile()}
                        </a>
                        <EntityHistoryButton
                            entityType="account"
                            entityId={account.id}
                            label={t.Admin_History()}
                            title={`${t.Admin_History()} — ${displayName}`}
                            className="btn btn-sm btn-outline-secondary ml-2"
                            testIdSuffix={`account-${account.id}`}
                        />
                    </div>
                )}
            </div>
            <div className="admin-user-balance" data-test-id="user-detail-balance">
                <div className="admin-user-balance-label">{t.User_Balance()}</div>
                <div className={`admin-user-balance-amount ${(balance?.balance ?? 0) < 0 ? 'text-danger' : 'text-success'}`}>
                    {balance?.balance ?? 0} &#8381;
                </div>
            </div>
        </div>
    );

    /* ---- Personal tab ---- */
    const personalTab = (
        <>
            {/* Support tickets */}
            {tickets.length > 0 && (
                <>
                    <SectionTitle>{t.User_SupportTickets()} ({tickets.length})</SectionTitle>
                    <table className="admin-detail-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>{t.User_TicketSubject()}</th>
                                <th>{t.User_TicketStatus()}</th>
                                <th>{t.User_TicketUpdated()}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tickets.map(tk => (
                                <tr key={tk.id}>
                                    <td className="admin-cell-id">
                                        <a
                                            href={appUrl(`/admin/support/#ticket=${tk.id}`)}
                                            className="admin-link-btn-strong"
                                            data-test-id={`user-detail-ticket-link-${tk.id}`}
                                        >
                                            #{tk.id}
                                        </a>
                                    </td>
                                    <td>
                                        <a
                                            href={appUrl(`/admin/support/#ticket=${tk.id}`)}
                                            className="admin-link-btn-strong"
                                        >
                                            {tk.subject}
                                        </a>
                                    </td>
                                    <td>
                                        <span className={`badge ${TICKET_STATUS_CLS[tk.status] ?? 'status-muted'}`}>
                                            {ticketStatusLabel(tk.status)}
                                        </span>
                                    </td>
                                    <td className="admin-cell-note">{formatTs(tk.updated_at)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </>
            )}

            {/* Ledger */}
            {ledger.length > 0 && (
                <>
                    <SectionTitle>{t.Admin_Finance()} ({ledger.length})</SectionTitle>
                    <table className="admin-detail-table">
                        <thead>
                            <tr>
                                <th>{t.Admin_Ledger_Date()}</th>
                                <th>{t.Admin_Ledger_Type()}</th>
                                <th>{t.Admin_Ledger_Direction()}</th>
                                <th>{t.Admin_Ledger_Amount()}</th>
                                <th>{t.User_LedgerParty()}</th>
                                <th>{t.Admin_Ledger_Note()}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {ledger.map(e => (
                                <tr key={e.id}>
                                    <td className="admin-cell-date">{formatTs(e.created_at)}</td>
                                    <td className="admin-cell-mono">{entryTypeLabel(e.entry_type)}</td>
                                    <td>
                                        {e.is_credit
                                            ? <span className="badge bg-success">{t.Admin_Ledger_Credit()}</span>
                                            : <span className="badge bg-danger">{t.Admin_Ledger_Debit()}</span>
                                        }
                                    </td>
                                    <td>{e.amount} &#8381;</td>
                                    <td>
                                        {e.party_id && e.party_name ? (
                                            <button type="button" className="admin-link-btn"
                                                onClick={() => openUser(e.party_id!, e.party_name!)}>
                                                {e.party_name}
                                            </button>
                                        ) : <span className="admin-cell-note">{'\u2014'}</span>}
                                    </td>
                                    <td className="admin-cell-note">{e.note ?? '\u2014'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </>
            )}
        </>
    );

    /* ---- Student tab (bookings) ---- */
    const userTab = (
        <>
            {bookings.length > 0 ? (
                <>
                    <SectionTitle>{t.Admin_Bookings()} ({bookings.length})</SectionTitle>
                    <table className="admin-detail-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>{t.Booking_Slot()}</th>
                                <th>{t.Slot_Expert()}</th>
                                <th>{t.Slot_Date()}</th>
                                <th>{t.Admin_Booking_Status()}</th>
                                <th>{t.Booking_Created()}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {bookings.map(b => {
                                const label   = `Slot #${b.bookable_id}`;
                                const dateStr = b.slot ? formatTs(b.slot.start_at) : '\u2014';
                                const expertId = b.expert_id;
                                const expertName = b.expert_name;
                                return (
                                    <tr key={b.id}>
                                        <td className="admin-cell-id">#{b.id}</td>
                                        <td>{label}</td>
                                        <td>
                                            {expertId && expertName ? (
                                                <button type="button" className="admin-link-btn"
                                                    onClick={() => openUser(expertId, expertName)}>
                                                    {expertName}
                                                </button>
                                            ) : <span className="admin-cell-note">{'\u2014'}</span>}
                                        </td>
                                        <td className="admin-cell-note">{dateStr}</td>
                                        <td>
                                            <span className={`badge ${BOOKING_STATUS_CLS[b.status] ?? 'status-muted'}`}>
                                                {statusLabel(b.status)}
                                            </span>
                                        </td>
                                        <td className="admin-cell-note">{formatTs(b.created_at)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </>
            ) : (
                <div className="text-muted text-sm py-4">{t.User_NoBookings()}</div>
            )}

            {/* User cancellations list */}
            {userCancellations.length > 0 && (
                <>
                    <SectionTitle>{t.User_UserCancellations()} ({userCancelCount})</SectionTitle>
                    <table className="admin-detail-table">
                        <thead>
                            <tr>
                                <th>{t.Admin_Cancel_Date()}</th>
                                <th>{t.Admin_Cancel_Expert()}</th>
                                <th>{t.Admin_Cancel_SlotTime()}</th>
                                <th>{t.Admin_Cancel_Reason()}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {userCancellations.map(sc => (
                                <tr key={sc.id}>
                                    <td className="admin-cell-date">{formatTs(sc.created_at)}</td>
                                    <td>
                                        {sc.expert_id && sc.expert_name ? (
                                            <button type="button" className="admin-link-btn"
                                                onClick={() => openUser(sc.expert_id, sc.expert_name!)}>
                                                {sc.expert_name}
                                            </button>
                                        ) : <span className="admin-cell-note">{'\u2014'}</span>}
                                    </td>
                                    <td className="admin-cell-date">
                                        {sc.slot_start_at ? formatTs(sc.slot_start_at) : '\u2014'}
                                    </td>
                                    <td className="text-sm">{sc.reason || '\u2014'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </>
            )}
        </>
    );

    /* ---- Teaching tab ---- */
    const teachingTab = (
        <>
            {/* Expert profile */}
            {expertProfile && (
                <div className="admin-expert-profile-card">
                    <div className="admin-expert-profile-row">
                        {expertProfile.specialization && (
                            <div><span className="text-muted">{t.Expert_Specialization()}: </span>{expertProfile.specialization}</div>
                        )}
                    </div>
                    {expertProfile.bio && <div className="text-muted mt-1">{expertProfile.bio}</div>}
                </div>
            )}

            {/* Expert cancellations list */}
            {expertCancellations.length > 0 && (
                <>
                    <SectionTitle>{t.User_ExpertCancellations()} ({expertCancelCount})</SectionTitle>
                    <table className="admin-detail-table mb-4">
                        <thead>
                            <tr>
                                <th>{t.Admin_Cancel_Date()}</th>
                                <th>{t.Admin_Cancel_User()}</th>
                                <th>{t.Admin_Cancel_SlotTime()}</th>
                                <th>{t.Admin_Cancel_Reason()}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {expertCancellations.map(tc => (
                                <tr key={tc.id}>
                                    <td className="admin-cell-date">{formatTs(tc.created_at)}</td>
                                    <td>
                                        {tc.user_id && tc.user_name ? (
                                            <button type="button" className="admin-link-btn"
                                                onClick={() => openUser(tc.user_id, tc.user_name!)}>
                                                {tc.user_name}
                                            </button>
                                        ) : <span className="admin-cell-note">{'\u2014'}</span>}
                                    </td>
                                    <td className="admin-cell-date">
                                        {tc.slot_start_at ? formatTs(tc.slot_start_at) : '\u2014'}
                                    </td>
                                    <td className="text-sm">{tc.reason || '\u2014'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </>
            )}

            {/* Slots */}
            {slots.length > 0 && (
                <>
                    <SectionTitle>{t.Admin_Slots()} ({slots.length})</SectionTitle>
                    <table className="admin-detail-table">
                        <thead>
                            <tr>
                                <th>{t.Slot_DateTime()}</th>
                                <th>{t.Slot_Duration()}</th>
                                <th>{t.Slot_Cost()}</th>
                                <th>{t.Slot_Type()}</th>
                                <th>{t.Slot_Status()}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {slots.map(s => (
                                <tr key={s.id}>
                                    <td className="whitespace-nowrap">{s.start_at ? formatTs(s.start_at) : '\u2014'}</td>
                                    <td>{s.duration_min} {t.Slot_Duration_Min()}</td>
                                    <td>{s.cost} &#8381;</td>
                                    <td>
                                        {s.is_online
                                            ? <span className="badge bg-primary">{t.Slot_Online()}</span>
                                            : <span className="badge bg-secondary">{t.Slot_Offline()}</span>
                                        }
                                    </td>
                                    <td>
                                        <span className={`badge ${SLOT_STATUS_CLS[s.status] ?? 'status-muted'}`}>
                                            {statusLabel(s.status)}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </>
            )}
        </>
    );

    return (
        <div className="admin-detail-pane" data-test-id="user-detail-pane">
            {/* Toast notification */}
            {toastMsg && (
                <div className="admin-floating-toast">
                    {toastMsg}
                </div>
            )}
            {header}
            {personalTab}
            {(data.bookings.length > 0 || userCancellations.length > 0) && userTab}
            {isExpert && teachingTab}
            {/* Write-to-user modal */}
            {showWriteModal && createTicketUrl && (
                <WriteToUserModal
                    accountId={account.id}
                    accountName={displayName}
                    createTicketUrl={createTicketUrl}
                    onClose={() => setShowWriteModal(false)}
                    onSuccess={() => {
                        setShowWriteModal(false);
                        setToastMsg(t.Admin_MessageSent());
                        // Reload data to refresh tickets list
                        sendPost(detailUrl, {account_id: accountId})
                            .then((r: any) => {
                                if (!r?.error) setData(r as UserDetailData);
                            });
                    }}
                />
            )}
        </div>
    );
}
