export type SupportStatus = 'open' | 'investigation' | 'in_progress' | 'waiting_user' | 'waiting_support' | 'escalated' | 'on_hold' | 'deferred' | 'low_priority' | 'resolved' | 'rejected';

export type UserRole = 'user' | 'expert' | 'moderator' | 'owner' | 'admin';

export interface SupportTicket {
    id: number;
    account_id: number;
    subject: string;
    status: SupportStatus;
    assignee_id: number | null;
    unread_user: number;
    unread_staff: number;
    created_at: number;
    updated_at: number;
    account_login?: string;
    account_name?: string;
    user_login?: string;
    user_name?: string;
    user_avatar?: string | null;
    user_role?: UserRole;
    has_expert_profile?: boolean;
    assignee_login?: string;
    assignee_name?: string;
}

export interface SupportAttachment {
    id: number;
    message_id: number;
    original_name: string;
    stored_name: string;
    mime_type: string;
    size: number;
    download_url: string;
}

export interface SupportMessage {
    id: number;
    ticket_id: number;
    author_id: number;
    author_name?: string;
    body: string;
    is_internal: number;
    msg_type: 'user' | 'staff' | 'system';
    created_at: number;
    attachments?: SupportAttachment[];
}

export interface AutoContext {
    url: string;
    referrer: string;
    userAgent: string;
    viewport: { width: number; height: number };
    language: string;
    timestamp: number;
    jsErrors: { message: string; source?: string; time: number }[];
    netErrors: { url: string; status: number; time: number }[];
    breadcrumb: { url: string; time: number }[];
}

export interface AssignmentLogEntry {
    id: number;
    ticket_id: number;
    actor_id: number;
    actor_name: string;
    from_id: number | null;
    from_name: string | null;
    to_id: number | null;
    to_name: string | null;
    created_at: number;
}
