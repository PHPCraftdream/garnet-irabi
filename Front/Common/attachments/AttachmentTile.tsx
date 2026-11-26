import * as React from 'react';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import {formatSize} from './helpers/formatSize';

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
export class AttachmentTile extends React.Component<Props> {
/** Открывает превью файла, если оно доступно. */
    private readonly open = () => {
        const {file, index, onOpen} = this.props;
        if (file.preview) onOpen(index);
    };

/** Удаляет плитку, не открывая её превью. */
    private readonly remove = (event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        this.props.onRemove(this.props.index);
    };

/** Рисует плитку файла и кнопку удаления. */
    public render() {
        const {file, index} = this.props;
        return (
            <div
                className="pick-file-tile"
                style={{width: 80, height: 80}}
                onClick={this.open}
            >
                {file.preview
                    ? <img src={file.preview} alt={file.name} className="pick-tile-image" />
                    : (
                        <div className="pick-tile-fallback">
                            {file.name.split('.').pop()?.toUpperCase()}
                            <br />
                            {formatSize(file.file.size)}
                        </div>
                    )}
                <button
                    type="button"
                    className="pick-tile-remove"
                    onClick={this.remove}
                    data-test-id={`attachment-remove-${index}`}
                    title={t.A11y_RemoveAttachment()}
                    aria-label={t.A11y_RemoveAttachment()}
                >
                    ×
                </button>
            </div>
        );
    }
}
