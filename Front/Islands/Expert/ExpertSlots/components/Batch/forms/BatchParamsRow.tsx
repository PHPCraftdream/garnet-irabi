import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {I18nForeground as t} from '../../../../../../I18nGen/I18nForeground';
import {DurationSelect} from '@common/Components/Controls/DurationSelect';
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

interface BatchParamsRowProps {
    count: number;
    setCount: (v: number) => void;
    perWeek: number;
    setPerWeek: (v: number) => void;
    batchTime: string;
    setBatchTime: (v: string) => void;
    batchDuration: number;
    setBatchDuration: (v: number) => void;
    batchCost: number;
    setBatchCost: (v: number) => void;
}

export class BatchParamsRow extends AntiHookComponent<BatchParamsRowProps> {
    /** Отобразить поле количества занятий. */
    private renderCountField() {
        const {count} = this.props;
        return (
            <BatchField label={t.Batch_Count()}>
                <input
                    type="number"
                    name="count"
                    data-test-id="batch-count"
                    className="batch-input"
                    value={count}
                    onChange={this.changeCount}
                    min={1}
                    required
                />
            </BatchField>
        );
    }

    /** Отобразить поле частоты занятий за неделю. */
    private renderPerWeekField() {
        const {perWeek} = this.props;
        return (
            <BatchField label={t.Batch_PerWeek()}>
                <input
                    type="number"
                    name="per_week"
                    data-test-id="batch-per-week"
                    className="batch-input"
                    value={perWeek}
                    onChange={this.changePerWeek}
                    min={1}
                    max={7}
                    required
                />
            </BatchField>
        );
    }

    /** Отобразить поле времени занятий. */
    private renderTimeField() {
        const {batchTime} = this.props;
        return (
            <BatchField label={t.Slot_Time()}>
                <DateInput
                    type="time"
                    name="batch_time"
                    data-test-id="batch-time"
                    value={batchTime}
                    onChange={this.changeTime}
                    required
                />
            </BatchField>
        );
    }

    /** Отобразить поле длительности занятий. */
    private renderDurationField() {
        const {batchDuration, setBatchDuration} = this.props;
        return (
            <BatchField label={t.Slot_Duration()}>
                <DurationSelect
                    value={batchDuration}
                    onChange={setBatchDuration}
                    name="batch_duration"
                    data-test-id="batch-duration"
                />
            </BatchField>
        );
    }

    /** Отобразить поле стоимости занятий. */
    private renderCostField() {
        const {batchCost} = this.props;
        return (
            <BatchField label={t.Slot_Cost()}>
                <input
                    type="number"
                    name="batch_cost"
                    data-test-id="batch-cost"
                    className="batch-input"
                    value={batchCost}
                    onChange={this.changeCost}
                    required
                />
            </BatchField>
        );
    }

    /** Обработать соответствующее действие пользователя. */
    private readonly changeCount = (event: React.ChangeEvent<HTMLInputElement>) => {
        this.props.setCount(parseInt(event.target.value) || 1);
    };

    /** Обработать соответствующее действие пользователя. */
    private readonly changePerWeek = (event: React.ChangeEvent<HTMLInputElement>) => {
        this.props.setPerWeek(parseInt(event.target.value) || 1);
    };

    /** Обработать соответствующее действие пользователя. */
    private readonly changeTime = (event: React.ChangeEvent<HTMLInputElement>) => {
        this.props.setBatchTime(event.target.value);
    };

    /** Обработать соответствующее действие пользователя. */
    private readonly changeCost = (event: React.ChangeEvent<HTMLInputElement>) => {
        this.props.setBatchCost(parseInt(event.target.value) || 0);
    };

    /** Отобразить соответствующую часть интерфейса. */
    render() {
        return (

            <div className="batch-params-row">
                {this.renderCountField()}
                {this.renderPerWeekField()}
                {this.renderTimeField()}
                {this.renderDurationField()}
                {this.renderCostField()}
            </div>
        );
    }
}

