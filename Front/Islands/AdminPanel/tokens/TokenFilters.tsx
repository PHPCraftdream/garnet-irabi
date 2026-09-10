import * as React from 'react';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {TOKEN_FILTER_OPTIONS} from './tokenTypes';

interface Props {
    search: string;
    status: string;
    onSearchChange: (v: string) => void;
    onStatusChange: (v: string) => void;
    onCreate: () => void;
}

export const TokenFilters: React.FC<Props> = ({search, status, onSearchChange, onStatusChange, onCreate}) => (
    <div className="admin-bookings-filters">
        <div className="filter-cell">
            <label htmlFor="tokens-search">{t.Admin_Tokens_Label()}</label>
            <input
                id="tokens-search"
                type="text"
                value={search}
                onChange={e => onSearchChange(e.target.value)}
                className="form-control"
                placeholder={t.Admin_Tokens_LabelPlaceholder()}
                data-test-id="tokens-search"
            />
        </div>
        <div className="filter-cell">
            <label htmlFor="tokens-status">{t.Admin_Tokens_Status()}</label>
            <select
                id="tokens-status"
                className="form-control"
                value={status}
                onChange={e => onStatusChange(e.target.value)}
                data-test-id="tokens-status-filter"
            >
                {TOKEN_FILTER_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label()}</option>)}
            </select>
        </div>
        <div className="filter-actions">
            <button type="button" className="btn btn-primary" onClick={onCreate} data-test-id="tokens-create-btn">
                {t.Admin_Tokens_Create()}
            </button>
        </div>
    </div>
);
