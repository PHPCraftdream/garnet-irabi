import * as React from 'react';

interface Props {
    name: string;
    photo: string | null;
    onView?: () => void;
}

    /** Формирует представление данных для соответствующего раздела панели. */
function initial(word: string): string | undefined {
    return word[0];
}

/** Фото пользователя или инициалы, если фото нет. */
export const UserAvatar: React.FC<Props> = ({name, photo, onView}) => {
    if (!photo) {
        const initials = name.split(' ').map(initial).join('').slice(0, 2).toUpperCase() || '?';

        return <div className="admin-user-heading-initials">{initials}</div>;
    }

    const img = <img src={photo} alt={name} className="admin-user-heading-photo" />;

    if (!onView) return img;

    return (
        <button
            type="button"
            className="admin-user-heading-photo-button"
            onClick={onView}
            title={name}
            data-test-id="admin-user-avatar"
        >
            {img}
        </button>
    );
};
