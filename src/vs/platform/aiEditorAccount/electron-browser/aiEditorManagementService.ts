/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProxyChannel } from '../../../base/parts/ipc/common/ipc.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { IMainProcessService } from '../../ipc/common/mainProcessService.js';
import {
	AiEditorManagementRoute,
	IAiEditorAccountMainService,
	IAiEditorManagementService
} from '../common/aiEditorAccount.js';
import { AI_EDITOR_ACCOUNT_CHANNEL_NAME } from '../common/aiEditorAccountIpc.js';

export class AiEditorManagementService implements IAiEditorManagementService {
	readonly _serviceBrand: undefined;

	private readonly accountMainService: IAiEditorAccountMainService;

	constructor(@IMainProcessService mainProcessService: IMainProcessService) {
		this.accountMainService = ProxyChannel.toService<IAiEditorAccountMainService>(
			mainProcessService.getChannel(AI_EDITOR_ACCOUNT_CHANNEL_NAME)
		);
	}

	prepareManagementView(viewId: string, route: AiEditorManagementRoute): Promise<void> {
		return this.accountMainService.prepareManagementView(viewId, route);
	}

	disposeManagementView(viewId: string): Promise<void> {
		return this.accountMainService.disposeManagementView(viewId);
	}
}

registerSingleton(IAiEditorManagementService, AiEditorManagementService, InstantiationType.Delayed);
