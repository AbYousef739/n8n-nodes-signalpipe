import type {
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IPollFunctions,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';
import { fetchOpenMissions, filterMissions, WAITING_STATUSES } from '../SignalPipe/shared/data';
import { getProducts } from '../SignalPipe/shared/methods';

/** How many mission IDs the trigger remembers between polls. */
const SEEN_LIMIT = 1000;

interface TriggerState {
	seenIds?: string[];
}

export class SignalPipeTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'SignalPipe Trigger',
		name: 'signalPipeTrigger',
		icon: { light: 'file:../../icons/signalpipe.svg', dark: 'file:../../icons/signalpipe.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: 'New mission',
		description: 'Starts the workflow when SignalPipe finds a new buyer',
		defaults: {
			name: 'SignalPipe Trigger',
		},
		polling: true,
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'signalPipeApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Trigger On',
				name: 'event',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'New Mission',
						value: 'newMission',
						description: 'A buyer the judges kept, usually with a drafted reply',
					},
				],
				default: 'newMission',
			},
			{
				displayName: 'Filters',
				name: 'filters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				options: [
					{
						displayName: 'Minimum Score',
						name: 'minScore',
						type: 'number',
						default: 0,
						typeOptions: { minValue: 0, maxValue: 100 },
						description: 'Only trigger for missions scored at least this high (0 to 100)',
					},
					{
						displayName: 'Only With a Draft',
						name: 'onlyDrafted',
						type: 'boolean',
						default: false,
						description:
							'Whether to wait until a mission has a drafted reply. A mission that needs a draft triggers once it gets one.',
					},
					{
						displayName: 'Product Name or ID',
						name: 'productId',
						type: 'options',
						typeOptions: { loadOptionsMethod: 'getProducts' },
						default: '',
						description:
							'Only trigger for this product. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
				],
			},
		],
	};

	methods = {
		loadOptions: {
			getProducts,
		},
	};

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const filters = this.getNodeParameter('filters', {}) as {
			minScore?: number;
			onlyDrafted?: boolean;
			productId?: string;
		};
		const missions = filterMissions(await fetchOpenMissions.call(this, { sort: 'newest' }), {
			statuses: filters.onlyDrafted ? ['pending_approval'] : WAITING_STATUSES,
			productId: filters.productId,
			minScore: filters.minScore,
		});

		if (this.getMode() === 'manual') {
			// A test run shows the newest match so its fields can be mapped. It
			// leaves alone what the active workflow has already seen.
			return missions.length ? [this.helpers.returnJsonArray([missions[0]])] : null;
		}

		const state = this.getWorkflowStaticData('node') as TriggerState;
		if (!Array.isArray(state.seenIds)) {
			// First poll after activation: remember the current queue without
			// starting the workflow for it, so activating does not replay old missions.
			state.seenIds = missions.map((m) => String(m.id)).slice(0, SEEN_LIMIT);
			return null;
		}

		const seen = new Set(state.seenIds);
		const fresh = missions.filter((m) => !seen.has(String(m.id)));
		if (!fresh.length) return null;

		state.seenIds = [...fresh.map((m) => String(m.id)), ...state.seenIds].slice(0, SEEN_LIMIT);
		// The API lists newest first; hand them over oldest first, in the order found.
		return [this.helpers.returnJsonArray(fresh.reverse())];
	}
}
