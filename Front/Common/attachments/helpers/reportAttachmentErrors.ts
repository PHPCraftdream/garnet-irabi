import {showToast} from '@common/Components/Feedback/GlobalToast';

/** Показывает ошибки обработки приложенных файлов. */
export function reportAttachmentErrors(resp: unknown): void {
    const errors: unknown = (resp as {attachmentErrors?: unknown} | null)?.attachmentErrors;

    if (!Array.isArray(errors) || errors.length === 0) {
        return;
    }

    for (const error of errors) {
        showToast(String(error), 'danger');
    }
}
