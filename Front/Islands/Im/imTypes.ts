export interface ImConversation {
    id: number;
    partner_id: number;
    partner_name: string;
    partner_avatar?: string | null;
    partner_has_expert_profile?: boolean;
    partner_is_disabled?: boolean;
    last_message_snippet: string;
    last_message_at: number;
    unread_count: number;
}

export interface ImMessage {
    id: number;
    conversation_id: number;
    sender_id: number;
    sender_name?: string;
    body: string;
    created_at: number;
    attachments?: ImAttachment[];
}

export interface ImAttachment {
    id: number;
    message_id: number;
    original_name: string;
    stored_name: string;
    mime_type: string;
    size: number;
    download_url: string;
}
