import * as React from 'react';
import {useState} from 'react';
import {UserX} from 'lucide-react';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {appUrl} from '@common/Utils/Url/appUrl';
import ImageLightbox from '../../Common/media/ImageLightbox';
import {MyReviews} from './MyReviews';

interface Props {
    user: {
        id: number;
        name: string;
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
                    {user.is_disabled ? (
                        <div className="avatar-circle-lg mx-auto mb-4 flex items-center justify-center text-muted" data-test-id="user-avatar-disabled">
                            <UserX size={40} />
                        </div>
                    ) : user.avatar ? (
                        <button
                            type="button"
                            className="block mx-auto mb-4 p-0 border-0 bg-transparent cursor-pointer"
                            onClick={() => setLightboxOpen(true)}
                            title={user.name}
                        >
                            <img
                                src={user.avatar}
                                alt={user.name}
                                className="avatar-circle-lg-img"
                                data-test-id="user-avatar"
                            />
                        </button>
                    ) : (
                        <div className="avatar-circle-lg mx-auto mb-4" data-test-id="user-avatar-fallback">
                            {initials}
                        </div>
                    )}
                    <h2 className="text-xl font-semibold text-on-surface mb-1">
                        {user.name || t.User_Anonymous()}
                    </h2>
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
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-5 border-t border-default">
                    <div className="profile-stat-cell">
                        <div className="profile-stat-value" data-test-id="user-stat-completed">{user.completedBookings}</div>
                        <div className="stat-tile-label">{t.Study_CompletedBookings()}</div>
                    </div>
                    {/* D-160: "Всего" used to sit next to Завершено/Отказов/Отмен
                        without a category for a still-open booking (pending, or
                        confirmed but not yet happened) — the four numbers never
                        summed to "Всего" whenever one existed, reading as broken
                        arithmetic rather than a missing category. */}
                    <div className="profile-stat-cell">
                        <div className="profile-stat-value" data-test-id="user-stat-active">{user.activeBookings}</div>
                        <div className="stat-tile-label">{t.Study_ActiveBookings()}</div>
                    </div>
                    <div className="profile-stat-cell">
                        <div className="profile-stat-value" data-test-id="user-stat-total">{user.totalBookings}</div>
                        <div className="stat-tile-label">{t.Study_TotalBookings()}</div>
                    </div>
                    <div className="profile-stat-cell">
                        <div className="profile-stat-value" data-test-id="user-stat-declines">{user.userDeclines}</div>
                        <div className="stat-tile-label">{t.User_Declines()}</div>
                    </div>
                    <div className="profile-stat-cell">
                        <div className="profile-stat-value" data-test-id="user-stat-cancellations">{user.userCancellations}</div>
                        <div className="stat-tile-label">{t.User_Cancellations()}</div>
                    </div>
                </div>
            </div>
            {isOwnProfile && myReviewsUrl && <MyReviews listUrl={myReviewsUrl} />}
            {lightboxOpen && fullPhoto && (
                <ImageLightbox src={fullPhoto} alt={user.name} onClose={() => setLightboxOpen(false)} />
            )}
        </div>
    );
};
