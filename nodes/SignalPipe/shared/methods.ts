import type {
	ILoadOptionsFunctions,
	INodeListSearchResult,
	INodePropertyOptions,
} from 'n8n-workflow';
import { fetchProducts, productLabel } from './data';

export async function searchProducts(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const needle = (filter ?? '').trim().toLowerCase();
	const products = await fetchProducts.call(this);
	const results = products
		.filter(
			(p) =>
				!needle ||
				String(p.name ?? '').toLowerCase().includes(needle) ||
				String(p.id).toLowerCase().includes(needle),
		)
		.map((p) => ({ name: productLabel(p), value: String(p.id) }))
		.sort((a, b) => a.name.localeCompare(b.name));
	return { results };
}

export async function getProducts(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const products = await fetchProducts.call(this);
	return products
		.map((p) => ({ name: productLabel(p), value: String(p.id) }))
		.sort((a, b) => a.name.localeCompare(b.name));
}
