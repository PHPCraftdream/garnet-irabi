export type CommentModerationStatus = 'pending' | 'approved' | 'rejected' | 'flagged';

export interface Comment {
    id: number;
    /** Ноль у всех, кроме модератора: отзывы анонимны для читателей. */
    author_id: number;
    /** Пусто у всех, кроме модератора — по той же причине. */
    author_name: string;
    author_login: string;
    /** Свой ли это отзыв. Приходит вместо имени, чтобы автор узнал себя, не раскрываясь другим. */
    is_mine?: boolean;
    /** Состояние модерации. Читателю приходят только одобренные — и свои любые. */
    moderation_status?: CommentModerationStatus;
    is_hidden?: boolean | number;
    entity_type: 'expert';
    entity_id: number;
    body: string;
    created_at: number;
}
