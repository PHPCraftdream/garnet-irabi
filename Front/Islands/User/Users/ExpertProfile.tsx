import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import {UserX} from 'lucide-react';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {CommentsSection} from '../../Comms/Comments/CommentsSection';
import {IrabiPreviewProvider} from '../../../Common/people/preview/IrabiPreviewProvider';
import {appUrl} from '@common/Utils/Url/appUrl';
import {SlotBookingController} from '../SlotsCalendar/Booking/logic/SlotBookingController';
import {SlotBookingModalHost} from '../SlotsCalendar/Booking/components/SlotBookingModalHost';
import ImageLightbox from '../../../Common/media/ImageLightbox';
import {ExpertSlotCard} from './ExpertSlotCard';

const actionEdit = t.Action_Edit;
const expertAllSlotsShown = t.Expert_AllSlotsShown;
const expertCancellations = t.Expert_Cancellations;
const expertConducted = t.Expert_Conducted;
const expertDeclines = t.Expert_Declines;
const expertMissed = t.Expert_Missed;
const expertMissedHint = t.Expert_MissedHint;
const expertShowMoreSlots = t.Expert_ShowMoreSlots;
const expertUpcoming = t.Expert_Upcoming;
const iMWriteMessage = t.IM_WriteMessage;
const slotAbout = t.Slot_About;

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

const ExpertAvatar: React.FC<{
    expert: Expert;
    initials: string;
    onOpenLightbox: () => void;
}> = ({expert, initials, onOpenLightbox}) => {
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
                {actionEdit()}
            </a>
        ) : (
            <a
                href={appUrl(`/im/#to=${expertId}`)}
                className="primary-action-button"
                data-profile-size="compact"
                data-test-id="expert-profile-message-btn"
            >
                {iMWriteMessage()}
            </a>
        )}
    </div>
);

type StatTone = 'success' | 'accent' | 'warning' | 'muted';

const ExpertStatCell: React.FC<{
    testId: string;
    tone: StatTone;
    value: number;
    label: string;
}> = ({testId, tone, value, label}) => (
    <div className="expert-profile-stat">
        <div className="expert-profile-stat-value" data-tone={tone} data-test-id={testId}>{value}</div>
        <div className="expert-profile-stat-label">{label}</div>
    </div>
);

const ExpertStats: React.FC<{expert: Expert}> = ({expert}) => (
    <div className="booking-card-shell" data-test-id="expert-stats">
        <div className="expert-profile-stats-grid">
            <ExpertStatCell testId="expert-stat-conducted" tone="success"
                value={expert.conducted_count ?? 0} label={expertConducted()} />
            <ExpertStatCell testId="expert-stat-upcoming" tone="accent"
                value={expert.upcoming_count ?? 0} label={expertUpcoming()} />
            <ExpertStatCell testId="expert-stat-declines" tone="warning"
                value={expert.decline_count ?? 0} label={expertDeclines()} />
            <ExpertStatCell testId="expert-stat-cancellations" tone="warning"
                value={expert.cancellation_count ?? 0} label={expertCancellations()} />
            {/* D-190: два соседних счётчика — решения преподавателя.
                Этот — их отсутствие: заявка истекла без ответа. Раньше
                она не попадала ни в один счётчик на его стороне, хотя
                у ученика была видна. */}
            <ExpertStatCell testId="expert-stat-missed" tone="muted"
                value={expert.missed_count ?? 0} label={expertMissed()} />
        </div>

        {/* D-197: объяснение жило в атрибуте title, а на телефоне
            наведения нет — оставалась голая цифра в ряду с «Отклонил»
            и «Отменил», и читалась она как клеймо, хотя означает
            обратное: молчать преподаватель вправе. Видимая строка
            вместо всплывающей подсказки — тот же урок, что D-122 и
            D-131, где на телефоне терялось именно объяснение. */}
        <p className="expert-profile-stats-hint" data-test-id="expert-stat-missed-hint">
            {expertMissedHint()}
        </p>
    </div>
);

const SlotsShowMore: React.FC<{
    hasMore: boolean;
    remaining: number;
    onShowMore: () => void;
}> = ({hasMore, remaining, onShowMore}) => (
    <div className="expert-profile-more">
        {hasMore ? (
            <button
                type="button"
                className="compact-outline-action"
                data-test-id="expert-slots-show-more"
                onClick={onShowMore}
            >
                {expertShowMoreSlots()} ({remaining})
            </button>
        ) : (
            <span className="expert-profile-muted">{expertAllSlotsShown()}</span>
        )}
    </div>
);

interface ProfileState {
    visibleCount: number;
    lightboxOpen: boolean;
}

class ProfileStore extends Carburetor<ProfileState> {
    /** Увеличивает число отображаемых слотов на одну страницу. */
    showMore(): void {
        this.setData({...this.getData(), visibleCount: this.getData().visibleCount + SLOTS_PAGE_SIZE});
    }

    /** Устанавливает состояние фотолайтбокса. */
    setLightbox(open: boolean): void {
        this.setData({...this.getData(), lightboxOpen: open});
    }
}

const initialOf = (word: string) => word[0]?.toUpperCase() || '';

const ProfileHeader: React.FC<{
    expert: Expert;
    expertId: number;
    isOwnProfile: boolean;
    onOpen: () => void;
}> = ({expert, expertId, isOwnProfile, onOpen}) => {
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
        <h4 className="expert-profile-bio-heading">{slotAbout()}</h4>
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
    /** Преобразует слот в карточку. */
    private readonly renderSlot = (slot: ExpertSlot) => (
        <ExpertSlotCard key={slot.id} slot={slot} isOwnProfile={this.props.isOwnProfile}
            canBook={this.props.canBook} onBook={this.props.onBook} />
    );

    /** Рисует список доступных слотов и кнопку показа следующих. */
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

export class ExpertProfileIsland extends AntiHookComponent<ExpertProfileProps> {
    private readonly store = new ProfileStore({visibleCount: SLOTS_PAGE_SIZE, lightboxOpen: false});
    private readonly controller = new SlotBookingController();
    /** Открывает фото профиля. */
    private readonly openLightbox = () => this.store.setLightbox(true);
    /** Закрывает фото профиля. */
    private readonly closeLightbox = () => this.store.setLightbox(false);
    /** Показывает следующую порцию слотов. */
    private readonly showMore = () => this.store.showMore();
    /** Запускает бронирование слота. */
    private readonly book = (slotId: number) => void this.controller.openBooking(slotId);

    /** Отображает фотографию в лайтбоксе, если она доступна. */
    private renderLightbox(open: boolean) {
        const {expert} = this.props;
        const photo = expert.avatar_full || expert.avatar;
        if (!open || expert.is_disabled || !photo) return null;
        return <ImageLightbox src={photo} alt={expert.display_name} onClose={this.closeLightbox} />;
    }

    /** Рисует данные профиля под заголовком. */
    private renderProfileDetails(
        expert: Expert,
        expertId: number,
        slots: ExpertSlot[],
        isOwnProfile: boolean,
        canBook: boolean,
        visibleCount: number,
        currentAccountId: number,
        isModerator: boolean,
        canReview: boolean,
        lightboxOpen: boolean,
    ) {
        return (
            <>
                {this.renderLightbox(lightboxOpen)}
                <ProfileBio bio={expert.bio} />
                <ExpertStats expert={expert} />
                <ProfileSlots slots={slots} visibleCount={visibleCount} isOwnProfile={isOwnProfile}
                    canBook={canBook} onBook={this.book} onShowMore={this.showMore} />
                <CommentsSection
                    entityType="expert"
                    entityId={expertId}
                    listUrl={this.props.commentsListUrl}
                    createUrl={this.props.commentsCreateUrl}
                    deleteUrl={this.props.commentsDeleteUrl}
                    currentAccountId={currentAccountId}
                    isModerator={isModerator}
                    canCreate={canReview}
                />
                <SlotBookingModalHost controller={this.controller} onBooked={reloadAfterBooking} />
            </>
        );
    }

    /** Собирает публичный профиль преподавателя. */
    render() {
        const {expert, expertId, slots, currentAccountId, isModerator, isOwnProfile = false,
            canBook = false, canReview} = this.props;
        const {visibleCount, lightboxOpen} = this.useCarburetor(this.store);
        return (
            <IrabiPreviewProvider>
                <div className="comms-page" data-test-id="expert-profile">
                    <ProfileHeader
                        expert={expert}
                        expertId={expertId}
                        isOwnProfile={isOwnProfile}
                        onOpen={this.openLightbox}
                    />
                    {this.renderProfileDetails(
                        expert, expertId, slots, isOwnProfile, canBook, visibleCount,
                        currentAccountId, isModerator, canReview, lightboxOpen,
                    )}
                </div>
            </IrabiPreviewProvider>
        );
    }
}

const reloadAfterBooking = () => window.location.reload();
