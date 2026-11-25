import * as React from 'react';
import {SupportStatus} from './supportTypes';
import {statusLabel} from './render/supportStatus';

/** Рисует подпись статуса обращения. */
export function StatusBadge({status}: {status: SupportStatus}) {
    return <span className="support-ticket-status" data-ticket-status={status}>{statusLabel(status)}</span>;
}
