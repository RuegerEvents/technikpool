import { renderButton, renderEmailLayout } from './layout';

export function pendingApprovalEmail(opts: {
	name?: string | null;
	ownerOrgName: string;
	requestingOrgName: string;
	productionName: string;
	pendingCount: number;
	url: string;
}) {
	const greeting = opts.name ? `Hallo ${opts.name},` : 'Hallo,';
	const itemText =
		opts.pendingCount === 1
			? '1 Ausrüstungsgegenstand wartet'
			: `${opts.pendingCount} Ausrüstungsgegenstände warten`;

	const html = renderEmailLayout({
		preheader: `${opts.requestingOrgName} möchte Ausrüstung von ${opts.ownerOrgName} ausleihen.`,
		bodyHtml: `
			<p style="margin:0 0 16px">${greeting}</p>
			<p style="margin:0 0 16px">
				<strong>${opts.requestingOrgName}</strong> möchte Ausrüstung von
				<strong>${opts.ownerOrgName}</strong> für die Produktion
				<strong>${opts.productionName}</strong> ausleihen. ${itemText} auf deine Freigabe.
			</p>
			${renderButton('Anfrage ansehen', opts.url)}
			<p style="margin:0;color:#71717a">
				Du erhältst erst dann wieder eine Benachrichtigung, wenn alle offenen Anfragen
				für diese Produktion bearbeitet wurden und eine neue hinzukommt.
			</p>
		`
	});

	const text = [
		greeting,
		'',
		`${opts.requestingOrgName} möchte Ausrüstung von ${opts.ownerOrgName} für die Produktion "${opts.productionName}" ausleihen.`,
		`${itemText} auf deine Freigabe.`,
		'',
		opts.url,
		'',
		'Du erhältst erst dann wieder eine Benachrichtigung, wenn alle offenen Anfragen für diese Produktion bearbeitet wurden und eine neue hinzukommt.'
	].join('\n');

	return {
		subject: `Technikpool: Freigabe erforderlich für "${opts.productionName}"`,
		html,
		text
	};
}
