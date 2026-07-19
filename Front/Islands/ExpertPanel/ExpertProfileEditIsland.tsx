import * as React from 'react';
import {useState} from 'react';
import {User} from 'lucide-react';
import {D} from '@common/Debug/D';
import {sendPost} from '@common/Api/sendPost';
import {showToast} from '@common/Components/GlobalToast';
import {useSending} from '@common/hooks/useSending';
import SendButton from '@common/Components/SendButton';
import {PageHeader} from '@common/Components/PageHeader';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';

export interface ExpertProfileEditProps {
    profile: {
        display_name: string;
        bio: string;
        specialization: string;
    };
    limits: {
        display_name: number;
        specialization: number;
        bio: number;
    };
    isApproved: boolean;
    saveUrl: string;
    publicProfileUrl: string;
}

export const ExpertProfileEditIsland: React.FC<ExpertProfileEditProps> = (props) => {
    const {sending, withSending} = useSending();

    const [displayName, setDisplayName] = useState(props.profile.display_name ?? '');
    const [specialization, setSpecialization] = useState(props.profile.specialization ?? '');
    const [bio, setBio] = useState(props.profile.bio ?? '');
    const [formError, setFormError] = useState('');

    const handleSave = () => {
        setFormError('');

        // Light client-side guard mirroring the server limits. The server is
        // the source of truth (ExpertProfileService::updateProfile) — these
        // checks just avoid a round-trip for obvious mistakes.
        if (!displayName.trim()) {
            setFormError(t.ExpertProfile_DisplayNameRequired());
            return;
        }

        withSending(async () => {
            D('expert.profile.save', {});
            try {
                const resp = await sendPost(props.saveUrl, {
                    display_name: displayName,
                    specialization,
                    bio,
                });
                const updated = (resp as any)?.profile;
                if (updated) {
                    setDisplayName(updated.display_name ?? displayName);
                    setSpecialization(updated.specialization ?? specialization);
                    setBio(updated.bio ?? bio);
                }
                showToast(t.ExpertProfile_Saved(), 'success');
            } catch (e: any) {
                D('expert.profile.error', {error: e?.message});
                const resp = e?.response;
                const msg = (resp && typeof resp === 'object' && resp.error)
                    ? resp.error
                    : (e?.message || t.General_Error());
                showToast(msg, 'danger');
            }
        });
    };

    const remaining = (value: string, max: number): number => Math.max(0, max - (value?.length ?? 0));

    return (
        <>
            <PageHeader
                title={t.ExpertProfile_Title()}
                icon={<User size={22} aria-hidden="true" />}
                actions={
                    <a
                        href={props.publicProfileUrl}
                        className="btn btn-sm btn-outline-secondary"
                        data-test-id="expert-profile-view-public"
                    >
                        {t.ExpertProfile_ViewPublic()}
                    </a>
                }
            />

            {props.isApproved === false && (
                <div className="section-soft mb-4 p-4 border border-warning text-sm" data-test-id="expert-pending-approval">
                    {t.ExpertProfile_PendingApprovalHint()}
                </div>
            )}

            <div className="section-soft">
                <div className="space-y-4">
                    {/* Display name */}
                    <div>
                        <label className="form-label" htmlFor="expert-profile-display-name">
                            {t.ExpertProfile_DisplayName()}
                        </label>
                        <input
                            id="expert-profile-display-name"
                            type="text"
                            className="form-control"
                            value={displayName}
                            onChange={e => setDisplayName(e.target.value)}
                            maxLength={props.limits.display_name}
                            data-test-id="expert-profile-display-name"
                        />
                        <div className="text-xs text-muted mt-1">{t.ExpertProfile_DisplayNameHelp()}</div>
                    </div>

                    {/* Specialization */}
                    <div>
                        <label className="form-label" htmlFor="expert-profile-specialization">
                            {t.ExpertProfile_Specialization()}
                        </label>
                        <input
                            id="expert-profile-specialization"
                            type="text"
                            className="form-control"
                            value={specialization}
                            onChange={e => setSpecialization(e.target.value)}
                            maxLength={props.limits.specialization}
                            data-test-id="expert-profile-specialization"
                        />
                        <div className="text-xs text-muted mt-1">
                            {remaining(specialization, props.limits.specialization)}
                        </div>
                    </div>

                    {/* Bio */}
                    <div>
                        <label className="form-label" htmlFor="expert-profile-bio">
                            {t.ExpertProfile_Bio()}
                        </label>
                        <textarea
                            id="expert-profile-bio"
                            className="form-control"
                            rows={6}
                            value={bio}
                            onChange={e => setBio(e.target.value)}
                            maxLength={props.limits.bio}
                            data-test-id="expert-profile-bio"
                        />
                        <div className="text-xs text-muted mt-1">
                            {t.ExpertProfile_BioHelp()}
                            <span className="float-end">{remaining(bio, props.limits.bio)}</span>
                        </div>
                    </div>

                    {formError && (
                        <div className="text-sm text-danger" data-test-id="expert-profile-form-error">
                            {formError}
                        </div>
                    )}

                    <div>
                        <SendButton
                            onClick={handleSave}
                            sending={sending}
                            label={t.ExpertProfile_Save()}
                            testId="expert-profile-save"
                        />
                    </div>
                </div>
            </div>
        </>
    );
};

export default ExpertProfileEditIsland;
