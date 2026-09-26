import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	IPollFunctions,
} from 'n8n-workflow';
import { signalPipeApiRequest } from './transport';

type SignalPipeContext = IExecuteFunctions | ILoadOptionsFunctions | IPollFunctions;

/** SignalPipe returns at most this many open missions per request. */
export const MAX_MISSIONS = 200;

/** Missions that mean "a buyer is waiting for you": drafted, or still needing a draft. */
export const WAITING_STATUSES = ['draft_needed', 'pending_approval'];

export interface MissionFilters {
	statuses?: string[];
	productId?: string;
	minScore?: number;
}

function asObject(value: unknown): IDataObject {
	return value && typeof value === 'object' && !Array.isArray(value) ? (value as IDataObject) : {};
}

function asNumber(value: unknown): number | null {
	const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
	return Number.isFinite(n) ? n : null;
}

/**
 * The mission shape this package returns. It has the same fields as the
 * SignalPipe MCP server's get_missions tool, without that tool's display
 * truncation, because a workflow that posts the reply needs the whole draft.
 *
 * The raw row also carries internal fields, such as the full lead row and the
 * judges' disagreement number. None of them leave this function; `split` is
 * the yes/no the API itself derives from that number.
 */
export function projectMission(row: IDataObject): IDataObject {
	const lead = asObject(row.leads);
	const product = asObject(row.products);
	const strategy = asObject(lead.strategy);
	const swarm = asObject(row.swarm);
	const signalScore = asNumber(lead.signal_score);
	const rawScore = asNumber(row.raw_score);

	const mission: IDataObject = {
		id: row.id,
		status: row.status,
		score: signalScore ?? rawScore,
		raw_score: rawScore,
		channel: row.outreach_channel ?? null,
		draft: row.draft_content ?? null,
		product: product.name ?? null,
		product_id: row.product_id ?? null,
		created_at: row.created_at ?? null,
		swarm_low_confidence: Boolean(row.swarm_low_confidence),
		split: swarm.split === true,
		lead: {
			title: lead.title ?? null,
			snippet: lead.snippet ?? null,
			url: lead.url ?? null,
			handle: lead.author_handle ?? null,
			platform: lead.source_platform ?? null,
			role: strategy.role ?? 'educator',
			found_at: lead.created_at ?? null,
		},
	};
	if (row.competitor_match || lead.competitor_match) {
		mission.competitor = lead.competitor_name ?? null;
	}
	if (row.draft_context !== undefined && row.draft_context !== null) {
		mission.draft_context = row.draft_context;
	}
	return mission;
}

/** Products without their internal learning stats. */
export function projectProduct(row: IDataObject): IDataObject {
	return {
		id: row.id,
		name: row.name ?? null,
		value_prop: row.value_prop ?? null,
		target_audience: row.target_audience ?? null,
		is_active: row.active ?? null,
		created_at: row.created_at ?? null,
	};
}

export function filterMissions(missions: IDataObject[], filters: MissionFilters): IDataObject[] {
	const statuses = (filters.statuses ?? []).filter(Boolean);
	const minScore = asNumber(filters.minScore) ?? 0;
	return missions.filter((m) => {
		if (statuses.length && !statuses.includes(String(m.status))) return false;
		if (filters.productId && m.product_id !== filters.productId) return false;
		if (minScore > 0 && (asNumber(m.score) ?? 0) < minScore) return false;
		return true;
	});
}

/**
 * The open queue: missions waiting for approval, needing a draft, or approved
 * but not yet marked sent. Reading it changes nothing on the account.
 */
export async function fetchOpenMissions(
	this: SignalPipeContext,
	options: { sort?: string; includeDraftContext?: boolean } = {},
): Promise<IDataObject[]> {
	const qs: IDataObject = { limit: MAX_MISSIONS, sort: options.sort || 'newest' };
	if (options.includeDraftContext) qs.include = 'draft_context';
	const response = asObject(await signalPipeApiRequest.call(this, 'GET', '/sync/missions', undefined, qs));
	const rows = Array.isArray(response.missions) ? (response.missions as IDataObject[]) : [];
	return rows.map(projectMission);
}

export async function fetchProducts(this: SignalPipeContext): Promise<IDataObject[]> {
	const response = asObject(await signalPipeApiRequest.call(this, 'GET', '/products/list'));
	const rows = Array.isArray(response.products) ? (response.products as IDataObject[]) : [];
	return rows.map(projectProduct);
}

/** How a product is named in pickers: paused products say so. */
export function productLabel(product: IDataObject): string {
	const name = String(product.name ?? product.id);
	return product.is_active === false ? `${name} (paused)` : name;
}
