import bwipjs from 'bwip-js/node';

export async function createDataMatrixPng(payload: string, scale = 4): Promise<Buffer> {
	const options = {
		bcid: 'datamatrix',
		text: payload,
		scale,
		includetext: false,
		backgroundcolor: 'FFFFFF'
	};
	return Promise.resolve(bwipjs.toBuffer(options)) as Promise<Buffer>;
}
