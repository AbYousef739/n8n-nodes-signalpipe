'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { NodeApiError, NodeOperationError } = require('n8n-workflow');
const { SignalPipe } = require('../dist/nodes/SignalPipe/SignalPipe.node.js');
const { SignalPipeApi } = require('../dist/credentials/SignalPipeApi.credentials.js');
const { searchProducts, getProducts } = require('../dist/nodes/SignalPipe/shared/methods.js');
const { API, AxiosError, makeContext, missionRow } = require('./helpers');

const node = new SignalPipe();
const run = (ctx) => node.execute.call(ctx);
const product = (value) => ({ __rl: true, mode: 'list', value });

const SCORE_RESPONSE = {
	score: 82,
	content_score: 55,
	swarm_ran: true,
	swarm_skipped: null,
	degraded: false,
	plan: 'starter',
	quota_month: 3000,
	quota_used_month: 12,
	swarm: { judges: { skeptic: 'doubtful', analyst: 'interested', optimist: 'keen' }, split: false },
	panel_verdict: 'kept',
	context_used: true,
	role: 'closer',
	classification: 'buying_intent',
	sub_scores: { urgency: 0.6, specificity: 0.7, keyword_density: 0.2 },
	competitor_match: false,
	competitor_name: null,
	competitor_intent: null,
	sarcastic: false,
	source_hint: 'reddit',
	drafting_context: { product: { name: 'Acme CRM' }, instructions: 'Write one reply' },
};

const SIMPLE_VERDICT = {
	score: 82,
	classification: 'buying_intent',
	panel_verdict: 'kept',
	degraded: false,
	swarm_skipped: null,
	role: 'closer',
	competitor_name: null,
};

test('the credential sends the key as a Bearer token and is checked against the product list', () => {
	const credential = new SignalPipeApi();
	assert.equal(credential.name, 'signalPipeApi');
	assert.equal(credential.authenticate.properties.headers.Authorization, '=Bearer {{$credentials.apiKey}}');
	assert.deepEqual(credential.test.request, { baseURL: API, url: '/products/list', method: 'GET' });
	const key = credential.properties.find((p) => p.name === 'apiKey');
	assert.equal(key.typeOptions.password, true);
});

test('every operation the node offers has an implementation', async () => {
	const resources = node.description.properties.find((p) => p.name === 'resource').options;
	for (const { value: resource } of resources) {
		const operations = node.description.properties.find(
			(p) => p.name === 'operation' && p.displayOptions.show.resource[0] === resource,
		).options;
		for (const { value: operation } of operations) {
			const ctx = makeContext({ params: { resource, operation } });
			await assert.rejects(run(ctx), (error) => {
				assert.doesNotMatch(error.message, /is not available/, `${resource}/${operation}`);
				return true;
			});
		}
	}
});

test('Score sends the text, product and options, and returns the verdict for each item', async () => {
	const texts = ['  We keep losing deals, any tool for follow-ups?  ', 'Looking for a CRM'];
	const ctx = makeContext({
		items: texts.map((text) => ({ json: { text } })),
		params: (i) => ({
			resource: 'signal',
			operation: 'score',
			productId: product('prod-1'),
			text: texts[i],
			options: i === 0 ? { context: ' The original post ', sourceHint: 'reddit' } : {},
		}),
		responses: { 'POST /signal/score': SCORE_RESPONSE },
	});

	const [out] = await run(ctx);

	assert.equal(ctx.calls.length, 2);
	assert.equal(ctx.calls[0].credentialType, 'signalPipeApi');
	assert.equal(ctx.calls[0].url, `${API}/signal/score`);
	assert.equal(ctx.calls[0].json, true);
	assert.deepEqual(ctx.calls[0].body, {
		text: 'We keep losing deals, any tool for follow-ups?',
		product_id: 'prod-1',
		context: 'The original post',
		source_hint: 'reddit',
	});
	assert.deepEqual(ctx.calls[1].body, { text: 'Looking for a CRM', product_id: 'prod-1' });
	assert.deepEqual(out.map((o) => o.json), [SIMPLE_VERDICT, SIMPLE_VERDICT]);
	assert.deepEqual(out.map((o) => o.pairedItem), [{ item: 0 }, { item: 1 }]);
});

test('Score with Simplify off returns everything SignalPipe sent', async () => {
	const ctx = makeContext({
		params: { resource: 'signal', operation: 'score', productId: product('prod-1'), text: 'Any CRM that follows up?', simplify: false },
		responses: { 'POST /signal/score': SCORE_RESPONSE },
	});
	const [out] = await run(ctx);
	assert.deepEqual(out[0].json, SCORE_RESPONSE);
});

test('Score refuses empty text without calling SignalPipe', async () => {
	const ctx = makeContext({
		params: { resource: 'signal', operation: 'score', productId: product('prod-1'), text: '   ' },
	});
	await assert.rejects(run(ctx), (error) => {
		assert.ok(error instanceof NodeOperationError);
		assert.equal(error.message, 'Text is empty');
		assert.equal(error.context.itemIndex, 0);
		return true;
	});
	assert.equal(ctx.calls.length, 0);
});

test("SignalPipe's own error sentence reaches the user, with its status", async () => {
	const detail = 'This product is paused. Resume it (update_product with active=true) to score against it.';
	const ctx = makeContext({
		params: { resource: 'signal', operation: 'score', productId: product('prod-1'), text: 'hello there' },
		responses: { 'POST /signal/score': new AxiosError(409, { detail }) },
	});
	await assert.rejects(run(ctx), (error) => {
		assert.ok(error instanceof NodeApiError);
		assert.equal(error.message, detail);
		assert.equal(String(error.httpCode), '409');
		assert.equal(error.context.itemIndex, 0);
		return true;
	});
});

test('a rejected key gets a message that says what to do', async () => {
	const ctx = makeContext({
		params: { resource: 'product', operation: 'getAll', returnAll: true },
		responses: { 'GET /products/list': new AxiosError(401, { detail: 'Unauthorized' }) },
	});
	await assert.rejects(run(ctx), (error) => {
		assert.equal(error.message, 'SignalPipe did not accept the operator key');
		assert.match(error.description, /signalpipe\.io\/dashboard/);
		return true;
	});
});

test('an outage says the service could not complete the request', async () => {
	const ctx = makeContext({
		params: { resource: 'product', operation: 'getAll', returnAll: true },
		responses: { 'GET /products/list': new AxiosError(503, { detail: 'embedding service unavailable' }) },
	});
	await assert.rejects(run(ctx), (error) => {
		assert.equal(error.message, 'SignalPipe could not complete the request');
		assert.equal(error.description, 'embedding service unavailable');
		return true;
	});
});

test('with Continue On Fail, a failed item becomes an error item and the rest still run', async () => {
	const texts = ['first text here', 'second text here'];
	const ctx = makeContext({
		continueOnFail: true,
		items: texts.map((text) => ({ json: { text } })),
		params: (i) => ({ resource: 'signal', operation: 'score', productId: product('prod-1'), text: texts[i] }),
		responses: {
			'POST /signal/score': (_options, n) =>
				n === 1 ? new AxiosError(404, { detail: "Unknown product_id 'prod-1'" }) : SCORE_RESPONSE,
		},
	});
	const [out] = await run(ctx);
	assert.deepEqual(out[0], { json: { error: "Unknown product_id 'prod-1'" }, pairedItem: { item: 0 } });
	assert.deepEqual(out[1].json, SIMPLE_VERDICT);
});

test('Get Many missions returns the public mission shape and drops internal fields', async () => {
	const ctx = makeContext({
		params: { resource: 'mission', operation: 'getAll', returnAll: true },
		responses: { 'GET /sync/missions': { missions: [missionRow()] } },
	});
	const [out] = await run(ctx);

	assert.deepEqual(ctx.calls[0].qs, { limit: 200, sort: 'newest' });
	assert.deepEqual(out[0].json, {
		id: 'm-1',
		status: 'pending_approval',
		score: 88,
		raw_score: 71,
		channel: 'reddit_comment',
		draft: 'Most teams fix this with a shared follow-up queue.',
		product: 'Acme CRM',
		product_id: 'prod-1',
		created_at: '2026-09-26T10:00:00Z',
		swarm_low_confidence: false,
		split: true,
		lead: {
			title: 'Need a CRM that follows up',
			snippet: 'We keep losing deals because nobody follows up.',
			url: 'https://www.reddit.com/r/sales/comments/abc',
			handle: 'u/buyer',
			platform: 'reddit',
			role: 'advisor',
			found_at: '2026-09-26T09:59:00Z',
		},
	});
	const serialized = JSON.stringify(out);
	for (const internal of ['swarm_disagreement', 'fused_score', 'owner_id', 'embedding', 'anchor_sentences', 'judges']) {
		assert.ok(!serialized.includes(internal), `${internal} must not be returned`);
	}
});

test('Get Many missions names a competitor and falls back to the raw score', async () => {
	const row = missionRow({
		raw_score: 64,
		leads: { signal_score: null, competitor_match: true, competitor_name: 'HubSpot' },
		swarm: undefined,
	});
	const ctx = makeContext({
		params: { resource: 'mission', operation: 'getAll', returnAll: true },
		responses: { 'GET /sync/missions': { missions: [row] } },
	});
	const [out] = await run(ctx);
	assert.equal(out[0].json.score, 64);
	assert.equal(out[0].json.competitor, 'HubSpot');
	assert.equal(out[0].json.split, false);
});

test('Get Many missions applies filters, sort, drafting context and the limit', async () => {
	const rows = [
		missionRow({ id: 'a', status: 'pending_approval', leads: { signal_score: 90 } }),
		missionRow({ id: 'b', status: 'draft_needed', leads: { signal_score: 95 }, draft_context: { lead: {} } }),
		missionRow({ id: 'c', status: 'approved', leads: { signal_score: 99 } }),
		missionRow({ id: 'd', status: 'draft_needed', product_id: 'prod-2', leads: { signal_score: 97 } }),
		missionRow({ id: 'e', status: 'draft_needed', leads: { signal_score: 40 } }),
	];
	const ctx = makeContext({
		params: {
			resource: 'mission',
			operation: 'getAll',
			returnAll: false,
			limit: 1,
			filters: { statuses: ['pending_approval', 'draft_needed'], productId: 'prod-1', minScore: 60 },
			options: { sort: 'consensus', includeDraftContext: true },
		},
		responses: { 'GET /sync/missions': { missions: rows } },
	});
	const [out] = await run(ctx);
	assert.deepEqual(ctx.calls[0].qs, { limit: 200, sort: 'consensus', include: 'draft_context' });
	assert.deepEqual(out.map((o) => o.json.id), ['a']);

	ctx.calls.length = 0;
	const all = makeContext({
		params: {
			resource: 'mission',
			operation: 'getAll',
			returnAll: true,
			filters: { statuses: ['draft_needed'], productId: 'prod-1', minScore: 60 },
			options: { includeDraftContext: true },
		},
		responses: { 'GET /sync/missions': { missions: rows } },
	});
	const [both] = await run(all);
	assert.deepEqual(both.map((o) => o.json.id), ['b']);
	assert.deepEqual(both[0].json.draft_context, { lead: {} });
});

test('Approve sends the edited reply only when there is one', async () => {
	const edited = makeContext({
		params: { resource: 'mission', operation: 'approve', missionId: ' m-1 ', approveOptions: { draft: ' New wording ' } },
		responses: { 'POST /actions/approve': { status: 'ok' } },
	});
	const [out] = await run(edited);
	assert.deepEqual(edited.calls[0].body, { id: 'm-1', draft: 'New wording' });
	assert.deepEqual(out[0].json, { mission_id: 'm-1', status: 'approved', edited: true });

	const plain = makeContext({
		params: { resource: 'mission', operation: 'approve', missionId: 'm-2' },
		responses: { 'POST /actions/approve': { status: 'ok' } },
	});
	const [plainOut] = await run(plain);
	assert.deepEqual(plain.calls[0].body, { id: 'm-2' });
	assert.equal(plainOut[0].json.edited, false);
});

test('Reject, Delete, Mark as Sent and Upload Draft call the right endpoints', async () => {
	const cases = [
		{
			params: { operation: 'reject', missionId: 'm-1', reason: 'spam' },
			key: 'POST /actions/reject',
			body: { id: 'm-1', rejection_reason: 'spam' },
			out: { mission_id: 'm-1', status: 'rejected', reason: 'spam' },
		},
		{
			params: { operation: 'delete', missionId: 'id with/slash' },
			key: 'DELETE /actions/mission/id%20with%2Fslash',
			body: undefined,
			out: { deleted: true },
		},
		{
			params: { operation: 'markSent', missionId: 'm-1' },
			key: 'POST /actions/mark_sent',
			body: { id: 'm-1' },
			out: { mission_id: 'm-1', status: 'sent' },
		},
		{
			params: { operation: 'uploadDraft', missionId: 'm-1', draft: ' My reply ' },
			key: 'POST /actions/upload_draft',
			body: { id: 'm-1', content: 'My reply' },
			out: { mission_id: 'm-1', status: 'pending_approval', draft: 'My reply' },
		},
	];
	for (const c of cases) {
		const ctx = makeContext({
			params: { resource: 'mission', ...c.params },
			responses: { [c.key]: { status: 'ok' } },
		});
		const [out] = await run(ctx);
		assert.equal(`${ctx.calls[0].method} ${ctx.calls[0].url.replace(API, '')}`, c.key);
		assert.deepEqual(ctx.calls[0].body, c.body);
		assert.deepEqual(out[0].json, c.out);
	}
});

test('a mission action without a mission ID fails before calling SignalPipe', async () => {
	const ctx = makeContext({ params: { resource: 'mission', operation: 'reject', missionId: '' } });
	await assert.rejects(run(ctx), /Mission ID is empty/);
	assert.equal(ctx.calls.length, 0);
});

test('Get Many products drops the learning stats and honours the limit', async () => {
	const products = [
		{ id: 'p1', name: 'Acme CRM', value_prop: 'v', target_audience: 't', active: true, rl_weight: 1.3, created_at: 'x' },
		{ id: 'p2', name: 'Beta', value_prop: 'v2', target_audience: 't2', active: false, rl_weight: 0.7, created_at: 'y' },
	];
	const ctx = makeContext({
		params: { resource: 'product', operation: 'getAll', returnAll: false, limit: 1 },
		responses: { 'GET /products/list': { products } },
	});
	const [out] = await run(ctx);
	assert.deepEqual(out.map((o) => o.json), [
		{ id: 'p1', name: 'Acme CRM', value_prop: 'v', target_audience: 't', is_active: true, created_at: 'x' },
	]);
});

test('the product pickers search by name, mark paused products and sort', async () => {
	const responses = {
		'GET /products/list': {
			products: [
				{ id: 'p2', name: 'Zeta Radar', active: false },
				{ id: 'p1', name: 'Acme CRM', active: true },
				{ id: 'p3', name: 'Acme Mail', active: true },
			],
		},
	};
	const search = await searchProducts.call(makeContext({ responses }), 'acme');
	assert.deepEqual(search.results, [
		{ name: 'Acme CRM', value: 'p1' },
		{ name: 'Acme Mail', value: 'p3' },
	]);
	const options = await getProducts.call(makeContext({ responses }));
	assert.deepEqual(options, [
		{ name: 'Acme CRM', value: 'p1' },
		{ name: 'Acme Mail', value: 'p3' },
		{ name: 'Zeta Radar (paused)', value: 'p2' },
	]);
});
