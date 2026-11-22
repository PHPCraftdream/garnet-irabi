import * as React from 'react';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import type {Slot} from '../../types';
import {ExpertSlotModalShell} from '../Slot/ExpertSlotModalShell';
import {BatchSlotWizard} from './BatchSlotWizard';

interface Props {
    open: boolean;
    onClose: () => void;
    onSuccess: (msg: string, newSlots?: Slot[]) => void;
    onError: (msg: string) => void;
    onConfirm: (message: string, items: string[]) => Promise<boolean>;
    defaultPenaltyPercent: number;
}

export function BatchSlotModal({open, onClose, onSuccess, onError, onConfirm, defaultPenaltyPercent}: Props) {
    if (!open) return null;
    return (
        <ExpertSlotModalShell title={t.Batch_Title()} testId="batch-slot-modal" size="batch" onClose={onClose}>
            <BatchSlotWizard
                onSuccess={onSuccess}
                onError={onError}
                onConfirm={onConfirm}
                onCancel={onClose}
                defaultPenaltyPercent={defaultPenaltyPercent}
            />
        </ExpertSlotModalShell>
    );
}
