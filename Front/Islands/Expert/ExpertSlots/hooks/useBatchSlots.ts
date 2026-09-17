import {useState, useCallback} from 'react';
import {ProposedSlot, ExistingItem} from '../types';

function timeToMinutes(t: string): number {
    const parts = t.split(':');
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

/** Mirrors BatchPreviewTable's per-row isDateInPast — kept in one place so
 * the "any row past" check used to gate submission matches exactly what
 * the warning badge is based on. */
function isDateInPast(date: string, time: string): boolean {
    const now = new Date();
    const slotDate = new Date(date + 'T' + (time || '00:00'));
    return slotDate < now;
}

export function useBatchSlots() {
    const [batchSlots, setBatchSlots] = useState<ProposedSlot[]>([]);
    const [existingSlots, setExistingSlots] = useState<ExistingItem[]>([]);
    const [availableDates, setAvailableDates] = useState<Record<string, string>>({});
    const [restrictedDates, setRestrictedDates] = useState<Record<string, string>>({});

    const hasOverlap = useCallback((date: string, time: string, duration: number): boolean => {
        const startMin = timeToMinutes(time);
        const endMin = startMin + duration;
        return existingSlots.some(ex => {
            if (ex.date !== date) return false;
            const exStart = timeToMinutes(ex.time);
            const exEnd = exStart + ex.duration_min;
            return startMin < exEnd && endMin > exStart;
        });
    }, [existingSlots]);

    const hasProposedOverlap = useCallback((date: string, time: string, duration: number, excludeIndex: number): boolean => {
        const startMin = timeToMinutes(time);
        const endMin = startMin + duration;
        return batchSlots.some((s, i) => {
            if (i === excludeIndex || s.date !== date) return false;
            const sStart = timeToMinutes(s.time);
            const sEnd = sStart + s.duration;
            return startMin < sEnd && endMin > sStart;
        });
    }, [batchSlots]);

    const getDayItems = useCallback((date: string): ExistingItem[] => {
        return existingSlots.filter(ex => ex.date === date);
    }, [existingSlots]);

    const isProposed = useCallback((date: string): boolean => {
        return batchSlots.some(s => s.date === date);
    }, [batchSlots]);

    // Server rejects the WHOLE batch (HTTP 400, nothing created) if any row
    // has a past start time — block submission client-side too so the user
    // gets immediate feedback instead of a round-trip failure.
    const hasPastDate = useCallback((): boolean => {
        return batchSlots.some(s => isDateInPast(s.date, s.time));
    }, [batchSlots]);

    const addSlot = useCallback((date: string, time: string, duration: number) => {
        setBatchSlots(prev => {
            if (prev.some(s => s.date === date)) return prev;
            const hebrewDate = availableDates[date] || '';
            return [...prev, {id: crypto.randomUUID(), date, hebrewDate, time, duration}];
        });
    }, [availableDates]);

    const removeSlot = useCallback((index: number) => {
        setBatchSlots(prev => prev.filter((_, i) => i !== index));
    }, []);

    const updateSlotDate = useCallback((index: number, date: string) => {
        setBatchSlots(prev => prev.map((s, i) => i === index ? {...s, date, hebrewDate: availableDates[date] || ''} : s));
    }, [availableDates]);

    const updateSlotTime = useCallback((index: number, time: string) => {
        setBatchSlots(prev => prev.map((s, i) => i === index ? {...s, time} : s));
    }, []);

    const updateSlotDuration = useCallback((index: number, duration: number) => {
        setBatchSlots(prev => prev.map((s, i) => i === index ? {...s, duration} : s));
    }, []);

    return {
        batchSlots,
        setBatchSlots,
        existingSlots,
        setExistingSlots,
        availableDates,
        setAvailableDates,
        restrictedDates,
        setRestrictedDates,
        hasOverlap,
        hasProposedOverlap,
        getDayItems,
        isProposed,
        hasPastDate,
        addSlot,
        removeSlot,
        updateSlotDate,
        updateSlotTime,
        updateSlotDuration,
    };
}
