import { ipcMain } from 'electron';
import type Database from 'better-sqlite3';
import type { BotManager } from '../BotManager';
import {
  dbGetTasks, dbGetTask, dbCreateTask, dbUpdateTask, dbDeleteTask,
  dbGetGroups, dbCreateGroup, dbDeleteGroup,
  dbGetProfiles, dbCreateProfile, dbUpdateProfile, dbDeleteProfile,
  dbGetLogs, dbClearLogs,
  dbGetSettings, dbSaveSettings,
} from '../../db/queries';

export function registerIpcHandlers(db: Database.Database, bot: BotManager): void {

  // ── Tasks ────────────────────────────────────────────────────────────────
  ipcMain.handle('db:getTasks',    ()          => dbGetTasks(db));
  ipcMain.handle('db:getTask',     (_, id)     => dbGetTask(db, id));
  ipcMain.handle('db:createTask',  (_, input)  => dbCreateTask(db, input));
  ipcMain.handle('db:updateTask',  (_, id, i)  => dbUpdateTask(db, id, i));
  ipcMain.handle('db:deleteTask',  (_, id)     => dbDeleteTask(db, id));

  // ── Groups ───────────────────────────────────────────────────────────────
  ipcMain.handle('db:getGroups',   ()          => dbGetGroups(db));
  ipcMain.handle('db:createGroup', (_, name)   => dbCreateGroup(db, name));
  ipcMain.handle('db:deleteGroup', (_, id)     => dbDeleteGroup(db, id));

  // ── Profiles ─────────────────────────────────────────────────────────────
  ipcMain.handle('db:getProfiles',    ()          => dbGetProfiles(db));
  ipcMain.handle('db:createProfile',  (_, input)  => dbCreateProfile(db, input));
  ipcMain.handle('db:updateProfile',  (_, id, i)  => dbUpdateProfile(db, id, i));
  ipcMain.handle('db:deleteProfile',  (_, id)     => dbDeleteProfile(db, id));

  // ── Logs ─────────────────────────────────────────────────────────────────
  ipcMain.handle('db:getLogs',    (_, filters) => dbGetLogs(db, filters));
  ipcMain.handle('db:clearLogs',  ()           => dbClearLogs(db));

  // ── Settings ─────────────────────────────────────────────────────────────
  ipcMain.handle('db:getSettings',  ()      => dbGetSettings(db));
  ipcMain.handle('db:saveSettings', (_, s)  => dbSaveSettings(db, s));

  // ── Bot control ──────────────────────────────────────────────────────────
  ipcMain.handle('bot:startTask',  (_, id) => bot.startTask(id));
  ipcMain.handle('bot:stopTask',   (_, id) => bot.stopTask(id));
  ipcMain.handle('bot:startGroup', (_, id) => bot.startGroup(id));
  ipcMain.handle('bot:stopGroup',  (_, id) => bot.stopGroup(id));
}
