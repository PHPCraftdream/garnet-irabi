import {isActionable} from './isActionable';
import {isConfirmed} from '../../status/isConfirmed';

/** Проверяет, можно ли действовать с бронью прямо сейчас. */
export const canActNow = (status?: string, startAt?: number): boolean => {
    if (!isActionable(status)) return false;
    if (!isConfirmed(status)) return true;
    if (typeof startAt !== 'number' || startAt <= 0) return true;

    return startAt > Math.floor(Date.now() / 1000);
};

/**
 * Подтверждена ли бронь. Отдельная функция, а не сравнение по месту: именно
 * здесь трижды рождалась ошибка «всё, что не confirmed, — это pending».
 */
