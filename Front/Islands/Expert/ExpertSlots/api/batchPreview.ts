import {sendPostFormData} from '@common/Api/Send/sendPostFormData';
import {D} from '@common/Support/Debug/D';
import {appUrl} from '@common/Utils/Url/appUrl';
import type {BatchPreviewResponse} from '../types';

/** Рассчитать доступные занятия для пакетного создания. */
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
