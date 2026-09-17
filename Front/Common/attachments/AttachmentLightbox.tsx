import * as React from 'react';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';

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
    <div className="common-pick-lightbox-actions">
        <button
            type="button"
            className="common-pick-lightbox-btn-danger"
            onClick={onRemove}
            title={t.A11y_RemoveAttachment()}
            aria-label={t.A11y_RemoveAttachment()}
        >
            ×
        </button>
        <button
            type="button"
            className="common-pick-lightbox-btn-neutral"
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
            className="common-pick-lightbox-nav left-2"
            title={t.A11y_PreviousImage()}
            aria-label={t.A11y_PreviousImage()}
            onClick={onPrev}
        >
            ‹
        </button>
        <button
            type="button"
            className="common-pick-lightbox-nav right-2"
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
export const AttachmentLightbox: React.FC<Props> = ({
    current,
    previewFiles,
    currentIndex,
    onNavigate,
    onRemove,
    onClose,
}) => {
    if (!current?.preview) return null;

    const pos = previewFiles.findIndex(f => f.index === currentIndex);
    const many = previewFiles.length > 1;

    const goPrev = () => onNavigate((pos > 0 ? previewFiles[pos - 1] : previewFiles[previewFiles.length - 1]).index);
    const goNext = () => onNavigate((pos < previewFiles.length - 1 ? previewFiles[pos + 1] : previewFiles[0]).index);

    return (
        <div className="common-pick-lightbox" onClick={onClose} data-test-id="attachment-lightbox">
            <div
                role="dialog"
                aria-modal="true"
                aria-label={t.A11y_ImagePreview()}
                className="common-pick-lightbox-frame"
                onClick={e => e.stopPropagation()}
            >
                <img src={current.preview} alt={current.name} className="common-pick-lightbox-img" />
                <LightboxActions onRemove={onRemove} onClose={onClose} />
                {many && <LightboxNav onPrev={goPrev} onNext={goNext} />}
                <div className="common-pick-lightbox-caption">
                    {current.name}
                    {many && ` (${pos + 1}/${previewFiles.length})`}
                </div>
            </div>
        </div>
    );
};
