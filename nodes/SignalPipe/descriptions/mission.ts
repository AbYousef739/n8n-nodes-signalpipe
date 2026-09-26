import type { INodeProperties } from 'n8n-workflow';
import { MAX_MISSIONS } from '../shared/data';

const showFor = (operation: string[]) => ({ resource: ['mission'], operation });

export const missionOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['mission'] } },
		options: [
			{
				name: 'Approve',
				value: 'approve',
				action: 'Approve mission',
				description:
					'Approve the drafted reply. SignalPipe posts nothing; approving also tells the judges the lead was a good one.',
			},
			{
				name: 'Delete',
				value: 'delete',
				action: 'Delete mission',
				description:
					'Remove a mission without teaching the judges anything, for example when the post was deleted',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many missions',
				description: `Get up to ${MAX_MISSIONS} open missions: buyers the judges kept, with their drafted replies`,
			},
			{
				name: 'Mark as Sent',
				value: 'markSent',
				action: 'Mark mission as sent',
				description:
					'Record that you posted the reply yourself, so SignalPipe follows the conversation from here',
			},
			{
				name: 'Reject',
				value: 'reject',
				action: 'Reject mission',
				description: 'Reject a mission that was not a real buyer. The reason teaches the judges.',
			},
			{
				name: 'Upload Draft',
				value: 'uploadDraft',
				action: 'Upload mission draft',
				description:
					'Attach a reply you wrote. The mission then waits for your approval with your text as its draft.',
			},
		],
		default: 'getAll',
	},
];

export const missionFields: INodeProperties[] = [
	{
		displayName: 'Mission ID',
		name: 'missionId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: showFor(['approve', 'delete', 'markSent', 'reject', 'uploadDraft']) },
		description: 'The ID of the mission, as returned by Get Many or the SignalPipe Trigger',
	},

	// Approve
	{
		displayName: 'Options',
		name: 'approveOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: showFor(['approve']) },
		options: [
			{
				displayName: 'Edited Reply',
				name: 'draft',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				description: 'Your edited version of the reply. Leave it out to keep the draft as written.',
			},
		],
	},

	// Reject
	{
		displayName: 'Reason',
		name: 'reason',
		type: 'options',
		default: 'no_reason',
		displayOptions: { show: showFor(['reject']) },
		description: 'Why this was not a buyer. Each reason teaches the judges a different amount.',
		options: [
			{
				name: 'Already a Customer',
				value: 'already_customer',
				description: 'They already bought. No penalty.',
			},
			{
				name: 'No Reason',
				value: 'no_reason',
				description: 'Use when no other reason fits',
			},
			{
				name: 'Not Relevant',
				value: 'not_relevant',
				description: 'Wrong audience or topic',
			},
			{
				name: 'Sarcasm',
				value: 'sarcasm',
				description: 'Venting or irony, not a real request',
			},
			{
				name: 'Spam',
				value: 'spam',
				description: 'A bot or a promoted post. The heaviest penalty.',
			},
			{
				name: 'Too Vague',
				value: 'too_vague',
				description: 'Too little to act on',
			},
			{
				name: 'Wrong Product',
				value: 'wrong_product',
				description: 'A real buyer, but for a different product of yours',
			},
		],
	},

	// Upload Draft
	{
		displayName: 'Draft',
		name: 'draft',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		required: true,
		displayOptions: { show: showFor(['uploadDraft']) },
		description: 'The reply you wrote for this mission',
	},

	// Get Many
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		displayOptions: { show: showFor(['getAll']) },
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		typeOptions: { minValue: 1, maxValue: MAX_MISSIONS },
		displayOptions: { show: { ...showFor(['getAll']), returnAll: [false] } },
		description: 'Max number of results to return',
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: showFor(['getAll']) },
		options: [
			{
				displayName: 'Minimum Score',
				name: 'minScore',
				type: 'number',
				default: 0,
				typeOptions: { minValue: 0, maxValue: 100 },
				description: 'Only return missions scored at least this high (0 to 100)',
			},
			{
				displayName: 'Product Name or ID',
				name: 'productId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getProducts' },
				default: '',
				description:
					'Only return missions for this product. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Status',
				name: 'statuses',
				type: 'multiOptions',
				default: [],
				description: 'Only return missions in these states. Leave empty for all open missions.',
				options: [
					{ name: 'Approved', value: 'approved' },
					{ name: 'Awaiting Approval', value: 'pending_approval' },
					{ name: 'Needs a Draft', value: 'draft_needed' },
				],
			},
		],
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: showFor(['getAll']) },
		options: [
			{
				displayName: 'Include Drafting Context',
				name: 'includeDraftContext',
				type: 'boolean',
				default: false,
				description:
					'Whether to add what a writer needs to draft a reply (the product, the post, the length and tone rules) to missions that need a draft',
			},
			{
				displayName: 'Sort',
				name: 'sort',
				type: 'options',
				default: 'newest',
				options: [
					{
						name: 'Newest First',
						value: 'newest',
					},
					{
						name: 'Most Agreement First',
						value: 'consensus',
						description: 'Missions the three judges agreed on most come first',
					},
				],
			},
		],
	},
];
