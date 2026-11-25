import * as React from 'react';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';

export class SlotsNoMatch extends React.Component<{onReset: () => void}> {
    /** Отрисовывает содержимое компонента. */
    public render() {
        return (
            <div className="slots-no-match" data-test-id="slots-no-match">
                <div className="slots-no-match-title">{t.Slots_NoMatch()}</div>
                <button
                    type="button"
                    className="slots-reset"
                    onClick={this.props.onReset}
                    data-test-id="slots-reset-filters"
                >
                    {t.Slot_Reset()}
                </button>
            </div>
        );
    }
}
