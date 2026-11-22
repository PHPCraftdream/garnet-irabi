import * as React from 'react';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';

const stopPropagation = (event: React.MouseEvent) => event.stopPropagation();

interface PreviewFile {
    name: string;
    preview?: string;
    /** Место файла в исходном списке — по нему открывается просмотр. */
    index: number;
}

interface ActionsProps {
    onRemove: () => void;
    onClose: () => void;
}

const LightboxActions: React.FC<ActionsProps> = ({onRemove, onClose}) => (
    <div className="pick-preview-actions">
        <button
            type="button"
            className="pick-remove-button"
            onClick={onRemove}
            title={t.A11y_RemoveAttachment()}
            aria-label={t.A11y_RemoveAttachment()}
        >
            ×
        </button>
        <button
            type="button"
            className="pick-close-button"
            onClick={onClose}
            title={t.Action_Close()}
            aria-label={t.Action_Close()}
        >
            ✕
        </button>
    </div>
);

interface NavProps {
    onPrev: () => void;
    onNext: () => void;
}

/** Стрелки листания — только когда картинок больше одной. */
const LightboxNav: React.FC<NavProps> = ({onPrev, onNext}) => (
    <>
        <button
            type="button"
            className="pick-previous-button"
            title={t.A11y_PreviousImage()}
            aria-label={t.A11y_PreviousImage()}
            onClick={onPrev}
        >
            ‹
        </button>
        <button
            type="button"
            className="pick-next-button"
            title={t.A11y_NextImage()}
            aria-label={t.A11y_NextImage()}
            onClick={onNext}
        >
            ›
        </button>
    </>
);

interface Props {
    /** Открытый файл; null — просмотр закрыт. */
    current: {name: string; preview?: string} | null;
    /** Только те файлы, у которых есть превью: листать можно по ним. */
    previewFiles: PreviewFile[];
    currentIndex: number;
    onNavigate: (index: number) => void;
    onRemove: () => void;
    onClose: () => void;
}

/** Просмотр выбранной картинки во весь экран, с листанием и удалением. */
export class AttachmentLightbox extends React.Component<Props> {
    private position(): number {
        const {previewFiles, currentIndex} = this.props;
        for (let i = 0; i < previewFiles.length; i++) {
            if (previewFiles[i].index === currentIndex) return i;
        }
        return -1;
    }

    private readonly goPrev = () => {
        const {previewFiles, onNavigate} = this.props;
        const pos = this.position();
        onNavigate((pos > 0 ? previewFiles[pos - 1] : previewFiles[previewFiles.length - 1]).index);
    };

    private readonly goNext = () => {
        const {previewFiles, onNavigate} = this.props;
        const pos = this.position();
        onNavigate((pos < previewFiles.length - 1 ? previewFiles[pos + 1] : previewFiles[0]).index);
    };

    public render() {
        const {current, previewFiles, onRemove, onClose} = this.props;
        if (!current?.preview) return null;

        const pos = this.position();
        const many = previewFiles.length > 1;

        return (
            <div className="pick-preview-backdrop" onClick={onClose} data-test-id="attachment-lightbox">
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label={t.A11y_ImagePreview()}
                    className="pick-preview-frame"
                    onClick={stopPropagation}
                >
                    <img src={current.preview} alt={current.name} className="pick-preview-image" />
                    <LightboxActions onRemove={onRemove} onClose={onClose} />
                    {many && <LightboxNav onPrev={this.goPrev} onNext={this.goNext} />}
                    <div className="pick-preview-caption">
                        {current.name}
                        {many && ` (${pos + 1}/${previewFiles.length})`}
                    </div>
                </div>
            </div>
        );
    }
}
