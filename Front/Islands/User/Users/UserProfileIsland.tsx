import * as React from 'react';
import {useState} from 'react';
import {UserX} from 'lucide-react';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {appUrl} from '@common/Utils/Url/appUrl';
import ImageLightbox from '../../../Common/media/ImageLightbox';
import {MyReviews} from './MyReviews';

interface Props {
    user: {
        id: number;
        name: string;
        bio?: string;
        avatar?: string | null;
        avatar_full?: string | null;
        is_disabled?: boolean;
        completedBookings: number;
        totalBookings: number;
        userCancellations: number;
        userDeclines: number;
        activeBookings: number;
    };
    isModerator: boolean;
    isOwnProfile?: boolean;
    myReviewsUrl?: string;
}

const ProfileAvatar: React.FC<{user: Props['user']; initials: string; onOpenLightbox: () => void}> = ({user, initials, onOpenLightbox}) => {
    if (user.is_disabled) {
        return (
            <div className="avatar-circle-lg mx-auto mb-4 flex items-center justify-center text-muted" data-test-id="user-avatar-disabled">
                <UserX size={40} />
            </div>
        );
    }
    if (user.avatar) {
        return (
            <button
                type="button"
                className="block mx-auto mb-4 p-0 border-0 bg-transparent cursor-pointer"
                onClick={onOpenLightbox}
                title={user.name}
            >
                <img
                    src={user.avatar}
                    alt={user.name}
                    className="avatar-circle-lg-img"
                    data-test-id="user-avatar"
                />
            </button>
        );
    }
    return (
        <div className="avatar-circle-lg mx-auto mb-4" data-test-id="user-avatar-fallback">
            {initials}
        </div>
    );
};

const ProfileActions: React.FC<{user: Props['user']; isModerator: boolean; isOwnProfile: boolean}> = ({user, isModerator, isOwnProfile}) => (
    <div className="flex items-center justify-center gap-2 mt-3">
        {isOwnProfile ? (
            <a
                href={appUrl('/~profile_edit')}
                className="btn btn-sm btn-primary"
                data-test-id="user-profile-edit-btn"
            >
                {t.Action_Edit()}
            </a>
        ) : (
            <a
                href={appUrl(`/im/#to=${user.id}`)}
                className="btn btn-sm btn-primary"
                data-test-id="user-profile-message-btn"
            >
                {t.IM_WriteMessage()}
            </a>
        )}
        {isModerator && !isOwnProfile && (
            <a
                href={appUrl(`/admin/#user=${user.id}`)}
                className="profile-admin-link"
            >
                {t.Admin_Users()}
            </a>
        )}
    </div>
);

const ProfileStatCell: React.FC<{testId: string; value: number; label: string}> = ({testId, value, label}) => (
    <div className="profile-stat-cell">
        <div className="profile-stat-value" data-test-id={testId}>{value}</div>
        <div className="stat-tile-label">{label}</div>
    </div>
);

const ProfileStats: React.FC<{user: Props['user']}> = ({user}) => (
    <div className="grid grid-cols-2 md:grid-cols-5 border-t border-default">
        <ProfileStatCell testId="user-stat-completed" value={user.completedBookings} label={t.Study_CompletedBookings()} />
        {/* D-160: "Всего" used to sit next to Завершено/Отказов/Отмен
            without a category for a still-open booking (pending, or
            confirmed but not yet happened) — the four numbers never
            summed to "Всего" whenever one existed, reading as broken
            arithmetic rather than a missing category. */}
        <ProfileStatCell testId="user-stat-active" value={user.activeBookings} label={t.Study_ActiveBookings()} />
        <ProfileStatCell testId="user-stat-total" value={user.totalBookings} label={t.Study_TotalBookings()} />
        <ProfileStatCell testId="user-stat-declines" value={user.userDeclines} label={t.User_Declines()} />
        <ProfileStatCell testId="user-stat-cancellations" value={user.userCancellations} label={t.User_Cancellations()} />
    </div>
);

export const UserProfileIsland: React.FC<Props> = ({user, isModerator, isOwnProfile = false, myReviewsUrl}) => {
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const fullPhoto = user.avatar_full || user.avatar;
    const initials = (user.name || '?')
        .split(' ')
        .map(w => w[0]?.toUpperCase() || '')
        .slice(0, 2)
        .join('');

    return (
        <div className="page-narrow">
            <div className="profile-card">
                {/* Header */}
                <div className="profile-header">
                    <ProfileAvatar user={user} initials={initials} onOpenLightbox={() => setLightboxOpen(true)} />
                    <h2 className="text-xl font-semibold text-on-surface mb-1">
                        {user.name || t.User_Anonymous()}
                    </h2>
                    <ProfileActions user={user} isModerator={isModerator} isOwnProfile={isOwnProfile} />
                </div>
                <ProfileStats user={user} />
            </div>
            {user.bio && (
                <div className="section-soft mb-8">
                    <h4 className="mb-2">{t.Slot_About()}</h4>
                    <p className="mb-0 whitespace-pre-line">{user.bio}</p>
                </div>
            )}
            {isOwnProfile && myReviewsUrl && <MyReviews listUrl={myReviewsUrl} />}
            {lightboxOpen && fullPhoto && (
                <ImageLightbox src={fullPhoto} alt={user.name} onClose={() => setLightboxOpen(false)} />
            )}
        </div>
    );
};
