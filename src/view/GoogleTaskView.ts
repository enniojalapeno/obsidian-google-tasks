import {
	ButtonComponent,
	DropdownComponent,
	ItemView,
	Setting,
	WorkspaceLeaf,
	moment,
} from "obsidian";
import { ConfirmationModal } from "../modal/ConfirmationModal";
import { CreateTaskModal } from "../modal/CreateTaskModal";
import {
	GoogleCompleteTask,
	GoogleUnCompleteTask,
} from "../googleApi/GoogleCompleteTask";

import { DeleteGoogleTask } from "../googleApi/GoogleDeleteTask";
import type GoogleTasks from "../GoogleTasksPlugin";
import { settingsAreCompleteAndLoggedIn } from "./GoogleTasksSettingTab";
import {
	getAllCompletedTasksGroupedByDue,
	getAllTaskLists,
	getAllUncompletedTasksGroupedByDue,
} from "../googleApi/ListAllTasks";
import type { Task, TaskList } from "../helper/types";
import { UpdateTaskModal } from "../modal/UpdateTaskModal";

export const VIEW_TYPE_GOOGLE_TASK = "googleTaskView";

export class GoogleTaskView extends ItemView {
	plugin: GoogleTasks;

	todoTasksGroups: Map<string, Task[]> = new Map();
	doneTasksGroups: Map<string, Task[]> = new Map();

	taskLists: TaskList[] = [];

	showDone = false;
	showTodo = true;

	currentListId = "000";
	currentListIndex = 0;

	intervalId!: number;

	private _loaded = false;

	constructor(leaf: WorkspaceLeaf, plugin: GoogleTasks) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType() {
		return VIEW_TYPE_GOOGLE_TASK;
	}

	getIcon(): string {
		return "check-in-circle";
	}

	getDisplayText() {
		return "Google Tasks";
	}

	async displayTaskGroupList(
		taskGroup: Map<string, Task[]>,
		mainContainer: HTMLDivElement,
		isUnDoneList: boolean
	) {
		const sortedKeys = [...taskGroup.keys()].sort((a, b) => {
			if (a === "No due date") return 1;
			if (b === "No due date") return -1;
			const dateA = new Date(a).getTime();
			const dateB = new Date(b).getTime();
			if (isNaN(dateA) && isNaN(dateB)) return a.localeCompare(b);
			if (isNaN(dateA)) return 1;
			if (isNaN(dateB)) return -1;
			return isUnDoneList ? dateA - dateB : dateB - dateA;
		});

		for (const dueDate of sortedKeys) {
			const tasks = taskGroup.get(dueDate);
			if (!tasks || !tasks.length) continue;

			let dateString = "No due date";

			if (this.currentListId != "000") {
				const filtered = tasks.filter((task) => {
					return getListId(task) == this.currentListId;
				});

				if (filtered.length == 0) {
					continue;
				}
			}

			if (moment(dueDate).isValid()) {
				dateString = moment.utc(dueDate).local().calendar(null, {
					lastDay: "[Yesterday]",
					sameDay: "[Today]",
					nextDay: "[Tomorrow]",
					lastWeek: "[last] dddd",
					nextWeek: "dddd",
					sameElse: "L",
				});
			}

			mainContainer.createEl("h6", {
				text: dateString,
			});

			tasks.forEach((task:Task) => this.createTaskElement(task, mainContainer, isUnDoneList, false));
		}
	}

	createTaskElement(task:Task, containerEl: HTMLElement, isUnDoneList: boolean, isSubTaskList: boolean){
		const due = task.due ?? "No due date";

		const taskContainer = containerEl.createDiv({
			cls: "googleTaskContainer",
		});

		let startTime = 0;
		let endTime = 0;
		let longpress = false;

		taskContainer.addEventListener("mousedown", () => {
			startTime = new Date().getTime();
		});

		taskContainer.addEventListener("mouseup", () => {
			endTime = new Date().getTime();
			longpress = endTime - startTime < 500 ? false : true;
		});

		taskContainer.addEventListener("click", () => {
			if (longpress) {
				longpress = false;
				new UpdateTaskModal(this.plugin, task).open();
			}
		});

		if (!isUnDoneList) {
			const trashElement = new ButtonComponent(taskContainer);
			trashElement.setClass("googleTaskTrash");
			trashElement.setIcon("cross");
			trashElement.onClick(() => {
				if (this.plugin.settings.askConfirmation) {
					new ConfirmationModal(this.plugin, async () =>
						this.deleteTask(task)
					).open();
				} else {
					this.deleteTask(task);
				}
			});
		}

		const checkBox = taskContainer.createEl("input", {
			type: "checkbox",
		});
		if (!isUnDoneList || (isSubTaskList && task.completed) ) {
			checkBox.checked = true;
		}
		checkBox.addEventListener("click", async () => {

			if(task.parent){
				if(checkBox.checked){
					await GoogleCompleteTask(this.plugin, task);
				}else{
					await GoogleUnCompleteTask(this.plugin, task);
				}
			}else{

				if (isUnDoneList) {
					const gotDeleted = await GoogleCompleteTask(
						this.plugin,
						task
					);
					if (!gotDeleted) return;

					//ADD to done list
					if (this.doneTasksGroups.has(due)) {
						this.doneTasksGroups.get(due)!.push(task);
					} else {
						this.doneTasksGroups.set(due, [task]);
					}

					//Remove from todo list
					const todoTasks = this.todoTasksGroups.get(due);
					if (todoTasks) {
						const remaining = todoTasks.filter(t => t.id !== task.id);
						if (remaining.length === 0) {
							this.todoTasksGroups.delete(due);
						} else {
							this.todoTasksGroups.set(due, remaining);
						}
					}

					this.loadTaskView();
				} else {
					const gotRestored = await GoogleUnCompleteTask(
						this.plugin,
						task
					);
					if (!gotRestored) return;

					//ADD to todo list
					if (this.todoTasksGroups.has(due)) {
						this.todoTasksGroups.get(due)!.push(task);
					} else {
						this.todoTasksGroups.set(due, [task]);
					}

					//Remove from done list
					const doneTasks = this.doneTasksGroups.get(due);
					if (doneTasks) {
						const remaining = doneTasks.filter(t => t.id !== task.id);
						if (remaining.length === 0) {
							this.doneTasksGroups.delete(due);
						} else {
							this.doneTasksGroups.set(due, remaining);
						}
					}

					this.loadTaskView();
				}
			}
		});

		const taskTextContainer = taskContainer.createDiv({
			cls: "googleTaskTextContainer",
		});

		taskTextContainer.createEl("span", {
			cls: "googleTaskTitle",
			text: task.title,
		});

		if (due != "No due date" && isUnDoneList) {
			if (moment.utc(due).local().isBefore(moment(), "date")) {
				taskTextContainer.style.color = "red";
			}
		}

		taskTextContainer.createEl("span", {
			cls: "googleTaskDetails",
			text: task.notes,
		});

		if(!isSubTaskList && task.children?.length){
			const arrow = taskContainer.createEl("span", {
				cls: "googleTaskArrowDown",
				text: "^"
			});
			arrow.addEventListener("click", () => {
				const subContainer = arrow.parentElement!.nextSibling;
				if(subContainer instanceof HTMLDivElement){
					if(subContainer.classList.contains("hideSubTasks")){
						subContainer.classList.remove("hideSubTasks")
						arrow.textContent = "^";
					}else{
						subContainer.classList.add("hideSubTasks")
						arrow.textContent = "˅";
					}
				}
			})
		}

		if(!isSubTaskList && task.children?.length){
			const subTaskContainer = containerEl.createDiv({
				cls: "googleSubTaskContainer"
			});

			task.children.forEach((subTask:Task) => this.createTaskElement(subTask, subTaskContainer, isUnDoneList, true));
		}
	}

	public async loadTaskView() {
		if (!this._loaded) return;

		const container = this.containerEl.children[1];

		container.empty();

		const mainContainer = container.createDiv({
			cls: "googleTaskMainContainer",
		});

		const titleContainer = mainContainer.createDiv({
			cls: "googleTaskTitleContainer",
		});

		new Setting(titleContainer).addButton((button) => {
			button.setIcon("plus");
			button.setClass("googleTaskAddButton");
			button.onClick(() => {
				new CreateTaskModal(this.plugin).open();
			});
		});

		titleContainer
			.createEl("h4", { text: "Google Tasks" })
			.addEventListener("click", () => {
				this.updateFromServer();
			});

		const listDropDown = new Setting(titleContainer);

		listDropDown.addDropdown((dropDown) => {
			const optionList: DropdownComponent[] = [
				dropDown.addOption("000", "Combined"),
			];

			this.taskLists.forEach((taskList) => {
				optionList.push(
					dropDown.addOption(taskList.id, taskList.title)
				);
			});
			dropDown.onChange((selectedId: string) => {
				this.currentListId = selectedId;

				this.loadTaskView();
			});

			dropDown.setValue(this.currentListId);
		});

		mainContainer.createEl("hr");

		mainContainer
			.createEl("h5", {
				text: "Todo",
			})
			.addEventListener("click", async () => {
				this.showTodo = !this.showTodo;

				if (this.showTodo) {
					todoContainer.addClass("googleTaskForceShow");
				} else {
					todoContainer.removeClass("googleTaskForceShow");
				}
			});
		mainContainer.createEl("hr");

		const todoContainer = mainContainer.createDiv({
			cls: "googleTaskTodoContainer",
		});

		this.displayTaskGroupList(this.todoTasksGroups, todoContainer, true);

		mainContainer
			.createEl("h5", {
				text: "Done",
			})
			.addEventListener("click", async () => {
				this.showDone = !this.showDone;
				this.plugin.showHidden = !this.plugin.showHidden;
				if (this.showDone) {
					doneContainer.addClass("googleTaskForceShow");
					await this.onOpen();
				} else {
					doneContainer.removeClass("googleTaskForceShow");
				}

			});
		mainContainer.createEl("hr");

		const doneContainer = mainContainer.createDiv({
			cls: "googleTaskDoneContainer",
		});

		if (this.showDone) {
			doneContainer.addClass("googleTaskForceShow");
		} else {
			doneContainer.removeClass("googleTaskForceShow");
		}

		if (this.showTodo) {
			todoContainer.addClass("googleTaskForceShow");
		} else {
			todoContainer.removeClass("googleTaskForceShow");
		}

		this.displayTaskGroupList(this.doneTasksGroups, doneContainer, false);
	}

	async deleteTask(task: Task) {
		const due = task.due ?? "No due date";
		const gotDeleted: boolean = await DeleteGoogleTask(
			this.plugin,
			task.selfLink
		);

		if (gotDeleted) {
			const doneTasks = this.doneTasksGroups.get(due);
			if (doneTasks) {
				const remaining = doneTasks.filter(t => t.id !== task.id);
				if (remaining.length === 0) {
					this.doneTasksGroups.delete(due);
				} else {
					this.doneTasksGroups.set(due, remaining);
				}
			}

			this.loadTaskView();
		}
	}

	public setRefreshInterval() {
		if (this.intervalId) {
			window.clearInterval(this.intervalId);
		}
		this.registerInterval(
			(this.intervalId = window.setInterval(
				() => {
					if (this._loaded) {
						this.updateFromServer();
					}
				},
				this.plugin.settings.refreshInterval * 1000
			))
		);
	}

	async onOpen() {
		this._loaded = true;
		await this.updateFromServer();
		await this.setRefreshInterval();
	}

	public addTodo(task: Task) {
		const due = task.due ?? "No due date";
		if (this.todoTasksGroups.has(due)) {
			this.todoTasksGroups.get(due)!.push(task);
		} else {
			this.todoTasksGroups.set(due, [task]);
		}
	}

	public removeTodo(task: Task) {
		const due = task.due ?? "No due date";

		const todoTasks = this.todoTasksGroups.get(due);
		if (todoTasks) {
			const remaining = todoTasks.filter((t) => t.id == task.id);
			const ts = remaining[0];
			const filtered = todoTasks.filter(t => t.id !== ts?.id);
			if (filtered.length === 0) {
				this.todoTasksGroups.delete(due);
			} else {
				this.todoTasksGroups.set(due, filtered);
			}
		}
	}

	public addDone(task: Task) {
		const due = task.due ?? "No due date";
		if (this.doneTasksGroups.has(due)) {
			this.doneTasksGroups.get(due)!.push(task);
		} else {
			this.doneTasksGroups.set(due, [task]);
		}
	}

	async updateFromServer() {
		if (!this._loaded) return;

		if (settingsAreCompleteAndLoggedIn(this.plugin)) {
			this.taskLists = await getAllTaskLists(this.plugin);

			this.todoTasksGroups = await getAllUncompletedTasksGroupedByDue(
				this.plugin
			);

			this.doneTasksGroups = await getAllCompletedTasksGroupedByDue(
				this.plugin
			);

			this.loadTaskView();
		} else {
			const container = this.containerEl.children[1];

			container.empty();

			container.createEl("h4", { text: "Google Tasks" });
			container.createEl("hr");

			container.createEl("h5", {
				text: "Missing settings",
			});
		}
	}

	async onClose() {
		this._loaded = false;
	}
}

export function getListId(task: Task): string {
	const selfLink = task.selfLink;

	const startIndex = "https://www.googleapis.com/tasks/v1/lists/".length;

	const endIndex = selfLink.indexOf("/", startIndex);

	return selfLink.substring(startIndex, endIndex);
}
