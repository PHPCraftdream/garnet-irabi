import * as React from 'react';

/** Минимум, который нужен колбэку «после брони». */
export interface ReloadableFeed {
    reloadAfterBooking: () => void;
}

export interface NewsFeedReload<T extends ReloadableFeed> {
    readonly ref: React.RefObject<T>;
    readonly onBooked: () => void;
}

/**
 * Колбэк «после брони» на одну ленту: перечитывает ту, из которой открыли
 * окно, — как onBooked в мастере, а не все смонтированные экземпляры.
 */
export function useNewsFeedReload<T extends ReloadableFeed>(): NewsFeedReload<T> {
    const ref = React.useRef<T>(null);
    const onBooked = React.useCallback((): void => ref.current?.reloadAfterBooking(), []);
    return {ref, onBooked};
}
