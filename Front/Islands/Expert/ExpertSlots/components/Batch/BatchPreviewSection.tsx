import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {DateInput} from '@common/Components/ui/DateInput';
import {DurationSelect} from '@common/Components/Controls/DurationSelect';
import {Calendar} from '@common/Components/Controls/Calendar';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {anyPastDate, type BatchSlotsState} from './BatchSlotsState';
import type {ExistingItem, ProposedSlot} from '../../types';
import {BatchPreviewTable} from './BatchPreviewTable';

const dayNames = () => [t.Cal_Sun(), t.Cal_Mon(), t.Cal_Tue(), t.Cal_Wed(), t.Cal_Thu(), t.Cal_Fri(), t.Cal_Sat()];

interface Props {
    startDate: string;
    endDate: string;
    batch: BatchSlotsState;
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

export class BatchPreviewSection extends AntiHookComponent<Props> {
    private readonly batchSnapshot = this.connectSelection(() => this.props.batch, state => ({batchSlots: state.batchSlots, existingSlots: state.existingSlots, availableDates: state.availableDates, restrictedDates: state.restrictedDates}));

    private readonly changeDate = (event: React.ChangeEvent<HTMLInputElement>) => {
        this.props.setAddSlotDate(event.target.value);
    };

    private readonly changeTime = (event: React.ChangeEvent<HTMLInputElement>) => {
        this.props.setAddSlotTime(event.target.value);
    };

    private readonly isProposed = (date: string): boolean => {
        return this.props.batch.getData().batchSlots.some(slot => slot.date === date);
    };

    private renderCalendar(availableDates: Record<string, string>, restrictedDates: Record<string, string>) {
        const {startDate, endDate, onDateClick} = this.props;
        return (
            <div className="batch-preview-spacing">
                <Calendar
                    startDate={startDate}
                    endDate={endDate}
                    dayNames={dayNames()}
                    isProposed={this.isProposed}
                    restrictedDates={restrictedDates}
                    availableDates={availableDates}
                    onDateClick={onDateClick}
                    idPrefix="batchCalendar"
                    hideEmptyWeeks
                />
            </div>
        );
    }

    private renderTable(batchSlots: readonly ProposedSlot[], existingSlots: readonly ExistingItem[]) {
        const {batch, startDate, endDate} = this.props;
        return (
            <BatchPreviewTable
                slots={batchSlots}
                startDate={startDate}
                endDate={endDate}
                existingSlots={existingSlots}
                onDateChange={batch.updateSlotDate}
                onTimeChange={batch.updateSlotTime}
                onDurationChange={batch.updateSlotDuration}
                onRemove={batch.removeSlot}
            />
        );
    }

    private renderAddRow() {
        const {addSlotDate, addSlotTime, addSlotDuration, setAddSlotDuration, onAddSlot} = this.props;
        return (
            <div className="batch-preview-add-row" id="addSlotRow">
                <div>
                    <label className="batch-field-label">{t.Slot_Date()}</label>
                    <DateInput id="addSlotDate" value={addSlotDate} onChange={this.changeDate} />
                </div>
                <div>
                    <label className="batch-field-label">{t.Slot_Time()}</label>
                    <DateInput type="time" id="addSlotTime" value={addSlotTime} onChange={this.changeTime} />
                </div>
                <div>
                    <label className="batch-field-label">{t.Slot_Duration()}</label>
                    <DurationSelect value={addSlotDuration} onChange={setAddSlotDuration} id="addSlotDuration" />
                </div>
                <div>
                    <button type="button" id="addSlotBtn" className="compact-outline-action" title={t.Action_Add()} onClick={onAddSlot}>+</button>
                </div>
            </div>
        );
    }

    private renderActions(hasPastDate: boolean) {
        const {onCancel, onCreate} = this.props;
        return (
            <div className="batch-preview-actions">
                {onCancel && <button type="button" className="confirm-modal-cancel" onClick={onCancel}>{t.Batch_Cancel()}</button>}
                <button
                    type="button"
                    id="batchCreateBtn"
                    data-test-id="batch-create-btn"
                    className="confirm-modal-success"
                    disabled={hasPastDate}
                    title={hasPastDate ? t.Batch_PastDate() : undefined}
                    onClick={onCreate}
                >{t.Batch_CreateAll()}</button>
            </div>
        );
    }

    render() {
        const state = this.batchSnapshot();
        return (
            <div id="batchPreview">
                <hr className="batch-preview-divider" />
                <div className="batch-preview-spacing">
                    <span className="batch-legend-available">{t.Batch_Available()}</span>{' '}
                    <span className="batch-legend-restricted">{t.Batch_Restricted()}</span>{' '}
                    <span className="batch-legend-proposed">{t.Batch_Proposed()}</span>
                </div>
                {this.renderCalendar(state.availableDates, state.restrictedDates)}
                <h6>{t.Batch_ProposedDates()}:</h6>
                {this.renderTable(state.batchSlots, state.existingSlots)}
                {this.renderAddRow()}
                <p className="batch-preview-stats" id="batchStats">
                    {t.Batch_AvailableDays()}: {Object.keys(state.availableDates).length} | {t.Batch_RestrictedDays()}: {Object.keys(state.restrictedDates).length} | {t.Batch_Proposed()}: {state.batchSlots.length}
                </p>
                {this.renderActions(anyPastDate(state.batchSlots))}
            </div>
        );
    }
}
