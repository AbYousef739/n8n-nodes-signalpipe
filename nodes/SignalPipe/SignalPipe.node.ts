import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { runOperation } from './actions/operations';
import { missionFields, missionOperations } from './descriptions/mission';
import { productFields, productOperations } from './descriptions/product';
import { signalFields, signalOperations } from './descriptions/signal';
import { getProducts, searchProducts } from './shared/methods';

export class SignalPipe implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'SignalPipe',
		name: 'signalPipe',
		icon: { light: 'file:../../icons/signalpipe.svg', dark: 'file:../../icons/signalpipe.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Judge whether the author of a text is a real buyer, and act on the buyers SignalPipe finds',
		defaults: {
			name: 'SignalPipe',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'signalPipeApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Mission',
						value: 'mission',
						description: 'A buyer the judges kept, with a drafted reply for you to approve',
					},
					{
						name: 'Product',
						value: 'product',
					},
					{
						name: 'Signal',
						value: 'signal',
						description: 'Any text you want judged for buying intent',
					},
				],
				default: 'signal',
			},
			...signalOperations,
			...signalFields,
			...missionOperations,
			...missionFields,
			...productOperations,
			...productFields,
		],
	};

	methods = {
		listSearch: {
			searchProducts,
		},
		loadOptions: {
			getProducts,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		for (let i = 0; i < items.length; i++) {
			try {
				const result = await runOperation.call(this, resource, operation, i);
				const executionData = this.helpers.constructExecutionMetaData(
					this.helpers.returnJsonArray(result),
					{ itemData: { item: i } },
				);
				returnData.push(...executionData);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				// Both constructors hand back an error of their own type unchanged,
				// so the item index is set on it first.
				if (error instanceof NodeApiError) {
					error.context.itemIndex = i;
					throw new NodeApiError(this.getNode(), error as unknown as JsonObject);
				}
				if (error instanceof NodeOperationError) error.context.itemIndex = i;
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
