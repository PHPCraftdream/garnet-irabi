import * as React from 'react';

interface Props {
    name: string;
    photo: string | null;
    onView?: () => void;
}

/** Фото пользователя или инициалы, если фото нет. */
export const UserAvatar: React.FC<Props> = ({name, photo, onView}) => {
    if (!photo) {
        const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';

        return <div className="admin-user-avatar-fallback">{initials}</div>;
    }

    const img = <img src={photo} alt={name} className="admin-user-avatar-img" />;

    if (!onView) return img;

    return (
        <button
            type="button"
            className="p-0 border-0 bg-transparent cursor-pointer"
            onClick={onView}
            title={name}
            data-test-id="admin-user-avatar"
        >
            {img}
        </button>
    );
};
