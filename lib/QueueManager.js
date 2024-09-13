// QueueManager.js
import { promise as Q } from 'fastq';

export class QueueManager {
    constructor() {
        this.queue = null;
        this.awaitPause = Promise.resolve();
        this._initQueue();
    }

    _initQueue() {
        if (!this.queue) {
            this.queue = Q(async (task) => {
                try {
                    return await task.execute();
                } catch (error) {
                    console.error('Task failed:', error);
                    if (task.callback) task.callback(error);
                    throw error;
                }
            }, 1);  // Concurrency of 1 ensures tasks run sequentially
        }
    }

    // Add a new task to the queue (conforming to task interface)
    addTask(task) {
        return new Promise((resolve, reject) => {
            // Automatically resume the queue if it's paused
            if (this.queue.paused) {
                this.resumeQueue();
            }

            if (this.queueCleared) {
                console.warn('Task not added: queue was cleared.');
                return resolve();  // Skip adding tasks if the queue was cleared
            }

            this.queue.push({
                execute: task,  // Conforming to the task interface
                callback: (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                }
            });
        });
    }

    // Clear any remaining tasks in the queue
    clearQueue() {
        console.log('Clearing the task queue');
        this.queueCleared = true;  // Mark the queue as cleared
        this.queue.kill();  // Kill any remaining tasks
        this._initQueue();  // Reinitialize the queue to allow for future tasks
    }

    pauseQueue() {
        this.queue.pause();
        this.awaitPause = new Promise(resolve => {
           this._resume = resolve;
        });
    }

    resumeQueue() {
        this.queue.resume();
    }

    get isPaused() {
        return this.queue.paused;
    }
}

