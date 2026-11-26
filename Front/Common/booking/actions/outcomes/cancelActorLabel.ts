import {I18nForeground as t} from '@/I18nGen/I18nForeground';

/** Возвращает описание инициатора отмены. */
export const cancelActorLabel = (opts: {
    role?: string | null;
    wasConfirmed: boolean;
    viewerIsStudent: boolean;
}): string => {
    const {role, wasConfirmed, viewerIsStudent} = opts;

    switch (role) {
        case 'user':
            if (!wasConfirmed) {
                return viewerIsStudent ? t.Booking_WithdrawnByYou() : t.Booking_WithdrawnByStudent();
            }

            return viewerIsStudent ? t.Booking_CancelledByYou() : t.Booking_CancelledByStudent();
        case 'expert':
            if (wasConfirmed) {
                return viewerIsStudent
                    ? t.Booking_CancelledLessonByExpert()
                    : t.Booking_CancelledLessonByYouAsExpert();
            }

            return viewerIsStudent ? t.Booking_CancelledByExpert() : t.Booking_CancelledByYouAsExpert();
        case 'moderator':
            return t.Booking_CancelledByModerator();
        case 'system':
            return t.Booking_CancelledBySystem();
        default:
            return '';
    }
};

/** Надпись на кнопке действия. */
