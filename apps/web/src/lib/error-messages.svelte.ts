import type { AppErrorCode, ErrorParams } from './errors';

// The wording for every `AppErrorCode`, and the only copy of it. `.svelte.ts` is the
// extension wuchale extracts from, which is the whole reason this is a module of its own
// rather than a table inside `errors.ts`: a message written in a `.ts` file ships
// untranslated. Used from both sides — `appError` on the server, `getErrorMessage` on the
// client — so a failure reads in the user's language wherever it surfaces.
//
// The switch is exhaustive by construction: the `never` in the default branch fails
// `pnpm check` the moment a code is added without a message.

export function messageForErrorCode(code: AppErrorCode, params: ErrorParams = []): string {
	const p0 = String(params[0] ?? '');
	const p1 = String(params[1] ?? '');

	switch (code) {
		// Authentication and permissions
		case 'unauthorized':
			return 'You are not allowed to do that.';
		case 'admin_required':
			return 'This needs system admin rights.';
		case 'not_org_member':
			return 'You are not a member of this organization.';
		case 'org_manage_forbidden':
			return 'Only org owners or system admins can manage this organization.';
		case 'billing_manage_forbidden':
			return 'Only org admins and owners can manage offers and invoices.';
		case 'production_delete_forbidden':
			return 'Only org admins and owners can delete productions.';
		case 'asset_create_forbidden':
			return 'You are not allowed to create assets in this organization.';
		case 'approval_forbidden':
			return 'You are not allowed to approve assets from this organization.';
		case 'decline_forbidden':
			return 'You are not allowed to decline assets from this organization.';
		case 'product_edit_forbidden':
			return 'You need admin rights in one of your organizations to edit products.';
		case 'product_delete_forbidden':
			return 'You need admin rights in one of your organizations to delete products.';
		case 'product_merge_forbidden':
			return 'You need admin rights in one of your organizations to merge products.';
		case 'product_units_other_orgs':
			return `Units of this product belong to ${p0}. Only an admin there can change it.`;
		case 'product_merge_units_other_orgs':
			return `Units of "${p0}" belong to ${p1}. Only an admin there can merge it.`;
		case 'product_unowned_not_creator':
			return `No organization holds units of "${p0}", so only whoever added it or a system admin can change it.`;
		case 'connector_edit_forbidden':
			return 'You need admin rights in one of your organizations to edit connectors.';
		case 'rates_forbidden':
			return 'Only admins of this organization can set its prices.';

		// Invitations
		case 'invite_user_exists':
			return `${p0} already has an account. Add them from the organization's page.`;
		case 'invitation_not_found':
			return 'This invitation no longer exists.';

		// Catalogue: manufacturers, categories, products, connectors
		case 'catalog_revert_unavailable':
			return 'This change cannot be reverted because the product no longer exists.';
		case 'catalog_revert_stale':
			return 'Nothing left to revert: every field of this change has been edited again since.';
		case 'manufacturer_name_required':
			return 'A manufacturer needs a name.';
		case 'manufacturer_required':
			return 'Manufacturer is required';
		case 'manufacturer_exists':
			return 'A manufacturer with this name already exists. Merge them instead.';
		case 'manufacturer_merge_self':
			return 'A manufacturer cannot be merged into itself.';
		case 'category_name_required':
			return 'A category needs an English name.';
		case 'category_required':
			return 'A category is required for a new product.';
		case 'category_exists':
			return `Another category is already called "${p0}".`;
		case 'product_required':
			return 'A product is required.';
		case 'product_has_units':
			return 'This product still has units. Merge it into the correct product instead.';
		case 'product_merge_self':
			return 'A product cannot be merged into itself.';
		case 'product_accessory_self':
			return 'A product cannot be an accessory of itself.';
		case 'product_no_units_in_org':
			return 'This organization has no units of that product.';
		case 'connector_exists':
			return `A connector called "${p0}" already exists.`;
		case 'connector_in_use':
			return `${p0} product(s) still use this connector. Rename it instead of deleting it.`;
		case 'connector_not_found':
			return 'One of these connectors is no longer in the catalog. Pick it again.';

		// Assets
		case 'asset_not_found':
			return `Tag "${p0}" not found.`;
		case 'assets_not_found':
			return 'No assets found.';
		case 'asset_tag_prefix_mismatch':
			return `Asset tag "${p0}" has to start with the org prefix "${p1}".`;
		case 'asset_retired_status_only':
			return 'This unit is sold or decommissioned — only its status can be changed.';
		case 'asset_retired_no_accessories':
			return 'A sold or decommissioned unit cannot have accessories attached to it.';
		case 'asset_retired_no_attach':
			return 'A sold or decommissioned unit cannot be attached to anything.';
		case 'asset_retired_no_booking':
			return 'This unit is sold or decommissioned and can no longer be booked.';
		case 'asset_retired_no_bundle':
			return 'This unit is sold or decommissioned and cannot be added to a bundle.';
		case 'asset_retired_no_inspection':
			return 'This unit is sold or decommissioned and can no longer be inspected.';
		case 'asset_unavailable_no_booking':
			return 'This unit is marked unavailable and cannot be booked or checked out.';
		case 'asset_unavailable_no_bundle':
			return 'This unit is marked unavailable and cannot be added to a bundle.';
		case 'asset_wrong_organization':
			return 'That belongs to a different organization.';
		case 'asset_still_booked':
			return `This unit is still booked for "${p0}" — remove it there first.`;
		case 'assets_still_booked_one':
			return `One unit is still booked for ${p0} — remove it there first.`;
		case 'assets_still_booked_many':
			return `${p0} units are still booked (${p1}) — remove them there first.`;
		case 'asset_booking_conflict':
			return `This unit is already booked for "${p0}" during this time.`;
		case 'asset_delete_booked':
			return `This unit has been booked for "${p0}" — decommission it instead of deleting it.`;
		case 'asset_delete_history':
			return 'This unit has been scanned or checked out — decommission it instead of deleting it.';
		case 'asset_delete_inspected':
			return 'This unit has an inspection on record — decommission it instead of deleting it.';
		case 'asset_delete_has_accessories':
			return 'Other units are attached to this one as accessories — detach them first.';
		case 'asset_delete_billed':
			return 'This unit appears on an offer or invoice — decommission it instead of deleting it.';
		case 'asset_in_other_bundle':
			return `This unit is already in the bundle "${p0}" — remove it there first.`;
		case 'location_invalid':
			return 'That location does not belong to this organization.';
		case 'location_required':
			return 'A location is required.';
		case 'location_used_by_other_org':
			return 'Another organization has a unit at one of these locations; move it first.';
		case 'cable_row_incomplete':
			return `"${p0}" says nothing about the cable — add ends, a length or a type.`;

		// Licences
		case 'license_not_a_license':
			return 'This unit is not a license, so it has no credentials.';
		case 'license_reveal_forbidden':
			return 'Credentials are only shown to whoever has this license checked out to their production, and to the organization that keeps it.';
		case 'license_edit_forbidden':
			return "Only org admins and owners can change a license's credentials.";
		case 'license_nothing_stored':
			return 'No credentials are stored for this license yet.';
		case 'license_credentials_empty':
			return 'Enter a license key, or a username and password.';

		// Accessories
		case 'accessory_self':
			return 'A unit cannot be its own accessory.';
		case 'accessory_nested':
			return 'That unit is itself an accessory — accessories are one level deep.';
		case 'accessory_org_mismatch':
			return 'An accessory has to belong to the same organization as what it is attached to.';
		case 'accessory_bundle_conflict':
			return 'An accessory is in whatever bundle its parent is in — pass one or the other.';
		case 'accessory_has_accessories':
			return 'That unit has accessories of its own — detach those first.';
		case 'accessory_already_attached':
			return 'That unit is already attached to another unit — detach it there first.';
		case 'accessory_in_bundle':
			return `That unit is in the bundle "${p0}" — remove it there first.`;
		case 'not_an_accessory':
			return 'That unit is not an accessory.';

		// Bundles
		case 'bundle_org_mismatch':
			return 'That bundle belongs to a different organization.';
		case 'bundle_tag_taken':
			return `Tag "${p0}" is already used by another bundle.`;
		case 'bundle_category_required':
			return 'A category is required for a new bundle type.';
		case 'bundle_type_required':
			return 'A bundle type is required.';
		case 'bundle_accessory_member':
			return 'This unit is an accessory — put the unit it is attached to in the bundle instead.';
		case 'bundle_too_small':
			return 'A bundle needs at least two devices to be converted.';
		case 'bundle_main_not_member':
			return 'The selected main device is not in this bundle.';
		case 'bundle_main_is_accessory':
			return 'The main device cannot itself be an accessory.';
		case 'bundle_featured_not_member':
			return 'A main device has to be a product this bundle type actually contains.';
		case 'bundle_product_not_in_type':
			return 'This bundle type does not contain that product. Every case of a type holds the same gear.';
		case 'bundle_product_quantity_exceeded':
			return `This bundle type holds no more ${p0} than it already has.`;
		case 'bundle_composition_incomplete':
			return `A case of this bundle type is still short of ${p0}× ${p1}.`;
		case 'bundle_members_org_mismatch':
			return 'All units in a bundle must belong to the same organization.';
		case 'bundle_empty':
			return 'This bundle has no units.';
		case 'bundle_all_in_production':
			return 'All units of this bundle are already in this production.';
		case 'bundle_all_booked':
			return 'All units of this bundle are already booked during this production.';
		case 'bundle_copy_tag_single':
			return 'A tag names one case — leave it empty when copying a bundle more than once.';

		// Productions
		case 'dates_end_before_start':
			return 'The end date cannot be before the start date.';
		case 'show_end_before_show_start':
			return 'The show end cannot be before the show start.';
		case 'show_start_before_start':
			return 'The show start cannot be before the overall start.';
		case 'show_end_after_end':
			return 'The show end cannot be after the overall end.';
		case 'not_enough_units':
			return `Only ${p0} more unit(s) are available to add.`;
		case 'equipment_copy_same_production':
			return 'A production cannot take over its own equipment.';

		// Offers and invoices
		case 'offer_immutable':
			return 'This offer is finalized and can no longer be changed.';
		case 'offer_already_finalized':
			return 'This offer has already been finalized.';
		case 'offer_not_finalized':
			return 'Finalize the offer before creating an invoice.';
		case 'offer_no_production':
			return 'This offer is not linked to a production.';
		case 'offer_lines_not_found':
			return 'No offer lines found.';
		case 'offer_lines_mixed':
			return 'Those lines belong to different offers.';
		case 'offer_has_invoice':
			return 'An invoice was already created from this offer.';
		case 'offer_finalized_no_delete':
			return 'A finalized offer cannot be deleted.';
		case 'offer_draft_no_revision':
			return 'A draft offer can still be edited directly.';
		case 'offer_already_current':
			return `${p0} is already the current version of this offer.`;
		case 'offer_not_current_version':
			return `Only the current version, ${p0}, can be invoiced.`;
		case 'invoice_immutable':
			return 'This invoice has been sent and can no longer be changed.';
		case 'invoice_already_finalized':
			return 'This invoice has already been finalized.';
		case 'invoice_no_production':
			return 'This invoice is not linked to a production.';
		case 'invoice_lines_not_found':
			return 'No invoice lines found.';
		case 'invoice_lines_mixed':
			return 'Those lines belong to different invoices.';
		case 'invoice_finalized_no_delete':
			return 'A finalized invoice cannot be deleted.';
		case 'invoice_number_taken':
			return `Invoice number "${p0}" is already taken in this organization.`;
		case 'customer_not_found':
			return 'That customer no longer exists.';
		case 'billing_missing_prices':
			return `No net purchase price set for: ${p0}`;
		case 'billing_missing_rates':
			return `No rental rate set for category: ${p0}`;
		case 'billing_missing_prices_and_rates':
			return `No net purchase price set for: ${p0}. No rental rate set for category: ${p1}`;
		case 'billing_pdf_data_missing':
			return `The PDF cannot be generated. Missing billing data: ${p0}`;

		// Organisations and users
		case 'org_prefix_invalid':
			return 'The asset ID prefix has to be exactly 3 digits.';
		case 'org_avatar_label_invalid':
			return 'The avatar label has to be exactly 2 letters.';
		case 'org_color_invalid':
			return 'Pick a color as #RRGGBB.';
		case 'org_prefix_taken':
			return `The asset ID prefix ${p0} is already taken. Pick another one.`;
		case 'org_avatar_label_taken':
			return `The avatar label ${p0} is already taken. Pick another one.`;
		case 'org_color_taken':
			return `The color ${p0} is already taken. Pick another one.`;
		case 'user_has_history':
			return 'This user appears in asset history and cannot be deleted.';
		case 'cannot_remove_self':
			return 'You cannot remove yourself from the organization.';
		case 'cannot_change_own_admin':
			return 'You cannot change your own admin status.';
		case 'cannot_delete_own_account':
			return 'You cannot delete your own account.';

		// Sticker sheets
		case 'sticker_config_invalid':
			return `The sticker sheet could not be generated: ${p0}`;

		default: {
			// Exhaustiveness guard — a new code without a message fails to compile here.
			const unhandled: never = code;
			return unhandled;
		}
	}
}
