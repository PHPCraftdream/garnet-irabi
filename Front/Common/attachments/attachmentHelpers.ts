import {showToast} from '@common/Components/Feedback/GlobalToast';

/**
 * The server can accept a message and refuse a file attached to it — too
 * large, wrong type, empty. Both halves used to come back as one cheerful
 * "success", so the sender walked away certain the file had gone with it.
 *
 * Every endpoint that takes attachments answers with `attachmentErrors`; every
 * caller has to say them out loud. Shared here because the same silence in
 * support, in the moderator panel and in private messages is the same defect
 * three times.
 */
export function reportAttachmentErrors(resp: unknown): void {
    const errors: unknown = (resp as {attachmentErrors?: unknown} | null)?.attachmentErrors;

    if (!Array.isArray(errors) || errors.length === 0) {
        return;
    }

    for (const error of errors) {
        showToast(String(error), 'danger');
    }
}

/**
 * Сколько файлов можно приложить.
 *
 * Число одно на все формы. Виджет поддержки обещал три, страница
 * поддержки — пять, а операция у них одна и та же: создать обращение.
 * Человек получал разное обещание в зависимости от того, через какую дверь
 * зашёл (нашла mod-2).
 *
 * Ограничение живёт только на клиенте — сервер числа файлов не проверяет.
 * Это любезность к отправителю, а не гарантия, и потому тем более не
 * должно расходиться между экранами.
 */
export const MAX_ATTACHMENTS = 5;

export function formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + 'B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';

    return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
}
