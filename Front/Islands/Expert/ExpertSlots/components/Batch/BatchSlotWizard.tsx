import * as React from 'react';
import {useState, useMemo} from 'react';
import {D} from '@common/Support/Debug/D';
import {DurationSelect} from '@common/Components/Controls/DurationSelect';
import {DateInput} from '@common/Components/ui/DateInput';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {batchPreview, batchCreate} from '../../api';
import {useBatchSlots} from '../../hooks/useBatchSlots';
import {BatchPreviewSection} from './BatchPreviewSection';
import {SlotFormatFields} from '../Slot/SlotFormatFields';
import {Slot} from '../../types';

interface Props {
    onSuccess: (msg: string, newSlots?: Slot[]) => void;
    onError: (msg: string) => void;
    onConfirm: (message: string, items: string[]) => Promise<boolean>;
    onCancel?: () => void;
    defaultPenaltyPercent: number;
}

interface BatchFieldProps {
    label: string;
    children: React.ReactNode;
}

const BatchField: React.FC<BatchFieldProps> = ({label, children}) => (
    <div>
        <label className="form-label">{label}</label>
        {children}
    </div>
);

interface BatchDateRangeRowProps {
    startDate: string;
    setStartDate: (v: string) => void;
    endDate: string;
}

const BatchDateRangeRow: React.FC<BatchDateRangeRowProps> = ({startDate, setStartDate, endDate}) => (
    <div className="grid grid-cols-2 gap-3">
        <BatchField label={t.Batch_StartDate()}>
            <DateInput name="start_date" data-test-id="batch-start-date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
        </BatchField>
        <BatchField label={t.Batch_EndDate()}>
            <input type="text" className="form-control" data-test-id="batch-end-date" value={endDate} readOnly disabled />
        </BatchField>
    </div>
);

interface BatchParamsRowProps {
    count: number;
    setCount: (v: number) => void;
    perWeek: number;
    setPerWeek: (v: number) => void;
    batchTime: string;
    setBatchTime: (v: string) => void;
    batchDuration: number;
    setBatchDuration: (v: number) => void;
    batchCost: number;
    setBatchCost: (v: number) => void;
}

const BatchParamsRow: React.FC<BatchParamsRowProps> = ({count, setCount, perWeek, setPerWeek, batchTime, setBatchTime, batchDuration, setBatchDuration, batchCost, setBatchCost}) => (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <BatchField label={t.Batch_Count()}>
            <input type="number" name="count" data-test-id="batch-count" className="form-control" value={count} onChange={e => setCount(parseInt(e.target.value) || 1)} min={1} required />
        </BatchField>
        <BatchField label={t.Batch_PerWeek()}>
            <input type="number" name="per_week" data-test-id="batch-per-week" className="form-control" value={perWeek} onChange={e => setPerWeek(parseInt(e.target.value) || 1)} min={1} max={7} required />
        </BatchField>
        <BatchField label={t.Slot_Time()}>
            <DateInput type="time" name="batch_time" data-test-id="batch-time" value={batchTime} onChange={e => setBatchTime(e.target.value)} required />
        </BatchField>
        <BatchField label={t.Slot_Duration()}>
            <DurationSelect value={batchDuration} onChange={setBatchDuration} className="form-select" name="batch_duration" data-test-id="batch-duration" />
        </BatchField>
        <BatchField label={t.Slot_Cost()}>
            <input type="number" name="batch_cost" data-test-id="batch-cost" className="form-control" value={batchCost} onChange={e => setBatchCost(parseInt(e.target.value) || 0)} required />
        </BatchField>
    </div>
);

interface BatchPenaltyRowProps {
    penaltyPercent: number;
    setPenaltyPercent: (v: number) => void;
}

const BatchPenaltyRow: React.FC<BatchPenaltyRowProps> = ({penaltyPercent, setPenaltyPercent}) => (
    <div>
        <label className="form-label">{t.Slot_PenaltyPercent()}</label>
        <input
            type="number"
            name="batch_penalty_percent"
            data-test-id="batch-penalty-percent"
            className="form-control"
            min={0}
            max={100}
            value={penaltyPercent}
            onChange={e => setPenaltyPercent(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
        />
        <div className="text-xs text-muted mt-1">{t.Slot_PenaltyHelp()}</div>
    </div>
);

interface BatchFormatRowProps {
    batchIsOnline: boolean;
    setBatchIsOnline: (v: boolean) => void;
    batchLocation: string;
    setBatchLocation: (v: string) => void;
}

const BatchFormatRow: React.FC<BatchFormatRowProps> = ({batchIsOnline, setBatchIsOnline, batchLocation, setBatchLocation}) => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <SlotFormatFields
            isOnline={batchIsOnline}
            location={batchLocation}
            onIsOnlineChange={setBatchIsOnline}
            onLocationChange={setBatchLocation}
            idPrefix="batch"
        />
    </div>
);

interface BatchFormFooterProps {
    onCancel?: () => void;
    showPreview: boolean;
}

const BatchFormFooter: React.FC<BatchFormFooterProps> = ({onCancel, showPreview}) => (
    <div className="flex gap-2 justify-end mb-3">
        {onCancel && !showPreview && (
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
                {t.Batch_Cancel()}
            </button>
        )}
        <button type="submit" className="btn btn-primary" data-test-id="batch-preview-btn">{t.Batch_Preview()}</button>
    </div>
);

export const BatchSlotWizard: React.FC<Props> = ({onSuccess, onError, onConfirm, onCancel, defaultPenaltyPercent}) => {
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
    const [batchPenaltyPercent, setBatchPenaltyPercent] = useState(defaultPenaltyPercent);
    const [showPreview, setShowPreview] = useState(false);

    // Format + location are batch-wide: every slot in the party shares one
    // setting (per-slot format makes no sense for a recurring series).
    const [batchIsOnline, setBatchIsOnline] = useState(true);
    const [batchLocation, setBatchLocation] = useState('');

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
                id: crypto.randomUUID(),
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
        if (batch.hasPastDate()) return;
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
            const result = await batchCreate({
                slots: slotsPayload,
                cost: batchCost,
                cancellation_penalty_percent: batchPenaltyPercent,
                is_online: batchIsOnline,
                location: batchLocation,
            });

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
                    <BatchDateRangeRow startDate={startDate} setStartDate={setStartDate} endDate={endDate} />
                    <BatchParamsRow
                        count={count}
                        setCount={setCount}
                        perWeek={perWeek}
                        setPerWeek={setPerWeek}
                        batchTime={batchTime}
                        setBatchTime={setBatchTime}
                        batchDuration={batchDuration}
                        setBatchDuration={setBatchDuration}
                        batchCost={batchCost}
                        setBatchCost={setBatchCost}
                    />
                    <BatchPenaltyRow penaltyPercent={batchPenaltyPercent} setPenaltyPercent={setBatchPenaltyPercent} />
                    <BatchFormatRow
                        batchIsOnline={batchIsOnline}
                        setBatchIsOnline={setBatchIsOnline}
                        batchLocation={batchLocation}
                        setBatchLocation={setBatchLocation}
                    />
                </div>
                <BatchFormFooter onCancel={onCancel} showPreview={showPreview} />
            </form>

            {showPreview && (
                <BatchPreviewSection
                    startDate={startDate}
                    endDate={endDate}
                    batch={batch}
                    addSlotDate={addSlotDate}
                    setAddSlotDate={setAddSlotDate}
                    addSlotTime={addSlotTime}
                    setAddSlotTime={setAddSlotTime}
                    addSlotDuration={addSlotDuration}
                    setAddSlotDuration={setAddSlotDuration}
                    onAddSlot={handleAddSlot}
                    onDateClick={handleDateClick}
                    onCancel={onCancel}
                    onCreate={handleCreate}
                />
            )}
        </div>
    );
};
