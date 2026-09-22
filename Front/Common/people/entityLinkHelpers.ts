import {appUrl} from '@common/Utils/Url/appUrl';

/** Helper to build public + admin URLs for common entity types */
export function userLinks(accountId: number, hasExpertProfile?: boolean) {
    return {
        publicUrl: appUrl(hasExpertProfile ? `/expert/id~${accountId}` : `/user/id~${accountId}`),
        adminUrl: appUrl(`/admin/#user=${accountId}`),
        userId: accountId,
    };
}

export function ticketLinks(_ticketId: number) {
    return {
        publicUrl: appUrl(`/support/`),
        adminUrl: appUrl(`/admin/support/`),
    };
}
