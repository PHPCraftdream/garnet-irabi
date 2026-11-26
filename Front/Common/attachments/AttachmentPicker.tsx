import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import {showToast} from '@common/Components/Feedback/GlobalToast';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import {AttachmentAddRow} from './AttachmentAddRow';
import {AttachmentTile} from './AttachmentTile';
import {AttachmentLightbox} from './AttachmentLightbox';
import {MAX_ATTACHMENTS} from './helpers/MAX_ATTACHMENTS';

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

interface PickerSelectionData {
    index: number | null;
}

class PickerSelection extends Carburetor<PickerSelectionData> {
/** Выбирает файл для просмотра или закрывает его. */
    public readonly setIndex = (index: number | null): void => {
        this.setData({index});
    };
}

/**
 * Mirrors UploadRules::documentsAndImages() on the server. Kept here as well
 * so a refusal arrives while the sender is still looking at the form, instead
 * of after they have pressed send and believed the file went along.
 */
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_FILE_SIZE_MB = 5;

const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'txt', 'log']);

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

const addPreviewIndex = (file: PendingFile, index: number) => ({...file, index});
const hasPreview = (file: PendingFile) => !!file.preview;

interface AttachmentThumbsProps {
    files: readonly PendingFile[];
    onOpen: (index: number) => void;
    onRemove: (index: number) => void;
}

class AttachmentThumbs extends React.Component<AttachmentThumbsProps> {
/** Рисует плитку выбранного файла. */
    private readonly renderTile = (file: PendingFile, index: number) => (
        <AttachmentTile
            key={file.id}
            file={file}
            index={index}
            onOpen={this.props.onOpen}
            onRemove={this.props.onRemove}
        />
    );

    /** Рисует сетку миниатюр. */
    public render() {
        return <div className="pick-file-grid">{this.props.files.map(this.renderTile)}</div>;
    }
}

export default class AttachmentPicker extends AntiHookComponent<Props> {
    private readonly inputRef = React.createRef<HTMLInputElement>();
    private readonly selection = new PickerSelection({index: null});
    private unlockBody: (() => void) | undefined;

/** Синхронизирует блокировку прокрутки после монтирования. */
    public componentDidMount(): void {
        super.componentDidMount();
        this.syncBodyLock();
    }

/** Обновляет блокировку прокрутки после изменения состояния. */
    public componentDidUpdate(previousProps: Readonly<Props>): void {
        super.componentDidUpdate(previousProps);
        this.syncBodyLock();
    }

/** Снимает блокировку прокрутки перед размонтированием. */
    public componentWillUnmount(): void {
        this.unlockBody?.();
        this.unlockBody = undefined;
        super.componentWillUnmount();
    }

/** Запирает страницу, пока открыт просмотр картинки. */
    private syncBodyLock(): void {
        const locked = this.selection.getData().index !== null;
        if (locked && !this.unlockBody) {
            const previousOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
            this.unlockBody = () => { document.body.style.overflow = previousOverflow; };
        } else if (!locked && this.unlockBody) {
            this.unlockBody();
            this.unlockBody = undefined;
        }
    }

/** Проверяет и добавляет выбранные файлы к текущему списку. */
    private readonly addFiles = (newFiles: FileList | File[]) => {
        const {files, onChange} = this.props;
        const maxFiles = this.props.maxFiles === undefined ? MAX_ATTACHMENTS : this.props.maxFiles;
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
            const entry: PendingFile = {id: crypto.randomUUID(), file, name: file.name};
            if (file.type.startsWith('image/')) {
                entry.preview = URL.createObjectURL(file);
            }
            pending.push(entry);
        }

        if (overflow.length > 0) {
            showToast(t.Attach_TooMany([maxFiles, overflow.join(', ')]), 'warning');
        }
        if (this.inputRef.current) this.inputRef.current.value = '';
        if (pending.length === 0) return;
        onChange([...files, ...pending]);
    };

/** Удаляет файл и освобождает URL его превью. */
    private readonly remove = (index: number) => {
        const {files, onChange} = this.props;
        const lightboxIndex = this.selection.getData().index;
        const next = [...files];
        const removed = next.splice(index, 1);
        for (const file of removed) {
            if (file.preview) URL.revokeObjectURL(file.preview);
        }
        onChange(next);
        if (lightboxIndex === index) this.selection.setIndex(null);
    };

/** Открывает системный диалог выбора файлов. */
    private readonly openPicker = () => this.inputRef.current?.click();
/** Закрывает окно просмотра. */
    private readonly closeLightbox = () => this.selection.setIndex(null);
/** Удаляет файл, выбранный в окне просмотра. */
    private readonly removeCurrent = () => {
        const index = this.selection.getData().index;
        if (index !== null) this.remove(index);
    };

    /** Рисует прикреплённые файлы, если они выбраны. */
    private renderThumbs(files: readonly PendingFile[]) {
        if (!files.length) return null;
        return (
            <AttachmentThumbs
                files={files}
                onOpen={this.selection.setIndex}
                onRemove={this.remove}
            />
        );
    }

    /** Рисует кнопку добавления, пока не достигнут лимит файлов. */
    private renderAddRow(files: readonly PendingFile[], maxFiles: number, accept?: string) {
        if (files.length >= maxFiles) return null;
        return (
            <AttachmentAddRow
                inputRef={this.inputRef}
                accept={accept}
                onFiles={this.addFiles}
                count={files.length}
                maxFiles={maxFiles}
                onPick={this.openPicker}
                hint={t.Attach_Hint([maxFiles, MAX_FILE_SIZE_MB])}
            />
        );
    }

    /** Рисует плитки, кнопку добавления и просмотр. */
    public render() {
        const {files, accept} = this.props;
        const maxFiles = this.props.maxFiles === undefined ? MAX_ATTACHMENTS : this.props.maxFiles;
        const {index} = this.useCarburetor(this.selection);
        const previewFiles = files.map(addPreviewIndex).filter(hasPreview);

        return (
            <div>
                {this.renderThumbs(files)}
                {this.renderAddRow(files, maxFiles, accept)}
                <AttachmentLightbox
                    current={index !== null ? files[index] : null}
                    previewFiles={previewFiles}
                    currentIndex={index ?? -1}
                    onNavigate={this.selection.setIndex}
                    onRemove={this.removeCurrent}
                    onClose={this.closeLightbox}
                />
            </div>
        );
    }
}
