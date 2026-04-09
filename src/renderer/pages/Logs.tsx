import React, { useContext, useState, useMemo, useRef, useEffect } from 'react';
import { Trash2, Search, Filter } from 'lucide-react';
import { AppCtx } from '../App';
import type { LogEntry } from '../../types';
import { LogLevel } from '../../types';

const LEVEL_COLORS: Record<string, string> = {
  info:    'text-dark-300',
  warn:    'text-yellow-400',
  error:   'text-red-400',
  success: 'text-green-400',
};

const LEVEL_DOT: Record<string, string> = {
  info:    'bg-dark-500',
  warn:    'bg-yellow-500',
  error:   'bg-red-500',
  success: 'bg-green-500',
};

export function Logs() {
  const { logs } = useContext(AppCtx);
  const [filterLevel,   setFilterLevel]   = useState<string>('all');
  const [filterTaskId,  setFilterTaskId]  = useState<string>('all');
  const [search,        setSearch]        = useState('');
  const [autoScroll,    setAutoScroll]    = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive (if enabled)
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const taskIds = useMemo(() => {
    const ids = Array.from(new Set(logs.map(l => l.task_id).filter(Boolean)));
    return ids as number[];
  }, [logs]);

  const filtered = useMemo(() => {
    return logs.filter(l => {
      if (filterLevel !== 'all' && l.level !== filterLevel) return false;
      if (filterTaskId !== 'all' && String(l.task_id) !== filterTaskId) return false;
      if (search && !l.message.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [logs, filterLevel, filterTaskId, search]);

  async function handleClear() {
    if (!confirm('Clear all logs?')) return;
    await window.api.clearLogs();
    // Parent will auto-update via IPC subscription; but manually trigger here too
    window.api.getLogs().then(() => {}); // logs state is managed in App
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-dark-800 flex-shrink-0">
        <h1 className="text-sm font-semibold mr-2">Logs</h1>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="w-3.5 h-3.5 text-dark-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input className="input pl-8 py-1.5 text-xs" placeholder="Search logs…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* Level filter */}
        <div className="flex items-center gap-1">
          <Filter className="w-3.5 h-3.5 text-dark-500" />
          <select className="select py-1.5 text-xs w-28" value={filterLevel}
            onChange={e => setFilterLevel(e.target.value)}>
            <option value="all">All levels</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
            <option value="success">Success</option>
          </select>
        </div>

        {/* Task filter */}
        <select className="select py-1.5 text-xs w-36" value={filterTaskId}
          onChange={e => setFilterTaskId(e.target.value)}>
          <option value="all">All tasks</option>
          {taskIds.map(id => <option key={id} value={id}>Task #{id}</option>)}
        </select>

        <label className="flex items-center gap-1 text-xs text-dark-400 cursor-pointer ml-auto">
          <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} />
          Auto-scroll
        </label>

        <button className="btn-ghost py-1.5 text-xs text-red-400" onClick={handleClear}>
          <Trash2 className="w-3.5 h-3.5" />
          Clear
        </button>
      </div>

      {/* Log list */}
      <div className="flex-1 overflow-y-auto font-mono text-xs">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-dark-600">No log entries.</div>
        ) : (
          <table className="w-full">
            <tbody>
              {[...filtered].reverse().map(log => (
                <LogRow key={log.id} log={log} />
              ))}
            </tbody>
          </table>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Footer count */}
      <div className="px-5 py-2 border-t border-dark-800 text-xs text-dark-600 flex-shrink-0">
        Showing {filtered.length} of {logs.length} entries
      </div>
    </div>
  );
}

function LogRow({ log }: { log: LogEntry }) {
  const ts = new Date(log.timestamp);
  const timeStr = ts.toLocaleTimeString('en-US', { hour12: false }) + '.' +
    String(ts.getMilliseconds()).padStart(3, '0');

  return (
    <tr className="border-b border-dark-900 hover:bg-dark-800/30 transition-colors">
      <td className="px-4 py-1.5 text-dark-600 w-28 whitespace-nowrap">{timeStr}</td>
      <td className="px-2 py-1.5 w-6">
        <span className={`inline-block w-2 h-2 rounded-full ${LEVEL_DOT[log.level] ?? 'bg-dark-500'}`} />
      </td>
      <td className="px-2 py-1.5 text-dark-500 w-16 whitespace-nowrap">
        {log.task_id ? `#${log.task_id}` : '—'}
      </td>
      <td className={`px-2 py-1.5 break-all ${LEVEL_COLORS[log.level] ?? 'text-dark-300'}`}>
        {log.message}
      </td>
    </tr>
  );
}
