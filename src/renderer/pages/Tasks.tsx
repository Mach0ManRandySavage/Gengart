import React, { useState, useEffect, useContext } from 'react';
import { Plus, Play, Square, Trash2, Edit, FolderPlus, ChevronDown, ChevronRight } from 'lucide-react';
import type { Task, TaskGroup, Profile } from '../../types';
import { TaskStatus } from '../../types';
import { TaskModal } from '../components/TaskModal';
import { AppCtx } from '../App';

const STATUS_LABEL: Record<TaskStatus, string> = {
  [TaskStatus.Idle]:        'Idle',
  [TaskStatus.Monitoring]:  'Monitoring',
  [TaskStatus.InQueue]:     'In Queue',
  [TaskStatus.CheckingOut]: 'Checking Out',
  [TaskStatus.Success]:     'Success',
  [TaskStatus.Failed]:      'Failed',
};

function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium status-${status}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Tasks() {
  const { tasks, refreshTasks } = useContext(AppCtx);
  const [groups,   setGroups]   = useState<TaskGroup[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editTask,  setEditTask]  = useState<Task | null>(null);
  const [expanded,  setExpanded]  = useState<Set<number>>(new Set());
  const [newGroupName, setNewGroupName] = useState('');
  const [showGroupInput, setShowGroupInput] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    const [g, p] = await Promise.all([window.api.getGroups(), window.api.getProfiles()]);
    setGroups(g);
    setProfiles(p);
    refreshTasks();
  }

  async function handleStart(id: number) {
    await window.api.startTask(id);
  }

  async function handleStop(id: number) {
    await window.api.stopTask(id);
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this task?')) return;
    await window.api.deleteTask(id);
    refreshTasks();
  }

  async function handleStartGroup(id: number) {
    await window.api.startGroup(id);
  }

  async function handleStopGroup(id: number) {
    await window.api.stopGroup(id);
  }

  async function handleDeleteGroup(id: number) {
    if (!confirm('Delete group and all its tasks?')) return;
    await window.api.deleteGroup(id);
    loadAll();
  }

  async function handleCreateGroup() {
    if (!newGroupName.trim()) return;
    await window.api.createGroup(newGroupName.trim());
    setNewGroupName('');
    setShowGroupInput(false);
    loadAll();
  }

  function toggleGroup(id: number) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const ungrouped = tasks.filter(t => !t.group_id);

  function isRunning(t: Task) {
    return t.status !== TaskStatus.Idle && t.status !== TaskStatus.Success && t.status !== TaskStatus.Failed;
  }

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Tasks</h1>
          <p className="text-sm text-dark-500 mt-0.5">{tasks.length} task{tasks.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-ghost" onClick={() => setShowGroupInput(!showGroupInput)}>
            <FolderPlus className="w-4 h-4" />
            New Group
          </button>
          <button className="btn-primary" onClick={() => { setEditTask(null); setShowModal(true); }}>
            <Plus className="w-4 h-4" />
            New Task
          </button>
        </div>
      </div>

      {/* New group input */}
      {showGroupInput && (
        <div className="flex gap-2 p-3 card">
          <input className="input flex-1" placeholder="Group name…" value={newGroupName}
            onChange={e => setNewGroupName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreateGroup()} />
          <button className="btn-primary" onClick={handleCreateGroup}>Create</button>
          <button className="btn-ghost" onClick={() => setShowGroupInput(false)}>Cancel</button>
        </div>
      )}

      {/* Groups */}
      {groups.map(group => {
        const groupTasks = tasks.filter(t => t.group_id === group.id);
        const isOpen = expanded.has(group.id);
        return (
          <div key={group.id} className="card p-0 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-dark-800/50 border-b border-dark-700">
              <button onClick={() => toggleGroup(group.id)} className="flex items-center gap-2 text-sm font-medium hover:text-white">
                {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                {group.name}
                <span className="text-dark-500 text-xs">({groupTasks.length})</span>
              </button>
              <div className="flex items-center gap-1">
                <button className="btn-ghost text-xs py-1" onClick={() => handleStartGroup(group.id)}>
                  <Play className="w-3 h-3" /> Start All
                </button>
                <button className="btn-ghost text-xs py-1" onClick={() => handleStopGroup(group.id)}>
                  <Square className="w-3 h-3" /> Stop All
                </button>
                <button className="btn-ghost text-xs py-1 text-red-400" onClick={() => handleDeleteGroup(group.id)}>
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
            {isOpen && (
              <div className="divide-y divide-dark-800">
                {groupTasks.length === 0
                  ? <p className="text-sm text-dark-500 px-4 py-3">No tasks in this group.</p>
                  : groupTasks.map(t => <TaskRow key={t.id} task={t} profiles={profiles}
                      onStart={handleStart} onStop={handleStop}
                      onEdit={() => { setEditTask(t); setShowModal(true); }}
                      onDelete={handleDelete} isRunning={isRunning(t)} />)
                }
              </div>
            )}
          </div>
        );
      })}

      {/* Ungrouped */}
      {ungrouped.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 bg-dark-800/50 border-b border-dark-700 text-sm font-medium text-dark-400">
            Ungrouped Tasks
          </div>
          <div className="divide-y divide-dark-800">
            {ungrouped.map(t => (
              <TaskRow key={t.id} task={t} profiles={profiles}
                onStart={handleStart} onStop={handleStop}
                onEdit={() => { setEditTask(t); setShowModal(true); }}
                onDelete={handleDelete} isRunning={isRunning(t)} />
            ))}
          </div>
        </div>
      )}

      {tasks.length === 0 && !showModal && (
        <div className="text-center py-16 text-dark-500">
          <p className="text-sm">No tasks yet. Create one to get started.</p>
        </div>
      )}

      {showModal && (
        <TaskModal task={editTask} groups={groups} profiles={profiles}
          onClose={() => setShowModal(false)} onSave={loadAll} />
      )}
    </div>
  );
}

function TaskRow({ task, profiles, onStart, onStop, onEdit, onDelete, isRunning }: {
  task: Task; profiles: Profile[];
  onStart: (id: number) => void; onStop: (id: number) => void;
  onEdit: () => void; onDelete: (id: number) => void; isRunning: boolean;
}) {
  const profile = profiles.find(p => p.id === task.profile_id);

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-dark-800/30 transition-colors">
      <div className="w-8 h-8 bg-dark-700 rounded-lg flex items-center justify-center text-xs font-mono text-dark-500 flex-shrink-0">
        #{task.id}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium capitalize">{task.retailer}</span>
          <StatusBadge status={task.status} />
        </div>
        <div className="text-xs text-dark-500 truncate">
          {task.product_url || task.keywords || 'No URL set'}
          {task.size ? ` · ${task.size}` : ''}
          {task.quantity > 1 ? ` · qty ${task.quantity}` : ''}
        </div>
        <div className="text-xs text-dark-600">
          {profile ? `Profile: ${profile.name}` : 'No profile'} · Poll: {task.poll_interval}ms
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        {isRunning ? (
          <button className="btn-ghost text-xs py-1 text-red-400" onClick={() => onStop(task.id)}>
            <Square className="w-3 h-3" /> Stop
          </button>
        ) : (
          <button className="btn-ghost text-xs py-1 text-green-400" onClick={() => onStart(task.id)}>
            <Play className="w-3 h-3" /> Start
          </button>
        )}
        <button className="btn-ghost p-1.5 rounded" onClick={onEdit}>
          <Edit className="w-3.5 h-3.5" />
        </button>
        <button className="btn-ghost p-1.5 rounded text-red-400" onClick={() => onDelete(task.id)}>
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
