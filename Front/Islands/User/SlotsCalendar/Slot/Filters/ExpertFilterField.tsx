import * as React from 'react';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {Combobox} from '@common/Components/ui/Combobox';
import {ExpertMap} from '../../types';

export const ExpertFilterField: React.FC<{experts: ExpertMap; expertIds: Set<string>; onChange: (ids: Set<string>) => void}> = ({experts, expertIds, onChange}) => {
    const expertEntries = Object.entries(experts);

    return (
        <>
            <label className="label-mini">
                {t.Slot_Expert()}
            </label>
            <Combobox
                options={[{value: '', label: t.Slots_AllExperts()}, ...expertEntries.map(([id, expert]) => ({value: id, label: expert.display_name}))]}
                value={expertIds.size === 0 ? '' : (expertIds.size === 1 ? [...expertIds][0] : '')}
                onChange={val => onChange(val ? new Set([val]) : new Set())}
                placeholder={t.Slots_AllExperts()}
                searchPlaceholder={t.IM_Search() + '...'}
                emptyText={t.Filter_NoResults()}
                testId="filter-expert"
            />
        </>
    );
};
