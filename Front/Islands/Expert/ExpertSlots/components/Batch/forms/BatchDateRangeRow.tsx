import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {I18nForeground as t} from '../../../../../../I18nGen/I18nForeground';
import {DateInput} from '@common/Components/ui/DateInput';

interface BatchFieldProps {
    label: string;
    children: React.ReactNode;
}

const BatchField: React.FC<BatchFieldProps> = ({label, children}) => (
    <div>
        <label className="batch-field-label">{label}</label>
        {children}
    </div>
);

interface BatchDateRangeRowProps { startDate: string; setStartDate: (v: string) => void; endDate: string; }

export class BatchDateRangeRow extends AntiHookComponent<BatchDateRangeRowProps> {
    /** Обработать соответствующее действие пользователя. */
    private readonly changeStartDate = (event: React.ChangeEvent<HTMLInputElement>) => {
        this.props.setStartDate(event.target.value);
    };

    /** Отобразить соответствующую часть интерфейса. */
    render() {
        const {startDate, endDate} = this.props;
        return (

            <div className="batch-date-row">
                <BatchField label={t.Batch_StartDate()}>
                    <DateInput name="start_date" data-test-id="batch-start-date" value={startDate}
                    onChange={this.changeStartDate} required />
                </BatchField>
                <BatchField label={t.Batch_EndDate()}>
                    <input
                        type="text"
                        className="batch-input"
                        data-test-id="batch-end-date"
                        value={endDate}
                        readOnly
                        disabled
                    />
                </BatchField>
            </div>
        );
    }
}

