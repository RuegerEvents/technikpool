import { escapeHtml, renderButton, renderEmailLayout } from './layout';

/**
 * Two audiences, one message. Crew get the reason and a link, since the
 * production is theirs to open. A lending org gets neither: it may not open
 * another org's production, and the reason is that org's business — what it
 * needs is that its units are free again.
 */
export function productionCancelledEmail(
	opts: { name?: string | null; productionName: string; orgName: string } & (
		| { audience: 'crew'; reason: string; url: string }
		| { audience: 'lender'; releasedCount: number }
	)
) {
	const greeting = opts.name ? `Hallo ${opts.name},` : 'Hallo,';
	const production = escapeHtml(opts.productionName);
	const org = escapeHtml(opts.orgName);

	const units =
		opts.audience === 'lender'
			? opts.releasedCount === 1
				? '1 Gerät'
				: `${opts.releasedCount} Geräte`
			: '';

	const bodyHtml =
		opts.audience === 'crew'
			? `
			<p style="margin:0 0 16px">${escapeHtml(greeting)}</p>
			<p style="margin:0 0 16px">
				<strong>${org}</strong> hat die Produktion <strong>${production}</strong> abgesagt.
			</p>
			<p style="margin:0 0 16px;white-space:pre-line">Grund: ${escapeHtml(opts.reason)}</p>
			${renderButton('Produktion ansehen', opts.url)}
		`
			: `
			<p style="margin:0 0 16px">${escapeHtml(greeting)}</p>
			<p style="margin:0 0 16px">
				<strong>${org}</strong> hat die Produktion <strong>${production}</strong> abgesagt.
				${units} von euch, die dafür angefragt oder zugesagt waren, sind wieder frei.
			</p>
		`;

	const text = (
		opts.audience === 'crew'
			? [
					greeting,
					'',
					`${opts.orgName} hat die Produktion "${opts.productionName}" abgesagt.`,
					`Grund: ${opts.reason}`,
					'',
					opts.url
				]
			: [
					greeting,
					'',
					`${opts.orgName} hat die Produktion "${opts.productionName}" abgesagt.`,
					`${units} von euch, die dafür angefragt oder zugesagt waren, sind wieder frei.`
				]
	).join('\n');

	return {
		subject: `Technikpool: "${opts.productionName}" abgesagt`,
		html: renderEmailLayout({
			preheader: `${opts.orgName} hat die Produktion "${opts.productionName}" abgesagt.`,
			bodyHtml
		}),
		text
	};
}
