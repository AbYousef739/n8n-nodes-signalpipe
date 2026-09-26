'use strict';

// A stand-in for the parts of n8n's runtime the nodes use. The request helper
// fails the way n8n-core's httpRequestWithAuthentication does: it wraps the
// HTTP client's error in a NodeApiError.

const { NodeApiError } = require('n8n-workflow');

const API = 'https://api.signalpipe.io';

const NODE = {
	id: 'node-1',
	name: 'SignalPipe',
	type: 'n8n-nodes-signalpipe.signalPipe',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

/** Shaped like an axios error, which is what n8n's HTTP layer throws. */
class AxiosError extends Error {
	constructor(status, data) {
		super(`Request failed with status code ${status}`);
		this.response = { status, data };
	}
}

function makeContext({
	params = {},
	items = [{ json: {} }],
	responses = {},
	continueOnFail = false,
	mode = 'trigger',
	staticData = {},
} = {}) {
	const calls = [];
	return {
		calls,
		staticData,
		getInputData: () => items,
		getNode: () => NODE,
		getMode: () => mode,
		continueOnFail: () => continueOnFail,
		getWorkflowStaticData: () => staticData,
		// execute: (name, itemIndex, fallback, options); poll and load options: (name, fallback, options)
		getNodeParameter(name, a, b, c) {
			const perItem = typeof a === 'number';
			const itemIndex = perItem ? a : 0;
			const fallback = perItem ? b : a;
			const options = perItem ? c : b;
			const source = typeof params === 'function' ? params(itemIndex) : params;
			let value = source[name];
			if (value === undefined) return fallback;
			if (options && options.extractValue && value && typeof value === 'object' && value.__rl) {
				value = value.value;
			}
			return value;
		},
		helpers: {
			async httpRequestWithAuthentication(credentialType, options) {
				calls.push({ credentialType, ...options });
				const key = `${options.method} ${options.url.replace(API, '')}`;
				let response = responses[key];
				if (typeof response === 'function') response = response(options, calls.length);
				if (response === undefined) throw new Error(`No fake response for ${key}`);
				if (response instanceof AxiosError) throw new NodeApiError(NODE, response);
				return JSON.parse(JSON.stringify(response));
			},
			returnJsonArray: (data) => (Array.isArray(data) ? data : [data]).map((json) => ({ json })),
			constructExecutionMetaData: (data, { itemData }) =>
				data.map((entry) => ({ ...entry, pairedItem: itemData })),
		},
	};
}

/** A /sync/missions row, including the internal fields the node must drop. */
function missionRow(overrides = {}) {
	const { leads, products, ...rest } = overrides;
	return {
		id: 'm-1',
		status: 'pending_approval',
		raw_score: 71,
		outreach_channel: 'reddit_comment',
		draft_content: 'Most teams fix this with a shared follow-up queue.',
		product_id: 'prod-1',
		owner_id: 'owner-1',
		created_at: '2026-09-26T10:00:00Z',
		updated_at: '2026-09-26T10:05:00Z',
		swarm_low_confidence: false,
		swarm_disagreement: 0.81,
		fused_score: 0.9,
		swarm: { judges: { skeptic: 'doubtful', analyst: 'interested', optimist: 'keen' }, split: true },
		leads: {
			title: 'Need a CRM that follows up',
			snippet: 'We keep losing deals because nobody follows up.',
			url: 'https://www.reddit.com/r/sales/comments/abc',
			author_handle: 'u/buyer',
			source_platform: 'reddit',
			strategy: { role: 'advisor' },
			created_at: '2026-09-26T09:59:00Z',
			signal_score: 88,
			competitor_match: false,
			embedding: [0.12, 0.34],
			...leads,
		},
		products: {
			name: 'Acme CRM',
			value_prop: 'Follow-ups that happen on their own',
			target_audience: 'Sales teams',
			anchor_sentences: ['one', 'two', 'three'],
			...products,
		},
		...rest,
	};
}

module.exports = { API, AxiosError, NODE, makeContext, missionRow };
