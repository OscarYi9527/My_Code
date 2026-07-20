/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IPaCreatorService = createDecorator<IPaCreatorService>('paCreatorService');

export const enum PaCreatorStepStatus {
	Pending = 'pending',
	InProgress = 'inProgress',
	WaitingForConfirmation = 'waitingForConfirmation',
	Completed = 'completed',
	Invalidated = 'invalidated'
}

export const enum PaCreatorSessionStatus {
	Running = 'running',
	WaitingForUser = 'waitingForUser',
	ReadyForPublication = 'readyForPublication',
	Completed = 'completed',
	Abandoned = 'abandoned'
}

export interface IPaCreatorActivityDefinition {
	readonly id: string;
	readonly order: number;
	readonly name: string;
	readonly responsibility: string;
	readonly outputName: string;
	readonly requiresConfirmation: boolean;
}

export const PA_CREATOR_ACTIVITIES: readonly IPaCreatorActivityDefinition[] = Object.freeze([
	{ id: 'AA-01', order: 1, name: '需求澄清', responsibility: '确认目标、范围、非目标和成功标准。', outputName: '结构化需求', requiresConfirmation: true },
	{ id: 'AA-02', order: 2, name: '资料与知识入库', responsibility: '登记、排序、解析和追溯输入材料。', outputName: '知识目录', requiresConfirmation: false },
	{ id: 'AA-03', order: 3, name: '交付物与数据对象定义', responsibility: '先定义终点、数据对象及 Schema。', outputName: '数据对象目录', requiresConfirmation: true },
	{ id: 'AA-04', order: 4, name: '身份、边界与硬约束定义', responsibility: '生成 Identity 和 Manifesto。', outputName: 'PA 身份与约束', requiresConfirmation: false },
	{ id: 'AA-05', order: 5, name: 'AA/CA 拆分及契约设计', responsibility: '拆分职责、检查和失败回退路由。', outputName: 'AA/CA 规格与 DAG', requiresConfirmation: true },
	{ id: 'AA-06', order: 6, name: '工具和调度设计', responsibility: '选择工具、并发方式和状态策略。', outputName: '执行计划', requiresConfirmation: false },
	{ id: 'AA-07', order: 7, name: '工程生成与静态检查', responsibility: '生成标准 PA 包并执行确定性检查。', outputName: 'PA 工程草稿', requiresConfirmation: false },
	{ id: 'AA-08', order: 8, name: '试运行、修正与验收', responsibility: '执行试运行、CA 检查、返工和验收。', outputName: '可发布候选', requiresConfirmation: true },
	{ id: 'AA-09', order: 9, name: '发布到 PA 广场', responsibility: '执行原子注册、刷新和交付。', outputName: '已发布 PA 模块', requiresConfirmation: false }
]);

export interface IPaCreatorSource {
	readonly id: string;
	readonly name: string;
	readonly uri: string;
	readonly kind: 'document' | 'pdf' | 'spreadsheet' | 'presentation' | 'image' | 'archive' | 'directory' | 'prompt' | 'skill' | 'pa' | 'code' | 'web';
	readonly interpretation: string;
	readonly uncertain: boolean;
}

export interface IPaCreatorArtifact {
	readonly id: string;
	readonly activityId: string;
	readonly name: string;
	readonly summary: string;
	readonly detail: string;
	readonly createdAt: string;
}

export interface IPaCreatorMessage {
	readonly id: string;
	readonly role: 'user' | 'assistant' | 'system';
	readonly activityId: string;
	readonly text: string;
	readonly createdAt: string;
}

export interface IPaCreatorConfirmation {
	readonly id: string;
	readonly activityId: string;
	readonly kind: 'mandatory' | 'sourceInterpretation';
	readonly title: string;
	readonly summary: string;
	readonly sourceIds?: readonly string[];
}

export interface IPaCreatorStepState {
	readonly activityId: string;
	readonly status: PaCreatorStepStatus;
	readonly attempts: number;
	readonly artifactId?: string;
	readonly invalidatedBy?: string;
}

export interface IPaCreatorSession {
	readonly id: string;
	readonly profileId: string;
	readonly title: string;
	readonly status: PaCreatorSessionStatus;
	readonly currentActivityId: string;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly steps: Readonly<Record<string, IPaCreatorStepState>>;
	readonly messages: readonly IPaCreatorMessage[];
	readonly artifacts: readonly IPaCreatorArtifact[];
	readonly sources: readonly IPaCreatorSource[];
	readonly pendingConfirmation?: IPaCreatorConfirmation;
	readonly publicationTarget?: {
		readonly artifactId: string;
		readonly baseVersion: string;
		readonly version: string;
	};
}

export interface IPaCreatorStartOptions {
	readonly title: string;
	readonly requirement: string;
	readonly sources?: readonly Omit<IPaCreatorSource, 'id'>[];
	readonly publicationTarget?: IPaCreatorSession['publicationTarget'];
}

export interface IPaCreatorService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeSession: Event<string>;

	startSession(options: IPaCreatorStartOptions): IPaCreatorSession;
	getSession(id: string): IPaCreatorSession | undefined;
	getIncompleteSessions(): readonly IPaCreatorSession[];
	submitInput(id: string, text: string): IPaCreatorSession;
	confirm(id: string, confirmationId: string): IPaCreatorSession;
	rejectConfirmation(id: string, confirmationId: string, reason: string): IPaCreatorSession;
	reviseFrom(id: string, activityId: string, text: string): IPaCreatorSession;
	completePublication(id: string, moduleId: string): IPaCreatorSession;
	abandon(id: string): void;
}
