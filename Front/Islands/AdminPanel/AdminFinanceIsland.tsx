import * as React from 'react';
import {useEffect, useState} from 'react';
import {LedgerEntry, AccountBalanceRow, GridConfig} from './types';
import {LedgerSection} from './LedgerSection';
import {BalancesSection} from './BalancesSection';
import {UserDetailContext} from './UserDetailContext';
import {UserDetailTab} from './UserDetailTab';
import {useUserTabs} from './useUserTabs';
import {ADMIN_URLS} from './AdminPageWrapper';
import {TabNav, TabDef} from '@common/Components/Navigation/TabNav';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {PageHeader} from '@common/Components/PageHeader';
import {Banknote} from 'lucide-react';

interface Props {
    ledger: LedgerEntry[];
    balances: AccountBalanceRow[];
    ledgerGridConfig: GridConfig;
    balancesGridConfig: GridConfig;
    userDetailUrl: string;
    adjustUrl: string;
    initialTab: 'finance' | 'balances';
}

type FinanceTabId = 'finance' | 'balances';

const FINANCE_TAB_IDS: ReadonlyArray<FinanceTabId> = ['finance', 'balances'];

function readTabFromUrl(): FinanceTabId | null {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    return tab === 'balances' || tab === 'finance' ? tab : null;
}

function writeTabToUrl(tab: FinanceTabId): void {
    const url = new URL(window.location.href);
    if (tab === 'finance') {
        url.searchParams.delete('tab');
    } else {
        url.searchParams.set('tab', tab);
    }
    window.history.pushState(null, '', url.toString());
}

export const AdminFinanceIsland: React.FC<Props> = ({
    ledger, balances, ledgerGridConfig, balancesGridConfig, userDetailUrl, adjustUrl, initialTab,
}) => {
    const [activeMainTab, setActiveMainTab] = useState<FinanceTabId>(initialTab);

    const {userTabs, activeUserTabId, setActiveUserTabId, openUser, closeUser} = useUserTabs();

    // React to back/forward navigation
    useEffect(() => {
        const onPop = () => {
            const tab = readTabFromUrl();
            if (tab) setActiveMainTab(tab);
        };
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, []);

    // Open user tab from #user={id}
    useEffect(() => {
        const hash = window.location.hash;
        if (hash.includes('user=')) {
            const userId = parseInt(hash.split('user=')[1]?.split('&')[0] || '0', 10);
            if (userId > 0) {
                openUser(userId, `#${userId}`);
                window.history.replaceState(null, '', window.location.pathname + window.location.search);
            }
        }
    }, [openUser]);

    const effectiveActiveId: string = activeUserTabId ?? activeMainTab;

    const mainTabs: TabDef[] = [
        {id: 'finance', label: t.Admin_FinanceTab_Finance(), closeable: false},
        {id: 'balances', label: t.Admin_FinanceTab_Balances(), closeable: false},
    ];

    const allTabs: TabDef[] = [...mainTabs, ...userTabs];

    const handleSelect = (id: string) => {
        if (FINANCE_TAB_IDS.includes(id as FinanceTabId)) {
            const tab = id as FinanceTabId;
            setActiveUserTabId(null);
            setActiveMainTab(tab);
            writeTabToUrl(tab);
            return;
        }
        if (userTabs.find(ut => ut.id === id)) {
            setActiveUserTabId(id);
        }
    };

    const handleClose = (id: string) => {
        if (userTabs.find(ut => ut.id === id)) {
            closeUser(id);
        }
    };

    const showFinance = effectiveActiveId === 'finance';
    const showBalances = effectiveActiveId === 'balances';
    const activeUserTab = userTabs.find(ut => ut.id === effectiveActiveId);

    return (
        <UserDetailContext.Provider value={{openUser}}>
            <PageHeader title={t.Admin_Finance()} icon={<Banknote size={22} aria-hidden="true" />} />
            <div className="section-soft">
            <TabNav
                tabs={allTabs}
                activeId={effectiveActiveId}
                onSelect={handleSelect}
                onClose={handleClose}
            />
            {showFinance && (
                <LedgerSection ledger={ledger} config={ledgerGridConfig} />
            )}
            {showBalances && (
                <BalancesSection balances={balances} config={balancesGridConfig} adjustUrl={adjustUrl} />
            )}
            {activeUserTab && (
                <UserDetailTab
                    accountId={activeUserTab.tabKind.accountId}
                    detailUrl={userDetailUrl || ADMIN_URLS.detailUrl}
                    setFlagUrl={ADMIN_URLS.setFlagUrl}
                    createTicketUrl={ADMIN_URLS.createTicketUrl}
                />
            )}
            </div>
        </UserDetailContext.Provider>
    );
};
