<script lang="ts">
	import type { Task } from "../helper/types";
	import type GoogleTasks from "../GoogleTasksPlugin";
	import { onMount } from "svelte";
	import { getAllTasks } from "../googleApi/ListAllTasks";
	import type { SelectInsertTaskModal } from "../modal/SelectInsertTaskModal";
	import { moment } from "obsidian";

    export let plugin:GoogleTasks;
    export let onSubmit: (tasks: Task[], modal: SelectInsertTaskModal) => void;
    export let selectInsertTaskModal: SelectInsertTaskModal;

    let startDate: moment.Moment | null = null;
    let endDate: moment.Moment | null = null;

    let allowCompletedTasks: string = "notCompleted";
    let tasks: [Task, boolean][] = [];
    let taskLists: [string, boolean][] = [];

    onMount(async () => {
        tasks = (await getAllTasks(plugin, startDate, endDate)).map((task) => [task, !task.completed]);
        taskLists = getTaskLists(tasks).map((taskList) => [taskList, true]);
    });

    function getTaskLists(tasks: [Task, boolean][] ): string[] {
        const result: string[] = [];

        for (const [task] of tasks) {
            if (task.taskListName && !result.contains(task.taskListName)) {
                result.push(task.taskListName);
            }
        }

        return result;
    }

    async function updateStartDate(event: Event) {
        startDate = moment((event.target as HTMLInputElement).value);
        tasks = (await getAllTasks(plugin, startDate, endDate)).map((task) => [task, true]);
    }

    async function updateEndDate(event: Event) {
        endDate = moment((event.target as HTMLInputElement).value);
        tasks = (await getAllTasks(plugin, startDate, endDate)).map((task) => [task, true]);
    }

    function changedTaskLists (e: Event) {
        const target = e.target as HTMLInputElement;
        tasks = tasks.map(([task, selected]) => {

            if (task.taskListName !== target.name) {
                return [task, selected];
            }

            return [task, target.checked]

        });
    }

    function updateCompletedFilter() {
        tasks = tasks.map(([task]) => {
            if (allowCompletedTasks == "all") {
                return [task, true] as [Task, boolean];
            } else if (allowCompletedTasks == "completed") {
                return [task, task.status === "completed"] as [Task, boolean];
            } else {
                return [task, task.status !== "completed"] as [Task, boolean];
            }
        });
    }

    function handleSubmit() {
        const selectedTasks = tasks
            .filter(([, selected]) => selected)
            .map(([task]) => task);
        onSubmit(selectedTasks, selectInsertTaskModal);
    }

</script>
<div>
    <h1>Task Selection</h1>

    <button on:click={handleSubmit}>Insert selected Tasks</button>

    <h3>Date Range</h3>
    <label for="startDate">
        Start Date
        <input type="date" name="startDate" value={startDate?.format("YYYY-MM-DD") ?? ""} on:change={updateStartDate}>
    </label>
    <label for="endDate">
        End Date
        <input type="date" name="endDate" value={endDate?.format("YYYY-MM-DD") ?? ""}  on:change={updateEndDate}>
    </label>
    <select name="" id="" bind:value={allowCompletedTasks} on:change={updateCompletedFilter}>
        <option value="all">All</option>
        <option value="completed">Completed</option>
        <option value="notCompleted">Not Completed</option>
    </select>
    <h3>Lists</h3>
    {#each taskLists as [taskList, selected]}
        <div>
            <input type="checkbox" name={taskList} bind:checked={selected} on:change={changedTaskLists}>
            <label for="taskList">{taskList}</label>
        </div>
    {/each}

    <h3>Tasks</h3>
    {#each tasks as [task, selected]}
        <div>
            <input type="checkbox" name="task" bind:checked={selected}>
            <label for="task">{task.title}</label>
        </div>
    {/each}

</div>

<style>

</style>
