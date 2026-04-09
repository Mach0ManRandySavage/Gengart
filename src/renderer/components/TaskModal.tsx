import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { Task, TaskGroup, Profile, CreateTaskInput } from '../../types';
import { Retailer } from '../../types';

interface TaskModalProps {
  task?:     Task | null;
  groups:    TaskGroup[];
  profiles:  Profile[];
  onClose:   () => void;
  onSave:    () => void;
}

const RETAILERS = [
  { value: Retailer.Walmart, label: 'Walmart'  },
  { value: Retailer.Target,  label: 'Target'   },
  { value: Retailer.Amazon,  label: 'Amazon'   },
  { value: Retailer.BestBuy, label: 'Best Buy' },
];

export function TaskModal({ task, groups, profiles, onClose, onSave }: TaskModalProps) {
  const [form, setForm] = useState<CreateTaskInput>({
    retailer:        Retailer.Walmart,
    product_url:     '',
    keywords:        '',
    size:            '',
    quantity:        1,
    profile_id:      null,
    group_id:        null,
    proxy:           '',
    poll_interval:   3000,
    offer_id:        '',
    skip_monitoring: false,
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  useEffect(() => {
    if (task) {
      setForm({
        retailer:        task.retailer,
        product_url:     task.product_url  ?? '',
        keywords:        task.keywords     ?? '',
        size:            task.size         ?? '',
        quantity:        task.quantity,
        profile_id:      task.profile_id,
        group_id:        task.group_id,
        proxy:           task.proxy        ?? '',
        poll_interval:   task.poll_interval,
        offer_id:        task.offer_id     ?? '',
        skip_monitoring: task.skip_monitoring ?? false,
      });
    }
  }, [task]);

  function set<K extends keyof CreateTaskInput>(key: K, val: CreateTaskInput[K]) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  async function handleSave() {
    if (!form.product_url && !form.keywords) {
      setError('Enter a product URL or keywords.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      if (task) {
        await window.api.updateTask(task.id, form);
      } else {
        await window.api.createTask(form);
      }
      onSave();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal w-full max-w-xl">
        <div className="modal-header">
          <h2 className="text-base font-semibold">{task ? 'Edit Task' : 'New Task'}</h2>
          <button onClick={onClose} className="btn-ghost p-1 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="modal-body">
          {/* Retailer */}
          <div>
            <label className="label">Retailer</label>
            <select className="select" value={form.retailer} onChange={e => set('retailer', e.target.value as Retailer)}>
              {RETAILERS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>

          {/* URL */}
          <div>
            <label className="label">Product URL</label>
            <input className="input" placeholder="https://www.walmart.com/ip/..." value={form.product_url ?? ''} onChange={e => set('product_url', e.target.value)} />
          </div>

          {/* Keywords */}
          <div>
            <label className="label">Keywords (fallback)</label>
            <input className="input" placeholder="RTX 4090, ASUS..." value={form.keywords ?? ''} onChange={e => set('keywords', e.target.value)} />
          </div>

          {/* Size + Quantity */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Size / Variant</label>
              <input className="input" placeholder="XL, 256GB, Black..." value={form.size ?? ''} onChange={e => set('size', e.target.value)} />
            </div>
            <div>
              <label className="label">Quantity</label>
              <input className="input" type="number" min={1} max={10} value={form.quantity}
                onChange={e => set('quantity', Math.max(1, parseInt(e.target.value) || 1))} />
            </div>
          </div>

          {/* Profile */}
          <div>
            <label className="label">Checkout Profile</label>
            <select className="select" value={form.profile_id ?? ''} onChange={e => set('profile_id', e.target.value ? Number(e.target.value) : null)}>
              <option value="">— Select profile —</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {/* Group */}
          <div>
            <label className="label">Task Group (optional)</label>
            <select className="select" value={form.group_id ?? ''} onChange={e => set('group_id', e.target.value ? Number(e.target.value) : null)}>
              <option value="">— No group —</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>

          {/* Proxy */}
          <div>
            <label className="label">Proxy (optional)</label>
            <input className="input" placeholder="http://user:pass@host:port" value={form.proxy ?? ''} onChange={e => set('proxy', e.target.value)} />
          </div>

          {/* Poll interval */}
          <div>
            <label className="label">Poll Interval (ms)</label>
            <input className="input" type="number" min={1000} step={500} value={form.poll_interval}
              onChange={e => set('poll_interval', Math.max(1000, parseInt(e.target.value) || 3000))} />
          </div>

          {/* Walmart-specific fields */}
          {form.retailer === 'walmart' && (
            <div className="border border-dark-700 rounded-lg p-3 space-y-3">
              <p className="text-xs font-semibold text-dark-400 uppercase tracking-widest">Walmart Options</p>

              <div>
                <label className="label">Offer ID (OID) <span className="text-dark-600 normal-case font-normal">— optional, for specific seller</span></label>
                <input className="input" placeholder="e.g. 4B0A3BCC2..." value={form.offer_id ?? ''}
                  onChange={e => set('offer_id', e.target.value)} />
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" className="rounded" checked={form.skip_monitoring ?? false}
                  onChange={e => set('skip_monitoring', e.target.checked)} />
                <span className="text-sm text-dark-300">Skip Monitoring — go straight to ATC</span>
              </label>
              {form.skip_monitoring && (
                <p className="text-xs text-yellow-400">
                  Enable this right when the drop begins. Requires Offer ID to target a specific listing.
                </p>
              )}
            </div>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : task ? 'Update Task' : 'Create Task'}
          </button>
        </div>
      </div>
    </div>
  );
}
