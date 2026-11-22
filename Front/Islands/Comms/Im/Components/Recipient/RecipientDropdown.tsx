import * as React from 'react';
import * as Popover from '@radix-ui/react-popover';
import {AntiHookComponent} from '@react-carburetor/core';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {Recipient} from '../RecipientCombobox';
import {getInitials, roleLabel} from './recipientHelpers';

interface OptionProps {
    r: Recipient;
    active: boolean;
    onPick: (recipient: Recipient) => void;
}

class Option extends AntiHookComponent<OptionProps> {
    private readonly pick = () => this.props.onPick(this.props.r);

    render() {
        const {r, active} = this.props;
        return (
            <button type="button" className="im-recipient-option" data-active={active} onClick={this.pick} data-test-id={`im-recipient-${r.id}`}>
                <span className="im-recipient-avatar">{getInitials(r.name)}</span>
                <span className="im-recipient-option-label"><span className="im-recipient-option-name">{r.name || t.User_Anonymous()}</span></span>
                <span className="im-recipient-role">{roleLabel(r.role)}</span>
            </button>
        );
    }
}

interface Props {
    search: string;
    onSearchChange: (v: string) => void;
    filtered: readonly Recipient[];
    value: string;
    onPick: (r: Recipient) => void;
    loading: boolean;
}

/**
 * Всплывающее содержимое комбобокса: поиск и список получателей.
 *
 * Вынесено из `RecipientCombobox`, чтобы цепочка компонентов внутри
 * `Popover.Content` (сам Content уже третий уровень от `Popover.Root`) не
 * ныряла глубже разрешённых трёх уровней вложенности — здесь она начинает
 * счёт заново.
 */
export class RecipientDropdown extends AntiHookComponent<Props> {
    private readonly changeSearch = (event: React.ChangeEvent<HTMLInputElement>) => this.props.onSearchChange(event.target.value);

    private renderOptions() {
        const {filtered, value, onPick} = this.props;
        const options: React.ReactNode[] = [];
        for (const r of filtered) options.push(<Option key={r.id} r={r} active={String(r.id) === value} onPick={onPick} />);
        return options;
    }

    render() {
        const {search, filtered, loading} = this.props;
        return (
            <Popover.Portal>
                <Popover.Content className="im-recipient-content" sideOffset={4} align="start">
                    <div className="im-recipient-search-wrap">
                        <input
                            type="text"
                            className="im-recipient-search-input"
                            placeholder={t.IM_Search() + '...'}
                            value={search}
                            onChange={this.changeSearch}
                            autoFocus
                            data-test-id="im-recipient-search"
                        />
                    </div>
                    <div className="im-recipient-list">
                        {filtered.length === 0 && (
                            <div className="im-recipient-empty">{loading ? t.User_Loading() : t.IM_NoRecipients()}</div>
                        )}
                        {this.renderOptions()}
                    </div>
                </Popover.Content>
            </Popover.Portal>
        );
    }
}
