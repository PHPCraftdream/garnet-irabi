import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import {UserX} from 'lucide-react';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {CommentsSection} from '../../Comms/Comments/CommentsSection';
import {IrabiPreviewProvider} from '../../../Common/people/IrabiPreviewProvider';
import {appUrl} from '@common/Utils/Url/appUrl';
import {useSlotBooking} from '../SlotsCalendar/Booking/useSlotBooking';
import ImageLightbox from '../../../Common/media/ImageLightbox';
import {ExpertSlotCard} from './ExpertSlotCard';

interface Expert {
    display_name: string;
    bio?: string;
    avatar?: string | null;
    avatar_full?: string | null;
    is_disabled?: boolean;
    cancellation_count?: number;
    decline_count?: number;
    /** D-190: заявки, оставленные без ответа до начала занятия. */
    missed_count?: number;
    conducted_count?: number;
    upcoming_count?: number;
}

interface ExpertSlot {
    id: number;
    start_at: number;
    cost: number;
    is_online: number;
    /** Адрес очного занятия. У онлайнового пусто — ссылка на встречу наружу не идёт. */
    location?: string;
    /** Публичное имя площадки онлайн-занятия («Zoom»). */
    platform?: string;
    max_users?: number;
    /** D-200: сколько мест уже занято — вместе с max_users даёт остаток. */
    booked_count?: number;
    /** D-187: статус ('pending'|'confirmed'), если у текущего пользователя уже есть открытая заявка на этот слот. */
    booking_status?: string | null;
}

interface ExpertProfileProps {
    expert: Expert;
    expertId: number;
    canReview: boolean;
    slots: ExpertSlot[];
    commentsListUrl: string;
    commentsCreateUrl: string;
    commentsDeleteUrl: string;
    currentAccountId: number;
    isModerator: boolean;
    isOwnProfile?: boolean;
    canBook?: boolean;
}

const SLOTS_PAGE_SIZE = 6;

const ExpertAvatar: React.FC<{expert: Expert; initials: string; onOpenLightbox: () => void}> = ({expert, initials, onOpenLightbox}) => {
    if (expert.is_disabled) {
        return (
            <div
                className="expert-profile-avatar-placeholder"
                data-test-id="expert-avatar-disabled"
            >
                <UserX size={40} />
            </div>
        );
    }
    if (expert.avatar) {
        return (
            <button
                type="button"
                className="expert-profile-avatar-button"
                onClick={onOpenLightbox}
                title={expert.display_name}
                data-test-id="expert-avatar"
            >
                <img
                    src={expert.avatar}
                    alt={expert.display_name}
                    className="expert-profile-avatar-image"
                />
            </button>
        );
    }
    return (
        <div
            className="expert-profile-avatar-placeholder"
            data-variant="initials"
            data-test-id="expert-avatar-fallback"
        >
            {initials}
        </div>
    );
};

const ExpertActions: React.FC<{expertId: number; isOwnProfile: boolean}> = ({expertId, isOwnProfile}) => (
    <div className="expert-profile-actions">
        {isOwnProfile ? (
            <a
                href={appUrl('/~profile_edit')}
                className="primary-action-button"
                data-profile-size="compact"
                data-test-id="expert-profile-edit-btn"
            >
                {t.Action_Edit()}
            </a>
        ) : (
            <a
                href={appUrl(`/im/#to=${expertId}`)}
                className="primary-action-button"
                data-profile-size="compact"
                data-test-id="expert-profile-message-btn"
            >
                {t.IM_WriteMessage()}
            </a>
        )}
    </div>
);

type StatTone = 'success' | 'accent' | 'warning' | 'muted';

const ExpertStatCell: React.FC<{testId: string; tone: StatTone; value: number; label: string}> = ({testId, tone, value, label}) => (
    <div className="expert-profile-stat">
        <div className="expert-profile-stat-value" data-tone={tone} data-test-id={testId}>{value}</div>
        <div className="expert-profile-stat-label">{label}</div>
    </div>
);

const ExpertStats: React.FC<{expert: Expert}> = ({expert}) => (
    <div className="booking-card-shell" data-expert-profile="stats" data-test-id="expert-stats">
        <div className="expert-profile-stats-grid">
            <ExpertStatCell testId="expert-stat-conducted" tone="success" value={expert.conducted_count ?? 0} label={t.Expert_Conducted()} />
            <ExpertStatCell testId="expert-stat-upcoming" tone="accent" value={expert.upcoming_count ?? 0} label={t.Expert_Upcoming()} />
            <ExpertStatCell testId="expert-stat-declines" tone="warning" value={expert.decline_count ?? 0} label={t.Expert_Declines()} />
            <ExpertStatCell testId="expert-stat-cancellations" tone="warning" value={expert.cancellation_count ?? 0} label={t.Expert_Cancellations()} />
            {/* D-190: два соседних счётчика — решения преподавателя.
                Этот — их отсутствие: заявка истекла без ответа. Раньше
                она не попадала ни в один счётчик на его стороне, хотя
                у ученика была видна. */}
            <ExpertStatCell testId="expert-stat-missed" tone="muted" value={expert.missed_count ?? 0} label={t.Expert_Missed()} />
        </div>

        {/* D-197: объяснение жило в атрибуте title, а на телефоне
            наведения нет — оставалась голая цифра в ряду с «Отклонил»
            и «Отменил», и читалась она как клеймо, хотя означает
            обратное: молчать преподаватель вправе. Видимая строка
            вместо всплывающей подсказки — тот же урок, что D-122 и
            D-131, где на телефоне терялось именно объяснение. */}
        <p className="expert-profile-stats-hint" data-test-id="expert-stat-missed-hint">
            {t.Expert_MissedHint()}
        </p>
    </div>
);

const SlotsShowMore: React.FC<{hasMore: boolean; remaining: number; onShowMore: () => void}> = ({hasMore, remaining, onShowMore}) => (
    <div className="expert-profile-more">
        {hasMore ? (
            <button
                type="button"
                className="compact-outline-action"
                data-test-id="expert-slots-show-more"
                onClick={onShowMore}
            >
                {t.Expert_ShowMoreSlots()} ({remaining})
            </button>
        ) : (
            <span className="expert-profile-muted">{t.Expert_AllSlotsShown()}</span>
        )}
    </div>
);

interface ProfileState {
    visibleCount: number;
    lightboxOpen: boolean;
}

class ProfileStore extends Carburetor<ProfileState> {
    showMore(): void {
        this.setData({...this.getData(), visibleCount: this.getData().visibleCount + SLOTS_PAGE_SIZE});
    }

    setLightbox(open: boolean): void {
        this.setData({...this.getData(), lightboxOpen: open});
    }
}

interface InnerProps extends ExpertProfileProps {
    openBooking: (slotId: number) => void;
    bookingModal: React.ReactNode;
}

const initialOf = (word: string) => word[0]?.toUpperCase() || '';

const ProfileHeader: React.FC<{expert: Expert; expertId: number; isOwnProfile: boolean; onOpen: () => void}> = ({expert, expertId, isOwnProfile, onOpen}) => {
    const initials = (expert.display_name || '?').split(' ').map(initialOf).slice(0, 2).join('');
    return (
        <div className="expert-profile-header">
            <ExpertAvatar expert={expert} initials={initials} onOpenLightbox={onOpen} />
            <div className="expert-profile-heading">
                <h1 className="expert-profile-name">{expert.display_name}</h1>
                <ExpertActions expertId={expertId} isOwnProfile={isOwnProfile} />
            </div>
        </div>
    );
};

const ProfileBio: React.FC<{bio?: string}> = ({bio}) => bio ? (
    <div className="section-soft" data-profile-about="true">
        <h4 className="expert-profile-bio-heading">{t.Slot_About()}</h4>
        <p className="expert-profile-bio-text">{bio}</p>
    </div>
) : null;

interface ProfileSlotsProps {
    slots: ExpertSlot[];
    visibleCount: number;
    isOwnProfile: boolean;
    canBook: boolean;
    onBook: (slotId: number) => void;
    onShowMore: () => void;
}

class ProfileSlots extends AntiHookComponent<ProfileSlotsProps> {
    private readonly renderSlot = (slot: ExpertSlot) => (
        <ExpertSlotCard key={slot.id} slot={slot} isOwnProfile={this.props.isOwnProfile}
            canBook={this.props.canBook} onBook={this.props.onBook} />
    );

    render() {
        const {slots, visibleCount, onShowMore} = this.props;
        return (
            <>
                <h3 className="expert-profile-slots-heading">{t.Slot_AvailableSlots()}</h3>
                <div className="expert-profile-slots">
                    {slots.length === 0 && <p className="expert-profile-empty">{t.Slot_NoAvailable()}</p>}
                    {slots.slice(0, visibleCount).map(this.renderSlot)}
                </div>
                {slots.length > SLOTS_PAGE_SIZE && (
                    <SlotsShowMore hasMore={visibleCount < slots.length}
                        remaining={slots.length - visibleCount} onShowMore={onShowMore} />
                )}
            </>
        );
    }
}

class ExpertProfileIslandInner extends AntiHookComponent<InnerProps> {
    private readonly store = new ProfileStore({visibleCount: SLOTS_PAGE_SIZE, lightboxOpen: false});
    private readonly openLightbox = () => this.store.setLightbox(true);
    private readonly closeLightbox = () => this.store.setLightbox(false);
    private readonly showMore = () => this.store.showMore();
    private readonly book = (slotId: number) => this.props.openBooking(slotId);

    private renderLightbox(open: boolean) {
        const {expert} = this.props;
        const photo = expert.avatar_full || expert.avatar;
        if (!open || expert.is_disabled || !photo) return null;
        return <ImageLightbox src={photo} alt={expert.display_name} onClose={this.closeLightbox} />;
    }

    render() {
        const {expert, expertId, slots, commentsListUrl, commentsCreateUrl, commentsDeleteUrl,
            currentAccountId, isModerator, isOwnProfile = false, canBook = false, canReview,
            bookingModal} = this.props;
        const {visibleCount, lightboxOpen} = this.useCarburetor(this.store);

        return (
            <div className="comms-page" data-test-id="expert-profile">
                <ProfileHeader expert={expert} expertId={expertId} isOwnProfile={isOwnProfile} onOpen={this.openLightbox} />

                {this.renderLightbox(lightboxOpen)}

                <ProfileBio bio={expert.bio} />
                <ExpertStats expert={expert} />
                <ProfileSlots slots={slots} visibleCount={visibleCount} isOwnProfile={isOwnProfile}
                    canBook={canBook} onBook={this.book} onShowMore={this.showMore} />

                <CommentsSection
                    entityType="expert"
                    entityId={expertId}
                    listUrl={commentsListUrl}
                    createUrl={commentsCreateUrl}
                    deleteUrl={commentsDeleteUrl}
                    currentAccountId={currentAccountId}
                    isModerator={isModerator}
                    canCreate={canReview}
                />
                {bookingModal}
            </div>
        );
    }
}

const reloadAfterBooking = () => window.location.reload();

const ExpertProfileBooking: React.FC<ExpertProfileProps> = props => {
    const {openBooking, bookingModal} = useSlotBooking({onBooked: reloadAfterBooking});
    return <ExpertProfileIslandInner {...props} openBooking={openBooking} bookingModal={bookingModal} />;
};

export const ExpertProfileIsland: React.FC<ExpertProfileProps> = (props) => (
    <IrabiPreviewProvider>
        <ExpertProfileBooking {...props} />
    </IrabiPreviewProvider>
);
