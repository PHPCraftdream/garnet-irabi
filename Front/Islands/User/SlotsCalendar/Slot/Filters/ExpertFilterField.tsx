import * as React from 'react';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {Combobox} from '@common/Components/ui/Combobox';
import {ExpertInfo, ExpertMap} from '../../types';

interface Props {
    experts: ExpertMap;
    expertIds: Set<string>;
    onChange: (ids: Set<string>) => void;
}

const expertOption = ([id, expert]: [string, ExpertInfo]) => ({value: id, label: expert.display_name});

export class ExpertFilterField extends React.Component<Props> {
    private readonly change = (value: string) => this.props.onChange(value ? new Set([value]) : new Set());

    public render() {
        const {experts, expertIds} = this.props;
        const expertEntries = Object.entries(experts);
        return (
            <>
                <label className="slot-filter-label">{t.Slot_Expert()}</label>
                <Combobox
                    options={[{value: '', label: t.Slots_AllExperts()}, ...expertEntries.map(expertOption)]}
                    value={expertIds.size === 0 ? '' : (expertIds.size === 1 ? [...expertIds][0] : '')}
                    onChange={this.change}
                    placeholder={t.Slots_AllExperts()}
                    searchPlaceholder={t.IM_Search() + '...'}
                    emptyText={t.Filter_NoResults()}
                    testId="filter-expert"
                />
            </>
        );
    }
}
