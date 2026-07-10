import {sendPostFormData} from '@common/Api/sendPostFormData';
import {D} from '@common/Debug/D';
import {appUrl} from '@common/Utils/appUrl';
import {BatchPreviewResponse} from './types';

export function createSlot(data: {
    date: string;
    time: string;
    duration: number;
    cost: number;
    max_users: number;
    cancellation_penalty_percent: number;
}): Promise<{success: boolean; slot_id?: number; slot?: import('./types').Slot; error?: string}> {
    D('teaching.slot.create', {date: data.date, time: data.time, duration: data.duration, cost: data.cost});
    const fd = new FormData();
    fd.append('date', data.date);
    fd.append('time', data.time);
    fd.append('duration', String(data.duration));
    fd.append('cost', String(data.cost));
    fd.append('max_users', String(data.max_users));
    fd.append('cancellation_penalty_percent', String(data.cancellation_penalty_percent));
    return sendPostFormData(appUrl('/expert/~slots'), fd);
}

export function batchPreview(data: {
    start_date: string;
    end_date: string;
    count: number;
    batch_time: string;
    batch_duration: number;
}): Promise<BatchPreviewResponse> {
    D('teaching.batch.preview', {startDate: data.start_date, endDate: data.end_date, count: data.count});
    const fd = new FormData();
    fd.append('start_date', data.start_date);
    fd.append('end_date', data.end_date);
    fd.append('count', String(data.count));
    fd.append('batch_time', data.batch_time);
    fd.append('batch_duration', String(data.batch_duration));
    return sendPostFormData(appUrl('/expert/~batchPreview'), fd);
}

export function batchCreate(data: {
    slots: {date: string; time: string; duration: number}[];
    cost: number;
    max_users?: number;
}): Promise<{success: boolean; created: number; overlaps: {date: string; time: string; reason: string}[]; slots?: import('./types').Slot[]; error?: string}> {
    D('teaching.batch.create', {slotsCount: data.slots.length, cost: data.cost});
    const fd = new FormData();
    fd.append('slots', JSON.stringify(data.slots));
    fd.append('cost', String(data.cost));
    if (data.max_users) fd.append('max_users', String(data.max_users));
    return sendPostFormData(appUrl('/expert/~batchSlots'), fd);
}
