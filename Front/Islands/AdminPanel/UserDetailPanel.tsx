import * as React from 'react';
import {useState, useEffect} from 'react';
import {sendPost} from '@common/Api/sendPost';
import {showToast} from '@common/Components/GlobalToast';
import {appUrl} from '@common/Utils/appUrl';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {useOpenUser} from './UserDetailContext';
import {UserDetailData} from './userDetail/userDetailTypes';
import {UserHeader} from './userDetail/UserHeader';
import {WriteToUserModal} from './userDetail/WriteToUserModal';
import {ClearUserModal} from './userDetail/ClearUserModal';
import {TicketsSection} from './userDetail/sections/TicketsSection';
import {LedgerSection} from './userDetail/sections/LedgerSection';
import {BookingsSection} from './userDetail/sections/BookingsSection';
import {CancellationsSection} from './userDetail/sections/CancellationsSection';
import {SlotsSection} from './userDetail/sections/SlotsSection';

interface Props {
    accountId: number;
    detailUrl: string;
    setFlagUrl?: string;
    createTicketUrl?: string;
    callerIsOwner?: boolean;
    callerIsAdmin?: boolean;
}

/**
 * Карточка пользователя в админке: шапка с ролями и деньгами, затем разделы —
 * обращения, финансы, брони, отмены, слоты.
 *
 * Разметка живёт в `userDetail/`. Раньше всё это лежало одним файлом на 970
 * строк — самым большим на фронте, — где строка таблицы уходила на
 * тринадцатый уровень вложенности.
 */
export default function UserDetailPanel({accountId, detailUrl, setFlagUrl, createTicketUrl, callerIsOwner, callerIsAdmin}: Props) {
    const [data, setData] = useState<UserDetailData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [flagPending, setFlagPending] = useState(false);
    const [photoRemovePending, setPhotoRemovePending] = useState(false);
    const [showWriteModal, setShowWriteModal] = useState(false);
    const [showClearModal, setShowClearModal] = useState(false);
    const [cleared, setCleared] = useState(false);
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

    useEffect(() => {
        if (!toastMsg) return;
        const timer = setTimeout(() => setToastMsg(null), 3000);
        return () => clearTimeout(timer);
    }, [toastMsg]);

    const setFlag = async (flagName: string, value: 0 | 1) => {
        if (!setFlagUrl || flagPending || !data) return;
        setFlagPending(true);
        try {
            const csrf = (window as any).__GARNET_CSRF__ ?? '';
            const resp = await sendPost(setFlagUrl, {CSRF_TOKEN: csrf, user_id: data.account.id, flag: flagName, value}) as any;
            if (resp?.error) {
                showToast(resp.error, 'danger');
                return;
            }
            setData(prev => prev ? {...prev, account: {...prev.account, [flagName]: value ? '1' : null}} : prev);
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
            const csrf = (window as any).__GARNET_CSRF__ ?? '';
            const resp = await sendPost(appUrl('/admin/~removeUserPhoto'), {CSRF_TOKEN: csrf, user_id: data.account.id}) as any;
            if (resp?.error) {
                showToast(resp.error, 'danger');
                return;
            }
            setData(prev => prev ? {...prev, account: {...prev.account, avatar: null, photo: undefined}} : prev);
            showToast(t.Admin_RemovePhotoDone(), 'success');
        } catch (err: any) {
            showToast(err?.response?.error || err?.message || t.General_Error(), 'danger');
        } finally {
            setPhotoRemovePending(false);
        }
    };

    if (error) return <div className="admin-detail-error">{error}</div>;
    if (!data) return <div className="admin-detail-loading">{t.User_Loading()}</div>;

    // После успешной очистки аккаунта и всех связанных записей уже нет —
    // обновиться с сервера панель не может. Показываем итоговую надпись;
    // вкладку администратор закрывает сам.
    if (cleared) {
        return (
            <div className="admin-detail-pane" data-test-id="user-detail-pane">
                {toastMsg && <div className="admin-floating-toast">{toastMsg}</div>}
                <div className="admin-detail-cleared">
                    <h3 className="text-danger">{t.Admin_ClearUserDone()}</h3>
                </div>
            </div>
        );
    }

    const {
        account, expertProfile, slots, balance, ledger, bookings, tickets,
        expertCancelCount, userCancelCount, expertDeclineCount, userDeclineCount,
        expertCancellations, userCancellations,
    } = data;

    const isExpert = account.type === 'expert';
    const photo = account.avatar ?? expertProfile?.photo ?? null;
    const fullPhoto = account.avatar_full ?? photo;
    const displayName = expertProfile?.display_name || account.name || account.login;
    const showStudentPart = bookings.length > 0 || userCancellations.length > 0;

    const reloadAfterWrite = () => {
        setShowWriteModal(false);
        setToastMsg(t.Admin_MessageSent());
        sendPost(detailUrl, {account_id: accountId}).then((r: any) => {
            if (!r?.error) setData(r as UserDetailData);
        });
    };

    return (
        <div className="admin-detail-pane" data-test-id="user-detail-pane">
            {toastMsg && <div className="admin-floating-toast">{toastMsg}</div>}

            <UserHeader
                account={account}
                displayName={displayName}
                isExpert={isExpert}
                photo={photo}
                fullPhoto={fullPhoto}
                balance={balance}
                expertCancelCount={expertCancelCount}
                userCancelCount={userCancelCount}
                expertDeclineCount={expertDeclineCount}
                userDeclineCount={userDeclineCount}
                lightboxOpen={lightboxOpen}
                setLightboxOpen={setLightboxOpen}
                showActions={!!setFlagUrl}
                flagPending={flagPending}
                photoRemovePending={photoRemovePending}
                callerIsOwner={!!callerIsOwner}
                callerIsAdmin={!!callerIsAdmin}
                createTicketUrl={createTicketUrl}
                onSetFlag={setFlag}
                onWrite={() => setShowWriteModal(true)}
                onRemovePhoto={removePhoto}
                onClear={() => setShowClearModal(true)}
            />

            <TicketsSection tickets={tickets} />
            <LedgerSection ledger={ledger} onOpenUser={openUser} />

            {showStudentPart && <BookingsSection bookings={bookings} onOpenUser={openUser} />}
            {showStudentPart && (
                <CancellationsSection
                    title={t.User_UserCancellations()}
                    counterpartColumn={t.Admin_Cancel_Expert()}
                    count={userCancelCount}
                    items={userCancellations.map(sc => ({
                        id: sc.id,
                        created_at: sc.created_at,
                        slot_start_at: sc.slot_start_at,
                        reason: sc.reason,
                        counterpartId: sc.expert_id,
                        counterpartName: sc.expert_name,
                    }))}
                    onOpenUser={openUser}
                />
            )}

            {isExpert && expertProfile && (
                <div className="admin-expert-profile-card">
                    <div className="admin-expert-profile-row">
                    </div>
                    {expertProfile.bio && <div className="text-muted mt-1">{expertProfile.bio}</div>}
                </div>
            )}
            {isExpert && (
                <CancellationsSection
                    title={t.User_ExpertCancellations()}
                    counterpartColumn={t.Admin_Cancel_User()}
                    count={expertCancelCount}
                    className="admin-detail-table mb-4"
                    items={expertCancellations.map(tc => ({
                        id: tc.id,
                        created_at: tc.created_at,
                        slot_start_at: tc.slot_start_at,
                        reason: tc.reason,
                        counterpartId: tc.user_id,
                        counterpartName: tc.user_name,
                    }))}
                    onOpenUser={openUser}
                />
            )}
            {isExpert && <SlotsSection slots={slots} />}

            {showWriteModal && createTicketUrl && (
                <WriteToUserModal
                    accountId={account.id}
                    accountName={displayName}
                    createTicketUrl={createTicketUrl}
                    onClose={() => setShowWriteModal(false)}
                    onSuccess={reloadAfterWrite}
                />
            )}
            {showClearModal && (
                <ClearUserModal
                    accountId={account.id}
                    accountLogin={account.login}
                    accountName={displayName}
                    onClose={() => setShowClearModal(false)}
                    onSuccess={() => {
                        setShowClearModal(false);
                        setToastMsg(t.Admin_ClearUserDone());
                        setCleared(true);
                    }}
                />
            )}
        </div>
    );
}
