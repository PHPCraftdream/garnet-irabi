import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import {D} from '@common/Support/Debug/D';
import {DurationSelect} from '@common/Components/Controls/DurationSelect';
import {DateInput} from '@common/Components/ui/DateInput';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {batchPreview, batchCreate} from '../../api';
import {BatchSlotsState, anyPastDate, findExistingOverlap} from './BatchSlotsState';
import {BatchPreviewSection} from './BatchPreviewSection';
import {SlotFormatFields} from '../Slot/SlotFormatFields';
import {ProposedSlot, Slot} from '../../types';

export interface BatchSlotWizardProps {
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
        <label className="batch-field-label">{label}</label>
        {children}
    </div>
);

interface BatchDateRangeRowProps {
    startDate: string;
    setStartDate: (v: string) => void;
    endDate: string;
}

class BatchDateRangeRow extends AntiHookComponent<BatchDateRangeRowProps> {
    private readonly changeStartDate = (event: React.ChangeEvent<HTMLInputElement>) => {
        this.props.setStartDate(event.target.value);
    };

    render() {
        const {startDate, endDate} = this.props;
        return (

            <div className="batch-date-row">
                <BatchField label={t.Batch_StartDate()}>
                    <DateInput name="start_date" data-test-id="batch-start-date" value={startDate} onChange={this.changeStartDate} required />
                </BatchField>
                <BatchField label={t.Batch_EndDate()}>
                    <input type="text" className="batch-input" data-test-id="batch-end-date" value={endDate} readOnly disabled />
                </BatchField>
            </div>
        );
    }
}

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

class BatchParamsRow extends AntiHookComponent<BatchParamsRowProps> {
    private readonly changeCount = (event: React.ChangeEvent<HTMLInputElement>) => {
        this.props.setCount(parseInt(event.target.value) || 1);
    };

    private readonly changePerWeek = (event: React.ChangeEvent<HTMLInputElement>) => {
        this.props.setPerWeek(parseInt(event.target.value) || 1);
    };

    private readonly changeTime = (event: React.ChangeEvent<HTMLInputElement>) => {
        this.props.setBatchTime(event.target.value);
    };

    private readonly changeCost = (event: React.ChangeEvent<HTMLInputElement>) => {
        this.props.setBatchCost(parseInt(event.target.value) || 0);
    };

    render() {
        const {count, perWeek, batchTime, batchDuration, setBatchDuration, batchCost} = this.props;
        return (

            <div className="batch-params-row">
                <BatchField label={t.Batch_Count()}>
                    <input type="number" name="count" data-test-id="batch-count" className="batch-input" value={count} onChange={this.changeCount} min={1} required />
                </BatchField>
                <BatchField label={t.Batch_PerWeek()}>
                    <input type="number" name="per_week" data-test-id="batch-per-week" className="batch-input" value={perWeek} onChange={this.changePerWeek} min={1} max={7} required />
                </BatchField>
                <BatchField label={t.Slot_Time()}>
                    <DateInput type="time" name="batch_time" data-test-id="batch-time" value={batchTime} onChange={this.changeTime} required />
                </BatchField>
                <BatchField label={t.Slot_Duration()}>
                    <DurationSelect value={batchDuration} onChange={setBatchDuration} name="batch_duration" data-test-id="batch-duration" />
                </BatchField>
                <BatchField label={t.Slot_Cost()}>
                    <input type="number" name="batch_cost" data-test-id="batch-cost" className="batch-input" value={batchCost} onChange={this.changeCost} required />
                </BatchField>
            </div>
        );
    }
}

interface BatchPenaltyRowProps {
    penaltyPercent: number;
    setPenaltyPercent: (v: number) => void;
}

class BatchPenaltyRow extends AntiHookComponent<BatchPenaltyRowProps> {
    private readonly changePenalty = (event: React.ChangeEvent<HTMLInputElement>) => {
        this.props.setPenaltyPercent(Math.max(0, Math.min(100, parseInt(event.target.value) || 0)));
    };

    render() {
        const {penaltyPercent} = this.props;
        return (

            <div>
                <label className="batch-field-label">{t.Slot_PenaltyPercent()}</label>
                <input
                    type="number"
                    name="batch_penalty_percent"
                    data-test-id="batch-penalty-percent"
                    className="batch-input"
                    min={0}
                    max={100}
                    value={penaltyPercent}
                    onChange={this.changePenalty}
                />
                <div className="batch-help">{t.Slot_PenaltyHelp()}</div>
            </div>
        );
    }
}

interface BatchFormatRowProps {
    batchIsOnline: boolean;
    setBatchIsOnline: (v: boolean) => void;
    batchLocation: string;
    setBatchLocation: (v: string) => void;
}

const BatchFormatRow: React.FC<BatchFormatRowProps> = ({batchIsOnline, setBatchIsOnline, batchLocation, setBatchLocation}) => (
    <div className="batch-format-row">
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
    <div className="batch-form-footer">
        {onCancel && !showPreview && (
            <button type="button" className="confirm-modal-cancel" onClick={onCancel}>
                {t.Batch_Cancel()}
            </button>
        )}
        <button type="submit" className="primary-action-button" data-test-id="batch-preview-btn">{t.Batch_Preview()}</button>
    </div>
);

function tomorrowDate(): string {
    const d = new Date(); d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toSlotPayload(slot: ProposedSlot) {
    return {date: slot.date, time: slot.time, duration: slot.duration};
}

interface FormState {
    startDate: string;
    perWeek: number;
    count: number;
    batchTime: string;
    batchDuration: number;
    batchCost: number;
    batchPenaltyPercent: number;
    showPreview: boolean;
    batchIsOnline: boolean;
    batchLocation: string;
    addSlotDate: string;
    addSlotTime: string;
    addSlotDuration: number;
}

function calculateEndDate(startDate: string, count: number, perWeek: number): string {
    if (!startDate || count <= 0 || perWeek <= 0) return '';
    const weeks = Math.ceil(count / perWeek);
    const d = new Date(startDate + 'T00:00:00');
    d.setDate(d.getDate() + weeks * 7);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export class BatchSlotWizard extends AntiHookComponent<BatchSlotWizardProps> {
    private readonly batch = new BatchSlotsState();
    private readonly form = new Carburetor<FormState>({
        startDate: tomorrowDate(),
        perWeek: 2,
        count: 4,
        batchTime: '10:00',
        batchDuration: 60,
        batchCost: 500,
        batchPenaltyPercent: this.props.defaultPenaltyPercent,
        showPreview: false,
        batchIsOnline: true,
        batchLocation: '',
        addSlotDate: '',
        addSlotTime: '10:00',
        addSlotDuration: 60,
    });

    private updateForm(patch: Partial<FormState>): void {
        this.form.setData({...this.form.getData(), ...patch});
    }

    private readonly setStartDate = (startDate: string) => this.updateForm({startDate});
    private readonly setPerWeek = (perWeek: number) => this.updateForm({perWeek});
    private readonly setCount = (count: number) => this.updateForm({count});
    private readonly setBatchTime = (batchTime: string) => this.updateForm({batchTime});
    private readonly setBatchDuration = (batchDuration: number) => this.updateForm({batchDuration});
    private readonly setBatchCost = (batchCost: number) => this.updateForm({batchCost});
    private readonly setBatchPenaltyPercent = (batchPenaltyPercent: number) => this.updateForm({batchPenaltyPercent});
    private readonly setBatchIsOnline = (batchIsOnline: boolean) => this.updateForm({batchIsOnline});
    private readonly setBatchLocation = (batchLocation: string) => this.updateForm({batchLocation});
    private readonly setAddSlotDate = (addSlotDate: string) => this.updateForm({addSlotDate});
    private readonly setAddSlotTime = (addSlotTime: string) => this.updateForm({addSlotTime});
    private readonly setAddSlotDuration = (addSlotDuration: number) => this.updateForm({addSlotDuration});

    private readonly handlePreview = async (e: React.FormEvent) => {
        e.preventDefault();
        const {onError} = this.props;
        const {startDate, count, perWeek, batchTime, batchDuration} = this.form.getData();
        const endDate = calculateEndDate(startDate, count, perWeek);
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

            const restricted: Record<string, string> = {};
            data.restrictedDates.forEach(d => { restricted[d.date] = d.reason; });

            const proposed = data.proposedDates.map(d => ({
                id: crypto.randomUUID(),
                date: d.date,
                hebrewDate: d.hebrewDate,
                time: batchTime,
                duration: batchDuration,
            }));
            this.batch.replacePreview({batchSlots: proposed, existingSlots: data.existingSlots || [], availableDates: avail, restrictedDates: restricted});
            D('teaching.batch.preview.loaded', {proposed: proposed.length, available: Object.keys(avail).length});
            this.updateForm({showPreview: true});
        } catch (err: any) {
            D('teaching.error', {action: 'batchPreview', error: err.message});
            onError(err.message);
        }
    };

    private readonly handleCreate = async () => {
        const {onConfirm, onSuccess, onError} = this.props;
        const {batchSlots, existingSlots} = this.batch.getData();
        const {batchCost, batchPenaltyPercent, batchIsOnline, batchLocation} = this.form.getData();
        if (!batchSlots.length) return;
        if (anyPastDate(batchSlots)) return;
        D('teaching.batch.create', {slotsCount: batchSlots.length, cost: batchCost});

        const items: string[] = [];
        for (const {date, time, duration} of batchSlots) {
            let text = `${date} ${time} (${duration} ${t.Slot_Duration_Min()})`;
            if (findExistingOverlap(existingSlots, date, time, duration)) {
                text += ` \u26a0 ${t.Batch_Overlap()}`;
            }
            items.push(text);
        }

        const confirmed = await onConfirm(t.Batch_ConfirmCreate() + batchSlots.length + '?', items);
        if (!confirmed) return;

        try {
            const slotsPayload = batchSlots.map(toSlotPayload);
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

    private readonly handleDateClick = (date: string) => {
        const {batchSlots} = this.batch.getData();
        const {batchTime, batchDuration} = this.form.getData();
        const index = batchSlots.findIndex(slot => slot.date === date);
        if (index >= 0) this.batch.removeSlot(index);
        else this.batch.addSlot(date, batchTime, batchDuration);
    };

    private readonly handleAddSlot = () => {
        const {batchSlots} = this.batch.getData();
        const {addSlotDate, addSlotTime, addSlotDuration} = this.form.getData();
        if (!addSlotDate || batchSlots.some(slot => slot.date === addSlotDate)) return;
        this.batch.addSlot(addSlotDate, addSlotTime, addSlotDuration);
        this.setAddSlotDate('');
    };

    private renderForm(state: FormState, endDate: string) {
        const {startDate, count, perWeek, batchTime, batchDuration, batchCost, batchPenaltyPercent, batchIsOnline, batchLocation, showPreview} = state;
        const {onCancel} = this.props;
        return (
            <form id="batchForm" onSubmit={this.handlePreview}>
                <div className="batch-form-fields">
                    <BatchDateRangeRow startDate={startDate} setStartDate={this.setStartDate} endDate={endDate} />
                    <BatchParamsRow
                        count={count}
                        setCount={this.setCount}
                        perWeek={perWeek}
                        setPerWeek={this.setPerWeek}
                        batchTime={batchTime}
                        setBatchTime={this.setBatchTime}
                        batchDuration={batchDuration}
                        setBatchDuration={this.setBatchDuration}
                        batchCost={batchCost}
                        setBatchCost={this.setBatchCost}
                    />
                    <BatchPenaltyRow penaltyPercent={batchPenaltyPercent} setPenaltyPercent={this.setBatchPenaltyPercent} />
                    <BatchFormatRow
                        batchIsOnline={batchIsOnline}
                        setBatchIsOnline={this.setBatchIsOnline}
                        batchLocation={batchLocation}
                        setBatchLocation={this.setBatchLocation}
                    />
                </div>
                <BatchFormFooter onCancel={onCancel} showPreview={showPreview} />
            </form>
        );
    }

    private renderPreview(state: FormState, endDate: string) {
        const {showPreview, startDate, addSlotDate, addSlotTime, addSlotDuration} = state;
        const {onCancel} = this.props;
        if (!showPreview) return null;
        return (
            <BatchPreviewSection
                startDate={startDate}
                endDate={endDate}
                batch={this.batch}
                addSlotDate={addSlotDate}
                setAddSlotDate={this.setAddSlotDate}
                addSlotTime={addSlotTime}
                setAddSlotTime={this.setAddSlotTime}
                addSlotDuration={addSlotDuration}
                setAddSlotDuration={this.setAddSlotDuration}
                onAddSlot={this.handleAddSlot}
                onDateClick={this.handleDateClick}
                onCancel={onCancel}
                onCreate={this.handleCreate}
            />
        );
    }

    render() {
        const state = this.useCarburetor(this.form);
        const endDate = calculateEndDate(state.startDate, state.count, state.perWeek);
        return (
            <div>
                {this.renderForm(state, endDate)}
                {this.renderPreview(state, endDate)}
            </div>
        );
    }
}
