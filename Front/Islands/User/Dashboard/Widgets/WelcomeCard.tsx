import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {appUrl} from '@common/Utils/Url/appUrl';
import ImageLightbox from '../../../../Common/media/ImageLightbox';

interface WelcomeCardProps {
    name: string;
    role: string;
    balance: number;
    avatar?: string | null;
    avatar_full?: string | null;
}

type BadgeRole = 'user' | 'expert' | 'moderator' | 'owner' | 'admin';

const initialChar = (word: string) => word[0]?.toUpperCase() || '';

/** Берёт первые буквы имени для заглушки аватара. */
function initialsOf(name: string): string {
    return (name || '?')
        .split(' ')
        .map(initialChar)
        .slice(0, 2)
        .join('');
}

/** Ограничивает значение роли допустимыми ролями бейджа. */
function badgeRole(role: string): BadgeRole {
    if (role === 'expert' || role === 'moderator' || role === 'owner' || role === 'admin') return role;
    return 'user';
}

/** Возвращает локализованное название роли пользователя. */
function roleLabel(role: string): string {
    if (role === 'expert') return t.Dash_Role_Expert();
    if (role === 'moderator') return t.Dash_Role_Moderator();
    if (role === 'owner') return t.Dash_Role_Owner();
    return t.Dash_Role_User();
}

export class WelcomeCard extends AntiHookComponent<WelcomeCardProps> {
    private readonly lightboxState = new Carburetor({open: false});
    /** Открывает полноразмерный аватар в просмотрщике. */
    private readonly openAvatar = () => this.lightboxState.setData({open: true});
    /** Закрывает просмотр полноразмерного аватара. */
    private readonly closeAvatar = () => this.lightboxState.setData({open: false});

    /** Показывает баланс и ссылку для его пополнения. */
    private renderBalance() {
        const {balance} = this.props;
        return (
            <div className="welcome-balance">
                <div>
                    <span className="welcome-balance-label">{t.Dashboard_Balance()}:</span>{' '}
                    <strong className="welcome-balance-value">{balance} &#8381;</strong>
                </div>
                <a href={appUrl('/balance')} className="compact-outline-action" data-test-id="balance-link">
                    {t.Balance_TopUp()}
                </a>
            </div>
        );
    }

    /** Показывает аватар, его заглушку и просмотр полноразмерного фото. */
    private renderAvatar(name: string, avatar?: string | null, fullPhoto?: string | null, open = false) {
        return (
            <>
                {avatar ? (
                    <button
                        type="button"
                        className="welcome-avatar-button"
                        onClick={this.openAvatar}
                        title={name}
                    >
                        <img
                            src={avatar}
                            alt={name}
                            className="welcome-avatar-image"
                            data-test-id="welcome-avatar"
                        />
                    </button>
                ) : (
                    <div className="welcome-avatar-fallback" data-test-id="welcome-avatar-fallback">
                        {initialsOf(name)}
                    </div>
                )}
                {open && fullPhoto && (
                    <ImageLightbox src={fullPhoto} alt={name} onClose={this.closeAvatar} />
                )}
            </>
        );
    }

    /** Показывает приветствие, роль, аватар и баланс пользователя. */
    public render() {
        const {name, role, avatar, avatar_full} = this.props;
        const {open} = this.useCarburetor(this.lightboxState);
        const fullPhoto = avatar_full || avatar;
        return (
            <div className="dashboard-welcome-card" data-test-id="welcome-card">
                <div className="dashboard-welcome-row">
                    <div className="welcome-identity">
                        {this.renderAvatar(name, avatar, fullPhoto, open)}
                        <div>
                            <h1 className="welcome-heading">{t.Dash_Welcome([name])}</h1>
                            <span className="welcome-role" data-role={badgeRole(role)}>
                                {roleLabel(role)}
                            </span>
                        </div>
                    </div>
                    {this.renderBalance()}
                </div>
            </div>
        );
    }
}
