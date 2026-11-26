import {sendPostFormData} from '@common/Api/Send/sendPostFormData';
import {D} from '@common/Support/Debug/D';
import {appUrl} from '@common/Utils/Url/appUrl';

/** Создать пакет занятий с указанными параметрами. */
export function batchCreate(data: {
    slots: {date: string; time: string; duration: number}[];
    cost: number;
    max_users?: number;
    cancellation_penalty_percent?: number;
    is_online: boolean;
    location: string;
}): Promise<{
    success: boolean;
    created: number;
    overlaps: {date: string; time: string; reason: string}[];
    slots?: import('@/Islands/Expert/ExpertSlots/types').Slot[];
    error?: string;
}> {
    D('teaching.batch.create', {slotsCount: data.slots.length, cost: data.cost});
    const fd = new FormData();
    fd.append('slots', JSON.stringify(data.slots));
    fd.append('cost', String(data.cost));
    if (data.max_users) fd.append('max_users', String(data.max_users));
    if (data.cancellation_penalty_percent !== undefined) {
        fd.append('cancellation_penalty_percent', String(data.cancellation_penalty_percent));
    }
    fd.append('is_online', data.is_online ? '1' : '0');
    fd.append('location', data.location);
    const csrf = (globalThis as any).__GARNET_CSRF__ ?? '';
    fd.append('CSRF_TOKEN', csrf);
    return sendPostFormData(appUrl('/expert/~batchSlots'), fd);
}
