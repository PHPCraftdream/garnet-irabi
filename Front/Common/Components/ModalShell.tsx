import * as React from 'react';
import {Portal} from '@common/Components/Portal';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';

/**
 * Оболочка модального окна: затемнение, карточка, шапка с крестиком.
 *
 * Вынесена отдельно, потому что сама по себе съедала три уровня вложенности в
 * каждом окне — а правило простое: не больше четырёх. Всё, что окно хочет
 * показать, приходит одним `children` и оказывается на четвёртом уровне.
 */
interface HeaderProps {
    title: string;
    titleClassName?: string;
    testId: string;
    onClose: () => void;
}

const ModalHeader: React.FC<HeaderProps> = ({title, titleClassName = '', testId, onClose}) => (
    <div className="fg-modal-header-row">
        <h3 className={`fg-modal-title ${titleClassName}`}>{title}</h3>
        <button
            type="button"
            className="fg-modal-close-x"
            onClick={onClose}
            title={t.Action_Close()}
            aria-label={t.Action_Close()}
            data-test-id={`${testId}-close`}
        >
            &times;
        </button>
    </div>
);

interface Props {
    title: string;
    /** Дополнительный класс заголовка — например, красный у необратимых действий. */
    titleClassName?: string;
    testId: string;
    onClose: () => void;
    /** Ширина карточки; по умолчанию средняя. */
    size?: 'md' | 'lg';
    children: React.ReactNode;
}

export const ModalShell: React.FC<Props> = ({title, titleClassName, testId, onClose, size = 'md', children}) => (
    <Portal>
        <div
            className="fg-modal-overlay"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
            data-test-id={testId}
        >
            <div role="dialog" aria-modal="true" aria-label={title} className={`fg-modal-card fg-modal-card-${size}`}>
                <ModalHeader title={title} titleClassName={titleClassName} testId={testId} onClose={onClose} />
                {children}
            </div>
        </div>
    </Portal>
);
