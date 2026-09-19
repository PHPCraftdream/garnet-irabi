import * as React from 'react';
import {useRef, useState} from 'react';
import {useBodyScrollLock} from '@common/hooks/ui/useBodyScrollLock';
import {showToast} from '@common/Components/Feedback/GlobalToast';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {AttachmentAddRow} from './AttachmentAddRow';
import {AttachmentTile} from './AttachmentTile';
import {AttachmentLightbox} from './AttachmentLightbox';

export interface PendingFile {
    id: string;
    file: File | Blob;
    name: string;
    preview?: string; // object URL for images
}

interface Props {
    files: PendingFile[];
    onChange: (files: PendingFile[]) => void;
    maxFiles?: number;
    accept?: string;
}

/**
 * Mirrors UploadRules::documentsAndImages() on the server. Kept here as well
 * so a refusal arrives while the sender is still looking at the form, instead
 * of after they have pressed send and believed the file went along.
 */
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_FILE_SIZE_MB = 5;

/**
 * Сколько файлов можно приложить.
 *
 * Число одно на все формы. Виджет поддержки обещал три, страница
 * поддержки — пять, а операция у них одна и та же: создать обращение.
 * Человек получал разное обещание в зависимости от того, через какую дверь
 * зашёл (нашла mod-2).
 *
 * Ограничение живёт только на клиенте — сервер числа файлов не проверяет.
 * Это любезность к отправителю, а не гарантия, и потому тем более не
 * должно расходиться между экранами.
 */
export const MAX_ATTACHMENTS = 5;
const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'txt', 'log']);

function formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + 'B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
    return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
}

/** The reason this file is not going, phrased for the person who picked it. */
function refusalFor(file: File): string | null {
    if (file.size > MAX_FILE_SIZE) {
        return t.Attach_TooLarge([file.name, MAX_FILE_SIZE_MB]);
    }

    // An empty file used to pass every visible check and then disappear on the
    // server, where finfo calls it application/x-empty. Name it here instead.
    if (file.size <= 0) {
        return t.Attach_Empty([file.name]);
    }

    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

    if (!ALLOWED_EXTENSIONS.has(ext)) {
        return t.Attach_ExtNotAllowed([file.name]);
    }

    return null;
}

interface AttachmentThumbsProps {
    files: PendingFile[];
    onOpen: (index: number) => void;
    onRemove: (index: number) => void;
}

const AttachmentThumbs: React.FC<AttachmentThumbsProps> = ({files, onOpen, onRemove}) => (
    <div className="common-pick-grid">
        {files.map((f, i) => (
            <AttachmentTile key={f.id} file={f} index={i} onOpen={onOpen} onRemove={onRemove} />
        ))}
    </div>
);

export default function AttachmentPicker({files, onChange, maxFiles = MAX_ATTACHMENTS, accept}: Props) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
    useBodyScrollLock(lightboxIndex !== null);

    const addFiles = (newFiles: FileList | File[]) => {
        const picked = Array.from(newFiles);
        const remaining = maxFiles - files.length;
        const pending: PendingFile[] = [];

        const overflow: string[] = [];

        for (const file of picked) {
            const refusal = refusalFor(file);

            if (refusal !== null) {
                showToast(refusal, 'danger');

                continue;
            }

            if (pending.length >= remaining) {
                overflow.push(file.name);

                continue;
            }

            const entry: PendingFile = { id: crypto.randomUUID(), file, name: file.name };
            if (file.type.startsWith('image/')) {
                entry.preview = URL.createObjectURL(file);
            }
            pending.push(entry);
        }

        if (overflow.length > 0) {
            // Naming them matters once there is more than one: "the rest were
            // skipped" leaves the sender guessing which of the six went.
            showToast(t.Attach_TooMany([maxFiles, overflow.join(', ')]), 'warning');
        }

        if (inputRef.current) inputRef.current.value = '';
        if (pending.length === 0) return;

        onChange([...files, ...pending]);
    };

    const remove = (index: number) => {
        const next = [...files];
        const removed = next.splice(index, 1);
        for (const f of removed) {
            if (f.preview) URL.revokeObjectURL(f.preview);
        }
        onChange(next);
        if (lightboxIndex === index) setLightboxIndex(null);
    };

    // Images with previews for lightbox navigation
    const previewFiles = files.map((f, i) => ({...f, index: i})).filter(f => f.preview);

    return (
        <div>
            {/* Thumbnails */}
            {files.length > 0 && <AttachmentThumbs files={files} onOpen={setLightboxIndex} onRemove={remove} />}

            {/* Add button */}
            {files.length < maxFiles && (
                <AttachmentAddRow
                    inputRef={inputRef}
                    accept={accept}
                    onFiles={addFiles}
                    count={files.length}
                    maxFiles={maxFiles}
                    onPick={() => inputRef.current?.click()}
                    hint={t.Attach_Hint([maxFiles, MAX_FILE_SIZE_MB])}
                />
            )}

            {/* Lightbox */}
            <AttachmentLightbox
                current={lightboxIndex !== null ? files[lightboxIndex] : null}
                previewFiles={previewFiles}
                currentIndex={lightboxIndex ?? -1}
                onNavigate={setLightboxIndex}
                onRemove={() => { if (lightboxIndex !== null) remove(lightboxIndex); }}
                onClose={() => setLightboxIndex(null)}
            />
        </div>
    );
}
