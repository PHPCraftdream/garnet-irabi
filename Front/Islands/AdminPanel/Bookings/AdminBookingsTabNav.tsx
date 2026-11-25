import * as React from 'react';

export type TabKey = 'slots' | 'bookings' | 'expert-cancellations' | 'user-cancellations';

interface TabNavProps {
    tabs: TabKey[];
    tabLabels: Record<TabKey, string>;
    activeTab: TabKey;
    onSelect: (tab: TabKey) => void;
}

class TabButton extends React.Component<{tab: TabKey; label: string; active: boolean; onSelect: (tab: TabKey)
        => void}> {
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly select = () => this.props.onSelect(this.props.tab);

    /** Формирует представление данных для соответствующего раздела панели. */
    public render() {
        const {tab, label, active} = this.props;
        return (
            <button
                type="button"
                role="tab"
                aria-selected={active}
                className={active ? 'slot-filter-chip-active' : 'slot-filter-chip'}
                onClick={this.select}
                data-test-id={`tabnav-btn-${tab}`}
            >
                {label}
            </button>
        );
    }
}

export class AdminBookingsTabNav extends React.Component<TabNavProps> {
    /** Формирует представление данных для соответствующего раздела панели. */
    private readonly renderTab = (tab: TabKey) => (
        <TabButton key={tab} tab={tab} label={this.props.tabLabels[tab]} active={tab === this.props.activeTab}
        onSelect={this.props.onSelect} />
    );

    /** Формирует представление данных для соответствующего раздела панели. */
    public render() {
        return (
            <div className="admin-bookings-tabs" role="tablist" data-test-id="admin-bookings-section-tabs">
                {this.props.tabs.map(this.renderTab)}
            </div>
        );
    }
}
