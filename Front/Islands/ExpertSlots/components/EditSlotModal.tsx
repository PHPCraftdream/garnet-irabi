import * as React from 'react';
import {sendPost} from '@common/Api/Send/sendPost';
import {D} from '@common/Support/Debug/D';
import {useSending} from '@common/hooks/data/useSending';
import SendButton from '@common/Components/Controls/SendButton';
import {DateInput} from '@common/Components/ui/DateInput';
import {appUrl} from '@common/Utils/Url/appUrl';
import {tsToInputDate, tsToInputTime} from '@common/Utils/Time/DateUtils';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {ModalShell} from '../../../Common/Components/ModalShell';
import {Slot} from '../types';
import {SlotFormatFields} from './SlotFormatFields';

interface FieldProps {
    label: string;
    hint?: string;
    children: React.ReactNode;
}

const Field: React.FC<FieldProps> = ({label, hint, children}) => (
    <div>
        <label className="text-sm text-secondary mb-1 block">{label}</label>
        {children}
        {hint && <div className="text-xs text-muted mt-1">{hint}</div>}
    </div>
);

interface NumberFieldProps {
    label: string;
    hint?: string;
    value: number;
    min?: number;
    max?: number;
    locked: boolean;
    testId: string;
    onChange: (v: number) => void;
}

const NumberField: React.FC<NumberFieldProps> = ({label, hint, value, min, max, locked, testId, onChange}) => (
    <Field label={label} hint={hint}>
        <input
            type="number"
            className="form-control"
            value={value}
            onChange={e => onChange(Number(e.target.value))}
            min={min}
            max={max}
            disabled={locked}
            data-test-id={testId}
        />
    </Field>
);

interface Props {
    slot: Slot;
    onClose: () => void;
    onSaved: (updated: Slot) => void;
    onError: (msg: string) => void;
}

/**
 * Правка занятия.
 *
 * У забронированного слота меняется только место встречи: остальное — условия,
 * на которые человек уже согласился. Раньше эти поля выглядели такими же
 * активными, как разрешённое, и о запрете преподаватель узнавал только после
 * нажатия «Сохранить» (замечание expert-3). Теперь они заперты на вид, а
 * сверху сказано почему.
 */
export const EditSlotModal: React.FC<Props> = ({slot, onClose, onSaved, onError}) => {
    const {sending, withSending} = useSending();
    const locked = slot.status === 'booked';

    const [editDate, setEditDate] = React.useState(() => tsToInputDate(slot.start_at));
    const [editTime, setEditTime] = React.useState(() => tsToInputTime(slot.start_at));
    const [editDuration, setEditDuration] = React.useState(slot.duration_min ?? 60);
    const [editCost, setEditCost] = React.useState(slot.cost);
    const [editMaxUsers, setEditMaxUsers] = React.useState(slot.max_users ?? 1);
    const [editPenaltyPercent, setEditPenaltyPercent] = React.useState(slot.cancellation_penalty_percent ?? 0);
    const [editIsOnline, setEditIsOnline] = React.useState(Number(slot.is_online ?? 1) === 1);
    const [editLocation, setEditLocation] = React.useState(slot.location ?? '');
    const [validationError, setValidationError] = React.useState('');

    const handleSave = () => {
        setValidationError('');

        // Проверка «время в прошлом» делается на сервере в поясе преподавателя
        // (ExpertSlotsService::editSlot → DateUtils::parseUserDateTime).
        // Клиентский `new Date(date+T+time)` разобрал бы дату в поясе браузера.
        withSending(async () => {
            D('teaching.slot.edit', {slotId: slot.id, date: editDate, time: editTime});
            try {
                const csrf = (window as any).__GARNET_CSRF__ ?? '';
                const resp = await sendPost(appUrl('/expert/~editSlot'), {
                    CSRF_TOKEN: csrf,
                    slot_id: slot.id,
                    date: editDate,
                    time: editTime,
                    duration: editDuration,
                    cost: editCost,
                    max_users: editMaxUsers,
                    cancellation_penalty_percent: editPenaltyPercent,
                    is_online: editIsOnline ? 1 : 0,
                    location: editLocation,
                });
                onSaved((resp as any)?.slot ?? slot);
            } catch (e: any) {
                D('teaching.error', {action: 'editSlot', slotId: slot.id, error: e?.message});
                const resp = e?.response;
                if (resp && typeof resp === 'object' && resp.overlap) {
                    setValidationError(resp.error || t.Slot_OverlapError());
                    return;
                }
                onError((resp && typeof resp === 'object' && resp.error) ? resp.error : (e?.message || t.General_Error()));
            }
        });
    };

    return (
        <ModalShell title={t.Slot_EditTitle()} testId="edit-slot-modal" onClose={onClose}>
            {locked && (
                <div className="mb-3 text-sm p-2 rounded-lg bg-surface-alt" data-test-id="edit-slot-locked-notice">
                    {t.Slot_EditLockedNotice()}
                </div>
            )}
            {validationError && <div className="mb-3 text-sm text-danger">{validationError}</div>}
            <div className="space-y-3 mb-4">
                <Field label={t.Slot_Date()}>
                    <DateInput value={editDate} onChange={e => setEditDate(e.target.value)} disabled={locked} data-test-id="edit-slot-date" />
                </Field>
                <Field label={t.Slot_Time()}>
                    <DateInput type="time" value={editTime} onChange={e => setEditTime(e.target.value)} disabled={locked} data-test-id="edit-slot-time" />
                </Field>
                <NumberField label={t.Slot_Duration()} value={editDuration} min={15} locked={locked} testId="edit-slot-duration" onChange={setEditDuration} />
                <NumberField label={t.Slot_Cost()} value={editCost} min={0} locked={locked} testId="edit-slot-cost" onChange={setEditCost} />
                <NumberField
                    label={t.Slot_MaxUsers()}
                    value={editMaxUsers}
                    min={Math.max(1, slot.booked_count ?? 0)}
                    max={100}
                    locked={locked}
                    testId="edit-slot-max-users"
                    onChange={setEditMaxUsers}
                />
                <NumberField
                    label={t.Slot_PenaltyPercent()}
                    hint={t.Slot_PenaltyHelp()}
                    value={editPenaltyPercent}
                    min={0}
                    max={100}
                    locked={locked}
                    testId="edit-slot-penalty-percent"
                    onChange={setEditPenaltyPercent}
                />
                <SlotFormatFields
                    isOnline={editIsOnline}
                    location={editLocation}
                    onIsOnlineChange={setEditIsOnline}
                    onLocationChange={setEditLocation}
                    idPrefix="edit-slot"
                    labelClassName="text-sm text-secondary mb-1 block"
                    formatLocked={locked}
                />
            </div>
            <div className="flex gap-2 justify-end">
                <button type="button" className="btn btn-secondary" onClick={onClose} disabled={sending} data-test-id="edit-slot-cancel">
                    {t.Batch_Cancel()}
                </button>
                <SendButton onClick={handleSave} sending={sending} label={t.Slot_Save()} testId="edit-slot-save" />
            </div>
        </ModalShell>
    );
};
