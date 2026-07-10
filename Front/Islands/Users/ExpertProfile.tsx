import * as React from 'react';
import {useState} from 'react';
import {UserX} from 'lucide-react';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {formatTs} from '@common/Utils/DateUtils';
import {CommentsSection} from '../Comments/CommentsSection';
import {IrabiPreviewProvider} from '../../Common/IrabiPreviewProvider';
import {appUrl} from '@common/Utils/appUrl';
import {useSlotBooking} from '../SlotsCalendar/useSlotBooking';
import ImageLightbox from '../../Common/ImageLightbox';

interface Expert {
    display_name: string;
    specialization?: string;
    bio?: string;
    avatar?: string | null;
    avatar_full?: string | null;
    is_disabled?: boolean;
    cancellation_count?: number;
    decline_count?: number;
    conducted_count?: number;
    total_bookings?: number;
}

interface ExpertSlot {
    id: number;
    start_at: number;
    cost: number;
    is_online: number;
}

interface ExpertProfileProps {
    expert: Expert;
    expertId: number;
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

const ExpertProfileIslandInner: React.FC<ExpertProfileProps> = ({
    expert,
    expertId,
    slots,
    commentsListUrl,
    commentsCreateUrl,
    commentsDeleteUrl,
    currentAccountId,
    isModerator,
    isOwnProfile = false,
    canBook = false,
}) => {
    const [visibleCount, setVisibleCount] = useState(SLOTS_PAGE_SIZE);
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const visibleSlots = slots.slice(0, visibleCount);
    const hasMore = visibleCount < slots.length;

    const initials = (expert.display_name || '?')
        .split(' ')
        .map(w => w[0]?.toUpperCase() || '')
        .slice(0, 2)
        .join('');

    // Open the booking in a modal instead of navigating to a separate page;
    // reload on success so the slot list / stats reflect the new booking.
    const {openBooking, bookingModal} = useSlotBooking({onBooked: () => window.location.reload()});

    return (
        <div className="page-narrow" data-test-id="expert-profile">
            <div className="flex items-stretch gap-4 mb-6">
                {expert.is_disabled ? (
                    <div
                        className="shrink-0 self-stretch aspect-square rounded-lg bg-surface-hover flex items-center justify-center text-muted"
                        data-test-id="expert-avatar-disabled"
                    >
                        <UserX size={40} />
                    </div>
                ) : expert.avatar ? (
                    <button
                        type="button"
                        className="shrink-0 p-0 border-0 bg-transparent cursor-pointer self-stretch"
                        onClick={() => setLightboxOpen(true)}
                        title={expert.display_name}
                        data-test-id="expert-avatar"
                    >
                        <img
                            src={expert.avatar}
                            alt={expert.display_name}
                            className="h-full w-auto aspect-square object-cover rounded-lg shadow"
                        />
                    </button>
                ) : (
                    <div
                        className="shrink-0 self-stretch aspect-square rounded-lg bg-surface-hover flex items-center justify-center text-2xl font-semibold text-muted"
                        data-test-id="expert-avatar-fallback"
                    >
                        {initials}
                    </div>
                )}
                <div className="flex flex-col justify-center min-w-0">
                    <h1 className="mb-1 text-on-surface">{expert.display_name}</h1>
                    {expert.specialization && (
                        <p className="text-muted mb-2">{expert.specialization}</p>
                    )}
                    <div className="flex items-center gap-2">
                        {isOwnProfile ? (
                            <a
                                href={appUrl('/~profile_edit')}
                                className="btn btn-sm btn-primary"
                                data-test-id="expert-profile-edit-btn"
                            >
                                {t.Action_Edit()}
                            </a>
                        ) : (
                            <a
                                href={appUrl(`/im/#to=${expertId}`)}
                                className="btn btn-sm btn-primary"
                                data-test-id="expert-profile-message-btn"
                            >
                                {t.IM_WriteMessage()}
                            </a>
                        )}
                    </div>
                </div>
            </div>

            {!expert.is_disabled && lightboxOpen && (expert.avatar_full || expert.avatar) && (
                <ImageLightbox
                    src={(expert.avatar_full || expert.avatar) as string}
                    alt={expert.display_name}
                    onClose={() => setLightboxOpen(false)}
                />
            )}

            {expert.bio && (
                <div className="section-soft mb-8">
                    <h4 className="mb-2">{t.Slot_About()}</h4>
                    <p className="mb-0 whitespace-pre-line">{expert.bio}</p>
                </div>
            )}

            <div className="profile-card mb-5" data-test-id="expert-stats">
                <div className="grid grid-cols-2 md:grid-cols-4">
                    <div className="profile-stat-cell">
                        <div className="profile-stat-value text-success" data-test-id="expert-stat-conducted">{expert.conducted_count ?? 0}</div>
                        <div className="stat-tile-label">{t.Expert_Conducted()}</div>
                    </div>
                    <div className="profile-stat-cell">
                        <div className="profile-stat-value text-accent" data-test-id="expert-stat-total">{expert.total_bookings ?? 0}</div>
                        <div className="stat-tile-label">{t.Expert_TotalBookings()}</div>
                    </div>
                    <div className="profile-stat-cell">
                        <div className="profile-stat-value text-warning" data-test-id="expert-stat-declines">{expert.decline_count ?? 0}</div>
                        <div className="stat-tile-label">{t.Expert_Declines()}</div>
                    </div>
                    <div className="profile-stat-cell">
                        <div className="profile-stat-value text-warning" data-test-id="expert-stat-cancellations">{expert.cancellation_count ?? 0}</div>
                        <div className="stat-tile-label">{t.Expert_Cancellations()}</div>
                    </div>
                </div>
            </div>

            <h3 className="mt-6 mb-4">{t.Slot_AvailableSlots()}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {slots.length === 0 ? (
                    <div>
                        <p className="text-muted">{t.Slot_NoAvailable()}</p>
                    </div>
                ) : (
                    visibleSlots.map(slot => (
                        <div key={slot.id} data-test-id={`slot-card-${slot.id}`}>
                            <div className="card">
                                <div className="card-body">
                                    <h5 className="card-title">{formatTs(slot.start_at)}</h5>
                                    <p className="card-text mb-2"><strong>{t.Slot_Cost()}:</strong> {slot.cost} &#8381;</p>
                                    <p className="card-text mb-3"><strong>{t.Slot_Type()}:</strong> {slot.is_online ? t.Slot_Online() : t.Slot_Offline()}</p>
                                    {isOwnProfile ? (
                                        <span className="text-xs text-muted" data-test-id={`slot-own-${slot.id}`}>{t.Slot_OwnSlot()}</span>
                                    ) : canBook ? (
                                        <button type="button" onClick={() => openBooking(slot.id)} className="btn btn-primary btn-sm" data-test-id={`slot-book-${slot.id}`}>{t.Slot_Book()}</button>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
            {slots.length > SLOTS_PAGE_SIZE && (
                <div className="mt-4 text-center">
                    {hasMore ? (
                        <button
                            type="button"
                            className="btn btn-outline-secondary btn-sm"
                            data-test-id="expert-slots-show-more"
                            onClick={() => setVisibleCount(c => c + SLOTS_PAGE_SIZE)}
                        >
                            {t.Expert_ShowMoreSlots()} ({slots.length - visibleCount})
                        </button>
                    ) : (
                        <span className="text-xs text-muted">{t.Expert_AllSlotsShown()}</span>
                    )}
                </div>
            )}

            <CommentsSection
                entityType="expert"
                entityId={expertId}
                listUrl={commentsListUrl}
                createUrl={commentsCreateUrl}
                deleteUrl={commentsDeleteUrl}
                currentAccountId={currentAccountId}
                isModerator={isModerator}
                canCreate={!isOwnProfile}
            />
            {bookingModal}
        </div>
    );
};

export const ExpertProfileIsland: React.FC<ExpertProfileProps> = (props) => (
    <IrabiPreviewProvider>
        <ExpertProfileIslandInner {...props} />
    </IrabiPreviewProvider>
);
