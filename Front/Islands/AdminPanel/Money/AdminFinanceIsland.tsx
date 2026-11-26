import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import {LedgerEntry, AccountBalanceRow, GridConfig, PageResponse} from '@/Islands/AdminPanel/Shell/shared/types';
import {LedgerSection} from './LedgerSection';
import {BalancesSection} from './BalancesSection';
import {UserDetailContext, UserDetailContextValue} from '@/Islands/AdminPanel/Users/UserDetailContext';
import {UserDetailTab} from '@/Islands/AdminPanel/Users/UserDetailTab';
import {useUserTabs} from '@/Islands/AdminPanel/Shell/useUserTabs';
import {ADMIN_URLS} from '@/Islands/AdminPanel/Shell/navigation/adminUrls';
import {TabNav, TabDef} from '@common/Components/Layout/Navigation/TabNav';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import {PageHeader} from '@common/Components/Layout/PageHeader';
import {Banknote} from 'lucide-react';

interface LedgerFilterOptions {
    fromOptions: {value: string; label: string}[];
    toOptions: {value: string; label: string}[];
    entryTypes: string[];
}

interface Props {
    ledgerPageUrl: string;
    ledgerInitialData: PageResponse<LedgerEntry> | null;
    ledgerInitialFilterOptions: LedgerFilterOptions;
    balancesPageUrl: string;
    balancesInitialData: PageResponse<AccountBalanceRow> | null;
    balancesInitialAccountOptions: {value: string; label: string}[];
    ledgerGridConfig: GridConfig;
    balancesGridConfig: GridConfig;
    userDetailUrl: string;
    adjustUrl: string;
    canAdjust: boolean;
    initialTab: 'finance' | 'balances';
}

type FinanceTabId = 'finance' | 'balances';

    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
function readTabFromUrl(): FinanceTabId | null {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    return tab === 'balances' || tab === 'finance' ? tab : null;
}

    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
function writeTabToUrl(tab: FinanceTabId): void {
    const url = new URL(window.location.href);
    if (tab === 'finance') {
        url.searchParams.delete('tab');
    } else {
        url.searchParams.set('tab', tab);
    }
    window.history.pushState(null, '', url.toString());
}

const FINANCE_ICON = <Banknote size={22} aria-hidden="true" />;

type ViewProps = Props & ReturnType<typeof useUserTabs>;

class AdminFinanceView extends AntiHookComponent<ViewProps> {
    private readonly ui = new Carburetor({activeMainTab: this.props.initialTab});
    private detailCache?: {openUser: ViewProps['openUser']; value: UserDetailContextValue};

    /** Синхронизирует жизненный цикл компонента с его внешними подписками. */
    componentDidMount(): void {
        super.componentDidMount();
        window.addEventListener('popstate', this.onPop);
        this.openDeepLink();
    }

    /** Синхронизирует жизненный цикл компонента с его внешними подписками. */
    componentDidUpdate(previous: Readonly<ViewProps>): void {
        super.componentDidUpdate(previous);
        if (previous.openUser !== this.props.openUser) this.openDeepLink();
    }

    /** Синхронизирует жизненный цикл компонента с его внешними подписками. */
    componentWillUnmount(): void {
        window.removeEventListener('popstate', this.onPop);
        super.componentWillUnmount();
    }

    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
    private detailValue(): UserDetailContextValue {
        const {openUser} = this.props;
        if (this.detailCache?.openUser !== openUser) this.detailCache = {openUser, value: {openUser}};
        return this.detailCache.value;
    }

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly onPop = () => {
        const tab = readTabFromUrl();
        if (tab) this.ui.setData({activeMainTab: tab});
    };

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private openDeepLink(): void {
        const {hash, pathname, search} = window.location;
        if (!hash.includes('user=')) return;
        const id = parseInt(hash.split('user=')[1]?.split('&')[0] || '0', 10);
        if (id <= 0 || !Number.isFinite(id)) return;
        this.props.openUser(id, '#' + id);
        window.history.replaceState(null, '', pathname + search);
    }

    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
    private hasUserTab(id: string): boolean {
        for (const tab of this.props.userTabs) if (tab.id === id) return true;
        return false;
    }

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly select = (id: string) => {
        if (id === 'finance' || id === 'balances') {
            const tab = id;
            this.props.setActiveUserTabId(null);
            this.ui.setData({activeMainTab: tab});
            writeTabToUrl(tab);
        } else if (this.hasUserTab(id)) this.props.setActiveUserTabId(id);
    };

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly close = (id: string) => {
        if (this.hasUserTab(id)) this.props.closeUser(id);
    };

    /** Формирует представление данных для соответствующего раздела панели. */
    private renderSection(id: string) {
        const p = this.props;
        if (id === 'finance') return <LedgerSection pageUrl={p.ledgerPageUrl} initialData={p.ledgerInitialData}
            initialFilterOptions={p.ledgerInitialFilterOptions} config={p.ledgerGridConfig} />;
        if (id === 'balances') return <BalancesSection pageUrl={p.balancesPageUrl} initialData={p.balancesInitialData}
            initialAccountOptions={p.balancesInitialAccountOptions} config={p.balancesGridConfig}
        adjustUrl={p.adjustUrl} canAdjust={p.canAdjust} />;
        for (const tab of p.userTabs) {
            if (tab.id === id) return <UserDetailTab accountId={tab.tabKind.accountId}
        detailUrl={p.userDetailUrl || ADMIN_URLS.detailUrl}
                setFlagUrl={ADMIN_URLS.setFlagUrl} createTicketUrl={ADMIN_URLS.createTicketUrl} />;
        }
        return null;
    }

    /** Формирует представление данных для соответствующего раздела панели. */
    render() {
        const {activeMainTab} = this.useCarburetor(this.ui);
        const {activeUserTabId, userTabs} = this.props;
        const userDetail = this.detailValue();
        const activeId = activeUserTabId ?? activeMainTab;
        const tabs: TabDef[] = [
            {id: 'finance', label: t.Admin_FinanceTab_Finance(), closeable: false},
            {id: 'balances', label: t.Admin_FinanceTab_Balances(), closeable: false},
            ...userTabs,
        ];
        return (
            <UserDetailContext.Provider value={userDetail}>
                <PageHeader title={t.Admin_Finance()} icon={FINANCE_ICON} />
                <div className="section-soft">
                    <TabNav tabs={tabs} activeId={activeId} onSelect={this.select} onClose={this.close} />
                    {this.renderSection(activeId)}
                </div>
            </UserDetailContext.Provider>
        );
    }
}

    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
export function AdminFinanceIsland(props: Props) {
    return <AdminFinanceView {...props} {...useUserTabs()} />;
}
