import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import {UserX} from 'lucide-react';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import {appUrl} from '@common/Utils/Url/appUrl';
import ImageLightbox from '@/Common/media/ImageLightbox';
import {MyReviews} from './MyReviews';

const actionEdit = t.Action_Edit;
const adminUsers = t.Admin_Users;
const iMWriteMessage = t.IM_WriteMessage;
const studyActiveBookings = t.Study_ActiveBookings;
const studyCompletedBookings = t.Study_CompletedBookings;
const studyTotalBookings = t.Study_TotalBookings;
const userCancellations = t.User_Cancellations;
const userDeclines = t.User_Declines;

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

const ProfileAvatar: React.FC<{
    user: Props['user'];
    initials: string;
    onOpenLightbox: () => void;
}> = ({user, initials, onOpenLightbox}) => {
    if (user.is_disabled) {
        return (
            <div className="user-profile-avatar-disabled" data-test-id="user-avatar-disabled">
                <UserX size={40} />
            </div>
        );
    }
    if (user.avatar) {
        return (
            <button
                type="button"
                className="user-profile-photo-button"
                onClick={onOpenLightbox}
                title={user.name}
            >
                <img
                    src={user.avatar}
                    alt={user.name}
                    className="user-profile-photo"
                    data-test-id="user-avatar"
                />
            </button>
        );
    }
    return (
        <div className="user-profile-initials" data-test-id="user-avatar-fallback">
            {initials}
        </div>
    );
};

const ProfileActions: React.FC<{
    user: Props['user'];
    isModerator: boolean;
    isOwnProfile: boolean;
}> = ({user, isModerator, isOwnProfile}) => (
    <div className="user-profile-actions">
        {isOwnProfile ? (
            <a
                href={appUrl('/~profile_edit')}
                className="primary-action-button" data-profile-size="compact"
                data-test-id="user-profile-edit-btn"
            >
                {actionEdit()}
            </a>
        ) : (
            <a
                href={appUrl(`/im/#to=${user.id}`)}
                className="primary-action-button" data-profile-size="compact"
                data-test-id="user-profile-message-btn"
            >
                {iMWriteMessage()}
            </a>
        )}
        {isModerator && !isOwnProfile && (
            <a
                href={appUrl(`/admin/#user=${user.id}`)}
                className="user-profile-admin-link"
            >
                {adminUsers()}
            </a>
        )}
    </div>
);

const ProfileStatCell: React.FC<{
    testId: string;
    value: number;
    label: string;
}> = ({testId, value, label}) => (
    <div className="user-profile-stat">
        <div className="user-profile-stat-value" data-test-id={testId}>{value}</div>
        <div className="user-profile-stat-label">{label}</div>
    </div>
);

const ProfileStats: React.FC<{user: Props['user']}> = ({user}) => (
    <div className="user-profile-stats">
        <ProfileStatCell
            testId="user-stat-completed"
            value={user.completedBookings}
            label={studyCompletedBookings()}
        />
        {/* D-160: "Всего" used to sit next to Завершено/Отказов/Отмен
            without a category for a still-open booking (pending, or
            confirmed but not yet happened) — the four numbers never
            summed to "Всего" whenever one existed, reading as broken
            arithmetic rather than a missing category. */}
        <ProfileStatCell testId="user-stat-active" value={user.activeBookings} label={studyActiveBookings()} />
        <ProfileStatCell testId="user-stat-total" value={user.totalBookings} label={studyTotalBookings()} />
        <ProfileStatCell testId="user-stat-declines" value={user.userDeclines} label={userDeclines()} />
        <ProfileStatCell
            testId="user-stat-cancellations"
            value={user.userCancellations}
            label={userCancellations()}
        />
    </div>
);

/** Возвращает заглавную букву первого символа слова. */
function initial(word: string): string {
    return word[0]?.toUpperCase() || '';
}

/** Собирает инициалы по первым двум словам имени. */
function getInitials(name: string): string {
    return (name || '?').split(' ').slice(0, 2).map(initial).join('');
}

export class UserProfileIsland extends AntiHookComponent<Props> {
    private readonly ui = new Carburetor({lightboxOpen: false});
    /** Открывает фотографию профиля. */
    private readonly openPhoto = () => this.ui.setData({lightboxOpen: true});
    /** Закрывает фотографию профиля. */
    private readonly closePhoto = () => this.ui.setData({lightboxOpen: false});

    /** Рисует страницу профиля пользователя. */
    render() {
        const {user, isModerator, isOwnProfile = false, myReviewsUrl} = this.props;
        const {lightboxOpen} = this.useCarburetor(this.ui);
        const fullPhoto = user.avatar_full || user.avatar;
        return (
            <div className="comms-page">
                <div className="user-profile-card">
                    {/* Header */}
                    <div className="user-profile-header">
                        <ProfileAvatar user={user} initials={getInitials(user.name)} onOpenLightbox={this.openPhoto} />
                        <h2 className="user-profile-name">
                            {user.name || t.User_Anonymous()}
                        </h2>
                        <ProfileActions user={user} isModerator={isModerator} isOwnProfile={isOwnProfile} />
                    </div>
                    <ProfileStats user={user} />
                </div>
                {user.bio && (
                    <div className="section-soft" data-profile-about>
                        <h4 className="user-profile-about-title">{t.Slot_About()}</h4>
                        <p className="user-profile-bio">{user.bio}</p>
                    </div>
                )}
                {isOwnProfile && myReviewsUrl && <MyReviews listUrl={myReviewsUrl} />}
                {lightboxOpen && fullPhoto && (
                    <ImageLightbox src={fullPhoto} alt={user.name} onClose={this.closePhoto} />
                )}
            </div>
        );
    }
}
