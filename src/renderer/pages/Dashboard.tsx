import React, { useContext, useMemo } from 'react';
import { AppCtx } from '../App';
import { TaskStatus } from '../../types';
import { CheckCircle, XCircle, Activity, Clock, TrendingUp } from 'lucide-react';

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: number; icon: React.ElementType; color: string;
}) {
  return (
    <div className="card flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs text-dark-500">{label}</div>
      </div>
    </div>
  );
}

export function Dashboard() {
  const { tasks, logs } = useContext(AppCtx);

  const stats = useMemo(() => ({
    running:  tasks.filter(t => t.status === TaskStatus.Monitoring || t.status === TaskStatus.CheckingOut).length,
    success:  tasks.filter(t => t.status === TaskStatus.Success).length,
    failed:   tasks.filter(t => t.status === TaskStatus.Failed).length,
    total:    tasks.length,
  }), [tasks]);

  const recentLogs = useMemo(() => logs.slice(0, 50), [logs]);

  const activeTasks = tasks.filter(t =>
    t.status !== TaskStatus.Idle &&
    t.status !== TaskStatus.Success &&
    t.status !== TaskStatus.Failed
  );

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-dark-500 mt-0.5">Overview of all tasks</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Tasks"   value={stats.total}   icon={TrendingUp} color="bg-dark-700 text-dark-300" />
        <StatCard label="Running"       value={stats.running} icon={Activity}   color="bg-blue-900/50 text-blue-400" />
        <StatCard label="Successful"    value={stats.success} icon={CheckCircle} color="bg-green-900/50 text-green-400" />
        <StatCard label="Failed"        value={stats.failed}  icon={XCircle}    color="bg-red-900/50 text-red-400" />
      </div>

      {/* Active tasks */}
      {activeTasks.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-dark-400 mb-3 uppercase tracking-widest">Active Tasks</h2>
          <div className="space-y-2">
            {activeTasks.map(t => (
              <div key={t.id} className="card flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-dark-700 rounded-lg flex items-center justify-center text-xs font-mono text-dark-400">
                    #{t.id}
                  </div>
                  <div>
                    <div className="text-sm font-medium capitalize">{t.retailer}</div>
                    <div className="text-xs text-dark-500 truncate max-w-xs">
                      {t.product_url || t.keywords || 'No URL'}
                    </div>
                  </div>
                </div>
                <StatusBadge status={t.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent log */}
      <div>
        <h2 className="text-sm font-semibold text-dark-400 mb-3 uppercase tracking-widest">Recent Activity</h2>
        <div className="card p-0 overflow-hidden">
          {recentLogs.length === 0 ? (
            <p className="text-sm text-dark-500 p-4">No recent activity.</p>
          ) : (
            <div className="divide-y divide-dark-800">
              {recentLogs.map(log => (
                <div key={log.id} className="flex items-start gap-3 px-4 py-2.5">
                  <span className="text-xs text-dark-600 mt-0.5 flex-shrink-0 font-mono">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className={`text-xs flex-1 log-${log.level}`}>{log.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: TaskStatus }) {
  const label: Record<TaskStatus, string> = {
    [TaskStatus.Idle]:        'Idle',
    [TaskStatus.Monitoring]:  'Monitoring',
    [TaskStatus.InQueue]:     'In Queue',
    [TaskStatus.CheckingOut]: 'Checking Out',
    [TaskStatus.Success]:     'Success',
    [TaskStatus.Failed]:      'Failed',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium status-${status}`}>
      {label[status]}
    </span>
  );
}
