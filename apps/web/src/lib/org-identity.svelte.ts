import { messageForErrorCode } from './error-messages.svelte';

// Colour, avatar label and asset-ID prefix are unique across every organisation, and the two
// forms that set them (create on /orgs, edit on /orgs/[id]) both have to say so before the
// round trip — a clash is a normal outcome of filling the form, not an error worth a request.
//
// The wording comes from the same table the server's `appError` uses, so the message is
// identical whether the clash is caught here or by the unique constraint behind it.

export type OrgIdentity = { color: string; avatarLabel: string; assetIdPrefix: string };

export function normalizeOrgIdentity(raw: OrgIdentity): OrgIdentity {
	return {
		color: raw.color.trim().toLowerCase(),
		avatarLabel: raw.avatarLabel.trim().toUpperCase(),
		assetIdPrefix: raw.assetIdPrefix.trim()
	};
}

/** The message to show, or null when the identity is well formed and still free. */
export function orgIdentityProblem(
	raw: OrgIdentity,
	inUse: (OrgIdentity & { name?: string | null })[]
): string | null {
	const { color, avatarLabel, assetIdPrefix } = normalizeOrgIdentity(raw);

	if (!/^#[0-9a-f]{6}$/.test(color)) return messageForErrorCode('org_color_invalid');
	if (!/^[A-Z]{2}$/.test(avatarLabel)) return messageForErrorCode('org_avatar_label_invalid');
	if (!/^[0-9]{3}$/.test(assetIdPrefix)) return messageForErrorCode('org_prefix_invalid');

	if (inUse.some((org) => org.color.toLowerCase() === color)) {
		return messageForErrorCode('org_color_taken', [color]);
	}
	if (inUse.some((org) => org.avatarLabel === avatarLabel)) {
		return messageForErrorCode('org_avatar_label_taken', [avatarLabel]);
	}
	if (inUse.some((org) => org.assetIdPrefix === assetIdPrefix)) {
		return messageForErrorCode('org_prefix_taken', [assetIdPrefix]);
	}
	return null;
}
