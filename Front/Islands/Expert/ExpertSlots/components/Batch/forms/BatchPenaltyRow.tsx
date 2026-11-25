import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {I18nForeground as t} from '../../../../../../I18nGen/I18nForeground';

interface BatchPenaltyRowProps { penaltyPercent: number; setPenaltyPercent: (v: number) => void; }

export class BatchPenaltyRow extends AntiHookComponent<BatchPenaltyRowProps> {
    /** Обработать соответствующее действие пользователя. */
    private readonly changePenalty = (event: React.ChangeEvent<HTMLInputElement>) => {
        this.props.setPenaltyPercent(Math.max(0, Math.min(100, parseInt(event.target.value) || 0)));
    };

    /** Отобразить соответствующую часть интерфейса. */
    render() {
        const {penaltyPercent} = this.props;
        return (

            <div>
                <label className="batch-field-label">{t.Slot_PenaltyPercent()}</label>
                <input
                    type="number"
                    name="batch_penalty_percent"
                    data-test-id="batch-penalty-percent"
                    className="batch-input"
                    min={0}
                    max={100}
                    value={penaltyPercent}
                    onChange={this.changePenalty}
                />
                <div className="batch-help">{t.Slot_PenaltyHelp()}</div>
            </div>
        );
    }
}

