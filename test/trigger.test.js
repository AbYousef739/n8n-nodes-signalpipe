'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { SignalPipeTrigger } = require('../dist/nodes/SignalPipeTrigger/SignalPipeTrigger.node.js');
const { makeContext, missionRow } = require('./helpers');

const trigger = new SignalPipeTrigger();

/** A fake account whose queue can change between polls. */
function account(initial) {
	const state = { rows: initial };
	return {
		state,
		responses: { 'GET /sync/missions': () => ({ missions: state.rows }) },
	};
}

const ids = (result) => (result ? result[0].map((item) => item.json.id) : null);

test('the first poll after activation remembers the queue without starting the workflow', async () => {
	const { responses } = account([missionRow({ id: 'old-2' }), missionRow({ id: 'old-1' })]);
	const ctx = makeContext({ responses });
	assert.equal(await trigger.poll.call(ctx), null);
	assert.deepEqual(ctx.staticData.seenIds, ['old-2', 'old-1']);
	assert.deepEqual(ctx.calls[0].qs, { limit: 200, sort: 'newest' });
});

test('later polls start the workflow only for new missions, oldest first', async () => {
	const acct = account([missionRow({ id: 'old-1' })]);
	const ctx = makeContext({ responses: acct.responses });
	await trigger.poll.call(ctx);

	acct.state.rows = [missionRow({ id: 'new-2' }), missionRow({ id: 'new-1' }), missionRow({ id: 'old-1' })];
	assert.deepEqual(ids(await trigger.poll.call(ctx)), ['new-1', 'new-2']);
	assert.deepEqual(ctx.staticData.seenIds, ['new-2', 'new-1', 'old-1']);

	assert.equal(await trigger.poll.call(ctx), null);
});

test('approved missions never start the workflow', async () => {
	const acct = account([]);
	const ctx = makeContext({ responses: acct.responses });
	await trigger.poll.call(ctx);
	acct.state.rows = [missionRow({ id: 'a', status: 'approved' }), missionRow({ id: 'b', status: 'draft_needed' })];
	assert.deepEqual(ids(await trigger.poll.call(ctx)), ['b']);
});

test('with Only With a Draft, a mission triggers once its draft arrives', async () => {
	const acct = account([]);
	const ctx = makeContext({ responses: acct.responses, params: { filters: { onlyDrafted: true } } });
	await trigger.poll.call(ctx);

	acct.state.rows = [missionRow({ id: 'm', status: 'draft_needed' })];
	assert.equal(await trigger.poll.call(ctx), null);

	acct.state.rows = [missionRow({ id: 'm', status: 'pending_approval' })];
	assert.deepEqual(ids(await trigger.poll.call(ctx)), ['m']);
});

test('the product and minimum score filters apply', async () => {
	const acct = account([]);
	const ctx = makeContext({
		responses: acct.responses,
		params: { filters: { productId: 'prod-1', minScore: 80 } },
	});
	await trigger.poll.call(ctx);
	acct.state.rows = [
		missionRow({ id: 'keep', leads: { signal_score: 85 } }),
		missionRow({ id: 'low', leads: { signal_score: 60 } }),
		missionRow({ id: 'other', product_id: 'prod-2', leads: { signal_score: 95 } }),
	];
	assert.deepEqual(ids(await trigger.poll.call(ctx)), ['keep']);
});

test('a test run returns the newest match and leaves the remembered queue alone', async () => {
	const staticData = { seenIds: ['x'] };
	const { responses } = account([missionRow({ id: 'newest' }), missionRow({ id: 'older' })]);
	const ctx = makeContext({ responses, mode: 'manual', staticData });
	const result = await trigger.poll.call(ctx);
	assert.deepEqual(ids(result), ['newest']);
	assert.equal(result[0][0].json.lead.handle, 'u/buyer');
	assert.deepEqual(staticData, { seenIds: ['x'] });

	const empty = makeContext({ responses: account([]).responses, mode: 'manual' });
	assert.equal(await trigger.poll.call(empty), null);
});

test('the remembered queue is capped', async () => {
	const acct = account([]);
	const staticData = { seenIds: Array.from({ length: 1000 }, (_, n) => `seen-${n}`) };
	const ctx = makeContext({ responses: acct.responses, staticData });
	acct.state.rows = [missionRow({ id: 'fresh' })];
	assert.deepEqual(ids(await trigger.poll.call(ctx)), ['fresh']);
	assert.equal(staticData.seenIds.length, 1000);
	assert.equal(staticData.seenIds[0], 'fresh');
	assert.ok(!staticData.seenIds.includes('seen-999'));
});
