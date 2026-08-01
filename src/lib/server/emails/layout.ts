// Plain server-side templates — not covered by wuchale (Svelte-only), so
// these are written in German to match the app's default locale.

function escapeHtml(value: string) {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

export function renderButton(label: string, url: string) {
	return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td style="border-radius:6px;background-color:#18181b"><a href="${url}" style="display:inline-block;padding:12px 24px;font-family:sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px">${escapeHtml(label)}</a></td></tr></table>`;
}

export function renderEmailLayout(opts: { preheader?: string; bodyHtml: string }) {
	return `<!doctype html>
<html lang="de">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>Technikpool</title>
	</head>
	<body style="margin:0;padding:0;background-color:#f4f4f5">
		${opts.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(opts.preheader)}</div>` : ''}
		<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px">
			<tr>
				<td align="center">
					<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border-radius:8px;overflow:hidden;font-family:sans-serif">
						<tr>
							<td style="padding:24px 32px;background-color:#18181b">
								<span style="font-size:18px;font-weight:700;color:#ffffff">Technikpool</span>
							</td>
						</tr>
						<tr>
							<td style="padding:32px;font-size:15px;line-height:1.6;color:#27272a">
								${opts.bodyHtml}
							</td>
						</tr>
						<tr>
							<td style="padding:16px 32px;background-color:#fafafa;font-size:12px;color:#a1a1aa">
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
