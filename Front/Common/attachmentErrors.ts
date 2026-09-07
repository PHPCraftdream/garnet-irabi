import {showToast} from '@common/Components/GlobalToast';

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
