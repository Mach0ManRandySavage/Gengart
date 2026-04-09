import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, ListTodo, User, Settings, ScrollText,
  ShoppingCart, Circle,
} from 'lucide-react';
import type { Task } from '../../types';
import { TaskStatus } from '../../types';

interface SidebarProps {
  tasks: Task[];
}

const NAV = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/tasks',     icon: ListTodo,        label: 'Tasks'     },
  { to: '/profiles',  icon: User,            label: 'Profiles'  },
  { to: '/logs',      icon: ScrollText,      label: 'Logs'      },
  { to: '/settings',  icon: Settings,        label: 'Settings'  },
];

function StatusDot({ status }: { status: TaskStatus }) {
  const color: Record<TaskStatus, string> = {
    [TaskStatus.Idle]:        'bg-dark-600',
    [TaskStatus.Monitoring]:  'bg-blue-500',
    [TaskStatus.InQueue]:     'bg-yellow-500',
    [TaskStatus.CheckingOut]: 'bg-purple-500',
    [TaskStatus.Success]:     'bg-green-500',
    [TaskStatus.Failed]:      'bg-red-500',
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${color[status]} animate-pulse`} />;
}

export function Sidebar({ tasks }: SidebarProps) {
  const running = tasks.filter(t =>
    t.status !== TaskStatus.Idle &&
    t.status !== TaskStatus.Success &&
    t.status !== TaskStatus.Failed
  );

  return (
    <aside className="w-56 flex-shrink-0 bg-dark-900 border-r border-dark-800 flex flex-col">
      {/* Titlebar area */}
      <div className="titlebar-drag h-10 flex items-center px-4 border-b border-dark-800">
        <ShoppingCart className="w-4 h-4 text-accent-400 mr-2" />
        <span className="text-sm font-semibold text-dark-200">Checkout Bot</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 space-y-0.5 px-2">
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors
               ${isActive
                ? 'bg-accent-600/20 text-accent-400 font-medium'
                : 'text-dark-400 hover:text-dark-200 hover:bg-dark-800'}`
            }
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Running tasks count */}
      {running.length > 0 && (
        <div className="px-4 py-3 border-t border-dark-800">
          <div className="text-xs text-dark-500 mb-2">Running</div>
          <div className="space-y-1">
            {running.slice(0, 5).map(t => (
              <div key={t.id} className="flex items-center gap-2 text-xs text-dark-300">
                <StatusDot status={t.status} />
                <span className="truncate capitalize">{t.retailer} #{t.id}</span>
              </div>
            ))}
            {running.length > 5 && (
              <div className="text-xs text-dark-500">+{running.length - 5} more</div>
            )}
          </div>
        </div>
      )}

      {/* App version */}
      <div className="px-4 py-3 border-t border-dark-800">
        <span className="text-xs text-dark-600">v1.0.0 — Personal use</span>
      </div>
    </aside>
  );
}
