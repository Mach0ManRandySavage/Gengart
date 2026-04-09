import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { Profile, CreateProfileInput } from '../../types';

interface ProfileModalProps {
  profile?: Profile | null;
  onClose: () => void;
  onSave:  () => void;
}

const EMPTY: CreateProfileInput = {
  name: '', email: '', phone: '',
  ship_first_name: '', ship_last_name: '', ship_address1: '',
  ship_address2: '', ship_city: '', ship_state: '', ship_zip: '', ship_country: 'US',
  billing_same_as_shipping: true,
  bill_first_name: '', bill_last_name: '', bill_address1: '',
  bill_address2: '', bill_city: '', bill_state: '', bill_zip: '', bill_country: 'US',
  card_name: '', card_number: '', card_expiry: '', card_cvv: '',
};

export function ProfileModal({ profile, onClose, onSave }: ProfileModalProps) {
  const [form,   setForm]   = useState<CreateProfileInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  useEffect(() => {
    if (profile) {
      setForm({
        name:  profile.name,
        email: profile.email,
        phone: profile.phone ?? '',
        ship_first_name: profile.ship_first_name,
        ship_last_name:  profile.ship_last_name,
        ship_address1:   profile.ship_address1,
        ship_address2:   profile.ship_address2 ?? '',
        ship_city:       profile.ship_city,
        ship_state:      profile.ship_state,
        ship_zip:        profile.ship_zip,
        ship_country:    profile.ship_country,
        billing_same_as_shipping: profile.billing_same_as_shipping,
        bill_first_name: profile.bill_first_name ?? '',
        bill_last_name:  profile.bill_last_name  ?? '',
        bill_address1:   profile.bill_address1   ?? '',
        bill_address2:   profile.bill_address2   ?? '',
        bill_city:       profile.bill_city       ?? '',
        bill_state:      profile.bill_state      ?? '',
        bill_zip:        profile.bill_zip        ?? '',
        bill_country:    profile.bill_country    ?? 'US',
        card_name:   profile.card_name,
        card_number: profile.card_number,
        card_expiry: profile.card_expiry,
        card_cvv:    profile.card_cvv,
      });
    }
  }, [profile]);

  function set<K extends keyof CreateProfileInput>(k: K, v: CreateProfileInput[K]) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  async function handleSave() {
    if (!form.name || !form.email || !form.ship_first_name || !form.card_number) {
      setError('Please fill in all required fields.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      if (profile) {
        await window.api.updateProfile(profile.id, form);
      } else {
        await window.api.createProfile(form);
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
      <div className="modal w-full max-w-2xl">
        <div className="modal-header">
          <h2 className="text-base font-semibold">{profile ? 'Edit Profile' : 'New Profile'}</h2>
          <button onClick={onClose} className="btn-ghost p-1 rounded-lg"><X className="w-4 h-4" /></button>
        </div>

        <div className="modal-body space-y-5">
          {/* Basic info */}
          <Section title="Basic Info">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Profile Name *"  value={form.name}  onChange={v => set('name', v)} placeholder="e.g. Main Profile" />
              <Field label="Email *"         value={form.email} onChange={v => set('email', v)} placeholder="you@example.com" />
            </div>
            <Field label="Phone" value={form.phone ?? ''} onChange={v => set('phone', v)} placeholder="+1 555 000 0000" />
          </Section>

          {/* Shipping */}
          <Section title="Shipping Address">
            <div className="grid grid-cols-2 gap-3">
              <Field label="First Name *" value={form.ship_first_name} onChange={v => set('ship_first_name', v)} />
              <Field label="Last Name *"  value={form.ship_last_name}  onChange={v => set('ship_last_name', v)} />
            </div>
            <Field label="Address Line 1 *" value={form.ship_address1} onChange={v => set('ship_address1', v)} />
            <Field label="Address Line 2"   value={form.ship_address2 ?? ''} onChange={v => set('ship_address2', v)} />
            <div className="grid grid-cols-3 gap-3">
              <Field label="City *"  value={form.ship_city}  onChange={v => set('ship_city', v)} />
              <Field label="State *" value={form.ship_state} onChange={v => set('ship_state', v)} placeholder="CA" />
              <Field label="ZIP *"   value={form.ship_zip}   onChange={v => set('ship_zip', v)}  placeholder="90210" />
            </div>
          </Section>

          {/* Billing */}
          <Section title="Billing Address">
            <label className="flex items-center gap-2 text-sm text-dark-300 cursor-pointer mb-3">
              <input type="checkbox" className="rounded" checked={form.billing_same_as_shipping}
                onChange={e => set('billing_same_as_shipping', e.target.checked)} />
              Same as shipping address
            </label>

            {!form.billing_same_as_shipping && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="First Name" value={form.bill_first_name ?? ''} onChange={v => set('bill_first_name', v)} />
                  <Field label="Last Name"  value={form.bill_last_name  ?? ''} onChange={v => set('bill_last_name', v)} />
                </div>
                <Field label="Address Line 1" value={form.bill_address1 ?? ''} onChange={v => set('bill_address1', v)} />
                <div className="grid grid-cols-3 gap-3">
                  <Field label="City"  value={form.bill_city  ?? ''} onChange={v => set('bill_city', v)} />
                  <Field label="State" value={form.bill_state ?? ''} onChange={v => set('bill_state', v)} />
                  <Field label="ZIP"   value={form.bill_zip   ?? ''} onChange={v => set('bill_zip', v)} />
                </div>
              </>
            )}
          </Section>

          {/* Payment */}
          <Section title="Payment">
            <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-lg px-3 py-2 mb-3">
              <p className="text-xs text-yellow-400">Card data is encrypted at rest using OS keychain / AES-256.</p>
            </div>
            <Field label="Name on Card *" value={form.card_name}   onChange={v => set('card_name', v)}   placeholder="John Doe" />
            <Field label="Card Number *"  value={form.card_number} onChange={v => set('card_number', v)} placeholder="4111 1111 1111 1111"
              type="password" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Expiry (MM/YY) *" value={form.card_expiry} onChange={v => set('card_expiry', v)} placeholder="09/27" />
              <Field label="CVV *"            value={form.card_cvv}    onChange={v => set('card_cvv', v)}    placeholder="123" type="password" />
            </div>
          </Section>

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : profile ? 'Update Profile' : 'Create Profile'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-dark-500 uppercase tracking-widest mb-3">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, type = 'text',
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" type={type} value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)} />
    </div>
  );
}
