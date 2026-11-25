/** Pull the server's booking error code out of a thrown request error. */
export function bookErrorCode(e: any): string {
    const resp = e?.response;
    if (resp && typeof resp === 'object' && typeof resp.error === 'string') {
        return resp.error;
    }
    const raw = typeof resp === 'string' ? resp : (e?.message ?? '');
    return /not.?found/i.test(raw) ? 'not_found' : '';
}
