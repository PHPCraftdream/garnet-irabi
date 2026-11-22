import * as React from 'react';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';

export class OwnSlotsHiddenNotice extends React.Component {
    public render() {
        return (
            <p className="slots-own-notice" data-test-id="own-slots-hidden-notice">
                {t.Slots_OwnHiddenNotice()}
            </p>
        );
    }
}
