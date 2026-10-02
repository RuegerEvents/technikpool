/** A generated PDF shown in the browser, under a name that survives non-ASCII titles. */
export function pdfResponse(bytes: Uint8Array, filename: string) {
	const ascii = filename.normalize('NFKD').replace(/[^\w.-]+/g, '-');
	return new Response(bytes as BodyInit, {
		headers: {
			'content-type': 'application/pdf',
			'content-disposition': `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
			'cache-control': 'private, no-store'
		}
	});
}
