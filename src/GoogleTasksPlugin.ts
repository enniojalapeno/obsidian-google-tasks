import { Editor, MarkdownFileInfo, Plugin, WorkspaceLeaf, Notice, TFile } from "obsidian";
import type { GoogleTasksSettings } from "./helper/types";
import { getAllUncompletedTasksOrderdByDue, getOneTaskById } from "./googleApi/ListAllTasks";
import {
	GoogleCompleteTaskById,
	GoogleUnCompleteTaskById,
} from "./googleApi/GoogleCompleteTask";
import { CreateTaskModal } from "./modal/CreateTaskModal";
import { GoogleTaskView, VIEW_TYPE_GOOGLE_TASK } from "./view/GoogleTaskView";
import { TaskListModal } from "./modal/TaskListModal";
import {
	GoogleTasksSettingTab,
	settingsAreCompleteAndLoggedIn,
} from "./view/GoogleTasksSettingTab";
import { taskToList } from './helper/TaskToList';
import { SelectInsertTaskModal } from './modal/SelectInsertTaskModal';

const DEFAULT_SETTINGS: GoogleTasksSettings = {
	googleRefreshToken: "",
	googleClientId: "",
	googleClientSecret: "",
	askConfirmation: true,
	refreshInterval: 60,
	showNotice: true,
	twoWaySync: true,
};

export default class GoogleTasks extends Plugin {
	settings!: GoogleTasksSettings;
	plugin!: GoogleTasks;
	showHidden = false;
	private _syncDebounceTimer: number | null = null;

	initView = async () => {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_GOOGLE_TASK);
		if (leaves.length === 0) {
			await this.app.workspace.getRightLeaf(false)?.setViewState({
				type: VIEW_TYPE_GOOGLE_TASK,
			});
		} else {
			const leaf = leaves[0];
			if ((leaf as any).isDeferred) {
				await (leaf as any).loadIfDeferred();
			}
		}
		this.app.workspace.revealLeaf(
			this.app.workspace.getLeavesOfType(VIEW_TYPE_GOOGLE_TASK).first()!
		);
	};

	onLayoutReady = async () => {
		this.app.workspace.on("file-open", async (file: TFile | null) => {
			if (!file || file.extension !== "md") return;
			try {
				let content = await this.app.vault.adapter.read(file.path);
				if (!content.match("%%")) {
					return;
				}

				const matches = [...content.matchAll(/\- \[[ xX]\] .* %%[A-Za-z0-9]{22}%%/g)];
				let updated = false;
				for (const match of matches) {
					const line = match[0];
					const idMatch = match[0].match(/%%[A-Za-z0-9]{22}%%/);
					if (!idMatch) continue;
					const id = idMatch[0].substring(2).slice(0, -2);
					try {
						const task = await getOneTaskById(this, id);
						if (!task) continue;
						if (task.status === "completed") {
							if (line.indexOf("- [ ]") > -1) {
								content = content.replace(line, line.replace("- [ ] ", "- [x] "));
								updated = true;
							}
						} else {
							if (line.indexOf("- [x] ") > -1) {
								content = content.replace(line, line.replace("- [x] ", "- [ ] "));
								updated = true;
							}
						}
					} catch (err) {
						console.error(err);
					}
				}
				if (updated) {
					await this.app.vault.adapter.write(file.path, content);
				}
			} catch (err) {
				console.error("Error in file-open handler:", err);
			}
		});

		this.registerEvent(
			this.app.workspace.on("editor-change", (_editor: Editor, info: any) => {
				if (!this.settings.twoWaySync) return;
				if (!(info?.file instanceof TFile) || info.file.extension !== "md") return;

				if (this._syncDebounceTimer !== null) {
					window.clearTimeout(this._syncDebounceTimer);
				}

				this._syncDebounceTimer = window.setTimeout(async () => {
					this._syncDebounceTimer = null;
					try {
						const content = await this.app.vault.adapter.read(info.file.path);
						const matches = [...content.matchAll(/\- \[([ xX])\] .* %%([A-Za-z0-9]{22})%%/g)];
						for (const match of matches) {
							const checked = match[1];
							const taskId = match[2];
							try {
								if (checked === "x" || checked === "X") {
									await GoogleCompleteTaskById(this, taskId);
								} else {
									await GoogleUnCompleteTaskById(this, taskId);
								}
							} catch (err) {
								console.error("Error syncing task", taskId, err);
							}
						}
					} catch (err) {
						console.error("Error in editor-change sync:", err);
					}
				}, 2000);
			})
		);
	};

	async onload() {
		await this.loadSettings();
		this.plugin = this;
		this.app.workspace.onLayoutReady(this.onLayoutReady);

		this.registerView(
			VIEW_TYPE_GOOGLE_TASK,
			(leaf: WorkspaceLeaf) => new GoogleTaskView(leaf, this)
		);

		this.addRibbonIcon(
			"check-in-circle",
			"Google Tasks",
			(_evt: MouseEvent) => {
				this.initView();
			}
		);

		this.registerDomEvent(document, "click", (event) => {
			if (!(event.target instanceof HTMLInputElement)) {
				return;
			}

			const checkPointElement = event.target as HTMLInputElement;
			if (
				!checkPointElement.classList.contains("task-list-item-checkbox")
			)
				return;

			const idElement = checkPointElement.parentElement?.parentElement?.querySelectorAll(
				".cm-comment.cm-list-1"
			)[1] as HTMLElement | undefined;

			const taskId = idElement?.textContent;

			if (!taskId || !settingsAreCompleteAndLoggedIn(this, false)) return;

			if (checkPointElement.checked) {
				GoogleCompleteTaskById(this, taskId);
			} else {
				GoogleUnCompleteTaskById(this, taskId);
			}
		});

		const createTodoListModal = async () => {
			const list = await getAllUncompletedTasksOrderdByDue(this);

			new TaskListModal(this, list).open();
		};

		this.addCommand({
			id: "list-google-tasks",
			name: "List Google Tasks",
			checkCallback: (checking: boolean) => {
				const canRun = settingsAreCompleteAndLoggedIn(this.plugin, false);

				if (checking) {
					return canRun;
				}
				if (!canRun) {
					return false;
				}
				createTodoListModal();
				return true;
			},
		});

		this.addCommand({
			id: "create-google-task",
			name: "Create Google Tasks",

			checkCallback: (checking: boolean) => {
				const canRun = settingsAreCompleteAndLoggedIn(this, false);

				if (checking) {
					return canRun;
				}

				if (!canRun) {
					return false;
				}

				new CreateTaskModal(this).open();
				return true;
			},
		});

		this.addCommand({
			id: "create-google-task-with-insert",
			name: "Create Google Tasks and insert it",
			editorCheckCallback: (checking, _editor, _ctx) => {
				const canRun = settingsAreCompleteAndLoggedIn(this, false);

				if (checking) {
					return canRun;
				}

				if (!canRun) {
					return;
				}

				new CreateTaskModal(this, _editor).open();
				return true;
			}
		});

		const writeTodoIntoFile = async (editor: Editor) => {
			const tasks = await getAllUncompletedTasksOrderdByDue(this);
			tasks.forEach((task) => {
				editor.replaceRange(
					taskToList(task),
					editor.getCursor()
				);
			});
		};

		this.addCommand({
			id: "insert-uncompleted-google-tasks",
			name: "Insert Uncompleted Google Tasks",
			editorCheckCallback: (
				checking: boolean,
				editor: Editor,
				_ctx: MarkdownFileInfo
			) => {
				const canRun = settingsAreCompleteAndLoggedIn(this, false);

				if (checking) {
					return canRun;
				}

				if (!canRun) {
					return;
				}

				writeTodoIntoFile(editor);
				return true;
			},
		});

		this.addCommand({
			id: "insert-google-tasks",
			name: "Insert Google Tasks",
			editorCheckCallback: (
				checking: boolean,
				editor: Editor,
				_ctx: MarkdownFileInfo
			) => {
				const canRun = settingsAreCompleteAndLoggedIn(this, false);

				if (checking) {
					return canRun;
				}

				if (!canRun) {
					return;
				}

				new SelectInsertTaskModal(this, editor).open();
				return true;
			},
		});

		this.addCommand({
			id: "copy-google-refresh-token",
			name: "Copy Google Refresh Token to Clipboard",

			callback: () => {
				const token = this.settings.googleRefreshToken;
				if (!token) {
					new Notice("No Refresh Token. Please Login.")
					return;
				}

				navigator.clipboard.writeText(token).then(() => {
					new Notice("Token copied")
				}, () => {
					new Notice("Could not copy token")
				});

			},
		});

		this.addSettingTab(new GoogleTasksSettingTab(this.app, this));
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_GOOGLE_TASK);
		if (this._syncDebounceTimer !== null) {
			window.clearTimeout(this._syncDebounceTimer);
		}
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
