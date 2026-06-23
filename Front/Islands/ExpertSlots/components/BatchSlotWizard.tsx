import * as React from 'react';
import {useState, useMemo} from 'react';
import {D} from '@common/Debug/D';
import {DurationSelect} from '@common/Components/DurationSelect';
import {DateInput} from '@common/Components/ui/DateInput';
import {Calendar} from '@common/Components/Calendar';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {batchPreview, batchCreate} from '../api';
import {useBatchSlots} from '../hooks/useBatchSlots';
import {BatchPreviewTable} from './BatchPreviewTable';
import {Slot} from '../types';

const DAY_NAMES = () => [t.Cal_Sun(), t.Cal_Mon(), t.Cal_Tue(), t.Cal_Wed(), t.Cal_Thu(), t.Cal_Fri(), t.Cal_Sat()];

interface Props {
    onSuccess: (msg: string, newSlots?: Slot[]) => void;
    onError: (msg: string) => void;
    onConfirm: (message: string, items: string[]) => Promise<boolean>;
    onCancel?: () => void;
}

export const BatchSlotWizard: React.FC<Props> = ({onSuccess, onError, onConfirm, onCancel}) => {
    const [startDate, setStartDate] = useState(() => {
        const d = new Date(); d.setDate(d.getDate() + 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    const [perWeek, setPerWeek] = useState(2);
    const [count, setCount] = useState(4);
    const endDate = useMemo(() => {
        if (!startDate || count <= 0 || perWeek <= 0) return '';
        const weeks = Math.ceil(count / perWeek);
        const d = new Date(startDate + 'T00:00:00');
        d.setDate(d.getDate() + weeks * 7);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }, [startDate, count, perWeek]);

    const [batchTime, setBatchTime] = useState('10:00');
    const [batchDuration, setBatchDuration] = useState(60);
    const [batchCost, setBatchCost] = useState(500);
    const [showPreview, setShowPreview] = useState(false);

    const [addSlotDate, setAddSlotDate] = useState('');
    const [addSlotTime, setAddSlotTime] = useState('10:00');
    const [addSlotDuration, setAddSlotDuration] = useState(60);

    const batch = useBatchSlots();

    const handlePreview = async (e: React.FormEvent) => {
        e.preventDefault();
        D('teaching.batch.preview', {startDate, endDate, count});
        try {
            const data = await batchPreview({
                start_date: startDate,
                end_date: endDate,
                count,
                batch_time: batchTime,
                batch_duration: batchDuration,
            });

            if ((data as any).error) {
                D('teaching.error', {action: 'batchPreview', error: (data as any).error});
                onError((data as any).error);
                return;
            }

            const avail: Record<string, string> = {};
            data.availableDates.forEach(d => { avail[d.date] = d.hebrewDate; });
            batch.setAvailableDates(avail);

            const restricted: Record<string, string> = {};
            data.restrictedDates.forEach(d => { restricted[d.date] = d.reason; });
            batch.setRestrictedDates(restricted);

            batch.setExistingSlots(data.existingSlots || []);

            const proposed = data.proposedDates.map(d => ({
                date: d.date,
                hebrewDate: d.hebrewDate,
                time: batchTime,
                duration: batchDuration,
            }));
            batch.setBatchSlots(proposed);
            D('teaching.batch.preview.loaded', {proposed: proposed.length, available: Object.keys(avail).length});
            setShowPreview(true);
        } catch (err: any) {
            D('teaching.error', {action: 'batchPreview', error: err.message});
            onError(err.message);
        }
    };

    const handleCreate = async () => {
        if (!batch.batchSlots.length) return;
        D('teaching.batch.create', {slotsCount: batch.batchSlots.length, cost: batchCost});

        const items = batch.batchSlots.map(s => {
            let text = `${s.date} ${s.time} (${s.duration} ${t.Slot_Duration_Min()})`;
            if (batch.hasOverlap(s.date, s.time, s.duration)) {
                text += ` \u26a0 ${t.Batch_Overlap()}`;
            }
            return text;
        });

        const confirmed = await onConfirm(t.Batch_ConfirmCreate() + batch.batchSlots.length + '?', items);
        if (!confirmed) return;

        try {
            const slotsPayload = batch.batchSlots.map(s => ({date: s.date, time: s.time, duration: s.duration}));
            const result = await batchCreate({slots: slotsPayload, cost: batchCost});

            if (result.success) {
                D('teaching.batch.created', {created: result.created, overlaps: result.overlaps?.length ?? 0});
                let msg = t.Batch_Created() + result.created;
                if (result.overlaps?.length > 0) {
                    msg += ` (${result.overlaps.length} ${t.Batch_Overlap()})`;
                }
                onSuccess(msg, result.slots);
            } else {
                D('teaching.error', {action: 'batchCreate', error: result.error});
                onError(result.error || t.General_Error());
            }
        } catch (err: any) {
            D('teaching.error', {action: 'batchCreate', error: err.message});
            onError(err.message);
        }
    };

    const handleDateClick = (date: string) => {
        if (batch.isProposed(date)) {
            const idx = batch.batchSlots.findIndex(s => s.date === date);
            if (idx >= 0) batch.removeSlot(idx);
        } else {
            batch.addSlot(date, batchTime, batchDuration);
        }
    };

    const handleAddSlot = () => {
        if (!addSlotDate || batch.isProposed(addSlotDate)) return;
        batch.addSlot(addSlotDate, addSlotTime, addSlotDuration);
        setAddSlotDate('');
    };

    return (
        <div>
            <form id="batchForm" onSubmit={handlePreview}>
                <div className="space-y-3 mb-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="form-label">{t.Batch_StartDate()}</label>
                            <DateInput name="start_date" data-test-id="batch-start-date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
                        </div>
                        <div>
                            <label className="form-label">{t.Batch_EndDate()}</label>
                            <input type="text" className="form-control" data-test-id="batch-end-date" value={endDate} readOnly disabled />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <div>
                            <label className="form-label">{t.Batch_Count()}</label>
                            <input type="number" name="count" data-test-id="batch-count" className="form-control" value={count} onChange={e => setCount(parseInt(e.target.value) || 1)} min={1} required />
                        </div>
                        <div>
                            <label className="form-label">{t.Batch_PerWeek()}</label>
                            <input type="number" name="per_week" data-test-id="batch-per-week" className="form-control" value={perWeek} onChange={e => setPerWeek(parseInt(e.target.value) || 1)} min={1} max={7} required />
                        </div>
                        <div>
                            <label className="form-label">{t.Slot_Time()}</label>
                            <DateInput type="time" name="batch_time" data-test-id="batch-time" value={batchTime} onChange={e => setBatchTime(e.target.value)} required />
                        </div>
                        <div>
                            <label className="form-label">{t.Slot_Duration()}</label>
                            <DurationSelect value={batchDuration} onChange={setBatchDuration} className="form-select" name="batch_duration" data-test-id="batch-duration" />
                        </div>
                        <div>
                            <label className="form-label">{t.Slot_Cost()}</label>
                            <input type="number" name="batch_cost" data-test-id="batch-cost" className="form-control" value={batchCost} onChange={e => setBatchCost(parseInt(e.target.value) || 0)} required />
                        </div>
                    </div>
                </div>
                <div className="flex gap-2 justify-end mb-3">
                    {onCancel && !showPreview && (
                        <button type="button" className="btn btn-secondary" onClick={onCancel}>
                            {t.Batch_Cancel()}
                        </button>
                    )}
                    <button type="submit" className="btn btn-primary" data-test-id="batch-preview-btn">{t.Batch_Preview()}</button>
                </div>
            </form>

            {showPreview && (
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
                            onDateClick={handleDateClick}
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
                        <div>
                            <label className="form-label">{t.Slot_Date()}</label>
                            <DateInput id="addSlotDate" value={addSlotDate} onChange={e => setAddSlotDate(e.target.value)} />
                        </div>
                        <div>
                            <label className="form-label">{t.Slot_Time()}</label>
                            <DateInput type="time" id="addSlotTime" value={addSlotTime} onChange={e => setAddSlotTime(e.target.value)} />
                        </div>
                        <div>
                            <label className="form-label">{t.Slot_Duration()}</label>
                            <DurationSelect value={addSlotDuration} onChange={setAddSlotDuration} className="form-select" id="addSlotDuration" />
                        </div>
                        <div>
                            <button type="button" id="addSlotBtn" className="btn btn-outline-primary w-full" title={t.Action_Add()} onClick={handleAddSlot}>+</button>
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
                        <button type="button" id="batchCreateBtn" data-test-id="batch-create-btn" className="btn btn-success" onClick={handleCreate}>{t.Batch_CreateAll()}</button>
                    </div>
                </div>
            )}
        </div>
    );
};
