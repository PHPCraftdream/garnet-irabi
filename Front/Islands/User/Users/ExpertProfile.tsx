import * as React from 'react';
import {useState} from 'react';
import {UserX} from 'lucide-react';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {formatTs} from '@common/Utils/Time/DateUtils';
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
    canReview,
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
            {/* Размер фото задан явно, а не выведен из высоты строки.
                Было `items-stretch` + `self-stretch` + `aspect-square`: высота
                картинки следовала за высотой строки, а квадрат делал её ширину
                равной высоте. На узком экране это замыкалось в петлю — длинное
                имя переносилось, строка росла, картинка становилась шире,
                колонке с именем оставалось меньше места, оно переносилось ещё
                сильнее. Кончалось тем, что имя и кнопка уезжали за край, и на
                телефоне первый экран занимало одно фото. Ломалось только у
                преподавателей с настоящим файлом фото — локализовала user-3. */}
            <div className="flex items-start gap-4 mb-6">
                {expert.is_disabled ? (
                    <div
                        className="shrink-0 w-24 h-24 md:w-32 md:h-32 rounded-lg bg-surface-hover flex items-center justify-center text-muted"
                        data-test-id="expert-avatar-disabled"
                    >
                        <UserX size={40} />
                    </div>
                ) : expert.avatar ? (
                    <button
                        type="button"
                        className="shrink-0 p-0 border-0 bg-transparent cursor-pointer"
                        onClick={() => setLightboxOpen(true)}
                        title={expert.display_name}
                        data-test-id="expert-avatar"
                    >
                        <img
                            src={expert.avatar}
                            alt={expert.display_name}
                            className="w-24 h-24 md:w-32 md:h-32 object-cover rounded-lg shadow"
                        />
                    </button>
                ) : (
                    <div
                        className="shrink-0 w-24 h-24 md:w-32 md:h-32 rounded-lg bg-surface-hover flex items-center justify-center text-2xl font-semibold text-muted"
                        data-test-id="expert-avatar-fallback"
                    >
                        {initials}
                    </div>
                )}
                <div className="flex flex-col justify-center min-w-0">
                    <h1 className="mb-1 text-on-surface">{expert.display_name}</h1>
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
                <div className="grid grid-cols-2 md:grid-cols-5">
                    <div className="profile-stat-cell">
                        <div className="profile-stat-value text-success" data-test-id="expert-stat-conducted">{expert.conducted_count ?? 0}</div>
                        <div className="stat-tile-label">{t.Expert_Conducted()}</div>
                    </div>
                    <div className="profile-stat-cell">
                        <div className="profile-stat-value text-accent" data-test-id="expert-stat-upcoming">{expert.upcoming_count ?? 0}</div>
                        <div className="stat-tile-label">{t.Expert_Upcoming()}</div>
                    </div>
                    <div className="profile-stat-cell">
                        <div className="profile-stat-value text-warning" data-test-id="expert-stat-declines">{expert.decline_count ?? 0}</div>
                        <div className="stat-tile-label">{t.Expert_Declines()}</div>
                    </div>
                    <div className="profile-stat-cell">
                        <div className="profile-stat-value text-warning" data-test-id="expert-stat-cancellations">{expert.cancellation_count ?? 0}</div>
                        <div className="stat-tile-label">{t.Expert_Cancellations()}</div>
                    </div>
                    {/* D-190: два соседних счётчика — решения преподавателя.
                        Этот — их отсутствие: заявка истекла без ответа. Раньше
                        она не попадала ни в один счётчик на его стороне, хотя
                        у ученика была видна. */}
                    <div className="profile-stat-cell">
                        <div className="profile-stat-value text-muted" data-test-id="expert-stat-missed">{expert.missed_count ?? 0}</div>
                        <div className="stat-tile-label">{t.Expert_Missed()}</div>
                    </div>
                </div>

                {/* D-197: объяснение жило в атрибуте title, а на телефоне
                    наведения нет — оставалась голая цифра в ряду с «Отклонил»
                    и «Отменил», и читалась она как клеймо, хотя означает
                    обратное: молчать преподаватель вправе. Видимая строка
                    вместо всплывающей подсказки — тот же урок, что D-122 и
                    D-131, где на телефоне терялось именно объяснение. */}
                <p className="px-4 pb-3 mb-0 text-xs text-muted" data-test-id="expert-stat-missed-hint">
                    {t.Expert_MissedHint()}
                </p>
            </div>

            <h3 className="mt-6 mb-4">{t.Slot_AvailableSlots()}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {slots.length === 0 && <p className="text-muted">{t.Slot_NoAvailable()}</p>}
                {visibleSlots.map(slot => (
                    <ExpertSlotCard
                        key={slot.id}
                        slot={slot}
                        isOwnProfile={isOwnProfile}
                        canBook={canBook}
                        onBook={openBooking}
                    />
                ))}
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
                canCreate={canReview}
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
