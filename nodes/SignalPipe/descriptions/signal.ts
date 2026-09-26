import type { INodeProperties } from 'n8n-workflow';

const showForScore = { resource: ['signal'], operation: ['score'] };

export const signalOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['signal'] } },
		options: [
			{
				name: 'Score',
				value: 'score',
				action: 'Score signal for buying intent',
				description: 'Judge whether the author of a text is a real buyer for your product',
			},
		],
		default: 'score',
	},
];

export const signalFields: INodeProperties[] = [
	{
		displayName: 'Product',
		name: 'productId',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		displayOptions: { show: showForScore },
		description: 'The product the author would be buying',
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: { searchListMethod: 'searchProducts', searchable: true },
			},
			{
				displayName: 'By ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. 3f2c9a4e-5b1d-4c7a-9e2f-8d6b1a0c4e7f',
			},
		],
	},
	{
		displayName: 'Text',
		name: 'text',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		required: true,
		displayOptions: { show: showForScore },
		placeholder: 'e.g. We keep losing deals because nobody follows up. Is there a tool for this?',
		description:
			'The post, comment, message or email to judge. SignalPipe reads the first 4,000 characters.',
	},
	{
		displayName: 'Simplify',
		name: 'simplify',
		type: 'boolean',
		default: true,
		displayOptions: { show: showForScore },
		description:
			'Whether to return a simplified version of the response instead of the raw data. The raw data adds the sub-scores, the judges, competitor details, your quota and the drafting context.',
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: showForScore },
		options: [
			{
				displayName: 'Context',
				name: 'context',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				description:
					'The conversation the text belongs to, such as the post a comment replies to or the email being answered. The judges read up to 2,000 characters of it as background. The verdict is still about the author of the text.',
			},
			{
				displayName: 'Source',
				name: 'sourceHint',
				type: 'string',
				default: '',
				placeholder: 'e.g. gmail',
				description:
					'Where the text came from, such as gmail, slack, discord or linkedin. It only sets the tone of the suggested reply. SignalPipe does not connect to the source.',
			},
		],
	},
];
