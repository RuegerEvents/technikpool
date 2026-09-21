import { escapeHtml, renderButton, renderEmailLayout } from './layout';

export function bookingReviewedEmail(opts: {
	name?: string | null;
	ownerOrgName: string;
	productionName: string;
	url: string;
}) {
	const greeting = opts.name ? `Hallo ${opts.name},` : 'Hallo,';

	const html = renderEmailLayout({
		preheader: `${opts.ownerOrgName} hat eure Anfragen für "${opts.productionName}" bearbeitet.`,
		bodyHtml: `
			<p style="margin:0 0 16px">${escapeHtml(greeting)}</p>
			<p style="margin:0 0 16px">
				<strong>${escapeHtml(opts.ownerOrgName)}</strong> hat alle offenen Ausleihanfragen für die
				Produktion <strong>${escapeHtml(opts.productionName)}</strong> bearbeitet.
			</p>
			${renderButton('Produktion ansehen', opts.url)}
		`
	});

	const text = [
		greeting,
		'',
		`${opts.ownerOrgName} hat alle offenen Ausleihanfragen für die Produktion "${opts.productionName}" bearbeitet.`,
		'',
		opts.url
	].join('\n');

	return {
		subject: `Technikpool: Anfragen für "${opts.productionName}" bearbeitet`,
		html,
		text
	};
}
