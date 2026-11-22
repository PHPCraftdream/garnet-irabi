import type * as React from 'react';
import {Carburetor} from '@react-carburetor/core';
import type {UserInternalTab} from '@common/hooks/data/useUserTabs';

type TabState = {tabs: UserInternalTab[]; activeId: string | null};

/**
 * Порт стора useUserTabs без React hooks.
 */
export class AdminSupportUserTabs extends Carburetor<TabState> {
    constructor() { super({tabs: [], activeId: null}); }

    readonly snapshot = () => this.getData();

    readonly subscribeSnapshot = (listener: () => void) => {
        const id = this.subscribe(listener);
        return () => this.unsubscribe(id);
    };

    readonly setActiveUserTabId: React.Dispatch<React.SetStateAction<string | null>> = value => {
        const previous = this.getData();
        const activeId = typeof value === 'function' ? value(previous.activeId) : value;
        this.patch({...previous, activeId});
    };

    readonly openUser = (accountId: number, label: string) => {
        const previous = this.getData();
        const tabId = `user-${accountId}`;
        const tabs = previous.tabs.some(t => t.id === tabId) ? previous.tabs : [...previous.tabs, {
            id: tabId, label, closeable: true, parentId: undefined,
            tabKind: {kind: 'user-detail' as const, accountId},
        }];
        this.patch({tabs, activeId: tabId});
    };

    readonly closeUser = (tabId: string) => {
        const previous = this.getData();
        const tabs = previous.tabs.filter(t => t.id !== tabId);
        // filter всегда даёт новый массив; без этой проверки закрытие несуществующей
        // вкладки рассылало бы уведомление при неизменном состоянии.
        if (tabs.length === previous.tabs.length && previous.activeId !== tabId) return;
        this.patch({tabs, activeId: previous.activeId === tabId ? null : previous.activeId});
    };

    private patch(next: TabState) {
        const previous = this.getData();
        if (next.tabs === previous.tabs && next.activeId === previous.activeId) return;
        const version = this.getVersion();
        this.setData(next);
        if (this.getData() !== previous && this.getVersion() === version) {
            this.markAllChanged();
            this.emitUpdate();
        }
    }
}
