import {Carburetor} from '@react-carburetor/core';
import type {UserInternalTab} from '@common/hooks/data/useUserTabs';

export type {UserInternalTab, UserTabKind} from '@common/hooks/data/useUserTabs';

interface UserTabsState {
    tabs: UserInternalTab[];
    activeId: string | null;
}

/** Хуко-независимая замена хука `useUserTabs`: вкладки админки в Carburetor-сторе. */
export class UserTabsStore extends Carburetor<UserTabsState> {
    constructor() {
        super({tabs: [], activeId: null});
    }

    readonly snapshot = () => this.getData();

    readonly subscribeSnapshot = (listener: () => void) => {
        const id = this.subscribe(listener);
        return () => this.unsubscribe(id);
    };

    private patch(next: UserTabsState): void {
        const previous = this.getData();
        if (next.tabs === previous.tabs && next.activeId === previous.activeId) return;
        const version = this.getVersion();
        this.setData(next);
        if (this.getData() !== previous && this.getVersion() === version) {
            this.markAllChanged();
            this.emitUpdate();
        }
    }

    readonly setActiveId = (value: string | null | ((previous: string | null) => string | null)): void => {
        const previous = this.getData();
        const activeId = typeof value === 'function' ? value(previous.activeId) : value;
        this.patch({...previous, activeId});
    };

    readonly openUser = (accountId: number, label: string): void => {
        const previous = this.getData();
        const tabId = `user-${accountId}`;
        const tabs = previous.tabs.some(t => t.id === tabId)
            ? previous.tabs
            : [...previous.tabs, {id: tabId, label, closeable: true, tabKind: {kind: 'user-detail' as const, accountId}}];
        this.patch({tabs, activeId: tabId});
    };

    readonly closeUser = (tabId: string): void => {
        const previous = this.getData();
        const tabs = previous.tabs.filter(t => t.id !== tabId);
        if (tabs.length === previous.tabs.length && previous.activeId !== tabId) return;
        this.patch({tabs, activeId: previous.activeId === tabId ? null : previous.activeId});
    };
}
