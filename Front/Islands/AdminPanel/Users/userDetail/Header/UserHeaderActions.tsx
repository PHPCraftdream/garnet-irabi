import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {EntityHistoryButton} from '@common/Components/Admin/EntityHistory/EntityHistoryButton';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {flag} from '../../usersFlags';
import {FlagBtn} from '../../FlagBtn';
import {AccountData} from '../userDetailTypes';

const ADMIN_USER_SECONDARY_ACTION_TEMPLATE = <button className="admin-user-secondary-action" />;

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
class RoleToggles extends AntiHookComponent<RoleTogglesProps> {
    private toggle(name: "IS_APPROVED" | "IS_DISABLED" | "IS_MODERATOR" | "IS_OWNER" | "IS_ADMIN"): void {
        const {account, onSetFlag} = this.props;
        onSetFlag(name, flag(account[name]) ? 0 : 1);
    }

    private readonly toggleIS_APPROVED = () => this.toggle('IS_APPROVED');
    private readonly toggleIS_DISABLED = () => this.toggle('IS_DISABLED');
    private readonly toggleIS_MODERATOR = () => this.toggle('IS_MODERATOR');
    private readonly toggleIS_OWNER = () => this.toggle('IS_OWNER');
    private readonly toggleIS_ADMIN = () => this.toggle('IS_ADMIN');

    private renderFlags() {
        const {account, isExpert, flagPending, callerIsOwner, callerIsAdmin} = this.props;
        return (
            <>
                {isExpert && (
                    <FlagBtn
                        testId={`flag-IS_APPROVED-${account.id}`}
                        label={flag(account.IS_APPROVED) ? t.Admin_Revoke() : t.Admin_Approve()}
                        title={flag(account.IS_APPROVED) ? t.Admin_Flag_RevokeApproval() : t.Admin_Flag_Approve()}
                        active={flag(account.IS_APPROVED)}
                        cls={['btn-outline-danger', 'btn-success']}
                        disabled={flagPending}
                        onClick={this.toggleIS_APPROVED}
                    />
                )}
                <FlagBtn
                    testId={`flag-IS_DISABLED-${account.id}`}
                    label={flag(account.IS_DISABLED) ? t.Admin_Enable() : t.Admin_Disable()}
                    title={flag(account.IS_DISABLED) ? t.Admin_Flag_Enable() : t.Admin_Flag_Disable()}
                    active={flag(account.IS_DISABLED)}
                    cls={['btn-secondary', 'btn-outline-danger']}
                    disabled={flagPending}
                    onClick={this.toggleIS_DISABLED}
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
                        onClick={this.toggleIS_MODERATOR}
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
                        onClick={this.toggleIS_OWNER}
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
                        onClick={this.toggleIS_ADMIN}
                    />
                )}
            </>
        );
    }

    render() {
        return this.renderFlags();
    }
}

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
        <div className="admin-user-actions">
            <RoleToggles {...props} />
            {createTicketUrl && (
                <button
                    type="button"
                    className="compact-outline-action" data-user-action="offset"
                    data-test-id={`write-to-user-${account.id}`}
                    onClick={props.onWrite}
                >
                    {t.Admin_WriteToUser()}
                </button>
            )}
            {photo && (
                <button
                    type="button"
                    className="slot-remove-btn" data-user-action="offset"
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
                className="admin-user-secondary-action"
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
                button={ADMIN_USER_SECONDARY_ACTION_TEMPLATE}
                testIdSuffix={`account-${account.id}`}
            />
            {callerIsOwner && (
                <button
                    type="button"
                    className="admin-user-clear-action"
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
