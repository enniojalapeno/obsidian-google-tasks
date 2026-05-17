import type GoogleTasksPlugin from "../GoogleTasksPlugin";
import type { Task } from "../helper/types";
import { getGoogleAuthToken } from "./GoogleAuth";
import { getOneTaskById } from "./ListAllTasks";
import { createNotice } from "../helper/NoticeHelper";

export async function GoogleCompleteTask(
	plugin: GoogleTasksPlugin,
	task: Task
): Promise<boolean> {

	if (task.children) {
		for (const subTask of task.children) {
			await GoogleCompleteTask(plugin, subTask);
		}
	}

	const requestHeaders: HeadersInit = new Headers();
	requestHeaders.append(
		"Authorization",
		"Bearer " + (await getGoogleAuthToken(plugin))
	);
	requestHeaders.append("Content-Type", "application/json");

	task.status = "completed";
	task.completed = new Date().toISOString();
	task.taskListName = undefined;

	try {
		const response = await fetch(task.selfLink,
			{
				method: "PUT",
				headers: requestHeaders,
				body: JSON.stringify(task),
			}
		);
		await response.json();
	} catch (error) {
		createNotice(plugin, "Could not complete task");
		return false;
	}
	return true;
}

export async function GoogleCompleteTaskById(
	plugin: GoogleTasksPlugin,
	taskId: string
): Promise<boolean> {
	const task = await getOneTaskById(plugin, taskId);
	if (!task) return false;
	return await GoogleCompleteTask(plugin, task);
}

export async function GoogleUnCompleteTask(
	plugin: GoogleTasksPlugin,
	task: Task
): Promise<boolean> {

	const requestHeaders: HeadersInit = new Headers();
	requestHeaders.append(
		"Authorization",
		"Bearer " + (await getGoogleAuthToken(plugin))
	);
	requestHeaders.append("Content-Type", "application/json");

	task.status = "needsAction";
	task.completed = undefined;
	task.taskListName = undefined;

	try {
		const response = await fetch(task.selfLink,
			{
				method: "PUT",
				headers: requestHeaders,
				body: JSON.stringify(task),
			}
		);
		await response.json();
	} catch (error) {
		createNotice(plugin, "Could not complete task");
		return false;
	}

	if (task.children) {
		for (const subTask of task.children) {
			await GoogleUnCompleteTask(plugin, subTask);
		}
	}

	return true;
}

export async function GoogleUnCompleteTaskById(
	plugin: GoogleTasksPlugin,
	taskId: string
): Promise<boolean> {
	const task = await getOneTaskById(plugin, taskId);
	if (!task) return false;
	return await GoogleUnCompleteTask(plugin, task);
}
