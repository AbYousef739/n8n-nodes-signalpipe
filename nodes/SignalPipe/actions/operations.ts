import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import {
	fetchOpenMissions,
	fetchProducts,
	filterMissions,
	MAX_MISSIONS,
	type MissionFilters,
} from '../shared/data';
import { signalPipeApiRequest } from '../shared/transport';

type OperationResult = IDataObject | IDataObject[];

function requiredText(this: IExecuteFunctions, name: string, i: number, label: string, hint: string): string {
	const value = String(this.getNodeParameter(name, i, '') ?? '').trim();
	if (!value) {
		throw new NodeOperationError(this.getNode(), `${label} is empty`, { itemIndex: i, description: hint });
	}
	return value;
}

function missionId(this: IExecuteFunctions, i: number): string {
	return requiredText.call(
		this,
		'missionId',
		i,
		'Mission ID',
		'Map the id field from SignalPipe Get Many or from the SignalPipe Trigger.',
	);
}

async function scoreSignal(this: IExecuteFunctions, i: number): Promise<OperationResult> {
	const productId = String(
		this.getNodeParameter('productId', i, '', { extractValue: true }) ?? '',
	).trim();
	if (!productId) {
		throw new NodeOperationError(this.getNode(), 'No product chosen', {
			itemIndex: i,
			description: 'Choose the product the author would be buying.',
		});
	}
	const text = requiredText.call(
		this,
		'text',
		i,
		'Text',
		'Map the field that holds the post, message or email to judge.',
	);
	const options = this.getNodeParameter('options', i, {}) as { context?: string; sourceHint?: string };

	const body: IDataObject = { text, product_id: productId };
	const context = String(options.context ?? '').trim();
	const sourceHint = String(options.sourceHint ?? '').trim();
	if (context) body.context = context;
	if (sourceHint) body.source_hint = sourceHint;

	const verdict = (await signalPipeApiRequest.call(this, 'POST', '/signal/score', body)) as IDataObject;
	if (!(this.getNodeParameter('simplify', i, true) as boolean)) return verdict;
	return simplifyVerdict(verdict);
}

/** The fields most workflows branch on. */
export function simplifyVerdict(verdict: IDataObject): IDataObject {
	return {
		score: verdict.score ?? null,
		classification: verdict.classification ?? null,
		panel_verdict: verdict.panel_verdict ?? null,
		degraded: verdict.degraded ?? false,
		swarm_skipped: verdict.swarm_skipped ?? null,
		role: verdict.role ?? null,
		competitor_name: verdict.competitor_name ?? null,
	};
}

async function getManyMissions(this: IExecuteFunctions, i: number): Promise<OperationResult> {
	const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;
	const limit = returnAll ? MAX_MISSIONS : (this.getNodeParameter('limit', i, 50) as number);
	const filters = this.getNodeParameter('filters', i, {}) as MissionFilters;
	const options = this.getNodeParameter('options', i, {}) as {
		sort?: string;
		includeDraftContext?: boolean;
	};
	const missions = await fetchOpenMissions.call(this, options);
	return filterMissions(missions, filters).slice(0, limit);
}

async function approveMission(this: IExecuteFunctions, i: number): Promise<OperationResult> {
	const id = missionId.call(this, i);
	const options = this.getNodeParameter('approveOptions', i, {}) as { draft?: string };
	const body: IDataObject = { id };
	const edited = String(options.draft ?? '').trim();
	if (edited) body.draft = edited;
	await signalPipeApiRequest.call(this, 'POST', '/actions/approve', body);
	return { mission_id: id, status: 'approved', edited: Boolean(edited) };
}

async function deleteMission(this: IExecuteFunctions, i: number): Promise<OperationResult> {
	const id = missionId.call(this, i);
	await signalPipeApiRequest.call(this, 'DELETE', `/actions/mission/${encodeURIComponent(id)}`);
	return { deleted: true };
}

async function markMissionSent(this: IExecuteFunctions, i: number): Promise<OperationResult> {
	const id = missionId.call(this, i);
	await signalPipeApiRequest.call(this, 'POST', '/actions/mark_sent', { id });
	return { mission_id: id, status: 'sent' };
}

async function rejectMission(this: IExecuteFunctions, i: number): Promise<OperationResult> {
	const id = missionId.call(this, i);
	const reason = (this.getNodeParameter('reason', i, 'no_reason') as string) || 'no_reason';
	await signalPipeApiRequest.call(this, 'POST', '/actions/reject', { id, rejection_reason: reason });
	return { mission_id: id, status: 'rejected', reason };
}

async function uploadMissionDraft(this: IExecuteFunctions, i: number): Promise<OperationResult> {
	const id = missionId.call(this, i);
	const draft = requiredText.call(this, 'draft', i, 'Draft', 'Map the reply you wrote for this mission.');
	await signalPipeApiRequest.call(this, 'POST', '/actions/upload_draft', { id, content: draft });
	return { mission_id: id, status: 'pending_approval', draft };
}

async function getManyProducts(this: IExecuteFunctions, i: number): Promise<OperationResult> {
	const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;
	const products = await fetchProducts.call(this);
	if (returnAll) return products;
	return products.slice(0, this.getNodeParameter('limit', i, 50) as number);
}

const OPERATIONS: Record<string, Record<string, (this: IExecuteFunctions, i: number) => Promise<OperationResult>>> = {
	signal: { score: scoreSignal },
	mission: {
		approve: approveMission,
		delete: deleteMission,
		getAll: getManyMissions,
		markSent: markMissionSent,
		reject: rejectMission,
		uploadDraft: uploadMissionDraft,
	},
	product: { getAll: getManyProducts },
};

export async function runOperation(
	this: IExecuteFunctions,
	resource: string,
	operation: string,
	i: number,
): Promise<OperationResult> {
	const run = OPERATIONS[resource]?.[operation];
	if (!run) {
		throw new NodeOperationError(
			this.getNode(),
			`The operation "${operation}" is not available for "${resource}"`,
			{ itemIndex: i },
		);
	}
	return await run.call(this, i);
}
