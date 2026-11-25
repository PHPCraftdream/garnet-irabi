import {appUrl} from '@common/Utils/Url/appUrl';

/** Builds the appropriate account links. */
export function userLinks(accountId: number, hasExpertProfile?: boolean) {
    return {
        publicUrl: appUrl(hasExpertProfile ? `/expert/id~${accountId}` : `/user/id~${accountId}`),
        adminUrl: appUrl(`/admin/#user=${accountId}`),
        userId: accountId,
    };
}

/** Подготавливает ссылки для карточки обращения. */
