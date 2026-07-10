export interface Slot {
    id: number;
    start_at: number;
    end_at: number;
    duration_min: number;
    cost: number;
    cancellation_penalty_percent: number;
    status: string;
    uid?: string;
    max_users?: number;
    user_id?: number;
    user_name?: string;
    booking_id?: number;
    booking_status?: string;
}

export interface ExistingItem {
    date: string;
    time: string;
    duration_min: number;
    type: 'slot';
    title: string;
}

export interface ProposedSlot {
    date: string;
    hebrewDate: string;
    time: string;
    duration: number;
}

export interface BatchPreviewResponse {
    availableDates: {date: string; hebrewDate: string}[];
    restrictedDates: {date: string; reason: string}[];
    proposedDates: {date: string; hebrewDate: string}[];
    existingSlots: ExistingItem[];
    totalAvailable: number;
    totalRestricted: number;
}

import {IFromFieldsInfo} from '@common/Dom/GridTable/Models';

export interface ExpertSlotsProps {
    slots: Slot[];
    slotFieldsInfo: IFromFieldsInfo;
    defaultPenaltyPercent: number;
    currentAccountId: number;
    messagesUrl: string;
    sendUrl: string;
    quickChatUrl: string;
    userPreviewUrl: string;
    isApproved?: boolean;
}
