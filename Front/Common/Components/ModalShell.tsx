import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {Portal} from '@common/Components/Layout/Portal';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';

const actionClose = t.Action_Close;

/**
 * Оболочка модального окна: затемнение, карточка, шапка с крестиком.
 *
 * Вынесена отдельно, потому что сама по себе съедала три уровня вложенности в
 * каждом окне — а правило простое: не больше четырёх. Всё, что окно хочет
 * показать, приходит одним `children` и оказывается на четвёртом уровне.
 */
interface HeaderProps {
    title: string;
    titleTone?: 'danger';
    testId: string;
    onClose: () => void;
}

const ModalHeader: React.FC<HeaderProps> = ({title, titleTone, testId, onClose}) => (
    <div className="modal-shell-header">
        <h3 className="modal-shell-title" data-tone={titleTone}>{title}</h3>
        <button
            type="button"
            className="modal-shell-close"
            onClick={onClose}
            title={actionClose()}
            aria-label={actionClose()}
            data-test-id={`${testId}-close`}
        >
            &times;
        </button>
    </div>
);

interface Props {
    title: string;
    titleTone?: 'danger';
    testId: string;
    onClose: () => void;
    /** Ширина карточки; по умолчанию средняя. */
    size?: 'md' | 'lg';
    children: React.ReactNode;
}

export class ModalShell extends AntiHookComponent<Props> {
/** Закрывает окно по клику на затемнённый фон. */
    private readonly closeFromBackdrop = (event: React.MouseEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget) this.props.onClose();
    };

/** Рисует модальное окно и его содержимое. */
    render() {
        const {title, titleTone, testId, onClose, size = 'md', children} = this.props;
        return (
            <Portal>
                <div className="modal-shell-overlay" onClick={this.closeFromBackdrop} data-test-id={testId}>
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label={title}
                        className={size === 'lg' ? 'modal-shell-card-lg' : 'modal-shell-card-md'}
                    >
                        <ModalHeader title={title} titleTone={titleTone} testId={testId} onClose={onClose} />
                        {children}
                    </div>
                </div>
            </Portal>
        );
    }
}
