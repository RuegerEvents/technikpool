import type { RequestHandler } from './$types';
import { apiError, apiJson, handleApi, requireApiUser } from '#lib/server/api.js';
import { withHandoutErrors } from '#lib/server/production-handout-api.js';
import { packCaseLabelData } from '#lib/server/services/production-handout.js';
import { labelLogo } from '#lib/server/case-label-logo.js';
import {
	LABEL_DPMM,
	LABEL_SIZES,
	LOGO_BOX,
	labelaryViewerUrl,
	renderCaseLabel,
	type CaseLabelSize
} from '#lib/server/case-label-zpl.js';

const SIZES: CaseLabelSize[] = ['large', 'small'];

// A pack case's label for one production — the case label's renderer with
// the production's contents. See `packCaseLabelData`.

export const GET: RequestHandler = ({ locals, params, url }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const sizeParam = url.searchParams.get('size') ?? 'large';
		const size = SIZES.find((s) => s === sizeParam);
		if (!size) return apiError(400, 'invalid_request', 'size must be large or small');

		return withHandoutErrors(async () => {
			const { logoPath, ...data } = await packCaseLabelData(
				user.id,
				params.productionId,
				params.caseAssetId
			);
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
