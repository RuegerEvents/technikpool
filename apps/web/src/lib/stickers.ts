/**
 * Sticker defaults shared by the generator and the configuration page. They
 * live outside `server/stickers/` so the page can show the same values the
 * server would fall back to without pulling the PDF generator into the bundle.
 */
export const DEFAULT_ORG_NAME = 'Rüger Events';
export const DEFAULT_STICKER_COLOR = '#09524e';

/**
 * The org name as it should be printed on a sticker. Org names often carry a
 * descriptive tail ("Rüger Events - Veranstaltungstechnik"); only the part in
 * front of the dash identifies the owner, and it is all that fits the 3mm
 * footer band at a legible cap height.
 */
export function stickerOrgName(name: string): string {
	return name.split(' - ')[0].trim();
}
