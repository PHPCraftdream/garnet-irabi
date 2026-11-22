import * as React from 'react';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';

export function CancelReasonNotice({reason}: {reason: string}) {
    return (
        <div className="slot-cancel-reason-panel" data-test-id="slot-detail-cancel-reason">
            <div className="slot-detail-label">{t.Slot_CancelReason()}</div>
            <div className="slot-cancel-reason-text">{reason}</div>
        </div>
    );
}
