import { test } from "brittle";
import {QueueManager} from "../lib/QueueManager.js";


test('QueueManager handles tasks sequentially', async t => {
    t.plan(3);

    const queueManager = new QueueManager();

    let task1Completed = false;
    let task2Completed = false;

    // Task 1: Simulate an asynchronous task with a delay
    queueManager.addTask(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        task1Completed = true;
        console.log('Task 1 completed');
        t.pass('Task 1 should complete first');
    });

    // Task 2: This task should only run after Task 1 completes
    queueManager.addTask(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        task2Completed = true;
        console.log('Task 2 completed');
        t.ok(task1Completed, 'Task 2 should only run after Task 1');
    });

    // Final Task: Verify both tasks have completed
    queueManager.addTask(async () => {
        t.ok(task1Completed && task2Completed, 'All tasks should be completed');
        console.log('All tasks completed');
    });
});

test('QueueManager handles errors properly', async t => {
    t.plan(2);

    const queueManager = new QueueManager();

    // Task 1: Simulate a task that will fail
    queueManager.addTask(async () => {
        throw new Error('Task 1 failed');
    }).catch(err => {
        console.log('Caught error:', err.message);
        t.is(err.message, 'Task 1 failed', 'Should catch error from task 1');
    });

    // Task 2: This task should run even after Task 1 fails
    queueManager.addTask(async () => {
        console.log('Task 2 completed');
        t.pass('Task 2 should still run even if Task 1 fails');
    });
});

test('QueueManager clears the queue properly', async t => {
    t.plan(2);

    const queueManager = new QueueManager();

    let task1Completed = false;

    // Task 1: Simulate a task
    queueManager.addTask(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        task1Completed = true;
        console.log('Task 1 completed');
    });

    // Clear the queue before Task 1 finishes
    queueManager.clearQueue();
    console.log('Queue cleared');

    // Task 2: This task should not run since the queue was cleared
    queueManager.addTask(async () => {
        console.log('Task 2 completed');
        t.fail('Task 2 should not run because the queue was cleared');
    });

    // Check if task1 was not completed
    t.ok(!task1Completed, 'Task 1 should not complete since the queue was cleared');
    t.pass('Queue cleared successfully');
});