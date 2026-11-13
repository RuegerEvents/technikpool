import { CheckoutError, type AffectedRecords } from '#lib/server/services/checkout.js';
import { appError, type AppErrorCode } from '#lib/errors.js';
import { refreshEquipmentViews } from './equipment-views';

// Shared by the remote files that book equipment (checkout.remote.ts,
// production-handout.remote.ts). Not a remote file itself: those may export
// remote functions only.

/**
 * Refresh what the calling page holds of whatever the service just changed —
 * the page names it with `.updates(...EQUIPMENT_VIEWS)`. The service itself is
 * framework-agnostic and only reports which records it touched.
 */
export async function refreshAffected(affected: AffectedRecords) {
	await refreshEquipmentViews({
		...affected,
		// Only when a unit of a kit moved — most scans don't touch one.
		bundles: affected.bundleIds.length > 0
	});
}

/**
 * The service is framework-agnostic and reports what went wrong as its own code
 * (`/api/v1` maps the same codes onto HTTP statuses). Here they become the app's
 * error codes, so the browser gets a translated sentence rather than the bare
 * 500 a plain throw would turn into.
 */
const ERROR_CODES: Record<CheckoutError['code'], AppErrorCode> = {
	asset_not_found: 'asset_not_found',
	serial_ambiguous: 'asset_serial_ambiguous',
	forbidden: 'unauthorized',
	wrong_organization: 'asset_wrong_organization',
	asset_retired: 'asset_retired_no_booking',
	asset_unavailable: 'asset_unavailable_no_booking',
	production_cancelled: 'production_cancelled',
	not_approved: 'booking_not_approved',
	not_a_pack_case: 'pack_not_a_case',
	pack_circle: 'pack_circle',
	kit_started: 'kit_swap_started',
	kit_not_interchangeable: 'kit_swap_not_interchangeable',
	kit_unavailable: 'kit_swap_unavailable'
};

const STATUS_BY_CODE: Record<CheckoutError['code'], number> = {
	asset_not_found: 404,
	serial_ambiguous: 409,
	forbidden: 403,
	wrong_organization: 403,
	asset_retired: 409,
	asset_unavailable: 409,
	production_cancelled: 409,
	not_approved: 409,
	not_a_pack_case: 409,
	pack_circle: 409,
	kit_started: 409,
	kit_not_interchangeable: 409,
	kit_unavailable: 409
};

export async function withCheckoutErrors<T>(fn: () => Promise<T>): Promise<T> {
	try {
		return await fn();
	} catch (err) {
		if (err instanceof CheckoutError) {
			appError(STATUS_BY_CODE[err.code], ERROR_CODES[err.code], err.params ?? [err.assetTag ?? '']);
		}
		throw err;
	}
}
