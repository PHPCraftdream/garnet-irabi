import * as React from 'react';
import {useState, useCallback, useRef} from 'react';
import {tsToInputDate} from '@common/Utils/Time/DateUtils';
import {Slot} from '../../types';

/**
 * Перетаскивание свободных занятий между днями.
 *
 * Счётчик входов/выходов на день нужен потому, что `dragleave` приходит и при
 * переходе на дочерний элемент внутри той же колонки: без счётчика подсветка
 * дня гасла бы на каждом внутреннем элементе.
 */
export const useCalendarDrag = (slots: Slot[], onSlotDrop?: (slotId: number, newDateStr: string) => void) => {
    const [dragOverDay, setDragOverDay] = useState<string | null>(null);
    const [draggingSlotId, setDraggingSlotId] = useState<number | null>(null);
    const dragCounterRef = useRef<Map<string, number>>(new Map());

    const handleDragStart = useCallback((e: React.DragEvent<HTMLDivElement>, slot: Slot) => {
        e.dataTransfer.setData('text/plain', String(slot.id));
        e.dataTransfer.effectAllowed = 'move';
        setDraggingSlotId(slot.id);
    }, []);

    const handleDragEnd = useCallback(() => {
        setDraggingSlotId(null);
        setDragOverDay(null);
        dragCounterRef.current.clear();
    }, []);

    const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>, dayIso: string) => {
        e.preventDefault();
        const counter = (dragCounterRef.current.get(dayIso) || 0) + 1;
        dragCounterRef.current.set(dayIso, counter);
        if (counter === 1) {
            setDragOverDay(dayIso);
        }
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>, dayIso: string) => {
        e.preventDefault();
        const counter = (dragCounterRef.current.get(dayIso) || 0) - 1;
        dragCounterRef.current.set(dayIso, Math.max(0, counter));
        if (counter <= 0) {
            dragCounterRef.current.delete(dayIso);
            setDragOverDay(prev => prev === dayIso ? null : prev);
        }
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }, []);

    const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>, dayIso: string) => {
        e.preventDefault();
        setDragOverDay(null);
        setDraggingSlotId(null);
        dragCounterRef.current.clear();

        const slotId = parseInt(e.dataTransfer.getData('text/plain'), 10);
        if (isNaN(slotId)) return;

        const slot = slots.find(s => s.id === slotId);
        if (!slot) return;

        // Тот же день — переносить нечего.
        if (tsToInputDate(slot.start_at) === dayIso) return;

        onSlotDrop?.(slotId, dayIso);
    }, [slots, onSlotDrop]);

    return {
        dragOverDay,
        draggingSlotId,
        handleDragStart,
        handleDragEnd,
        handleDragEnter,
        handleDragLeave,
        handleDragOver,
        handleDrop,
    };
};
