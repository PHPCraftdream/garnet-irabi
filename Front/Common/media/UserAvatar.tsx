import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {UserX} from 'lucide-react';

interface Props {
    name: string;
    avatar?: string | null;
    /** sm → 36px (lists/headers), lg → 80px (profile cards). */
    size?: 'sm' | 'lg';
    testId?: string;
    className?: string;
    /** Blocked account → show a neutral placeholder icon, never the real photo. */
    disabled?: boolean;
}

function initialOf(word: string): string {
    return word[0]?.toUpperCase() || '';
}

function initialsOf(name: string): string {
    return (name || '?')
        .split(' ')
        .map(initialOf)
        .slice(0, 2)
        .join('');
}

/**
 * Shared user avatar: renders the uploaded photo when present, otherwise an
 * initials circle. Same footprint either way (see avatar-circle* CSS).
 */
export class UserAvatar extends AntiHookComponent<Props> {
    private cls(base: string): string {
        const {className} = this.props;
        return className ? `${base} ${className}` : base;
    }

    render() {
        const {name, avatar, size = 'sm', testId, disabled} = this.props;
        const imgCls = size === 'lg' ? 'avatar-circle-lg-img' : 'avatar-circle-img';
        const boxCls = size === 'lg' ? 'avatar-circle-lg' : 'avatar-circle';

        if (disabled) {
            return (
                <div className={this.cls(boxCls)} data-test-id={testId ? `${testId}-disabled` : undefined} title={name}>
                    <UserX size={size === 'lg' ? 36 : 18} aria-hidden="true" />
                </div>
            );
        }

        if (avatar) {
            return <img src={avatar} alt={name} className={this.cls(imgCls)} data-test-id={testId} />;
        }
        return (
            <div className={this.cls(boxCls)} data-test-id={testId ? `${testId}-fallback` : undefined}>
                {initialsOf(name)}
            </div>
        );
    }
}
