// Plain server-side templates — not covered by wuchale (Svelte-only), so
// these are written in German to match the app's default locale.

export function escapeHtml(value: string) {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

export function renderButton(label: string, url: string) {
	return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td class="tp-button" bgcolor="#18181b" style="border-radius:6px;background-color:#18181b"><a class="tp-button" href="${url}" style="display:inline-block;padding:12px 24px;font-family:sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border:1px solid #71717a;border-radius:6px">${escapeHtml(label)}</a></td></tr></table>`;
}

// Mail clients with a dark mode either honour a dark scheme the mail declares
// or recolour it themselves. Declaring `light dark` plus the media query gives
// Apple Mail and Outlook our own dark palette; `[data-ogsc]`/`[data-ogsb]` are
// the attributes Outlook.com puts on the body in its dark mode, which ignores
// the media query. Every rule needs `!important` to beat the inline styles the
// light version is written in, and every background is repeated as `bgcolor`
// for the clients that only read the attribute.
//
// Thunderbird (`mail.dark-reader.enabled`, on by default) takes none of that:
// it deletes every `bgcolor` and every background brighter than luminance 200,
// and dark text colours with them. What is left of the header and the button
// is #18181b on its own near-identical grey. Borders are the one thing it never
// touches, so the card and the button carry one in a colour that reads on both
// white and dark — that outline is what still makes them a card and a button.
const darkStyles = `
	:root { color-scheme: light dark; supported-color-schemes: light dark; }
	@media (prefers-color-scheme: dark) {
		.tp-page { background-color:#0a0a0a !important; }
		.tp-card { background-color:#171717 !important; border-color:#262626 !important; }
		.tp-header { background-color:#262626 !important; }
		.tp-body { color:#e5e5e5 !important; }
		.tp-muted { color:#a3a3a3 !important; }
		.tp-footer { background-color:#121212 !important; color:#737373 !important; }
		td.tp-button { background-color:#fafafa !important; }
		a.tp-button { color:#171717 !important; border-color:#fafafa !important; }
	}
	[data-ogsb] .tp-page { background-color:#0a0a0a !important; }
	[data-ogsb] .tp-card { background-color:#171717 !important; border-color:#262626 !important; }
	[data-ogsb] .tp-header { background-color:#262626 !important; }
	[data-ogsc] .tp-body { color:#e5e5e5 !important; }
	[data-ogsc] .tp-muted { color:#a3a3a3 !important; }
	[data-ogsb] .tp-footer { background-color:#121212 !important; }
	[data-ogsc] .tp-footer { color:#737373 !important; }
	[data-ogsb] td.tp-button { background-color:#fafafa !important; }
	[data-ogsc] a.tp-button { color:#171717 !important; border-color:#fafafa !important; }
`;

export function renderEmailLayout(opts: { preheader?: string; bodyHtml: string }) {
	return `<!doctype html>
<html lang="de">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<meta name="color-scheme" content="light dark" />
		<meta name="supported-color-schemes" content="light dark" />
		<title>Technikpool</title>
		<style>${darkStyles}</style>
	</head>
	<body class="tp-page" style="margin:0;padding:0;background-color:#f4f4f5">
		${opts.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(opts.preheader)}</div>` : ''}
		<table class="tp-page" bgcolor="#f4f4f5" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px">
			<tr>
				<td align="center">
					<table class="tp-card" bgcolor="#ffffff" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border:1px solid #e4e4e7;border-radius:8px;overflow:hidden;font-family:sans-serif">
						<tr>
							<td class="tp-header" bgcolor="#18181b" style="padding:24px 32px;background-color:#18181b">
								<span style="font-size:18px;font-weight:700;color:#ffffff">Technikpool</span>
							</td>
						</tr>
						<tr>
							<td class="tp-body" style="padding:32px;font-size:15px;line-height:1.6;color:#27272a">
								${opts.bodyHtml}
							</td>
						</tr>
						<tr>
							<td class="tp-footer" bgcolor="#fafafa" style="padding:16px 32px;background-color:#fafafa;font-size:12px;color:#a1a1aa">
								Diese E-Mail wurde automatisch von Technikpool versendet.
							</td>
						</tr>
					</table>
				</td>
			</tr>
		</table>
	</body>
</html>`;
}
