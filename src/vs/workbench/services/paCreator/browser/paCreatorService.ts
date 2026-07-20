/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IUserDataProfileService } from '../../userDataProfile/common/userDataProfile.js';
import {
	IPaCreatorActivityDefinition,
	IPaCreatorArtifact,
	IPaCreatorConfirmation,
	IPaCreatorMessage,
	IPaCreatorService,
	IPaCreatorSession,
	IPaCreatorStartOptions,
	PA_CREATOR_ACTIVITIES,
	PaCreatorSessionStatus,
	PaCreatorStepStatus
} from '../common/paCreator.js';

interface IPaCreatorEnvironment {
	readonly now: () => string;
	readonly createId: () => string;
}

const PACKAGE_FILES = [
	'pa.json',
	'Identity.md',
	'Manifesto.md',
	'Plan.md',
	'DataObjects/',
	'AAList/',
	'CAList/',
	'Knowledge/',
	'BestPractice/',
	'Tests/',
	'assets/'
];

export class PaCreatorService extends Disposable implements IPaCreatorService {
	readonly _serviceBrand: undefined;
	private readonly _onDidChangeSession = this._register(new Emitter<string>());
	readonly onDidChangeSession = this._onDidChangeSession.event;
	private readonly sessionsByProfile = new Map<string, Map<string, IPaCreatorSession>>();
	private readonly environment: IPaCreatorEnvironment;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService
	) {
		super();
		this.environment = {
			now: () => new Date().toISOString(),
			createId: generateUuid
		};
		this.loadProfile(this.userDataProfileService.currentProfile.id);
		this._register(this.userDataProfileService.onDidChangeCurrentProfile(event => {
			this.loadProfile(event.profile.id);
		}));
	}

	startSession(options: IPaCreatorStartOptions): IPaCreatorSession {
		if (!options.title.trim() || !options.requirement.trim()) {
			throw new Error('PA Creator requires a title and initial requirement.');
		}
		const now = this.environment.now();
		const session: IPaCreatorSession = {
			id: this.environment.createId(),
			profileId: this.userDataProfileService.currentProfile.id,
			title: options.title.trim(),
			status: PaCreatorSessionStatus.Running,
			currentActivityId: 'AA-01',
			createdAt: now,
			updatedAt: now,
			steps: Object.fromEntries(PA_CREATOR_ACTIVITIES.map(activity => [
				activity.id,
				{ activityId: activity.id, status: PaCreatorStepStatus.Pending, attempts: 0 }
			])),
			messages: [this.message('user', 'AA-01', options.requirement.trim(), now)],
			artifacts: [],
			sources: (options.sources ?? []).map(source => ({ ...source, id: this.environment.createId() })),
			publicationTarget: options.publicationTarget
		};
		return this.executeFrom(this.save(session, false), 'AA-01', options.requirement.trim());
	}

	getSession(id: string): IPaCreatorSession | undefined {
		const session = this.currentSessions().get(id);
		return session ? clone(session) : undefined;
	}

	getIncompleteSessions(): readonly IPaCreatorSession[] {
		return [...this.currentSessions().values()]
			.filter(session => session.status !== PaCreatorSessionStatus.Completed && session.status !== PaCreatorSessionStatus.Abandoned)
			.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
			.map(clone);
	}

	submitInput(id: string, text: string): IPaCreatorSession {
		const session = this.requireSession(id);
		if (!text.trim()) {
			throw new Error('PA Creator input cannot be empty.');
		}
		if (session.pendingConfirmation) {
			return this.reviseFrom(id, session.pendingConfirmation.activityId, text);
		}
		return this.reviseFrom(id, session.currentActivityId, text);
	}

	confirm(id: string, confirmationId: string): IPaCreatorSession {
		let session = this.requireSession(id);
		const confirmation = session.pendingConfirmation;
		if (!confirmation || confirmation.id !== confirmationId) {
			throw new Error(`Confirmation '${confirmationId}' is not pending.`);
		}
		if (confirmation.kind === 'sourceInterpretation') {
			const sourceIds = new Set(confirmation.sourceIds);
			session = {
				...session,
				sources: session.sources.map(source => sourceIds.has(source.id) ? { ...source, uncertain: false } : source),
				pendingConfirmation: undefined,
				status: PaCreatorSessionStatus.Running,
				messages: [...session.messages, this.message(
					'user',
					confirmation.activityId,
					'已确认资料顺序与解析结果。',
					this.environment.now()
				)]
			};
			return this.executeFrom(this.save(session, false), confirmation.activityId);
		}
		const step = session.steps[confirmation.activityId];
		session = {
			...session,
			status: PaCreatorSessionStatus.Running,
			pendingConfirmation: undefined,
			steps: {
				...session.steps,
				[confirmation.activityId]: { ...step, status: PaCreatorStepStatus.Completed }
			},
			messages: [...session.messages, this.message(
				'user',
				confirmation.activityId,
				`已确认：${confirmation.title}`,
				this.environment.now()
			)]
		};
		const next = PA_CREATOR_ACTIVITIES.find(activity => activity.order === activityById(confirmation.activityId).order + 1);
		return next ? this.executeFrom(this.save(session, false), next.id) : this.save(session);
	}

	rejectConfirmation(id: string, confirmationId: string, reason: string): IPaCreatorSession {
		const session = this.requireSession(id);
		if (!session.pendingConfirmation || session.pendingConfirmation.id !== confirmationId || !reason.trim()) {
			throw new Error(`Confirmation '${confirmationId}' cannot be rejected without a reason.`);
		}
		return this.reviseFrom(id, session.pendingConfirmation.activityId, reason);
	}

	reviseFrom(id: string, activityId: string, text: string): IPaCreatorSession {
		let session = this.requireSession(id);
		const target = activityById(activityId);
		const affected = new Set(PA_CREATOR_ACTIVITIES.filter(activity => activity.order >= target.order).map(activity => activity.id));
		const steps = { ...session.steps };
		for (const affectedId of affected) {
			const step = steps[affectedId];
			steps[affectedId] = {
				activityId: affectedId,
				status: affectedId === activityId ? PaCreatorStepStatus.Pending : PaCreatorStepStatus.Invalidated,
				attempts: step.attempts,
				invalidatedBy: activityId
			};
		}
		const now = this.environment.now();
		session = {
			...session,
			status: PaCreatorSessionStatus.Running,
			currentActivityId: activityId,
			updatedAt: now,
			steps,
			artifacts: session.artifacts.filter(artifact => !affected.has(artifact.activityId)),
			pendingConfirmation: undefined,
			messages: [...session.messages, this.message('user', activityId, text.trim(), now)]
		};
		return this.executeFrom(this.save(session, false), activityId, text.trim());
	}

	abandon(id: string): void {
		const session = this.requireSession(id);
		this.save({ ...session, status: PaCreatorSessionStatus.Abandoned, updatedAt: this.environment.now() });
	}

	completePublication(id: string, moduleId: string): IPaCreatorSession {
		const session = this.requireSession(id);
		if (session.status !== PaCreatorSessionStatus.ReadyForPublication) {
			throw new Error(`PA Creator session '${id}' is not ready for publication.`);
		}
		const now = this.environment.now();
		return this.save({
			...session,
			status: PaCreatorSessionStatus.Completed,
			updatedAt: now,
			steps: {
				...session.steps,
				'AA-09': { ...session.steps['AA-09'], status: PaCreatorStepStatus.Completed }
			},
			messages: [...session.messages, this.message('system', 'AA-09', `已发布模块：${moduleId}`, now)]
		});
	}

	private executeFrom(initial: IPaCreatorSession, activityId: string, input?: string): IPaCreatorSession {
		let session = initial;
		let activity = activityById(activityId);
		while (activity) {
			if (activity.id === 'AA-02') {
				const uncertainSources = session.sources.filter(source => source.uncertain);
				if (uncertainSources.length > 0) {
					const confirmation: IPaCreatorConfirmation = {
						id: this.environment.createId(),
						activityId: activity.id,
						kind: 'sourceInterpretation',
						title: '确认资料顺序与解析结果',
						summary: uncertainSources.map(source => `${source.name}：${source.interpretation}`).join('\n'),
						sourceIds: uncertainSources.map(source => source.id)
					};
					return this.save({
						...session,
						status: PaCreatorSessionStatus.WaitingForUser,
						currentActivityId: activity.id,
						pendingConfirmation: confirmation,
						steps: {
							...session.steps,
							[activity.id]: {
								...session.steps[activity.id],
								status: PaCreatorStepStatus.WaitingForConfirmation
							}
						}
					});
				}
			}
			session = this.completeActivity(session, activity, input);
			input = undefined;
			if (activity.id === 'AA-09') {
				return this.save({
					...session,
					status: PaCreatorSessionStatus.ReadyForPublication,
					currentActivityId: activity.id
				});
			}
			if (activity.requiresConfirmation) {
				const artifact = session.artifacts.find(candidate => candidate.activityId === activity.id);
				const confirmation: IPaCreatorConfirmation = {
					id: this.environment.createId(),
					activityId: activity.id,
					kind: 'mandatory',
					title: confirmationTitle(activity.id),
					summary: artifact?.summary ?? activity.outputName
				};
				return this.save({
					...session,
					status: PaCreatorSessionStatus.WaitingForUser,
					pendingConfirmation: confirmation,
					steps: {
						...session.steps,
						[activity.id]: {
							...session.steps[activity.id],
							status: PaCreatorStepStatus.WaitingForConfirmation
						}
					}
				});
			}
			activity = PA_CREATOR_ACTIVITIES.find(candidate => candidate.order === activity.order + 1)!;
		}
		return this.save(session);
	}

	private completeActivity(
		session: IPaCreatorSession,
		activity: IPaCreatorActivityDefinition,
		input?: string
	): IPaCreatorSession {
		const now = this.environment.now();
		const artifact = createArtifact(activity, session, input, this.environment.createId(), now);
		const step = session.steps[activity.id];
		return this.save({
			...session,
			status: PaCreatorSessionStatus.Running,
			currentActivityId: activity.id,
			updatedAt: now,
			artifacts: [...session.artifacts.filter(candidate => candidate.activityId !== activity.id), artifact],
			steps: {
				...session.steps,
				[activity.id]: {
					activityId: activity.id,
					status: PaCreatorStepStatus.Completed,
					attempts: step.attempts + 1,
					artifactId: artifact.id
				}
			},
			messages: [...session.messages, this.message(
				'assistant',
				activity.id,
				`${activity.name}已完成：${artifact.summary}`,
				now
			)]
		}, false);
	}

	private message(role: IPaCreatorMessage['role'], activityId: string, text: string, createdAt: string): IPaCreatorMessage {
		return { id: this.environment.createId(), role, activityId, text, createdAt };
	}

	private requireSession(id: string): IPaCreatorSession {
		const session = this.currentSessions().get(id);
		if (!session) {
			throw new Error(`Unknown PA Creator session '${id}'.`);
		}
		return clone(session);
	}

	private save(session: IPaCreatorSession, fire = true): IPaCreatorSession {
		const updated = { ...session, updatedAt: this.environment.now() };
		this.currentSessions().set(updated.id, clone(updated));
		this.storageService.store(
			this.storageKey(updated.profileId),
			JSON.stringify([...this.currentSessions().values()]),
			StorageScope.APPLICATION,
			StorageTarget.USER
		);
		if (fire) {
			this._onDidChangeSession.fire(updated.id);
		}
		return clone(updated);
	}

	private currentSessions(): Map<string, IPaCreatorSession> {
		return this.loadProfile(this.userDataProfileService.currentProfile.id);
	}

	private loadProfile(profileId: string): Map<string, IPaCreatorSession> {
		let sessions = this.sessionsByProfile.get(profileId);
		if (!sessions) {
			const stored = this.storageService.get(this.storageKey(profileId), StorageScope.APPLICATION);
			const values = stored ? JSON.parse(stored) as IPaCreatorSession[] : [];
			sessions = new Map(values.map(session => [session.id, session]));
			this.sessionsByProfile.set(profileId, sessions);
		}
		return sessions;
	}

	private storageKey(profileId: string): string {
		return `aiEditor.paCreator.sessions.${profileId}`;
	}
}

function createArtifact(
	activity: IPaCreatorActivityDefinition,
	session: IPaCreatorSession,
	input: string | undefined,
	id: string,
	createdAt: string
): IPaCreatorArtifact {
	const requirement = input ?? session.messages.filter(message => message.role === 'user').at(-1)?.text ?? session.title;
	const sources = session.sources.map(source => `- ${source.name} (${source.kind}) — ${source.uri}`).join('\n') || '- 用户自然语言需求';
	let detail: string;
	switch (activity.id) {
		case 'AA-01':
			detail = `# 结构化需求\n\n## 目标\n${requirement}\n\n## 范围\n- 创建可运行、可维护的 PA\n\n## 非目标\n- 不建立公共市场\n\n## 成功标准\n- 通过试运行和发布门禁`;
			break;
		case 'AA-02':
			detail = `# 知识目录\n\n${sources}`;
			break;
		case 'AA-03':
			detail = '# 数据对象目录\n\n- SourceMaterialCatalog\n- NormalizedRequirement\n- PaDesign\n- PaPackageDraft\n- ReleaseCandidate\n- PublishedPAModule';
			break;
		case 'AA-04':
			detail = `# Identity\n\n${session.title}\n\n# Manifesto\n\n本地优先、契约闭合、证据化检查、不可绕过门禁。`;
			break;
		case 'AA-05':
			detail = '# AA/CA 与 DAG\n\n每个 AA 单一职责；关键产物具有 CA；失败回退到最近责任 AA；DAG 不允许循环。';
			break;
		case 'AA-06':
			detail = '# 执行计划\n\n确定性任务使用本地工具；语义任务通过 Agent Host；副作用使用稳定幂等键。';
			break;
		case 'AA-07':
			detail = `# PA 工程草稿\n\n${PACKAGE_FILES.map(path => `- ${path}`).join('\n')}\n\n静态检查：结构、契约、DAG、CA 覆盖。`;
			break;
		case 'AA-08':
			detail = '# 试运行与验收\n\n- 静态检查通过\n- 试运行候选已生成\n- 等待用户确认发布';
			break;
		case 'AA-09':
			detail = '# 发布交接\n\n候选已交给 P7 原子发布服务；未注册前不会出现在 PA 广场。';
			break;
		default:
			detail = activity.responsibility;
	}
	return {
		id,
		activityId: activity.id,
		name: activity.outputName,
		summary: `${activity.outputName}已生成`,
		detail,
		createdAt
	};
}

function confirmationTitle(activityId: string): string {
	switch (activityId) {
		case 'AA-01': return '确认目标和范围';
		case 'AA-03': return '确认最终交付物和数据对象';
		case 'AA-05': return '确认 AA/CA 与流程结构';
		case 'AA-08': return '确认发布';
		default: throw new Error(`Activity '${activityId}' has no mandatory confirmation.`);
	}
}

function activityById(id: string): IPaCreatorActivityDefinition {
	const activity = PA_CREATOR_ACTIVITIES.find(candidate => candidate.id === id);
	if (!activity) {
		throw new Error(`Unknown PA Creator activity '${id}'.`);
	}
	return activity;
}

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

registerSingleton(IPaCreatorService, PaCreatorService, InstantiationType.Delayed);
