/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/paPlaza.css';
import { $, addDisposableListener, append, clearNode } from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../common/editor.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import {
	CREATE_PA_ACTION_ID,
	EDIT_PA_ACTION_ID,
	EXPORT_PA_ACTION_ID,
	IMPORT_PA_ACTION_ID,
	IPaGalleryItem,
	IPaRegistryService,
	OPEN_PA_ACTION_ID,
	PaArtifactKind,
	PaPublicationStatus,
	ROLLBACK_PA_ACTION_ID,
	SET_PA_PUBLICATION_STATUS_ACTION_ID,
	SHOW_PA_DETAILS_ACTION_ID
} from '../../../services/paRegistry/common/paRegistry.js';
import { PaPlazaEditorInput, PaPlazaRoute } from './paPlazaEditorInput.js';

export class PaPlazaEditor extends EditorPane {
	static readonly ID = PaPlazaEditorInput.EDITOR_ID;

	private readonly renderedDisposables = this._register(new DisposableStore());
	private readonly inputDisposables = this._register(new DisposableStore());
	private container: HTMLElement | undefined;
	private route: PaPlazaRoute = 'plaza';
	private query = '';
	private kind: PaArtifactKind | undefined;
	private status: PaPublicationStatus | undefined;
	private activeTab: HTMLElement | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IPaRegistryService private readonly registryService: IPaRegistryService,
		@ICommandService private readonly commandService: ICommandService
	) {
		super(PaPlazaEditor.ID, group, telemetryService, themeService, storageService);
		this._register(this.registryService.onDidChangeGallery(() => this.render()));
	}

	protected override createEditor(parent: HTMLElement): void {
		this.container = append(parent, $('.pa-plaza-editor'));
	}

	override async setInput(input: PaPlazaEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		this.inputDisposables.clear();
		this.route = input.route;
		this.inputDisposables.add(input.onDidChangeRoute(route => {
			this.route = route;
			this.render();
		}));
		this.render();
	}

	override clearInput(): void {
		this.inputDisposables.clear();
		super.clearInput();
	}

	override focus(): void {
		this.activeTab?.focus();
	}

	override layout(): void {
		// The editor uses a full-size scroll container and responsive CSS grid.
	}

	private render(): void {
		if (!this.container) {
			return;
		}
		this.renderedDisposables.clear();
		this.activeTab = undefined;
		clearNode(this.container);
		const shell = append(this.container, $('.pa-plaza-shell'));
		this.renderHeader(shell);
		this.renderTabs(shell);
		if (this.route === 'personal') {
			this.renderToolbar(shell);
		}
		const items = this.route === 'plaza'
			? this.registryService.getGalleryItems()
			: this.registryService.getPersonalItems({ query: this.query, kind: this.kind, status: this.status });
		if (items.length === 0) {
			const empty = append(shell, $('.pa-empty'));
			empty.textContent = this.route === 'plaza'
				? localize('aiEditor.pa.plaza.empty', "当前 Profile 还没有已上架的 PA。")
				: localize('aiEditor.pa.personal.empty', "没有符合当前筛选条件的个人创作。");
			return;
		}
		const grid = append(shell, $('.pa-plaza-grid'));
		for (const item of items) {
			this.renderCard(grid, item);
		}
	}

	private renderHeader(parent: HTMLElement): void {
		const header = append(parent, $('.pa-plaza-header'));
		const copy = append(header, $('.pa-plaza-heading'));
		const title = append(copy, $('h1.pa-plaza-title'));
		title.textContent = this.route === 'plaza'
			? localize('aiEditor.pa.plaza.title', "PA 广场")
			: localize('aiEditor.pa.personalCreations.title', "个人创作");
		const subtitle = append(copy, $('p.pa-plaza-subtitle'));
		subtitle.textContent = this.route === 'plaza'
			? localize('aiEditor.pa.plaza.subtitle', "发现并运行当前 Profile 中已发布的本地流程智能体。")
			: localize('aiEditor.pa.personal.subtitle', "统一管理本地 PA 与 Skill；切换 Profile 只切换可见范围，不删除文件。");
		const action = append(header, $('button.primary'));
		action.textContent = this.route === 'plaza'
			? localize('aiEditor.pa.create', "创建 PA")
			: localize('aiEditor.pa.import', "导入");
		this.renderedDisposables.add(addDisposableListener(action, 'click', () => {
			void this.commandService.executeCommand(this.route === 'plaza' ? CREATE_PA_ACTION_ID : IMPORT_PA_ACTION_ID);
		}));
	}

	private renderTabs(parent: HTMLElement): void {
		const tabs = append(parent, $('.pa-plaza-tabs'));
		this.renderTab(tabs, 'plaza', localize('aiEditor.pa.plaza.tab', "PA 广场"));
		this.renderTab(tabs, 'personal', localize('aiEditor.pa.personal.tab', "个人创作"));
	}

	private renderTab(parent: HTMLElement, route: PaPlazaRoute, label: string): void {
		const button = append(parent, $('button.pa-plaza-tab'));
		button.classList.toggle('active', this.route === route);
		if (this.route === route) {
			this.activeTab = button;
		}
		button.setAttribute('aria-selected', String(this.route === route));
		button.textContent = label;
		this.renderedDisposables.add(addDisposableListener(button, 'click', () => {
			if (this.input instanceof PaPlazaEditorInput) {
				this.input.setRoute(route);
			}
		}));
	}

	private renderToolbar(parent: HTMLElement): void {
		const toolbar = append(parent, $('.pa-plaza-toolbar'));
		const search = append(toolbar, $('input')) as HTMLInputElement;
		search.type = 'search';
		search.placeholder = localize('aiEditor.pa.personal.search', "按名称搜索 PA 或 Skill");
		search.value = this.query;
		this.renderedDisposables.add(addDisposableListener(search, 'input', () => {
			this.query = search.value;
			this.render();
		}));
		const kind = append(toolbar, $('select')) as HTMLSelectElement;
		this.addOption(kind, '', localize('aiEditor.pa.kind.all', "全部类型"), !this.kind);
		this.addOption(kind, PaArtifactKind.Pa, 'PA', this.kind === PaArtifactKind.Pa);
		this.addOption(kind, PaArtifactKind.Skill, 'Skill', this.kind === PaArtifactKind.Skill);
		this.renderedDisposables.add(addDisposableListener(kind, 'change', () => {
			this.kind = kind.value ? kind.value as PaArtifactKind : undefined;
			this.render();
		}));
		const status = append(toolbar, $('select')) as HTMLSelectElement;
		this.addOption(status, '', localize('aiEditor.pa.status.all', "全部状态"), !this.status);
		this.addOption(status, PaPublicationStatus.Draft, localize('aiEditor.pa.status.draft', "草稿"), this.status === PaPublicationStatus.Draft);
		this.addOption(status, PaPublicationStatus.Published, localize('aiEditor.pa.status.published', "已上架"), this.status === PaPublicationStatus.Published);
		this.addOption(status, PaPublicationStatus.Unpublished, localize('aiEditor.pa.status.unpublished', "已下架"), this.status === PaPublicationStatus.Unpublished);
		this.renderedDisposables.add(addDisposableListener(status, 'change', () => {
			this.status = status.value ? status.value as PaPublicationStatus : undefined;
			this.render();
		}));
	}

	private addOption(select: HTMLSelectElement, value: string, label: string, selected: boolean): void {
		const option = append(select, $('option')) as HTMLOptionElement;
		option.value = value;
		option.textContent = label;
		option.selected = selected;
	}

	private renderCard(parent: HTMLElement, item: IPaGalleryItem): void {
		const card = append(parent, $('.pa-card'));
		card.classList.toggle('featured', item.primaryActionId === CREATE_PA_ACTION_ID);
		const heading = append(card, $('.pa-card-heading'));
		const icon = append(heading, $('.pa-card-icon'));
		icon.classList.add(...ThemeIcon.asClassNameArray(ThemeIcon.fromId(item.iconId)));
		const name = append(heading, $('h2.pa-card-name'));
		name.textContent = item.name;
		const description = append(card, $('p.pa-card-description'));
		description.textContent = item.description;
		const meta = append(card, $('.pa-card-meta'));
		this.addMeta(meta, item.kind === PaArtifactKind.Pa ? 'PA' : 'Skill');
		this.addMeta(meta, `v${item.version}`);
		this.addMeta(meta, this.statusLabel(item.status));
		this.addMeta(meta, new Date(item.updatedAt).toLocaleString());
		const actions = append(card, $('.pa-card-actions'));
		if (this.route === 'plaza') {
			this.addAction(actions, item.primaryActionId === CREATE_PA_ACTION_ID
				? localize('aiEditor.pa.create', "创建 PA")
				: localize('aiEditor.pa.open', "打开运行"), true, item.primaryActionId ?? OPEN_PA_ACTION_ID, item.id);
			this.addAction(actions, localize('aiEditor.pa.details', "详情"), false, SHOW_PA_DETAILS_ACTION_ID, item.id);
		} else {
			this.addAction(actions, localize('aiEditor.pa.update', "更新"), true, EDIT_PA_ACTION_ID, item.id);
			this.addAction(actions, localize('aiEditor.pa.export', "导出"), false, EXPORT_PA_ACTION_ID, item.id);
			this.addAction(actions, localize('aiEditor.pa.rollback', "回滚"), false, ROLLBACK_PA_ACTION_ID, item.id);
			const targetStatus = item.status === PaPublicationStatus.Published
				? PaPublicationStatus.Unpublished
				: PaPublicationStatus.Published;
			this.addAction(
				actions,
				targetStatus === PaPublicationStatus.Published
					? localize('aiEditor.pa.publish', "上架")
					: localize('aiEditor.pa.unpublish', "下架"),
				false,
				SET_PA_PUBLICATION_STATUS_ACTION_ID,
				item.id,
				targetStatus
			);
		}
	}

	private addMeta(parent: HTMLElement, label: string): void {
		const element = append(parent, $('span'));
		element.textContent = label;
	}

	private addAction(parent: HTMLElement, label: string, primary: boolean, commandId: string, ...args: unknown[]): void {
		const button = append(parent, $('button'));
		button.classList.toggle('primary', primary);
		button.textContent = label;
		this.renderedDisposables.add(addDisposableListener(button, 'click', () => {
			void this.commandService.executeCommand(commandId, ...args);
		}));
	}

	private statusLabel(status: PaPublicationStatus): string {
		switch (status) {
			case PaPublicationStatus.Draft:
				return localize('aiEditor.pa.status.draft', "草稿");
			case PaPublicationStatus.Published:
				return localize('aiEditor.pa.status.published', "已上架");
			case PaPublicationStatus.Unpublished:
				return localize('aiEditor.pa.status.unpublished', "已下架");
		}
	}
}
