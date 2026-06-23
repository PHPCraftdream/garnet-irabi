import * as React from 'react';
import {useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {D} from '@common/Debug/D';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {zodFromFieldsInfo, getFieldRegisterOptions} from '@common/Utils/zodFromFieldsInfo';
import {IFromFieldsInfo} from '@common/Dom/GridTable/Models';
import {createSlot} from '../api';
import {DateInput} from '@common/Components/ui/DateInput';

import {Slot} from '../types';

function getTomorrow(): string {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface Props {
    onSuccess: (newSlot?: Slot) => void;
    onError: (msg: string) => void;
    fieldsInfo: IFromFieldsInfo;
    defaultPenaltyPercent: number;
    onCancel?: () => void;
}

type SlotFormData = {date: string; time: string; duration: number; cost: number; max_users: number; cancellation_penalty_percent: number};

export const CreateSlotForm: React.FC<Props> = ({onSuccess, onError, fieldsInfo, defaultPenaltyPercent, onCancel}) => {
    const schema = React.useMemo(
        () => zodFromFieldsInfo(fieldsInfo.fields, fieldsInfo.detailsFields),
        [fieldsInfo],
    );

    const {register, handleSubmit, formState: {errors, isSubmitting}} = useForm<SlotFormData>({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resolver: zodResolver(schema) as any,
        defaultValues: {date: getTomorrow(), time: '10:00', duration: 60, cost: 500, max_users: 1, cancellation_penalty_percent: defaultPenaltyPercent},
    });

    const [serverError, setServerError] = React.useState('');

    const onSubmit = async (data: SlotFormData) => {
        setServerError('');
        D('teaching.slot.submit', {date: data.date, time: data.time, cost: data.cost});
        try {
            const result = await createSlot({
                date: data.date,
                time: data.time,
                duration: data.duration,
                cost: data.cost,
                max_users: data.max_users,
                cancellation_penalty_percent: data.cancellation_penalty_percent,
            });
            if (result.success) {
                D('teaching.slot.created', {slotId: result.slot_id});
                onSuccess(result.slot);
            } else {
                D('teaching.error', {action: 'createSlot', error: result.error});
                onError(result.error || t.General_Error());
            }
        } catch (err: any) {
            D('teaching.error', {action: 'createSlot', error: err.message});
            // Extract overlap error from ApiError response
            const resp = err?.response;
            if (resp && typeof resp === 'object' && resp.overlap) {
                setServerError(resp.error || t.Slot_OverlapError());
            } else {
                const msg = (resp && typeof resp === 'object' && resp.error) ? resp.error : err.message;
                onError(msg);
            }
        }
    };

    const durationOpts = getFieldRegisterOptions(fieldsInfo.fields['duration']);
    const costOpts     = getFieldRegisterOptions(fieldsInfo.fields['cost']);
    const maxStudOpts  = getFieldRegisterOptions(fieldsInfo.fields['max_users']);
    const penaltyField = fieldsInfo.fields['cancellation_penalty_percent'];
    const penaltyOpts  = penaltyField ? getFieldRegisterOptions(penaltyField) : {valueAsNumber: true};

    return (
        <form id="createSlotForm" onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="space-y-3 mb-4">
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="form-label">{t.Slot_Date()}</label>
                        <DateInput
                            className={errors.date ? 'is-invalid' : ''}
                            data-test-id="slot-date"
                            {...register('date')}
                        />
                        {errors.date && <div className="invalid-feedback">{errors.date.message}</div>}
                    </div>
                    <div>
                        <label className="form-label">{t.Slot_Time()}</label>
                        <DateInput
                            type="time"
                            className={errors.time ? 'is-invalid' : ''}
                            data-test-id="slot-time"
                            {...register('time')}
                        />
                        {errors.time && <div className="invalid-feedback">{errors.time.message}</div>}
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                    <div>
                        <label className="form-label">{t.Slot_Duration()}</label>
                        <select
                            className={`form-select${errors.duration ? ' is-invalid' : ''}`}
                            data-test-id="slot-duration"
                            {...register('duration', durationOpts)}
                        >
                            {[30, 45, 60, 90, 120].map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                            ))}
                        </select>
                        {errors.duration && <div className="invalid-feedback">{errors.duration.message}</div>}
                    </div>
                    <div>
                        <label className="form-label">{t.Slot_Cost()}</label>
                        <input
                            type="number"
                            className={`form-control${errors.cost ? ' is-invalid' : ''}`}
                            min={0}
                            data-test-id="slot-cost"
                            {...register('cost', costOpts)}
                        />
                        {errors.cost && <div className="invalid-feedback">{errors.cost.message}</div>}
                    </div>
                    <div>
                        <label className="form-label">{t.Slot_MaxUsers()}</label>
                        <input
                            type="number"
                            className={`form-control${errors.max_users ? ' is-invalid' : ''}`}
                            min={1}
                            data-test-id="slot-max-users"
                            {...register('max_users', maxStudOpts)}
                        />
                        {errors.max_users && <div className="invalid-feedback">{errors.max_users.message}</div>}
                    </div>
                </div>
                <div>
                    <label className="form-label">{t.Slot_PenaltyPercent()}</label>
                    <input
                        type="number"
                        className={`form-control${errors.cancellation_penalty_percent ? ' is-invalid' : ''}`}
                        min={0}
                        max={100}
                        data-test-id="slot-penalty-percent"
                        {...register('cancellation_penalty_percent', penaltyOpts)}
                    />
                    {errors.cancellation_penalty_percent && <div className="invalid-feedback">{errors.cancellation_penalty_percent.message}</div>}
                    <div className="text-xs text-muted mt-1">{t.Slot_PenaltyHelp()}</div>
                </div>
            </div>
            {serverError && (
                <div className="mb-3 text-sm text-danger">{serverError}</div>
            )}
            <div className="flex gap-2 justify-end">
                {onCancel && (
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={onCancel}
                        disabled={isSubmitting}
                    >
                        {t.Batch_Cancel()}
                    </button>
                )}
                <button
                    type="submit"
                    className="btn btn-success"
                    data-test-id="create-slot-btn"
                    disabled={isSubmitting}
                >
                    {t.Slot_Create()}
                </button>
            </div>
        </form>
    );
};
