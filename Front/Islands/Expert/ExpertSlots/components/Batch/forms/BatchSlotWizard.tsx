import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import {D} from '@common/Support/Debug/D';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import {batchPreview} from '@/Islands/Expert/ExpertSlots/components/Batch/logic/batchPreview';
import {batchCreate} from '@/Islands/Expert/ExpertSlots/components/Batch/logic/batchCreate';
import {BatchSlotsState} from '@/Islands/Expert/ExpertSlots/components/Batch/logic/BatchSlotsState';
import {anyPastDate} from '@/Islands/Expert/ExpertSlots/components/Batch/Preview/anyPastDate';
import {findExistingOverlap} from '@/Islands/Expert/ExpertSlots/components/Batch/Preview/findExistingOverlap';
import {BatchPreviewSection} from '@/Islands/Expert/ExpertSlots/components/Batch/Preview/BatchPreviewSection';
import {ProposedSlot, Slot} from '@/Islands/Expert/ExpertSlots/types';

export interface BatchSlotWizardProps {
    onSuccess: (msg: string, newSlots?: Slot[]) => void;
    onError: (msg: string) => void;
    onConfirm: (message: string, items: string[]) => Promise<boolean>;
    onCancel?: () => void;
    defaultPenaltyPercent: number;
}

import {BatchDateRangeRow} from './BatchDateRangeRow';
import {BatchParamsRow} from './BatchParamsRow';
import {BatchPenaltyRow} from './BatchPenaltyRow';
import {BatchFormatRow} from './BatchFormatRow';
import {BatchFormFooter} from './BatchFormFooter';

/** Подготовить данные для соответствующего интерфейса. */
function tomorrowDate(): string {
    const d = new Date(); d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Подготовить данные для соответствующего интерфейса. */
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

/** Подготовить данные для соответствующего интерфейса. */
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

    /** Обработать соответствующее действие пользователя. */
    private updateForm(patch: Partial<FormState>): void {
        this.form.setData({...this.form.getData(), ...patch});
    }

    /** Обработать соответствующее действие пользователя. */
    private readonly setStartDate = (startDate: string) => this.updateForm({startDate});
    /** Обработать соответствующее действие пользователя. */
    private readonly setPerWeek = (perWeek: number) => this.updateForm({perWeek});
    /** Обработать соответствующее действие пользователя. */
    private readonly setCount = (count: number) => this.updateForm({count});
    /** Обработать соответствующее действие пользователя. */
    private readonly setBatchTime = (batchTime: string) => this.updateForm({batchTime});
    /** Обработать соответствующее действие пользователя. */
    private readonly setBatchDuration = (batchDuration: number) => this.updateForm({batchDuration});
    /** Обработать соответствующее действие пользователя. */
    private readonly setBatchCost = (batchCost: number) => this.updateForm({batchCost});
    /** Обработать соответствующее действие пользователя. */
    private readonly setBatchPenaltyPercent = (batchPenaltyPercent: number) => this.updateForm({batchPenaltyPercent});
    /** Обработать соответствующее действие пользователя. */
    private readonly setBatchIsOnline = (batchIsOnline: boolean) => this.updateForm({batchIsOnline});
    /** Обработать соответствующее действие пользователя. */
    private readonly setBatchLocation = (batchLocation: string) => this.updateForm({batchLocation});
    /** Обработать соответствующее действие пользователя. */
    private readonly setAddSlotDate = (addSlotDate: string) => this.updateForm({addSlotDate});
    /** Обработать соответствующее действие пользователя. */
    private readonly setAddSlotTime = (addSlotTime: string) => this.updateForm({addSlotTime});
    /** Обработать соответствующее действие пользователя. */
    private readonly setAddSlotDuration = (addSlotDuration: number) => this.updateForm({addSlotDuration});

    /** Обработать соответствующее действие пользователя. */
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
            this.batch.replacePreview({batchSlots: proposed, existingSlots: data.existingSlots || [], availableDates:
            avail, restrictedDates: restricted});
            D('teaching.batch.preview.loaded', {proposed: proposed.length, available: Object.keys(avail).length});
            this.updateForm({showPreview: true});
        } catch (err: any) {
            D('teaching.error', {action: 'batchPreview', error: err.message});
            onError(err.message);
        }
    };

    /** Обработать соответствующее действие пользователя. */
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

    /** Обработать соответствующее действие пользователя. */
    private readonly handleDateClick = (date: string) => {
        const {batchSlots} = this.batch.getData();
        const {batchTime, batchDuration} = this.form.getData();
        const index = batchSlots.findIndex(slot => slot.date === date);
        if (index >= 0) this.batch.removeSlot(index);
        else this.batch.addSlot(date, batchTime, batchDuration);
    };

    /** Обработать соответствующее действие пользователя. */
    private readonly handleAddSlot = () => {
        const {batchSlots} = this.batch.getData();
        const {addSlotDate, addSlotTime, addSlotDuration} = this.form.getData();
        if (!addSlotDate || batchSlots.some(slot => slot.date === addSlotDate)) return;
        this.batch.addSlot(addSlotDate, addSlotTime, addSlotDuration);
        this.setAddSlotDate('');
    };

    /** Отобразить соответствующую часть интерфейса. */
    private renderForm(state: FormState, endDate: string) {
        const {startDate, count, perWeek, batchTime, batchDuration, batchCost, batchPenaltyPercent, batchIsOnline,
        batchLocation, showPreview} = state;
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
                    <BatchPenaltyRow
                        penaltyPercent={batchPenaltyPercent}
                        setPenaltyPercent={this.setBatchPenaltyPercent}
                    />
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

    /** Отобразить соответствующую часть интерфейса. */
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

    /** Отобразить соответствующую часть интерфейса. */
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
