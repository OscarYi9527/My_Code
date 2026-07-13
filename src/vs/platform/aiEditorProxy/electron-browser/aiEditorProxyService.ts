/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerMainProcessRemoteService } from '../../ipc/electron-browser/services.js';
import { AI_EDITOR_PROXY_CHANNEL_NAME, IAiEditorProxyService } from '../common/aiEditorProxy.js';

registerMainProcessRemoteService(IAiEditorProxyService, AI_EDITOR_PROXY_CHANNEL_NAME);
