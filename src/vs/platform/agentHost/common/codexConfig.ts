/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import { createSchema, schemaProperty } from './agentHostSchema.js';

/**
 * Host-internal Codex state persisted in `agent-host-config.json`.
 *
 * Keep this schema separate from the user-facing root configuration schema:
 * these values must survive Agent Host restarts, but must not appear as
 * editable session settings.
 */
export const CODEX_DELETED_THREAD_IDS_KEY = 'codex.deletedThreadIds';

export const codexInternalStateSchema = createSchema({
	[CODEX_DELETED_THREAD_IDS_KEY]: schemaProperty<readonly string[]>({
		type: 'array',
		title: localize('codex.internalState.deletedThreadIds', "Deleted Codex thread IDs"),
		items: {
			type: 'string',
			title: localize('codex.internalState.deletedThreadId', "Deleted Codex thread ID"),
		},
	}),
});
