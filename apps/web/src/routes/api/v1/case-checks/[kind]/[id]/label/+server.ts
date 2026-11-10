import type { RequestHandler } from './$types';
import { apiError, apiJson, handleApi, requireApiUser } from '#lib/server/api.js';
import { withCaseCheckErrors } from '#lib/server/case-check-api.js';
import { caseLabelData } from '#lib/server/services/case-check.js';
import { labelLogo } from '#lib/server/case-label-logo.js';
import {
	LABEL_DPMM,
	LABEL_SIZES,
	LOGO_BOX,
	labelaryViewerUrl,
	renderCaseLabel,
	type CaseLabelSize
} from '#lib/server/case-label-zpl.js';

const KINDS = ['bundle', 'asset'] as const;
const SIZES: CaseLabelSize[] = ['large', 'small'];

export const GET: RequestHandler = ({ locals, params, url }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const kind = KINDS.find((k) => k === params.kind);
		if (!kind) return apiError(400, 'invalid_request', 'kind must be bundle or asset');
		const sizeParam = url.searchParams.get('size') ?? 'large';
		const size = SIZES.find((s) => s === sizeParam);
		if (!size) return apiError(400, 'invalid_request', 'size must be large or small');

		return withCaseCheckErrors(async () => {
			const { logoPath, ...data } = await caseLabelData(user.id, { kind, id: params.id });
			const logo = await labelLogo(logoPath, LOGO_BOX[size]);
			const { zpl, labels } = renderCaseLabel(data, size, logo);
			return apiJson('CaseLabel', {
				size,
				zpl,
				labelCount: labels,
				widthMm: LABEL_SIZES[size].widthMm,
				heightMm: LABEL_SIZES[size].heightMm,
				dpmm: LABEL_DPMM,
				previewUrl: labelaryViewerUrl(zpl, size)
			});
		});
	});
