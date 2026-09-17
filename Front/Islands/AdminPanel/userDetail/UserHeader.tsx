import * as React from 'react';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import ImageLightbox from '../../../Common/media/ImageLightbox';
import {AccountData, BalanceRow} from './userDetailTypes';
import {UserAvatar} from './UserAvatar';
import {UserHeaderBadges, UserHeaderCounters, UserHeaderMeta} from './UserHeaderBadges';
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

export const UserHeader: React.FC<Props> = (props) => {
    const {account, displayName, isExpert, photo, fullPhoto, balance, lightboxOpen, setLightboxOpen, showActions} = props;

    return (
        <div className="admin-user-header">
            <UserAvatar name={displayName} photo={photo} onView={photo ? () => setLightboxOpen(true) : undefined} />
            {lightboxOpen && fullPhoto && (
                <ImageLightbox src={fullPhoto} alt={displayName} onClose={() => setLightboxOpen(false)} />
            )}
            <div className="flex-1 min-w-0">
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
            </div>
            <div className="admin-user-balance" data-test-id="user-detail-balance">
                <div className="admin-user-balance-label">{t.User_Balance()}</div>
                <div className={`admin-user-balance-amount ${(balance?.balance ?? 0) < 0 ? 'text-danger' : 'text-success'}`}>
                    {balance?.balance ?? 0} &#8381;
                </div>
            </div>
        </div>
    );
};
