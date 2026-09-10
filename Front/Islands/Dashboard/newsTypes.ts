export interface NewsEvent {
    id: number;
    event_type: string;
    payload: Record<string, any>;
    actor_id: number;
    created_at: number;
    is_read: boolean;
    read_at: number | null;
    is_archived: boolean;
}
