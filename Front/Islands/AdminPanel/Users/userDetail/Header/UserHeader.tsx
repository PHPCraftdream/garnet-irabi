import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import ImageLightbox from '@/Common/media/ImageLightbox';
import {AccountData, BalanceRow} from '@/Islands/AdminPanel/Users/userDetail/status/userDetailTypes';
import {UserAvatar} from './UserAvatar';
import {UserHeaderBadges} from './UserHeaderBadges';
import {UserHeaderMeta} from './UserHeaderMeta';
import {UserHeaderCounters} from './UserHeaderCounters';
import {UserHeaderActions} from './UserHeaderActions';

interface Props {
    account: AccountData;
    displayName: string;
    isExpert: boolean;
    photo: string | null;
    fullPhoto: string | null;
    balance: BalanceRow | null;
    expertCancelCount: number;
    userCancelCount: number;
    expertDeclineCount: number;
    userDeclineCount: number;
    lightboxOpen: boolean;
    setLightboxOpen: (v: boolean) => void;
    showActions: boolean;
    flagPending: boolean;
    photoRemovePending: boolean;
    callerIsOwner: boolean;
    callerIsAdmin: boolean;
    createTicketUrl?: string;
    onSetFlag: (name: string, value: 0 | 1) => void;
    onWrite: () => void;
    onRemovePhoto: () => void;
    onClear: () => void;
}

export class UserHeader extends AntiHookComponent<Props> {
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly openPhoto = () => this.props.setLightboxOpen(true);
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly closePhoto = () => this.props.setLightboxOpen(false);

    /** Формирует представление данных для соответствующего раздела панели. */
    private renderIdentity() {
        const props = this.props;
        const {account, displayName, isExpert, photo, showActions} = props;
        return (
            <>
                <UserHeaderBadges account={account} displayName={displayName} isExpert={isExpert} />
                <UserHeaderMeta account={account} />
                <UserHeaderCounters
                    expertCancelCount={props.expertCancelCount}
                    userCancelCount={props.userCancelCount}
                    expertDeclineCount={props.expertDeclineCount}
                    userDeclineCount={props.userDeclineCount}
                />
                {showActions && (
                    <UserHeaderActions
                        account={account}
                        isExpert={isExpert}
                        displayName={displayName}
                        photo={photo}
                        createTicketUrl={props.createTicketUrl}
                        flagPending={props.flagPending}
                        photoRemovePending={props.photoRemovePending}
                        callerIsOwner={props.callerIsOwner}
                        callerIsAdmin={props.callerIsAdmin}
                        onSetFlag={props.onSetFlag}
                        onWrite={props.onWrite}
                        onRemovePhoto={props.onRemovePhoto}
                        onClear={props.onClear}
                    />
                )}
            </>
        );
    }

    /** Формирует представление данных для соответствующего раздела панели. */
    render() {
        const {displayName, photo, fullPhoto, balance, lightboxOpen} = this.props;
        return (
            <div className="admin-user-heading">
                <UserAvatar name={displayName} photo={photo} onView={photo ? this.openPhoto : undefined} />
                {lightboxOpen && fullPhoto && (
                    <ImageLightbox src={fullPhoto} alt={displayName} onClose={this.closePhoto} />
                )}
                <div className="conversation-summary">
                    {this.renderIdentity()}
                </div>
                <div className="admin-user-heading-balance" data-test-id="user-detail-balance">
                    <div className="token-registration-ip">{t.User_Balance()}</div>
                    <div className="admin-user-heading-amount" data-negative={(balance?.balance ?? 0) < 0}>
                        {balance?.balance ?? 0} &#8381;
                    </div>
                </div>
            </div>
        );
    }
}
