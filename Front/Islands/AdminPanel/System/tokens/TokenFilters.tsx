import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {TOKEN_FILTER_OPTIONS} from './tokenTypes';

function renderStatusOption(option: (typeof TOKEN_FILTER_OPTIONS)[number]) {
    return <option key={option.value} value={option.value}>{option.label()}</option>;
}

interface Props {
    search: string;
    status: string;
    onSearchChange: (v: string) => void;
    onStatusChange: (v: string) => void;
    onCreate: () => void;
}

export class TokenFilters extends AntiHookComponent<Props> {
    private readonly search = (event: React.ChangeEvent<HTMLInputElement>) => this.props.onSearchChange(event.target.value);
    private readonly status = (event: React.ChangeEvent<HTMLSelectElement>) => this.props.onStatusChange(event.target.value);

    private renderSearch() {
        const {search} = this.props;
        return (
            <div className="filter-cell">
                    <label htmlFor="tokens-search">{t.Admin_Tokens_Label()}</label>
                    <input
                        id="tokens-search"
                        type="text"
                        value={search}
                        onChange={this.search}
                        className="admin-filter-field"
                        placeholder={t.Admin_Tokens_LabelPlaceholder()}
                        data-test-id="tokens-search"
                    />
                </div>
        );
    }

    render() {
        const {status, onCreate} = this.props;
        return (
            <div className="admin-bookings-filters">
                    {this.renderSearch()}
            <div className="filter-cell">
                    <label htmlFor="tokens-status">{t.Admin_Tokens_Status()}</label>
                    <select
                        id="tokens-status"
                        className="admin-filter-field"
                        value={status}
                        onChange={this.status}
                        data-test-id="tokens-status-filter"
                    >
                        {TOKEN_FILTER_OPTIONS.map(renderStatusOption)}
                    </select>
                </div>
                <div className="filter-actions">
                    <button type="button" className="primary-action-button" onClick={onCreate} data-test-id="tokens-create-btn">
                        {t.Admin_Tokens_Create()}
                    </button>
                </div>
            </div>
        );
    }
}
