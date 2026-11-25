import {appUrl} from '@common/Utils/Url/appUrl';

/** Builds the appropriate account links. */
export function ticketLinks(_ticketId: number) {
    return {
        publicUrl: appUrl(`/support/`),
        adminUrl: appUrl(`/admin/support/`),
    };
}
