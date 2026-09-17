import {AccountOption} from '../../Shell/adminShared';

/** Историческое имя: раздел отзывов знает людей под ним. */
export type CommentsAccountOption = AccountOption;

export interface AdminCommentRow {
    id: number;
    author_id: number;
    author_name: string;
    entity_type: string;
    entity_id: number;
    entity_name: string;
    expert_has_profile: boolean;
    body: string;
    is_hidden: boolean;
    /**
     * Состояние проверки. Модерация слепая: `author_name` приходит пустым, а
     * `author_id` нулём — кроме помеченных как опасные отзывов, и только
     * владельцу платформы.
     */
    moderation_status: 'pending' | 'approved' | 'rejected' | 'flagged';
    created_at: number;
}

export interface CommentsFetchBody {
    page: number;
    perPage: number;
    author_id: number;
    expert_id: number;
    date_from: string;
    date_to: string;
    search: string;
    hidden_only: string;
}

export interface ToggleResponse {
    success: boolean;
    is_hidden: boolean;
}

export interface ModerationResponse {
    success: boolean;
    moderation_status: AdminCommentRow['moderation_status'];
}

export const COMMENTS_PER_PAGE = 50;
export const COMMENT_BODY_TRUNC = 160;

export function truncate(s: string, n: number): string {
    if (s.length <= n) return s;
    return s.slice(0, n).trimEnd() + '…';
}
