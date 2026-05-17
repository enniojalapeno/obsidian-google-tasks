import { DropdownComponent, Editor, Modal, Setting } from "obsidian";
import { customSetting } from "../helper/CustomSettingElement";
import { CreateGoogleTask } from "../googleApi/GoogleCreateTask";
import type GoogleTasks from "../GoogleTasksPlugin";
import { getAllTaskLists } from "../googleApi/ListAllTasks";
import type { Task, TaskInput } from "../helper/types";
import { taskToList } from "../helper/TaskToList";

export class CreateTaskModal extends Modal {
	plugin: GoogleTasks;
	editor: Editor | null;
	taskTitle = "";
	taskDetails = "";
	taskList = "";
	taskDue = "";
	createdTask: Task | undefined;

	constructor(plugin: GoogleTasks, editor: Editor | null = null) {
		super(plugin.app);
		this.plugin = plugin;
		this.editor = editor;
		this.taskList = "";
	}
	async onOpen() {
		const taskList = await getAllTaskLists(this.plugin);
		if (taskList.length > 0) {
			this.taskList = taskList[0].id;
		}

		const { contentEl } = this;

		contentEl.createEl("h1", { text: "Add a new Task" });
		new Setting(contentEl)
			.setName("Title")
			.addText((text) =>
				text.onChange((value) => {
					this.taskTitle = value;
				})
			)
			.settingEl.querySelector("input")
			?.focus();

		new Setting(contentEl).setName("Details").addText((text) =>
			text.onChange((value) => {
				this.taskDetails = value;
			})
		);

		const dateSelectElement = customSetting(
			contentEl,
			"Due date",
			""
		).createEl("input", {
			type: "date",
		});

		dateSelectElement.addEventListener("input", () => {
			this.taskDue = dateSelectElement.value;
		});

		new Setting(contentEl)
			.setName("Category")
			.addDropdown((text: DropdownComponent) => {
				text.onChange((value) => {
					this.taskList = value;
				});

				for (let i = 0; i < taskList.length; i++) {
					text.addOption(taskList[i].id, taskList[i].title);
				}

				return text;
			});

		new Setting(contentEl).addButton((button) =>
			button.setButtonText("Create").onClick(async() => {
				const taskInput: TaskInput = {
					title: this.taskTitle,
					details: this.taskDetails,
					due: this.taskDue,
					taskListId: this.taskList,
				};
				this.createdTask = await CreateGoogleTask(this.plugin, taskInput);
				this.close();
			})
		);
	}
	onClose() {
		const { contentEl } = this;
		contentEl.empty();

		if(this.editor && this.createdTask){
			const cursor = this.editor.getCursor();
			this.editor.setLine(cursor.line, taskToList(this.createdTask) )
		}

	}
}
