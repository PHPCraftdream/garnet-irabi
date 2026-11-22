import * as React from 'react';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import type {IFromFieldsInfo} from '@common/Dom/GridTable/Models';
import type {Slot} from '../../types';
import {CreateSlotForm} from './CreateSlotForm';
import {ExpertSlotModalShell} from './ExpertSlotModalShell';

interface Props {
    open: boolean;
    onClose: () => void;
    onSuccess: (newSlot?: Slot) => void;
    onError: (msg: string) => void;
    fieldsInfo: IFromFieldsInfo;
    defaultPenaltyPercent: number;
}

export function CreateSlotModal({open, onClose, onSuccess, onError, fieldsInfo, defaultPenaltyPercent}: Props) {
    if (!open) return null;
    return (
        <ExpertSlotModalShell title={t.Slot_Create()} testId="create-slot-modal" size="single" onClose={onClose}>
            <CreateSlotForm
                onSuccess={onSuccess}
                onError={onError}
                fieldsInfo={fieldsInfo}
                defaultPenaltyPercent={defaultPenaltyPercent}
                onCancel={onClose}
            />
        </ExpertSlotModalShell>
    );
}
