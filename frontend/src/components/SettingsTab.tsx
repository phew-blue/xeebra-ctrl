import { useState } from 'react';
import type { AppConfig, Group } from '@/types';

interface Props {
  config: AppConfig;
  onConfigChange: (updated: AppConfig) => void;
}

interface GroupFormState {
  name: string;
  apiServerIp: string;
  sshUser: string;
  sshPassword: string;
}

const emptyForm = (): GroupFormState => ({
  name: '',
  apiServerIp: '',
  sshUser: 'evs',
  sshPassword: 'evs123',
});

type ModalMode = { type: 'add' } | { type: 'edit'; index: number };

export default function SettingsTab({ config, onConfigChange }: Props) {
  const [modal, setModal] = useState<ModalMode | null>(null);
  const [form, setForm] = useState<GroupFormState>(emptyForm());
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const openAdd = () => {
    setForm(emptyForm());
    setError(null);
    setShowPassword(false);
    setModal({ type: 'add' });
  };

  const openEdit = (idx: number) => {
    const g = config.groups[idx];
    setForm({
      name: g.name,
      apiServerIp: g.apiServerIp,
      sshUser: g.sshUser ?? 'evs',
      sshPassword: g.sshPassword ?? 'evs123',
    });
    setError(null);
    setShowPassword(false);
    setModal({ type: 'edit', index: idx });
  };

  const closeModal = () => {
    setModal(null);
    setError(null);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.apiServerIp.trim()) {
      setError('Name and API Server IP are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let res: Response;
      if (modal?.type === 'add') {
        res = await fetch('/api/settings/groups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name.trim(),
            apiServerIp: form.apiServerIp.trim(),
            sshUser: form.sshUser.trim() || 'evs',
            sshPassword: form.sshPassword || 'evs123',
          } satisfies Group),
        });
      } else if (modal?.type === 'edit') {
        res = await fetch(`/api/settings/groups/${modal.index}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name.trim(),
            apiServerIp: form.apiServerIp.trim(),
            sshUser: form.sshUser.trim() || 'evs',
            sshPassword: form.sshPassword || 'evs123',
          } satisfies Group),
        });
      } else {
        return;
      }
      if (!res.ok) {
        const body = await res.text();
        setError(body || 'Failed to save');
        return;
      }
      const updated: AppConfig = await res.json();
      onConfigChange(updated);
      closeModal();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (idx: number) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/settings/groups/${idx}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.text();
        setError(body || 'Failed to delete');
        return;
      }
      const updated: AppConfig = await res.json();
      onConfigChange(updated);
      setDeleteConfirm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-base font-semibold text-evs-contrast mb-1">Groups</h2>
      <p className="text-xs text-evs-gray-lighter mb-4">
        Each group represents a Xeebra API server (cluster). The app connects to each group's <code className="text-evs-primary">apiServerIp</code> to list and manage Xeebra servers.
      </p>

      {/* Group list */}
      <div className="border border-evs-gray rounded-xs overflow-hidden mb-4">
        {config.groups.length === 0 ? (
          <p className="px-4 py-3 text-sm text-evs-gray-lighter">No groups configured. Add one below.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-evs-gray text-evs-gray-lighter text-xs uppercase tracking-wider">
                <th className="px-4 py-2 text-left font-medium">Name</th>
                <th className="px-4 py-2 text-left font-medium">API Server IP</th>
                <th className="px-4 py-2 text-left font-medium">SSH User</th>
                <th className="px-4 py-2 w-20" />
              </tr>
            </thead>
            <tbody>
              {config.groups.map((g, idx) => (
                <tr key={idx} className="border-t border-evs-gray hover:bg-evs-gray/30 transition-colors">
                  <td className="px-4 py-2.5 text-evs-contrast font-medium">{g.name}</td>
                  <td className="px-4 py-2.5 text-evs-gray-lighter font-mono text-xs">{g.apiServerIp}</td>
                  <td className="px-4 py-2.5 text-evs-gray-lighter">{g.sshUser ?? 'evs'}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1 justify-end">
                      {deleteConfirm === idx ? (
                        <>
                          <span className="text-xs text-evs-danger mr-1">Delete?</span>
                          <button
                            onClick={() => handleDelete(idx)}
                            disabled={saving}
                            className="px-2 py-1 text-xs bg-evs-danger text-white rounded-xs hover:bg-evs-danger/80 disabled:opacity-50"
                          >
                            Yes
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="px-2 py-1 text-xs text-evs-gray-lighter hover:text-evs-contrast rounded-xs"
                          >
                            No
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => openEdit(idx)}
                            className="px-2 py-1 text-xs text-evs-gray-lighter hover:text-evs-contrast rounded-xs hover:bg-evs-gray transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(idx)}
                            className="px-2 py-1 text-xs text-evs-danger/70 hover:text-evs-danger rounded-xs hover:bg-evs-gray transition-colors"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <button
        onClick={openAdd}
        className="px-3 py-1.5 text-sm bg-evs-primary text-white rounded-xs hover:bg-evs-primary/80 transition-colors"
      >
        + Add Group
      </button>

      {/* Global error */}
      {error && !modal && (
        <p className="mt-3 text-xs text-evs-danger">{error}</p>
      )}

      {/* Add/Edit modal */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="bg-evs-gray-dark border border-evs-gray rounded-xs shadow-2xl w-full max-w-md mx-4">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-evs-gray">
              <h3 className="text-sm font-semibold text-evs-contrast">
                {modal.type === 'add' ? 'Add Group' : 'Edit Group'}
              </h3>
              <button
                onClick={closeModal}
                className="text-evs-gray-lighter hover:text-evs-contrast text-lg leading-none"
              >
                ×
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4 flex flex-col gap-3">
              {error && (
                <p className="text-xs text-evs-danger bg-evs-danger/10 px-3 py-2 rounded-xs">{error}</p>
              )}

              <label className="flex flex-col gap-1">
                <span className="text-xs text-evs-gray-lighter uppercase tracking-wider">Name *</span>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Studio A"
                  className="bg-evs-gray border border-evs-gray rounded-xs px-3 py-2 text-sm text-evs-contrast placeholder-evs-gray-lighter outline-none focus:border-evs-primary"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs text-evs-gray-lighter uppercase tracking-wider">API Server IP *</span>
                <input
                  type="text"
                  value={form.apiServerIp}
                  onChange={e => setForm(f => ({ ...f, apiServerIp: e.target.value }))}
                  placeholder="192.168.1.20"
                  className="bg-evs-gray border border-evs-gray rounded-xs px-3 py-2 text-sm text-evs-contrast placeholder-evs-gray-lighter font-mono outline-none focus:border-evs-primary"
                />
                <span className="text-xs text-evs-gray-lighter">IP address of the Xeebra cluster API server</span>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs text-evs-gray-lighter uppercase tracking-wider">SSH User</span>
                <input
                  type="text"
                  value={form.sshUser}
                  onChange={e => setForm(f => ({ ...f, sshUser: e.target.value }))}
                  placeholder="evs"
                  className="bg-evs-gray border border-evs-gray rounded-xs px-3 py-2 text-sm text-evs-contrast placeholder-evs-gray-lighter outline-none focus:border-evs-primary"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs text-evs-gray-lighter uppercase tracking-wider">SSH Password</span>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.sshPassword}
                    onChange={e => setForm(f => ({ ...f, sshPassword: e.target.value }))}
                    placeholder="evs123"
                    className="w-full bg-evs-gray border border-evs-gray rounded-xs px-3 py-2 pr-16 text-sm text-evs-contrast placeholder-evs-gray-lighter outline-none focus:border-evs-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(s => !s)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-evs-gray-lighter hover:text-evs-contrast"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <span className="text-xs text-evs-gray-lighter">Used for SSH shutdown/restart commands</span>
              </label>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-evs-gray">
              <button
                onClick={closeModal}
                className="px-4 py-1.5 text-sm text-evs-gray-lighter hover:text-evs-contrast rounded-xs transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-1.5 text-sm bg-evs-primary text-white rounded-xs hover:bg-evs-primary/80 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
