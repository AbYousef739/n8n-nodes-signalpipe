import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class SignalPipeApi implements ICredentialType {
	name = 'signalPipeApi';

	displayName = 'SignalPipe API';

	icon: Icon = { light: 'file:../icons/signalpipe.svg', dark: 'file:../icons/signalpipe.dark.svg' };

	documentationUrl = 'https://github.com/AbYousef739/n8n-nodes-signalpipe?tab=readme-ov-file#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'Operator Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Your SignalPipe operator key. Create or replace it on your dashboard at https://signalpipe.io/dashboard.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.signalpipe.io',
			url: '/products/list',
			method: 'GET',
		},
	};
}
