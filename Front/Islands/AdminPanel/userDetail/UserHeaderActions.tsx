import * as React from 'react';
import {EntityHistoryButton} from '@common/Components/EntityHistory/EntityHistoryButton';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {flag, FlagBtn} from '../UsersSection';
import {AccountData} from './userDetailTypes';

interface RoleTogglesProps {
    account: AccountData;
    isExpert: boolean;
    flagPending: boolean;
    callerIsOwner: boolean;
    callerIsAdmin: boolean;
    onSetFlag: (name: string, value: 0 | 1) => void;
}

/**
 * Переключатели ролей.
 *
 * Список повторяет серверный `$allowed` из `post__setFlag`: роль модератора
 * выдаёт владелец, роли владельца и админа — только админ. Модератору они
 * раньше отрисовывались рабочими, и интерфейс обещал то, что сервер отвергал
 * с 400.
 */
const RoleToggles: React.FC<RoleTogglesProps> = ({account, isExpert, flagPending, callerIsOwner, callerIsAdmin, onSetFlag}) => (
    <>
        {isExpert && (
            <FlagBtn
                testId={`flag-IS_APPROVED-${account.id}`}
                label={flag(account.IS_APPROVED) ? t.Admin_Revoke() : t.Admin_Approve()}
                title={flag(account.IS_APPROVED) ? t.Admin_Flag_RevokeApproval() : t.Admin_Flag_Approve()}
                active={flag(account.IS_APPROVED)}
                cls={['btn-outline-danger', 'btn-success']}
                disabled={flagPending}
                onClick={() => onSetFlag('IS_APPROVED', flag(account.IS_APPROVED) ? 0 : 1)}
            />
        )}
        <FlagBtn
            testId={`flag-IS_DISABLED-${account.id}`}
            label={flag(account.IS_DISABLED) ? t.Admin_Enable() : t.Admin_Disable()}
            title={flag(account.IS_DISABLED) ? t.Admin_Flag_Enable() : t.Admin_Flag_Disable()}
            active={flag(account.IS_DISABLED)}
            cls={['btn-secondary', 'btn-outline-danger']}
            disabled={flagPending}
            onClick={() => onSetFlag('IS_DISABLED', flag(account.IS_DISABLED) ? 0 : 1)}
        />
        {callerIsOwner && (
            <FlagBtn
                testId={`flag-IS_MODERATOR-${account.id}`}
                label={t.Admin_Role_Moderator()}
                title={
                    flag(account.IS_ADMIN) ? t.Admin_Flag_RemoveAdminFirst()
                        : flag(account.IS_OWNER) ? t.Admin_Flag_OwnerHasModeratorRights()
                            : flag(account.IS_MODERATOR) ? t.Admin_Flag_RevokeModerator() : t.Admin_Flag_GrantModerator()
                }
                active={flag(account.IS_MODERATOR)}
                cls={['btn-success', 'btn-outline-secondary']}
                disabled={flagPending || flag(account.IS_ADMIN) || flag(account.IS_OWNER)}
                onClick={() => onSetFlag('IS_MODERATOR', flag(account.IS_MODERATOR) ? 0 : 1)}
            />
        )}
        {callerIsAdmin && (
            <FlagBtn
                testId={`flag-IS_OWNER-${account.id}`}
                label={t.Admin_Role_Owner()}
                title={
                    flag(account.IS_ADMIN) ? t.Admin_Flag_RemoveAdminFirst()
                        : flag(account.IS_OWNER) ? t.Admin_Flag_RevokeOwner() : t.Admin_Flag_GrantOwner()
                }
                active={flag(account.IS_OWNER)}
                cls={['btn-success', 'btn-outline-secondary']}
                disabled={flagPending || flag(account.IS_ADMIN)}
                onClick={() => onSetFlag('IS_OWNER', flag(account.IS_OWNER) ? 0 : 1)}
            />
        )}
        {callerIsAdmin && (
            <FlagBtn
                testId={`flag-IS_ADMIN-${account.id}`}
                label={t.Admin_Role_Admin()}
                title={flag(account.IS_ADMIN) ? t.Admin_Flag_RevokeAdmin() : t.Admin_Flag_GrantAdmin()}
                active={flag(account.IS_ADMIN)}
                cls={['btn-success', 'btn-outline-secondary']}
                disabled={flagPending}
                onClick={() => onSetFlag('IS_ADMIN', flag(account.IS_ADMIN) ? 0 : 1)}
            />
        )}
    </>
);

interface Props extends RoleTogglesProps {
    displayName: string;
    photo: string | null;
    createTicketUrl?: string;
    photoRemovePending: boolean;
    onWrite: () => void;
    onRemovePhoto: () => void;
    onClear: () => void;
}

export const UserHeaderActions: React.FC<Props> = (props) => {
    const {account, isExpert, displayName, photo, createTicketUrl, photoRemovePending, callerIsOwner} = props;
    const publicHref = isExpert ? `/expert/id~${account.id}` : `/user/id~${account.id}`;

    return (
        <div className="admin-header-actions">
            <RoleToggles {...props} />
            {createTicketUrl && (
                <button
                    type="button"
                    className="btn btn-sm btn-outline-primary ml-2"
                    data-test-id={`write-to-user-${account.id}`}
                    onClick={props.onWrite}
                >
                    {t.Admin_WriteToUser()}
                </button>
            )}
            {photo && (
                <button
                    type="button"
                    className="btn btn-sm btn-outline-danger ml-2"
                    data-test-id={`remove-user-photo-${account.id}`}
                    onClick={props.onRemovePhoto}
                    disabled={photoRemovePending}
                >
                    {t.Admin_RemovePhoto()}
                </button>
            )}
            <a
                href={publicHref}
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
            {callerIsOwner && (
                <button
                    type="button"
                    className="btn btn-sm btn-danger ml-2"
                    data-test-id={`clear-user-${account.id}`}
                    title={t.Admin_ClearUserTitle()}
                    onClick={props.onClear}
                >
                    {t.Admin_ClearUser()}
                </button>
            )}
        </div>
    );
};
