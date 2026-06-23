export interface Comment {
    id: number;
    author_id: number;
    author_name: string;
    author_login: string;
    entity_type: 'expert';
    entity_id: number;
    body: string;
    created_at: number;
}
