import { error } from '@sveltejs/kit';
import { messageForErrorCode } from './error-messages.svelte';

/**
 * Every failure a remote function reports to the browser carries one of these codes.
 *
 * The code is the contract; the wording is not. `appError` looks the text up in
 * `error-messages.svelte.ts` — the one place it lives, and the only place wuchale can
 * translate it from — so a message never has to be written twice or kept in sync.
 *
 * This mirrors `/api/v1`, which has always answered with `{ error: { code, message } }`
 * and lets the scanner app localise from the code (`describeError` in the Flutter client).
 * The two surfaces are deliberately separate lists: `/api/v1`'s codes are published in
 * `openapi.yaml` and cannot change without a spec revision, while these are internal to
 * the web client and free to move.
 */
export type AppErrorCode =
	// Authentication and permissions
	| 'unauthorized'
	| 'admin_required'
	| 'not_org_member'
	| 'org_manage_forbidden'
	| 'billing_manage_forbidden'
	| 'production_delete_forbidden'
	| 'production_cancel_forbidden'
	| 'asset_create_forbidden'
	| 'approval_forbidden'
	| 'decline_forbidden'
	| 'product_edit_forbidden'
	| 'product_delete_forbidden'
	| 'product_merge_forbidden'
	| 'product_units_other_orgs'
	| 'product_merge_units_other_orgs'
	| 'product_unowned_not_creator'
	| 'connector_edit_forbidden'
	| 'rates_forbidden'
	// Invitations
	| 'invite_user_exists'
	| 'invitation_not_found'
	// Catalogue: manufacturers, categories, products, connectors
	| 'catalog_revert_unavailable'
	| 'catalog_revert_stale'
	| 'manufacturer_name_required'
	| 'manufacturer_required'
	| 'manufacturer_exists'
	| 'manufacturer_merge_self'
	| 'category_name_required'
	| 'category_required'
	| 'category_exists'
	| 'product_required'
	| 'product_has_units'
	| 'product_merge_self'
	| 'product_accessory_self'
	| 'product_no_units_in_org'
	| 'connector_exists'
	| 'connector_in_use'
	| 'connector_not_found'
	// Assets
	| 'asset_not_found'
	| 'assets_not_found'
	| 'asset_tag_prefix_mismatch'
	| 'asset_retired_status_only'
	| 'asset_retired_no_accessories'
	| 'asset_retired_no_attach'
	| 'asset_retired_no_booking'
	| 'asset_retired_no_bundle'
	| 'asset_retired_no_inspection'
	| 'asset_unavailable_no_booking'
	| 'asset_unavailable_no_bundle'
	| 'asset_wrong_organization'
	| 'asset_still_booked'
	| 'assets_still_booked_one'
	| 'assets_still_booked_many'
	| 'asset_booking_conflict'
	| 'asset_delete_booked'
	| 'asset_delete_history'
	| 'asset_delete_inspected'
	| 'asset_delete_has_accessories'
	| 'asset_delete_billed'
	| 'asset_in_other_bundle'
	| 'location_invalid'
	| 'location_required'
	| 'location_used_by_other_org'
	| 'cable_row_incomplete'
	// Licences
	| 'license_not_a_license'
	| 'license_reveal_forbidden'
	| 'license_edit_forbidden'
	| 'license_nothing_stored'
	| 'license_credentials_empty'
	// Accessories
	| 'accessory_self'
	| 'accessory_nested'
	| 'accessory_org_mismatch'
	| 'accessory_bundle_conflict'
	| 'accessory_has_accessories'
	| 'accessory_already_attached'
	| 'accessory_in_bundle'
	| 'not_an_accessory'
	// Bundles
	| 'bundle_org_mismatch'
	| 'bundle_tag_taken'
	| 'bundle_category_required'
	| 'bundle_type_required'
	| 'bundle_accessory_member'
	| 'bundle_too_small'
	| 'bundle_main_not_member'
	| 'bundle_main_is_accessory'
	| 'bundle_featured_not_member'
	| 'bundle_product_not_in_type'
	| 'bundle_product_quantity_exceeded'
	| 'bundle_composition_incomplete'
	| 'bundle_members_org_mismatch'
	| 'bundle_empty'
	| 'bundle_all_in_production'
	| 'bundle_all_booked'
	| 'bundle_copy_tag_single'
	// Productions
	| 'dates_end_before_start'
	| 'show_end_before_show_start'
	| 'show_start_before_start'
	| 'show_end_after_end'
	| 'not_enough_units'
	| 'equipment_copy_same_production'
	| 'production_cancelled'
	| 'production_already_cancelled'
	| 'production_not_cancelled'
	| 'cancellation_reason_required'
	| 'booking_not_pending'
	// Offers and invoices
	| 'offer_immutable'
	| 'offer_already_finalized'
	| 'offer_not_finalized'
	| 'offer_no_production'
	| 'offer_lines_not_found'
	| 'offer_lines_mixed'
	| 'offer_has_invoice'
	| 'offer_finalized_no_delete'
	| 'offer_draft_no_revision'
	| 'offer_already_current'
	| 'offer_not_current_version'
	| 'invoice_immutable'
	| 'invoice_already_finalized'
	| 'invoice_no_production'
	| 'invoice_lines_not_found'
	| 'invoice_lines_mixed'
	| 'invoice_finalized_no_delete'
	| 'invoice_number_taken'
	| 'customer_not_found'
	| 'billing_missing_prices'
	| 'billing_missing_rates'
	| 'billing_missing_prices_and_rates'
	| 'billing_pdf_data_missing'
	// Organisations and users
	| 'org_prefix_invalid'
	| 'org_avatar_label_invalid'
	| 'org_color_invalid'
	| 'org_prefix_taken'
	| 'org_avatar_label_taken'
	| 'org_color_taken'
	| 'user_has_history'
	| 'cannot_remove_self'
	| 'cannot_change_own_admin'
	| 'cannot_delete_own_account'
	// Sticker sheets (their own endpoint, not a remote function)
	| 'sticker_config_invalid';

/** Values interpolated into a message — an asset tag, a production name, a count. */
export type ErrorParams = (string | number)[];

/**
 * Throws the SvelteKit error a remote function answers with. The status still matters
 * (the browser and any proxy read it); the code is what the client translates.
 */
export function appError(status: number, code: AppErrorCode, params: ErrorParams = []): never {
	let message: string;
	try {
		// Server-side this resolves against the request's locale, so a log line and an
		// unhandled error page read in the same language as the rest of the response.
		message = messageForErrorCode(code, params);
	} catch {
		// Building the text must never swallow the failure it was describing.
		message = code;
	}
	error(status, { code, params, message });
}

export function errorCodeOf(err: unknown): AppErrorCode | null {
	if (!err || typeof err !== 'object' || !('body' in err)) return null;
	const body = (err as { body?: unknown }).body;
	if (!body || typeof body !== 'object' || !('code' in body)) return null;
	const code = (body as { code?: unknown }).code;
	return typeof code === 'string' ? (code as AppErrorCode) : null;
}

export function errorParamsOf(err: unknown): ErrorParams {
	if (!err || typeof err !== 'object' || !('body' in err)) return [];
	const body = (err as { body?: unknown }).body;
	if (!body || typeof body !== 'object' || !('params' in body)) return [];
	const params = (body as { params?: unknown }).params;
	return Array.isArray(params) ? (params as ErrorParams) : [];
}
