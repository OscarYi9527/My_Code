/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../base/browser/window.js';
import { ProxyChannel } from '../../../base/parts/ipc/common/ipc.js';
import { ICommandService } from '../../commands/common/commands.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { IMainProcessService } from '../../ipc/common/mainProcessService.js';
import {
	AI_EDITOR_ACCOUNT_CHANNEL_NAME
} from '../common/aiEditorAccountIpc.js';
import {
	AI_EDITOR_ACCOUNT_OPEN_MANAGEMENT_COMMAND_ID,
	IAiEditorAccountMainService,
	IAiEditorAccountService
} from '../common/aiEditorAccount.js';
import { AiEditorAccountRendererServiceCore } from './aiEditorAccountServiceCore.js';

export class AiEditorAccountService extends AiEditorAccountRendererServiceCore {
	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
		@ICommandService commandService: ICommandService
	) {
		super({
			transport: ProxyChannel.toService<IAiEditorAccountMainService>(
				mainProcessService.getChannel(AI_EDITOR_ACCOUNT_CHANNEL_NAME)
			),
			openManagement: route => commandService.executeCommand(AI_EDITOR_ACCOUNT_OPEN_MANAGEMENT_COMMAND_ID, route),
			isActive: () => mainWindow.document.visibilityState === 'visible'
		});

		const refreshOnFocus = () => void this.getStatus({ force: true });
		mainWindow.addEventListener('focus', refreshOnFocus);
		this._register({ dispose: () => mainWindow.removeEventListener('focus', refreshOnFocus) });
	}
}

registerSingleton(IAiEditorAccountService, AiEditorAccountService, InstantiationType.Delayed);
