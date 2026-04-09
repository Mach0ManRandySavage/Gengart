import { BrowserWindow, Notification } from 'electron';
import type { Database } from 'better-sqlite3';
import type { Task, Profile } from '../types';
import { TaskStatus } from '../types';
import { dbGetTask, dbGetProfile, dbUpdateTaskStatus, dbInsertLog, dbGetTasksByGroup, dbGetSettings } from '../db/queries';
import { StockMonitor } from '../bot/monitors/StockMonitor';

export class BotManager {
  private monitors: Map<number, StockMonitor> = new Map();
  private win: BrowserWindow | null = null;
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  setWindow(win: BrowserWindow): void {
    this.win = win;
  }

  private emit(channel: string, payload: unknown): void {
    this.win?.webContents.send(channel, payload);
  }

  private log(taskId: number | null, level: string, message: string): void {
    const entry = dbInsertLog(this.db, taskId, level, message);
    this.emit('log:entry', entry);
  }

  private setStatus(taskId: number, status: TaskStatus): void {
    dbUpdateTaskStatus(this.db, taskId, status);
    const task = dbGetTask(this.db, taskId);
    if (task) this.emit('task:update', task);
  }

  async startTask(taskId: number): Promise<void> {
    if (this.monitors.has(taskId)) {
      this.log(taskId, 'warn', `Task ${taskId} is already running`);
      return;
    }

    const task = dbGetTask(this.db, taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    const profile = task.profile_id ? dbGetProfile(this.db, task.profile_id) : null;
    if (!profile) throw new Error(`No profile assigned to task ${taskId}`);

    this.setStatus(taskId, TaskStatus.Monitoring);
    this.log(taskId, 'info', `Starting monitor for ${task.retailer} — ${task.product_url ?? task.keywords}`);

    const settings = dbGetSettings(this.db);

    const monitor = new StockMonitor(task, profile, {
      onStatusChange: (status) => this.setStatus(taskId, status),
      onLog: (level, msg) => this.log(taskId, level, msg),
      onSuccess: () => this.notifySuccess(task),
      onFail:    (err) => this.notifyFail(task, err),
    }, { headless: settings.browser_headless });

    this.monitors.set(taskId, monitor);

    try {
      await monitor.start();
    } catch (err) {
      this.monitors.delete(taskId);
      this.setStatus(taskId, TaskStatus.Failed);
      this.log(taskId, 'error', `Monitor crashed: ${(err as Error).message}`);
    }
  }

  async stopTask(taskId: number): Promise<void> {
    const monitor = this.monitors.get(taskId);
    if (!monitor) return;

    await monitor.stop();
    this.monitors.delete(taskId);
    this.setStatus(taskId, TaskStatus.Idle);
    this.log(taskId, 'info', `Task ${taskId} stopped`);
  }

  async startGroup(groupId: number): Promise<void> {
    const tasks = dbGetTasksByGroup(this.db, groupId);
    await Promise.allSettled(tasks.map((t) => this.startTask(t.id)));
  }

  async stopGroup(groupId: number): Promise<void> {
    const tasks = dbGetTasksByGroup(this.db, groupId);
    await Promise.allSettled(tasks.map((t) => this.stopTask(t.id)));
  }

  async stopAll(): Promise<void> {
    const ids = Array.from(this.monitors.keys());
    await Promise.allSettled(ids.map((id) => this.stopTask(id)));
  }

  private notifySuccess(task: Task): void {
    this.log(task.id, 'success', `Order placed successfully for task ${task.id}`);
    new Notification({
      title: 'Checkout Successful!',
      body:  `Order placed for ${task.retailer} task #${task.id}`,
    }).show();
  }

  private notifyFail(task: Task, err: string): void {
    this.log(task.id, 'error', `Checkout failed: ${err}`);
    new Notification({
      title: 'Checkout Failed',
      body:  `Task #${task.id} (${task.retailer}): ${err}`,
    }).show();
  }
}
