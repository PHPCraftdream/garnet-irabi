import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import {sendPost} from '@common/Api/Send/sendPost';
import {showToast} from '@common/Components/Feedback/GlobalToast';
import {appUrl} from '@common/Utils/Url/appUrl';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {UserDetailContext, UserDetailContextValue} from './UserDetailContext';
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

const selectToastMsg = (state: PanelState) => state.toastMsg;

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
    constructor(private readonly ui: UserDetailStore, private readonly readProps: () => Props) {}

    readonly setFlag = async (flagName: string, value: 0 | 1) => {
        const {setFlagUrl} = this.readProps();
        const {ui} = this;
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
        const {accountId, detailUrl} = this.readProps();
        const {ui} = this;
        const {setShowWriteModal, setToastMsg, setDetail: setData} = ui;
        setShowWriteModal(false);
        setToastMsg(t.Admin_MessageSent());
        sendPost(detailUrl, {account_id: accountId}).then((r: any) => {
            if (!r?.error && ui.getData().data?.account.id === accountId) setData(r as UserDetailData);
        }).catch(ignoreReloadFailure);
    };
}

function studentCancellation(item: UserDetailData['userCancellations'][number]) {
    const {id, created_at, slot_start_at, reason, expert_id, expert_name} = item;
    return {id, created_at, slot_start_at, reason, counterpartId: expert_id, counterpartName: expert_name};
}

function expertCancellation(item: UserDetailData['expertCancellations'][number]) {
    const {id, created_at, slot_start_at, reason, user_id, user_name} = item;
    return {id, created_at, slot_start_at, reason, counterpartId: user_id, counterpartName: user_name};
}

function renderCleared(toastMsg: string | null) {
    return (
        <div className="admin-support-detail" data-test-id="user-detail-pane">
            {toastMsg && <div className="admin-user-notice">{toastMsg}</div>}
            <div className="admin-user-neutral">
                <h3 className="admin-user-count-danger">{t.Admin_ClearUserDone()}</h3>
            </div>
        </div>
    );
}

export default class UserDetailPanel extends AntiHookComponent<Props> {
    static contextType = UserDetailContext;
    declare context: UserDetailContextValue;

    private readonly ui = new UserDetailStore();
    private readonly actions = new UserDetailActions(this.ui, () => this.props);
    /*
     * `useCarburetor` отдал бы detail маркером `data.~p`, который не просыпается от замены
     * detail целиком и от точечных правок, — а разделы читают поля уже в своих рендерах.
     * Снимок отсоединяет detail вместе со всеми вложенными списками.
     */
    private readonly detail = this.connectSelection(this.ui, state => state.data);

    private readonly clearToast = () => this.ui.setToastMsg(null);

    private readonly toastTimer = (toastMsg: string | null): (() => void) | void => {
        if (!toastMsg) return;
        const timer = setTimeout(this.clearToast, 3000);
        return () => clearTimeout(timer);
    };

    protected useEffects(): void {
        const {accountId, detailUrl} = this.props;
        this.useEffect('load', () => {
            let current = true;
            this.ui.setDetail(null);
            this.ui.setError(null);
            sendPost(detailUrl, {account_id: accountId})
                .then((r: any) => {
                    if (!current) return;
                    if (r?.error) this.ui.setError(r.error);
                    else this.ui.setDetail(r as UserDetailData);
                })
                .catch(() => { if (current) this.ui.setError(t.User_LoadError()); });
            return () => { current = false; };
        }, [accountId, detailUrl]);

        this.useStoreEffect('toast', this.ui, selectToastMsg, this.toastTimer);
    }

    public render() {
        const {error, flagPending, photoRemovePending, showWriteModal, showClearModal, cleared, toastMsg, lightboxOpen} =
            this.useCarburetor(this.ui);
        const data = this.detail() as UserDetailData | null;
        if (error) return <div className="admin-support-detail-error">{error}</div>;
        if (!data) return <div className="admin-support-detail-loading">{t.User_Loading()}</div>;

        // После успешной очистки аккаунта и всех связанных записей уже нет —
        // обновиться с сервера панель не может. Показываем итоговую надпись;
        // вкладку администратор закрывает сам.
        if (cleared) return renderCleared(toastMsg);

        return (
            <div className="admin-support-detail" data-test-id="user-detail-pane">
                {toastMsg && <div className="admin-user-notice">{toastMsg}</div>}

                {this.renderHeader(data, flagPending, photoRemovePending, lightboxOpen)}
                {this.renderStudentSections(data)}
                {this.renderExpertSections(data)}
                {this.renderModals(data, showWriteModal, showClearModal)}
            </div>
        );
    }

    private renderHeader(data: UserDetailData, flagPending: boolean, photoRemovePending: boolean, lightboxOpen: boolean) {
        const {account, expertProfile, balance, expertCancelCount, userCancelCount, expertDeclineCount, userDeclineCount} = data;
        const {setFlagUrl, createTicketUrl, callerIsOwner, callerIsAdmin} = this.props;
        const photo = account.avatar ?? expertProfile?.photo ?? null;
        return (
            <UserHeader
                account={account}
                displayName={expertProfile?.display_name || account.name || account.login}
                isExpert={account.type === 'expert'}
                photo={photo}
                fullPhoto={account.avatar_full ?? photo}
                balance={balance}
                expertCancelCount={expertCancelCount}
                userCancelCount={userCancelCount}
                expertDeclineCount={expertDeclineCount}
                userDeclineCount={userDeclineCount}
                lightboxOpen={lightboxOpen}
                setLightboxOpen={this.ui.setLightboxOpen}
                showActions={!!setFlagUrl}
                flagPending={flagPending}
                photoRemovePending={photoRemovePending}
                callerIsOwner={!!callerIsOwner}
                callerIsAdmin={!!callerIsAdmin}
                createTicketUrl={createTicketUrl}
                onSetFlag={this.actions.setFlag}
                onWrite={this.ui.openWrite}
                onRemovePhoto={this.actions.removePhoto}
                onClear={this.ui.openClear}
            />
        );
    }

    private renderStudentSections(data: UserDetailData) {
        const {bookings, tickets, ledger, userCancellations, userCancelCount} = data;
        const {openUser} = this.context;
        const showStudentPart = bookings.length > 0 || userCancellations.length > 0;
        return (
            <>
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
            </>
        );
    }

    private renderExpertSections(data: UserDetailData) {
        const {account, expertProfile, slots, expertCancellations, expertCancelCount} = data;
        const {openUser} = this.context;
        const isExpert = account.type === 'expert';
        return (
            <>
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
            </>
        );
    }

    private renderModals(data: UserDetailData, showWriteModal: boolean, showClearModal: boolean) {
        const {account, expertProfile} = data;
        const {createTicketUrl} = this.props;
        const accountName = expertProfile?.display_name || account.name || account.login;
        return (
            <>
                {showWriteModal && createTicketUrl && (
                    <WriteToUserModal
                        accountId={account.id}
                        accountName={accountName}
                        createTicketUrl={createTicketUrl}
                        onClose={this.ui.closeWrite}
                        onSuccess={this.actions.reloadAfterWrite}
                    />
                )}
                {showClearModal && (
                    <ClearUserModal
                        accountId={account.id}
                        accountLogin={account.login}
                        accountName={accountName}
                        onClose={this.ui.closeClear}
                        onSuccess={this.ui.completeClear}
                    />
                )}
            </>
        );
    }
}
