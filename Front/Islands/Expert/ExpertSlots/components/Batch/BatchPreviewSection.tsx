import * as React from 'react';
import {DateInput} from '@common/Components/ui/DateInput';
import {DurationSelect} from '@common/Components/Controls/DurationSelect';
import {Calendar} from '@common/Components/Controls/Calendar';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {useBatchSlots} from '../../hooks/useBatchSlots';
import {BatchPreviewTable} from './BatchPreviewTable';

interface FieldProps {
    label: string;
    children: React.ReactNode;
}

const Field: React.FC<FieldProps> = ({label, children}) => (
    <div>
        <label className="form-label">{label}</label>
        {children}
    </div>
);

const DAY_NAMES = () => [t.Cal_Sun(), t.Cal_Mon(), t.Cal_Tue(), t.Cal_Wed(), t.Cal_Thu(), t.Cal_Fri(), t.Cal_Sat()];

interface Props {
    startDate: string;
    endDate: string;
    batch: ReturnType<typeof useBatchSlots>;
    addSlotDate: string;
    setAddSlotDate: (v: string) => void;
    addSlotTime: string;
    setAddSlotTime: (v: string) => void;
    addSlotDuration: number;
    setAddSlotDuration: (v: number) => void;
    onAddSlot: () => void;
    onDateClick: (date: string) => void;
    onCancel?: () => void;
    onCreate: () => void;
}

export const BatchPreviewSection: React.FC<Props> = ({startDate, endDate, batch, addSlotDate, setAddSlotDate, addSlotTime, setAddSlotTime, addSlotDuration, setAddSlotDuration, onAddSlot, onDateClick, onCancel, onCreate}) => (
    <div id="batchPreview">
        <hr className="my-3" />
        <div className="mb-3">
            <span className="badge bg-success">{t.Batch_Available()}</span>{' '}
            <span className="badge bg-danger">{t.Batch_Restricted()}</span>{' '}
            <span className="badge bg-primary">{t.Batch_Proposed()}</span>
        </div>

        <div className="mb-3">
            <Calendar
                startDate={startDate}
                endDate={endDate}
                dayNames={DAY_NAMES()}
                isProposed={batch.isProposed}
                restrictedDates={batch.restrictedDates}
                availableDates={batch.availableDates}
                onDateClick={onDateClick}
                idPrefix="batchCalendar"
                hideEmptyWeeks
            />
        </div>

        <h6>{t.Batch_ProposedDates()}:</h6>
        <BatchPreviewTable
            slots={batch.batchSlots}
            startDate={startDate}
            endDate={endDate}
            hasOverlap={batch.hasOverlap}
            hasProposedOverlap={batch.hasProposedOverlap}
            getDayItems={batch.getDayItems}
            onDateChange={batch.updateSlotDate}
            onTimeChange={batch.updateSlotTime}
            onDurationChange={batch.updateSlotDuration}
            onRemove={batch.removeSlot}
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 items-end" id="addSlotRow">
            <Field label={t.Slot_Date()}>
                <DateInput id="addSlotDate" value={addSlotDate} onChange={e => setAddSlotDate(e.target.value)} />
            </Field>
            <Field label={t.Slot_Time()}>
                <DateInput type="time" id="addSlotTime" value={addSlotTime} onChange={e => setAddSlotTime(e.target.value)} />
            </Field>
            <Field label={t.Slot_Duration()}>
                <DurationSelect value={addSlotDuration} onChange={setAddSlotDuration} className="form-select" id="addSlotDuration" />
            </Field>
            <div>
                <button type="button" id="addSlotBtn" className="btn btn-outline-primary w-full" title={t.Action_Add()} onClick={onAddSlot}>+</button>
            </div>
        </div>

        <p className="text-muted" id="batchStats">
            {t.Batch_AvailableDays()}: {Object.keys(batch.availableDates).length} | {t.Batch_RestrictedDays()}: {Object.keys(batch.restrictedDates).length} | {t.Batch_Proposed()}: {batch.batchSlots.length}
        </p>

        <div className="flex gap-2 justify-end">
            {onCancel && (
                <button type="button" className="btn btn-secondary" onClick={onCancel}>
                    {t.Batch_Cancel()}
                </button>
            )}
            <button
                type="button"
                id="batchCreateBtn"
                data-test-id="batch-create-btn"
                className="btn btn-success"
                disabled={batch.hasPastDate()}
                title={batch.hasPastDate() ? t.Batch_PastDate() : undefined}
                onClick={onCreate}
            >{t.Batch_CreateAll()}</button>
        </div>
    </div>
);
