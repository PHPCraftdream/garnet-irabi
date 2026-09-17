import * as React from 'react';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';

export function formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + 'B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';

    return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
}

interface TileFile {
    id: string;
    name: string;
    preview?: string;
    file: File | Blob;
}

interface Props {
    file: TileFile;
    index: number;
    onOpen: (index: number) => void;
    onRemove: (index: number) => void;
}

/**
 * Плитка выбранного файла: превью для картинки, расширение и размер для
 * остального. Крестик убирает файл и не открывает просмотр — поэтому
 * всплытие останавливается.
 */
export const AttachmentTile: React.FC<Props> = ({file, index, onOpen, onRemove}) => (
    <div
        className="group common-pick-tile"
        style={{width: 80, height: 80}}
        onClick={() => file.preview && onOpen(index)}
    >
        {file.preview
            ? <img src={file.preview} alt={file.name} className="w-full h-full object-cover" />
            : (
                <div className="common-pick-tile-fallback">
                    {file.name.split('.').pop()?.toUpperCase()}
                    <br />
                    {formatSize(file.file.size)}
                </div>
            )}
        <button
            type="button"
            className="common-pick-remove"
            onClick={(e) => { e.stopPropagation(); onRemove(index); }}
            data-test-id={`attachment-remove-${index}`}
            title={t.A11y_RemoveAttachment()}
            aria-label={t.A11y_RemoveAttachment()}
        >
            ×
        </button>
    </div>
);
