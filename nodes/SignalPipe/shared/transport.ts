import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	IPollFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

export const SIGNALPIPE_API_URL = 'https://api.signalpipe.io';

export const CREDENTIAL_TYPE = 'signalPipeApi';

type SignalPipeContext = IExecuteFunctions | ILoadOptionsFunctions | IPollFunctions;

/** The HTTP status of a failed request, wherever n8n or axios put it. */
export function statusOf(error: unknown): number | undefined {
	const e = error as IDataObject & {
		cause?: { response?: { status?: unknown } };
		response?: { status?: unknown };
	};
	const raw = e?.httpCode ?? e?.cause?.response?.status ?? e?.response?.status ?? e?.statusCode;
	const status = Number(raw);
	return Number.isInteger(status) && status > 0 ? status : undefined;
}

/**
 * SignalPipe answers errors as `{"detail": "..."}` and writes that sentence for
 * the person reading it ("This product is paused. Resume it..."). n8n keeps the
 * response body in different places depending on which layer wrapped the error,
 * so look in each of them.
 */
export function detailOf(error: unknown): string | undefined {
	const e = error as {
		context?: { data?: unknown };
		cause?: { response?: { data?: unknown } };
		response?: { data?: unknown; body?: unknown };
	};
	const bodies = [e?.context?.data, e?.cause?.response?.data, e?.response?.data, e?.response?.body];
	for (const body of bodies) {
		if (!body || typeof body !== 'object') continue;
		const detail = (body as IDataObject).detail;
		if (typeof detail === 'string' && detail.trim()) return detail.trim();
		// Request validation errors arrive as a list of {loc, msg}.
		if (Array.isArray(detail) && detail.length) {
			return detail
				.map((d) => (d && typeof d === 'object' ? String((d as IDataObject).msg ?? '') : String(d)))
				.filter(Boolean)
				.join('; ');
		}
	}
	return undefined;
}

/** The message and hint shown in n8n for a failed SignalPipe request. */
export function describeFailure(
	status: number | undefined,
	detail: string | undefined,
): { message: string; description?: string } {
	if (status === 401) {
		return {
			message: 'SignalPipe did not accept the operator key',
			description:
				'Check the SignalPipe credential. A key only works while its subscription is active, and you can create a new one at https://signalpipe.io/dashboard.',
		};
	}
	if (status === 429) {
		return {
			message: 'SignalPipe is receiving too many requests from this account',
			description: detail ?? 'Wait a minute and try again, or turn on Retry On Fail in the node settings.',
		};
	}
	if (status !== undefined && status >= 500) {
		return {
			message: 'SignalPipe could not complete the request',
			description:
				detail ??
				'The service may be restarting. Try again shortly, or turn on Retry On Fail in the node settings.',
		};
	}
	if (detail) return { message: detail };
	if (status === 404) return { message: 'SignalPipe could not find that item' };
	return { message: 'SignalPipe could not complete the request' };
}

export async function signalPipeApiRequest(
	this: SignalPipeContext,
	method: IHttpRequestMethods,
	endpoint: string,
	body?: IDataObject,
	qs?: IDataObject,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
	const options: IHttpRequestOptions = {
		method,
		url: `${SIGNALPIPE_API_URL}${endpoint}`,
		json: true,
	};
	if (body !== undefined) options.body = body;
	if (qs !== undefined) options.qs = qs;

	try {
		return await this.helpers.httpRequestWithAuthentication.call(this, CREDENTIAL_TYPE, options);
	} catch (error) {
		const status = statusOf(error);
		const { message, description } = describeFailure(status, detailOf(error));
		if (error instanceof NodeApiError) {
			// Re-wrapping a NodeApiError hands back the original unchanged, so set
			// the wording on the error the request helper already built.
			error.message = message;
			error.description = description ?? null;
			throw new NodeApiError(this.getNode(), error as unknown as JsonObject);
		}
		throw new NodeApiError(this.getNode(), error as JsonObject, {
			message,
			description,
			httpCode: status === undefined ? undefined : String(status),
		});
	}
}
