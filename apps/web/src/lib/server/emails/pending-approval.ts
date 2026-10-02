import { escapeHtml, renderButton, renderEmailLayout } from './layout';

export function pendingApprovalEmail(opts: {
	name?: string | null;
	ownerOrgName: string;
	requestingOrgName: string;
	productionName: string;
	pendingCount: number;
	url: string;
	/** The borrower says the production is unpaid and asks to have it free of charge. */
	unpaid?: boolean;
	note?: string | null;
}) {
	const greeting = opts.name ? `Hallo ${opts.name},` : 'Hallo,';
	const itemText =
		opts.pendingCount === 1
			? '1 Ausrüstungsgegenstand wartet'
			: `${opts.pendingCount} Ausrüstungsgegenstände warten`;

	const unpaidText = 'Die Produktion ist unbezahlt – es wird um eine kostenlose Leihe gebeten.';

	const html = renderEmailLayout({
		preheader: `${opts.requestingOrgName} möchte Ausrüstung von ${opts.ownerOrgName} ausleihen.`,
		bodyHtml: `
			<p style="margin:0 0 16px">${escapeHtml(greeting)}</p>
			<p style="margin:0 0 16px">
				<strong>${escapeHtml(opts.requestingOrgName)}</strong> möchte Ausrüstung von
				<strong>${escapeHtml(opts.ownerOrgName)}</strong> für die Produktion
				<strong>${escapeHtml(opts.productionName)}</strong> ausleihen. ${itemText} auf deine Freigabe.
			</p>
			${opts.unpaid ? `<p style="margin:0 0 16px"><strong>${escapeHtml(unpaidText)}</strong></p>` : ''}
			${
				opts.note
					? `<p style="margin:0 0 16px;padding:12px 16px;border-left:3px solid #d4d4d4;white-space:pre-wrap">${escapeHtml(opts.note)}</p>`
					: ''
			}
			${renderButton('Anfrage ansehen', opts.url)}
		`
	});

	const text = [
		greeting,
		'',
		`${opts.requestingOrgName} möchte Ausrüstung von ${opts.ownerOrgName} für die Produktion "${opts.productionName}" ausleihen.`,
		`${itemText} auf deine Freigabe.`,
		...(opts.unpaid ? ['', unpaidText] : []),
		...(opts.note ? ['', opts.note] : []),
		'',
		opts.url
	].join('\n');

	return {
		subject: `Technikpool: Freigabe erforderlich für "${opts.productionName}"`,
		html,
		text
	};
}
