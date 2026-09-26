import type { INodeProperties } from 'n8n-workflow';

const showForGetMany = { resource: ['product'], operation: ['getAll'] };

export const productOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['product'] } },
		options: [
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many products',
				description: 'Get the products your buyers are judged against',
			},
		],
		default: 'getAll',
	},
];

export const productFields: INodeProperties[] = [
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		displayOptions: { show: showForGetMany },
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		typeOptions: { minValue: 1 },
		displayOptions: { show: { ...showForGetMany, returnAll: [false] } },
		description: 'Max number of results to return',
	},
];
