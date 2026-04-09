import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type {
  Task, CreateTaskInput, TaskGroup, Profile, CreateProfileInput,
  LogEntry, LogFilters, Settings, ElectronAPI,
} from '../types';

const api: ElectronAPI = {
  // Tasks
  getTasks:    ()            => ipcRenderer.invoke('db:getTasks'),
  getTask:     (id)          => ipcRenderer.invoke('db:getTask', id),
  createTask:  (input)       => ipcRenderer.invoke('db:createTask', input),
  updateTask:  (id, input)   => ipcRenderer.invoke('db:updateTask', id, input),
  deleteTask:  (id)          => ipcRenderer.invoke('db:deleteTask', id),
  startTask:   (id)          => ipcRenderer.invoke('bot:startTask', id),
  stopTask:    (id)          => ipcRenderer.invoke('bot:stopTask', id),

  // Groups
  getGroups:   ()            => ipcRenderer.invoke('db:getGroups'),
  createGroup: (name)        => ipcRenderer.invoke('db:createGroup', name),
  deleteGroup: (id)          => ipcRenderer.invoke('db:deleteGroup', id),
  startGroup:  (id)          => ipcRenderer.invoke('bot:startGroup', id),
  stopGroup:   (id)          => ipcRenderer.invoke('bot:stopGroup', id),

  // Profiles
  getProfiles:    ()            => ipcRenderer.invoke('db:getProfiles'),
  createProfile:  (input)       => ipcRenderer.invoke('db:createProfile', input),
  updateProfile:  (id, input)   => ipcRenderer.invoke('db:updateProfile', id, input),
  deleteProfile:  (id)          => ipcRenderer.invoke('db:deleteProfile', id),

  // Logs
  getLogs:    (filters)  => ipcRenderer.invoke('db:getLogs', filters),
  clearLogs:  ()         => ipcRenderer.invoke('db:clearLogs'),

  // Settings
  getSettings:  ()        => ipcRenderer.invoke('db:getSettings'),
  saveSettings: (s)       => ipcRenderer.invoke('db:saveSettings', s),

  // Events
  onTaskUpdate: (cb) => {
    const handler = (_event: IpcRendererEvent, task: Task) => cb(task);
    ipcRenderer.on('task:update', handler);
    return () => ipcRenderer.removeListener('task:update', handler);
  },
  onLogEntry: (cb) => {
    const handler = (_event: IpcRendererEvent, log: LogEntry) => cb(log);
    ipcRenderer.on('log:entry', handler);
    return () => ipcRenderer.removeListener('log:entry', handler);
  },
};

contextBridge.exposeInMainWorld('api', api);
