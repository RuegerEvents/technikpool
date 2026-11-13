/**
 * What a list says about the org a unit, kit or production belongs to: its
 * name and how it is drawn. Never `organization: true` in a query anything is
 * listed from — the row carries the org's IBAN, tax number and billing
 * templates, and it went out to everyone who could see a unit, a
 * DEVICE_VIEWER included. It was also a third of the device list's size.
 */
export const ORG_SUMMARY_SELECT = {
	id: true,
	name: true,
	shortName: true,
	color: true,
	avatarLabel: true,
	logoPath: true
} as const;
