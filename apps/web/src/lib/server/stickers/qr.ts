import bwipjs from 'bwip-js/node';

/** QR for on-screen scanning (device pairing), not for print — see datamatrix.ts for stickers. */
export async function createQrPng(payload: string, scale = 6): Promise<Buffer> {
	const options = {
		bcid: 'qrcode',
		text: payload,
		scale,
		includetext: false,
		backgroundcolor: 'FFFFFF'
	};
	return Promise.resolve(bwipjs.toBuffer(options)) as Promise<Buffer>;
}
