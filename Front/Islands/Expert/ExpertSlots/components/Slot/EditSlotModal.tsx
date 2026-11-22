import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import {sendPost} from '@common/Api/Send/sendPost';
import {D} from '@common/Support/Debug/D';
import SendButton from '@common/Components/Controls/SendButton';
import {DateInput} from '@common/Components/ui/DateInput';
import {appUrl} from '@common/Utils/Url/appUrl';
import {tsToInputDate, tsToInputTime} from '@common/Utils/Time/DateUtils';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {ModalShell} from '../../../../../Common/Components/ModalShell';
import type {Slot} from '../../types';
import {SlotFormatFields} from './SlotFormatFields';

interface FieldProps {
    label: string;
    hint?: string;
    children: React.ReactNode;
}

function Field({label, hint, children}: FieldProps) {
    return (
        <div>
            <label className="slot-format-label-edit">{label}</label>
            {children}
            {hint && <div className="slot-format-hint">{hint}</div>}
        </div>
    );
}

interface NumberFieldProps {
    label: string;
    hint?: string;
    value: number;
    min?: number;
    max?: number;
    locked: boolean;
    testId: string;
    onChange: (value: number) => void;
}

class NumberField extends AntiHookComponent<NumberFieldProps> {
    private readonly change = (event: React.ChangeEvent<HTMLInputElement>) => this.props.onChange(Number(event.target.value));

    render() {
        const {label, hint, value, min, max, locked, testId} = this.props;
        return (
            <Field label={label} hint={hint}>
                <input type="number" className="slot-format-location" value={value} onChange={this.change}
                    min={min} max={max} disabled={locked} data-test-id={testId} />
            </Field>
        );
    }
}

interface Props {
    slot: Slot;
    onClose: () => void;
    onSaved: (updated: Slot, original: Slot) => void;
    onError: (msg: string) => void;
}

function initialForm(slot: Slot) {
    return {
        date: tsToInputDate(slot.start_at),
        time: tsToInputTime(slot.start_at),
        duration: slot.duration_min ?? 60,
        cost: slot.cost,
        max_users: slot.max_users ?? 1,
        cancellation_penalty_percent: slot.cancellation_penalty_percent ?? 0,
        isOnline: Number(slot.is_online ?? 1) === 1,
        location: slot.location ?? '',
        error: '',
        sending: false,
    };
}

type Form = ReturnType<typeof initialForm>;

export class EditSlotModal extends AntiHookComponent<Props> {
    private readonly form = new Carburetor(initialForm(this.props.slot));

    private update(patch: Partial<Form>): void {
        this.form.setData({...this.form.getData(), ...patch});
    }

    private readonly changeDate = (event: React.ChangeEvent<HTMLInputElement>) => this.update({date: event.target.value});
    private readonly changeTime = (event: React.ChangeEvent<HTMLInputElement>) => this.update({time: event.target.value});
    private readonly changeDuration = (duration: number) => this.update({duration});
    private readonly changeCost = (cost: number) => this.update({cost});
    private readonly changeMaxUsers = (max_users: number) => this.update({max_users});
    private readonly changePenalty = (cancellation_penalty_percent: number) => this.update({cancellation_penalty_percent});
    private readonly changeFormat = (isOnline: boolean) => this.update({isOnline});
    private readonly changeLocation = (location: string) => this.update({location});

    private readonly save = async () => {
        const {slot, onSaved, onError} = this.props;
        const {sending, date, time, duration, cost, max_users, cancellation_penalty_percent, isOnline, location} = this.form.getData();
        this.update({error: ''});
        if (sending) return;
        this.update({sending: true});

        // Время проверяется на сервере в часовом поясе преподавателя.
        try {
            D('teaching.slot.edit', {slotId: slot.id, date, time});
            const csrf = (window as any).__GARNET_CSRF__ ?? '';
            const resp = await sendPost(appUrl('/expert/~editSlot'), {
                CSRF_TOKEN: csrf, slot_id: slot.id, date, time, duration, cost, max_users,
                cancellation_penalty_percent, is_online: isOnline ? 1 : 0, location,
            });
            onSaved((resp as any)?.slot ?? slot, slot);
        } catch (e: any) {
            D('teaching.error', {action: 'editSlot', slotId: slot.id, error: e?.message});
            const resp = e?.response;
            if (resp && typeof resp === 'object' && resp.overlap) {
                this.update({error: resp.error || t.Slot_OverlapError()});
                return;
            }
            onError((resp && typeof resp === 'object' && resp.error) ? resp.error : (e?.message || t.General_Error()));
        } finally {
            this.update({sending: false});
        }
    };

    private renderDateTime(state: Form, locked: boolean) {
        return (
            <>
                <Field label={t.Slot_Date()}>
                    <DateInput value={state.date} onChange={this.changeDate} disabled={locked} data-test-id="edit-slot-date" />
                </Field>
                <Field label={t.Slot_Time()}>
                    <DateInput type="time" value={state.time} onChange={this.changeTime} disabled={locked} data-test-id="edit-slot-time" />
                </Field>
            </>
        );
    }

    private renderFields(state: Form, locked: boolean) {
        return (
            <div className="batch-form-fields">
                {this.renderDateTime(state, locked)}
                <NumberField label={t.Slot_Duration()} value={state.duration} min={15} locked={locked} testId="edit-slot-duration" onChange={this.changeDuration} />
                <NumberField label={t.Slot_Cost()} value={state.cost} min={0} locked={locked} testId="edit-slot-cost" onChange={this.changeCost} />
                <NumberField label={t.Slot_MaxUsers()} value={state.max_users} min={Math.max(1, this.props.slot.booked_count ?? 0)} max={100} locked={locked} testId="edit-slot-max-users" onChange={this.changeMaxUsers} />
                <NumberField label={t.Slot_PenaltyPercent()} hint={t.Slot_PenaltyHelp()} value={state.cancellation_penalty_percent} min={0} max={100} locked={locked} testId="edit-slot-penalty-percent" onChange={this.changePenalty} />
                <SlotFormatFields isOnline={state.isOnline} location={state.location} onIsOnlineChange={this.changeFormat}
                    onLocationChange={this.changeLocation} idPrefix="edit-slot" labelVariant="edit" formatLocked={locked} />
            </div>
        );
    }

    private renderActions(sending: boolean) {
        return (
            <div className="batch-preview-actions">
                <button type="button" className="confirm-modal-cancel" onClick={this.props.onClose} disabled={sending} data-test-id="edit-slot-cancel">
                    {t.Batch_Cancel()}
                </button>
                <SendButton onClick={this.save} sending={sending} label={t.Slot_Save()} testId="edit-slot-save" />
            </div>
        );
    }

    render() {
        const {slot, onClose} = this.props;
        const state = this.useCarburetor(this.form);
        const locked = slot.status === 'booked';
        return (
            <ModalShell title={t.Slot_EditTitle()} testId="edit-slot-modal" onClose={onClose}>
                {locked && <div className="edit-slot-locked" data-test-id="edit-slot-locked-notice">{t.Slot_EditLockedNotice()}</div>}
                {state.error && <div className="invalid-feedback" data-slot-error="server">{state.error}</div>}
                {this.renderFields(state, locked)}
                {this.renderActions(state.sending)}
            </ModalShell>
        );
    }
}
