import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, CreditCard, MapPin, User } from 'lucide-react';
import type { Profile } from '../../types';
import { ProfileModal } from '../components/ProfileModal';

export function Profiles() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editProfile, setEditProfile] = useState<Profile | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    const p = await window.api.getProfiles();
    setProfiles(p);
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this profile?')) return;
    await window.api.deleteProfile(id);
    load();
  }

  return (
    <div className="p-6 space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Profiles</h1>
          <p className="text-sm text-dark-500 mt-0.5">Shipping + payment profiles</p>
        </div>
        <button className="btn-primary" onClick={() => { setEditProfile(null); setShowModal(true); }}>
          <Plus className="w-4 h-4" />
          New Profile
        </button>
      </div>

      {profiles.length === 0 ? (
        <div className="text-center py-16 text-dark-500">
          <User className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No profiles yet. Create one to start checking out.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {profiles.map(p => (
            <div key={p.id} className="card flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-accent-600/20 rounded-lg flex items-center justify-center">
                    <User className="w-4 h-4 text-accent-400" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{p.name}</div>
                    <div className="text-xs text-dark-500">{p.email}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs text-dark-500 mb-1">
                      <MapPin className="w-3 h-3" />
                      Shipping
                    </div>
                    <div className="text-xs text-dark-300">
                      {p.ship_first_name} {p.ship_last_name}<br />
                      {p.ship_address1}{p.ship_address2 ? `, ${p.ship_address2}` : ''}<br />
                      {p.ship_city}, {p.ship_state} {p.ship_zip}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5 text-xs text-dark-500 mb-1">
                      <CreditCard className="w-3 h-3" />
                      Payment
                    </div>
                    <div className="text-xs text-dark-300">
                      {p.card_name}<br />
                      •••• •••• •••• {p.card_number.slice(-4)}<br />
                      Exp: {p.card_expiry}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                <button className="btn-ghost p-1.5 rounded" onClick={() => { setEditProfile(p); setShowModal(true); }}>
                  <Edit className="w-4 h-4" />
                </button>
                <button className="btn-ghost p-1.5 rounded text-red-400" onClick={() => handleDelete(p.id)}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <ProfileModal profile={editProfile} onClose={() => setShowModal(false)} onSave={load} />
      )}
    </div>
  );
}
