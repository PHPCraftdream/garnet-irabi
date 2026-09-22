import {appUrl} from '@common/Utils/Url/appUrl';

// ── Hardcoded admin API URLs (consistent across all admin pages) ──

export const ADMIN_URLS = {
    detailUrl: appUrl('/admin/~userDetail'),
    setFlagUrl: appUrl('/admin/~setUserFlag'),
    createTicketUrl: appUrl('/admin/support/~createForUser'),
};
