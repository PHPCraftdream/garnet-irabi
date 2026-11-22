import * as React from 'react';
import {useState, useEffect} from 'react';
import {Carburetor} from '@react-carburetor/core';
import {sendPost} from '@common/Api/Send/sendPost';
import {showToast} from '@common/Components/Feedback/GlobalToast';
import {appUrl} from '@common/Utils/Url/appUrl';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {useOpenUser} from './UserDetailContext';
import {UserDetailData} from './userDetail/userDetailTypes';
import {UserHeader} from './userDetail/Header/UserHeader';
import {WriteToUserModal} from './userDetail/Modals/WriteToUserModal';
import {ClearUserModal} from './userDetail/Modals/ClearUserModal';
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

interface PanelState {
    data: UserDetailData | null;
    error: string | null;
    flagPending: boolean;
    photoRemovePending: boolean;
    showWriteModal: boolean;
    showClearModal: boolean;
    cleared: boolean;
    toastMsg: string | null;
    lightboxOpen: boolean;
}

class UserDetailStore extends Carburetor<PanelState> {
    constructor() {
        super({data: null, error: null, flagPending: false, photoRemovePending: false, showWriteModal: false, showClearModal: false, cleared: false, toastMsg: null, lightboxOpen: false});
    }

    readonly snapshot = () => this.getData();
    readonly subscribeSnapshot = (listener: () => void) => {
        const id = this.subscribe(listener);
        return () => this.unsubscribe(id);
    };

    private change<K extends keyof PanelState>(key: K, value: PanelState[K]): void {
        const current = this.getData();
        if (Object.is(current[key], value)) return;
        const version = this.getVersion();
        this.setData({...current, [key]: value});
        if (this.getData() !== current && this.getVersion() === version) {
            this.markAllChanged();
            this.emitUpdate();
        }
    }

    readonly setDetail = (value: React.SetStateAction<PanelState['data']>) => {
        const next = typeof value === 'function' ? value(this.getData().data) : value;
        this.change('data', next);
    };
    readonly setError = (value: string | null) => this.change('error', value);
    readonly setFlagPending = (value: boolean) => this.change('flagPending', value);
    readonly setPhotoRemovePending = (value: boolean) => this.change('photoRemovePending', value);
    readonly setShowWriteModal = (value: boolean) => this.change('showWriteModal', value);
    readonly setShowClearModal = (value: boolean) => this.change('showClearModal', value);
    readonly setCleared = (value: boolean) => this.change('cleared', value);
    readonly setToastMsg = (value: string | null) => this.change('toastMsg', value);
    readonly openWrite = () => this.setShowWriteModal(true);
    readonly closeWrite = () => this.setShowWriteModal(false);
    readonly openClear = () => this.setShowClearModal(true);
    readonly closeClear = () => this.setShowClearModal(false);
    readonly completeClear = () => {
        this.closeClear();
        this.setToastMsg(t.Admin_ClearUserDone());
        this.setCleared(true);
    };
    readonly setLightboxOpen = (value: boolean) => this.change('lightboxOpen', value);
}

function createStore(): UserDetailStore {
    return new UserDetailStore();
}

/**
 * Карточка пользователя в админке: шапка с ролями и деньгами, затем разделы —
 * обращения, финансы, брони, отмены, слоты.
 *
 * Разметка живёт в `userDetail/`. Раньше всё это лежало одним файлом на 970
 * строк — самым большим на фронте, — где строка таблицы уходила на
 * тринадцатый уровень вложенности.
 */
function ignoreReloadFailure(): void {}

class UserDetailActions {
    constructor(private readonly ui: UserDetailStore, private readonly accountId: number,
        private readonly detailUrl: string, private readonly setFlagUrl?: string) {}

    readonly setFlag = async (flagName: string, value: 0 | 1) => {
        const {setFlagUrl, ui} = this;
        const {data, flagPending} = ui.getData();
        const {setFlagPending, setDetail: setData} = ui;
        if (!setFlagUrl || flagPending || !data) return;
        setFlagPending(true);
        try {
            const csrf = (window as any).__GARNET_CSRF__ ?? '';
            const resp = await sendPost(setFlagUrl, {CSRF_TOKEN: csrf, user_id: data.account.id, flag: flagName, value}) as any;
            if (resp?.error) {
                showToast(resp.error, 'danger');
                return;
            }
            setData(prev => prev?.account.id === data.account.id ? {...prev, account: {...prev.account, [flagName]: value ? '1' : null}} : prev);
        } catch (err: any) {
            showToast(err?.response?.error || err?.message || t.General_Error(), 'danger');
        } finally {
            setFlagPending(false);
        }
    };

    readonly removePhoto = async () => {
        const {ui} = this;
        const {data, photoRemovePending} = ui.getData();
        const {setPhotoRemovePending, setDetail: setData} = ui;
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
            setData(prev => prev?.account.id === data.account.id ? {...prev, account: {...prev.account, avatar: null, photo: undefined}} : prev);
            showToast(t.Admin_RemovePhotoDone(), 'success');
        } catch (err: any) {
            showToast(err?.response?.error || err?.message || t.General_Error(), 'danger');
        } finally {
            setPhotoRemovePending(false);
        }
    };

    readonly reloadAfterWrite = () => {
        const {ui, detailUrl, accountId} = this;
        const {setShowWriteModal, setToastMsg, setDetail: setData} = ui;
        setShowWriteModal(false);
        setToastMsg(t.Admin_MessageSent());
        sendPost(detailUrl, {account_id: accountId}).then((r: any) => {
            if (!r?.error && ui.getData().data?.account.id === accountId) setData(r as UserDetailData);
        }).catch(ignoreReloadFailure);
    };
}

export default function UserDetailPanel({accountId, detailUrl, setFlagUrl, createTicketUrl, callerIsOwner, callerIsAdmin}: Props) {
    const [ui] = useState(createStore);
    const {data, error, flagPending, photoRemovePending, showWriteModal, showClearModal, cleared, toastMsg, lightboxOpen} =
        React.useSyncExternalStore(ui.subscribeSnapshot, ui.snapshot, ui.snapshot);
    const {setDetail: setData, setError, setToastMsg, setLightboxOpen} = ui;
    const {setFlag, removePhoto, reloadAfterWrite} = React.useMemo(
        () => new UserDetailActions(ui, accountId, detailUrl, setFlagUrl), [ui, accountId, detailUrl, setFlagUrl],
    );
    const openUser = useOpenUser();

    useEffect(() => {
        let current = true;
        setData(null);
        setError(null);
        sendPost(detailUrl, {account_id: accountId})
            .then((r: any) => {
                if (!current) return;
                if (r?.error) setError(r.error);
                else setData(r as UserDetailData);
            })
            .catch(() => { if (current) setError(t.User_LoadError()); });
        return () => { current = false; };
    }, [accountId, detailUrl, setData, setError]);

    useEffect(() => {
        if (!toastMsg) return;
        const timer = setTimeout(() => setToastMsg(null), 3000);
        return () => clearTimeout(timer);
    }, [toastMsg, setToastMsg]);

    return <UserDetailView {...{ui, data, error, flagPending, photoRemovePending, showWriteModal, showClearModal, cleared,
        toastMsg, lightboxOpen, setLightboxOpen, openUser, setFlagUrl, createTicketUrl, callerIsOwner, callerIsAdmin,
        setFlag, removePhoto, reloadAfterWrite}} />;
}

interface ViewProps extends PanelState, Pick<Props, 'setFlagUrl' | 'createTicketUrl' | 'callerIsOwner' | 'callerIsAdmin'> {
    ui: UserDetailStore;
    openUser: ReturnType<typeof useOpenUser>;
    setLightboxOpen: (open: boolean) => void;
    setFlag: (name: string, value: 0 | 1) => void;
    removePhoto: () => void;
    reloadAfterWrite: () => void;
}

function studentCancellation(item: UserDetailData['userCancellations'][number]) {
    const {id, created_at, slot_start_at, reason, expert_id, expert_name} = item;
    return {id, created_at, slot_start_at, reason, counterpartId: expert_id, counterpartName: expert_name};
}

function expertCancellation(item: UserDetailData['expertCancellations'][number]) {
    const {id, created_at, slot_start_at, reason, user_id, user_name} = item;
    return {id, created_at, slot_start_at, reason, counterpartId: user_id, counterpartName: user_name};
}

function UserDetailView({ui, data, error, flagPending, photoRemovePending, showWriteModal, showClearModal, cleared,
    toastMsg, lightboxOpen, setLightboxOpen, openUser, setFlagUrl, createTicketUrl, callerIsOwner, callerIsAdmin,
    setFlag, removePhoto, reloadAfterWrite}: ViewProps) {
    if (error) return <div className="admin-support-detail-error">{error}</div>;
    if (!data) return <div className="admin-support-detail-loading">{t.User_Loading()}</div>;

    // После успешной очистки аккаунта и всех связанных записей уже нет —
    // обновиться с сервера панель не может. Показываем итоговую надпись;
    // вкладку администратор закрывает сам.
    if (cleared) {
        return (
            <div className="admin-support-detail" data-test-id="user-detail-pane">
                {toastMsg && <div className="admin-user-notice">{toastMsg}</div>}
                <div className="admin-user-neutral">
                    <h3 className="admin-user-count-danger">{t.Admin_ClearUserDone()}</h3>
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

    return (
        <div className="admin-support-detail" data-test-id="user-detail-pane">
            {toastMsg && <div className="admin-user-notice">{toastMsg}</div>}

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
                onWrite={ui.openWrite}
                onRemovePhoto={removePhoto}
                onClear={ui.openClear}
            />

            <TicketsSection tickets={tickets} />
            <LedgerSection ledger={ledger} onOpenUser={openUser} />

            {showStudentPart && <BookingsSection bookings={bookings} onOpenUser={openUser} />}
            {showStudentPart && (
                <CancellationsSection
                    title={t.User_UserCancellations()}
                    counterpartColumn={t.Admin_Cancel_Expert()}
                    count={userCancelCount}
                    items={userCancellations.map(studentCancellation)}
                    onOpenUser={openUser}
                />
            )}

            {isExpert && expertProfile && (
                <div className="admin-user-neutral">
                    <div className="admin-user-neutral">
                    </div>
                    {expertProfile.bio && <div className="admin-user-bio">{expertProfile.bio}</div>}
                </div>
            )}
            {isExpert && (
                <CancellationsSection
                    title={t.User_ExpertCancellations()}
                    counterpartColumn={t.Admin_Cancel_User()}
                    count={expertCancelCount}
                    spacing="after"
                    items={expertCancellations.map(expertCancellation)}
                    onOpenUser={openUser}
                />
            )}
            {isExpert && <SlotsSection slots={slots} />}

            {showWriteModal && createTicketUrl && (
                <WriteToUserModal
                    accountId={account.id}
                    accountName={displayName}
                    createTicketUrl={createTicketUrl}
                    onClose={ui.closeWrite}
                    onSuccess={reloadAfterWrite}
                />
            )}
            {showClearModal && (
                <ClearUserModal
                    accountId={account.id}
                    accountLogin={account.login}
                    accountName={displayName}
                    onClose={ui.closeClear}
                    onSuccess={ui.completeClear}
                />
            )}
        </div>
    );
}
