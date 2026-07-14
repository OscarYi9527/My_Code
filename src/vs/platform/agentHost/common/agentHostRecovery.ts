/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Opaque confirmation data sent by the workbench when the user chooses the
 * recovery affordance on a failed Codex turn.
 */
export const AGENT_HOST_CHECK_STATUS_AND_CONTINUE_CONFIRMATION = 'agent-host.checkStatusAndContinue';

/**
 * Internal replacement for the visible recovery button label. The renderer
 * sends this to the Agent Host so localization never becomes part of the
 * protocol and a normal user prompt cannot accidentally select recovery.
 */
export const AGENT_HOST_CHECK_STATUS_AND_CONTINUE_PROMPT = '__agent_host_check_status_and_continue__';

/**
 * Per-session metadata key for the latest Codex turn whose effects need to be
 * checked before work continues.
 */
export const META_CODEX_RECOVERY_REQUIRED = 'codex.recovery.required';

export interface ICodexRecoveryRecord {
	readonly turnId: string;
	readonly cause: string;
	readonly recordedAt: number;
}
