import * as React from 'react';
import {useState} from 'react';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {appUrl} from '@common/Utils/appUrl';
import ImageLightbox from '../../Common/ImageLightbox';

interface WelcomeCardProps {
    name: string;
    role: string;
    balance: number;
    avatar?: string | null;
    avatar_full?: string | null;
}

function initialsOf(name: string): string {
    return (name || '?')
        .split(' ')
        .map(w => w[0]?.toUpperCase() || '')
        .slice(0, 2)
        .join('');
}

const roleBadgeColor: Record<string, string> = {
    user: 'status-info',
    expert: 'status-success',
    moderator: 'status-special',
    owner: 'status-warning',
    admin: 'status-danger',
};

function roleLabel(role: string): string {
    if (role === 'expert') return t.Dash_Role_Expert();
    if (role === 'moderator') return t.Dash_Role_Moderator();
    if (role === 'owner') return t.Dash_Role_Owner();
    return t.Dash_Role_User();
}

export const WelcomeCard: React.FC<WelcomeCardProps> = ({name, role, balance, avatar, avatar_full}) => {
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const fullPhoto = avatar_full || avatar;
    return (
    <div className="welcome-card" data-test-id="welcome-card">
        <div className="welcome-card-row">
            <div className="flex items-center gap-3">
                {avatar ? (
                    <button
                        type="button"
                        className="p-0 border-0 bg-transparent cursor-pointer"
                        onClick={() => setLightboxOpen(true)}
                        title={name}
                    >
                        <img src={avatar} alt={name} className="avatar-circle-img" data-test-id="welcome-avatar" />
                    </button>
                ) : (
                    <div className="avatar-circle" data-test-id="welcome-avatar-fallback">{initialsOf(name)}</div>
                )}
                {lightboxOpen && fullPhoto && (
                    <ImageLightbox src={fullPhoto} alt={name} onClose={() => setLightboxOpen(false)} />
                )}
                <div>
                    <h1 className="text-xl font-semibold text-on-surface mb-1">
                        {t.Dash_Welcome([name])}
                    </h1>
                    <span className={`role-badge ${roleBadgeColor[role] || roleBadgeColor.user}`}>
                        {roleLabel(role)}
                    </span>
                </div>
            </div>
            <div className="flex items-center gap-3">
                <div>
                    <span className="text-sm text-muted">{t.Dashboard_Balance()}:</span>{' '}
                    <strong className="text-accent">{balance} &#8381;</strong>
                </div>
                <a href={appUrl('/balance')} className="btn btn-sm btn-outline-primary" data-test-id="balance-link">
                    {t.Balance_TopUp()}
                </a>
            </div>
        </div>
    </div>
    );
};
