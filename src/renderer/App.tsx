import React, { useEffect, useState, useCallback } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { Tasks } from './pages/Tasks';
import { Profiles } from './pages/Profiles';
import { Settings } from './pages/Settings';
import { Logs } from './pages/Logs';
import type { Task, LogEntry } from '../types';

export interface AppContext {
  tasks:          Task[];
  logs:           LogEntry[];
  refreshTasks:   () => void;
  addLog:         (log: LogEntry) => void;
}

export const AppCtx = React.createContext<AppContext>({
  tasks:        [],
  logs:         [],
  refreshTasks: () => {},
  addLog:       () => {},
});

export function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [logs,  setLogs]  = useState<LogEntry[]>([]);

  const refreshTasks = useCallback(async () => {
    const t = await window.api.getTasks();
    setTasks(t);
  }, []);

  const addLog = useCallback((log: LogEntry) => {
    setLogs(prev => [log, ...prev].slice(0, 1000));
  }, []);

  useEffect(() => {
    refreshTasks();

    // Load recent logs
    window.api.getLogs({ limit: 200 }).then(setLogs);

    // Subscribe to real-time events
    const unsubTask = window.api.onTaskUpdate((task) => {
      setTasks(prev => prev.map(t => t.id === task.id ? task : t));
    });

    const unsubLog = window.api.onLogEntry((log) => {
      setLogs(prev => [log, ...prev].slice(0, 1000));
    });

    return () => {
      unsubTask();
      unsubLog();
    };
  }, [refreshTasks]);

  return (
    <AppCtx.Provider value={{ tasks, logs, refreshTasks, addLog }}>
      <HashRouter>
        <div className="flex h-screen overflow-hidden">
          <Sidebar tasks={tasks} />
          <main className="flex-1 overflow-y-auto">
            <Routes>
              <Route path="/"          element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/tasks"     element={<Tasks />} />
              <Route path="/profiles"  element={<Profiles />} />
              <Route path="/settings"  element={<Settings />} />
              <Route path="/logs"      element={<Logs />} />
            </Routes>
          </main>
        </div>
      </HashRouter>
    </AppCtx.Provider>
  );
}
