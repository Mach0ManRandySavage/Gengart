import React, { useState, useEffect } from 'react';
import { Save, Mail, Globe, Bell, Eye, EyeOff } from 'lucide-react';
import type { Settings as SettingsType } from '../../types';
import { DEFAULT_SETTINGS } from '../../types';

export function Settings() {
  const [form,    setForm]    = useState<SettingsType>(DEFAULT_SETTINGS);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [showPw,  setShowPw]  = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.api.getSettings().then(s => {
      setForm(s);
      setLoading(false);
    });
  }, []);

  function set<K extends keyof SettingsType>(k: K, v: SettingsType[K]) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await window.api.saveSettings(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-6 text-dark-500 text-sm">Loading…</div>;

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Settings</h1>
          <p className="text-sm text-dark-500 mt-0.5">Global configuration</p>
        </div>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4" />
          {saved ? 'Saved!' : saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* Monitoring */}
      <Section title="Monitoring" icon={Globe}>
        <div>
          <label className="label">Default Poll Interval (ms)</label>
          <input className="input" type="number" min={1000} step={500} value={form.poll_interval}
            onChange={e => set('poll_interval', parseInt(e.target.value) || 3000)} />
          <p className="text-xs text-dark-500 mt-1">Minimum 1000ms. Applies to new tasks. Recommended: 3000–5000ms.</p>
        </div>
        <div>
          <label className="label">Default Proxy</label>
          <input className="input" placeholder="http://user:pass@proxy:port or socks5://…" value={form.default_proxy}
            onChange={e => set('default_proxy', e.target.value)} />
          <p className="text-xs text-dark-500 mt-1">Per-task proxy overrides this. Leave blank for no proxy.</p>
        </div>
        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="rounded" checked={form.browser_headless}
              onChange={e => set('browser_headless', e.target.checked)} />
            <span className="text-sm text-dark-300">Run browser headless (hidden)</span>
          </label>
          <p className="text-xs text-dark-500 mt-1 ml-6">Disable to watch the browser for debugging.</p>
        </div>
      </Section>

      {/* Notifications */}
      <Section title="Notifications" icon={Bell}>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" className="rounded" checked={form.notifications_enabled}
            onChange={e => set('notifications_enabled', e.target.checked)} />
          <span className="text-sm text-dark-300">macOS notifications on success / failure</span>
        </label>
      </Section>

      {/* IMAP */}
      <Section title="IMAP Email (OTP Monitoring)" icon={Mail}>
        <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg px-3 py-2 mb-2">
          <p className="text-xs text-blue-400">
            Used to auto-detect verification codes from retailer emails during checkout.
            Gmail: enable App Passwords; use imap.gmail.com port 993.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">IMAP Host</label>
            <input className="input" placeholder="imap.gmail.com" value={form.imap_host}
              onChange={e => set('imap_host', e.target.value)} />
          </div>
          <div>
            <label className="label">Port</label>
            <input className="input" type="number" value={form.imap_port}
              onChange={e => set('imap_port', parseInt(e.target.value) || 993)} />
          </div>
        </div>
        <div>
          <label className="label">Email Address</label>
          <input className="input" type="email" placeholder="you@gmail.com" value={form.imap_user}
            onChange={e => set('imap_user', e.target.value)} />
        </div>
        <div>
          <label className="label">Password / App Password</label>
          <div className="relative">
            <input className="input pr-10" type={showPw ? 'text' : 'password'} value={form.imap_password}
              onChange={e => set('imap_password', e.target.value)} />
            <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-dark-500 hover:text-dark-300"
              onClick={() => setShowPw(!showPw)}>
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-dark-500 mt-1">Stored encrypted at rest.</p>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" className="rounded" checked={form.imap_tls}
            onChange={e => set('imap_tls', e.target.checked)} />
          <span className="text-sm text-dark-300">Use TLS</span>
        </label>
      </Section>
    </div>
  );
}

function Section({ title, icon: Icon, children }: {
  title: string; icon: React.ElementType; children: React.ReactNode;
}) {
  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-2 border-b border-dark-700 pb-3 -mt-1">
        <Icon className="w-4 h-4 text-dark-500" />
        <h2 className="text-sm font-semibold text-dark-300 uppercase tracking-widest">{title}</h2>
      </div>
      {children}
    </div>
  );
}
