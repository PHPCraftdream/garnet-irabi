import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import * as Popover from '@radix-ui/react-popover';
import {D} from '@common/Support/Debug/D';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {getInitials} from './Recipient/getInitials';
import {roleLabel} from './Recipient/recipientHelpers';
import {RecipientDropdown} from './Recipient/RecipientDropdown';

const userLoading = t.User_Loading;
const imSearch = t.IM_Search;
const userAnonymous = t.User_Anonymous;

export interface Recipient {
    id: number;
    name: string;
    role: string;
}

const TriggerLabel: React.FC<{selected?: Recipient; loading: boolean}> = ({selected, loading}) => {
    if (!selected) {
        return <span>{loading ? userLoading() : imSearch() + '...'}</span>;
    }

    return (
        <span className="im-recipient-label">
            <span className="im-recipient-avatar-small">{getInitials(selected.name)}</span>
            <span className="im-recipient-name">{selected.name || userAnonymous()}</span>
            <span className="im-recipient-role">{roleLabel(selected.role)}</span>
        </span>
    );
};

/** Находит получателя по идентификатору. */
function findRecipient(recipients: readonly Recipient[], value: string): Recipient | undefined {
    return recipients.find(recipient => String(recipient.id) === value);
}

/** Фильтрует получателей по поисковому запросу. */
function filterRecipients(recipients: readonly Recipient[], search: string): readonly Recipient[] {
    const query = search.trim().toLowerCase();
    return query ? recipients.filter(recipient => (recipient.name || '').toLowerCase().includes(query)) : recipients;
}

interface Props {
    recipients: readonly Recipient[];
    loading: boolean;
    value: string;
    onChange: (id: string) => void;
}

/** Выбор получателя: поиск по имени со списком. */
export class RecipientCombobox extends AntiHookComponent<Props> {
    private readonly ui = new Carburetor({open: false, search: ''});
    /** Устанавливает состояние раскрытия списка. */
    private readonly setOpen = (open: boolean) => this.ui.setData({...this.ui.getData(), open});
    /** Обновляет поисковый запрос. */
    private readonly setSearch = (search: string) => this.ui.setData({...this.ui.getData(), search});

    /** Выбирает получателя. */
    private readonly pick = (recipient: Recipient) => {
        D('im.selectRecipient', {id: recipient.id, name: recipient.name});
        this.props.onChange(String(recipient.id));
        this.ui.setData({search: '', open: false});
    };

    /** Обрабатывает renderTrigger. */
    private renderTrigger(open: boolean, selected?: Recipient) {
        const {loading} = this.props;
        return (
            <Popover.Trigger asChild>
                <button
                    type="button"
                    role="combobox"
                    aria-expanded={open}
                    className="im-recipient-trigger" data-empty={!selected}
                    data-test-id="im-recipient-input"
                >
                    <TriggerLabel selected={selected} loading={loading} />
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2" className="im-recipient-chevron">
                        <path d="m6 9 6 6 6-6" />
                    </svg>
                </button>
            </Popover.Trigger>
        );
    }

    /** Рисует содержимое компонента. */
    render() {
        const {recipients, loading, value} = this.props;
        const {open, search} = this.useCarburetor(this.ui);
        const selected = findRecipient(recipients, value);
        const filtered = filterRecipients(recipients, search);
        return (
            <Popover.Root open={open} onOpenChange={this.setOpen}>
                {this.renderTrigger(open, selected)}
                <RecipientDropdown
                    search={search}
                    onSearchChange={this.setSearch}
                    filtered={filtered}
                    value={value}
                    onPick={this.pick}
                    loading={loading}
                />
            </Popover.Root>
        );
    }
}
