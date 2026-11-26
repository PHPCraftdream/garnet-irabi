import {sendPostFormData} from '@common/Api/Send/sendPostFormData';
import {D} from '@common/Support/Debug/D';
import {appUrl} from '@common/Utils/Url/appUrl';
import type {Slot} from '@/Islands/Expert/ExpertSlots/types';

/** Создать занятие и отправить его данные на сервер. */
export function createSlot(data: {
    date: string;
    time: string;
    duration: number;
    cost: number;
    max_users: number;
    cancellation_penalty_percent: number;
    is_online: boolean;
    location: string;
}): Promise<{success: boolean; slot_id?: number; slot?: Slot; error?: string}> {
    D('teaching.slot.create', {date: data.date, time: data.time, duration: data.duration, cost: data.cost});
    const fd = new FormData();
    fd.append('date', data.date);
    fd.append('time', data.time);
    fd.append('duration', String(data.duration));
    fd.append('cost', String(data.cost));
    fd.append('max_users', String(data.max_users));
    fd.append('cancellation_penalty_percent', String(data.cancellation_penalty_percent));
    fd.append('is_online', data.is_online ? '1' : '0');
    fd.append('location', data.location);
    const csrf = (globalThis as any).__GARNET_CSRF__ ?? '';
    fd.append('CSRF_TOKEN', csrf);
    return sendPostFormData(appUrl('/expert/~slots'), fd);
}
