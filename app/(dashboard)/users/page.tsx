'use client';
import { useState } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { formatDate, formatDateTime, getRoleLabel, getRoleColor } from '@/lib/utils';
import { Search, Plus, Shield, UserCog } from 'lucide-react';

import { createUser, toggleUserStatus, updateUser } from '@/app/actions/users';

import { useProfiles } from '@/hooks/use-database';
import { useQueryClient } from '@tanstack/react-query';

export default function UsersPage() {
  const queryClient = useQueryClient();
  const { data: profiles, isLoading, refetch } = useProfiles();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'attendant',
    password: '',
  });
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState({ title: '', message: '' });

  const handleAddUser = async () => {
    setLoading(true);
    const res = await createUser(formData);
    setLoading(false);
    if (res.success) {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      setShowAdd(false);
      setFormData({ name: '', email: '', phone: '', role: 'attendant', password: '' });
      setSuccessMessage({ 
        title: 'User Created', 
        message: 'The new staff member has been added to the system and can now log in.' 
      });
      setShowSuccess(true);
    } else {
      alert('Error: ' + res.error);
    }
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    setLoading(true);
    const res = await updateUser(editingUser.id, formData);
    setLoading(false);
    if (res.success) {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      setEditingUser(null);
      setFormData({ name: '', email: '', phone: '', role: 'attendant', password: '' });
      setSuccessMessage({ 
        title: 'Profile Updated', 
        message: 'The user profile has been successfully updated across the system.' 
      });
      setShowSuccess(true);
    } else {
      alert('Error: ' + res.error);
    }
  };

  const handleToggle = async (id: string, status: boolean) => {
    const res = await toggleUserStatus(id, status);
    if (res.success) {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
    } else {
      alert('Error: ' + res.error);
    }
  };

  const startEdit = (user: any) => {
    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      role: user.role,
      password: '', // Don't edit password here for now
    });
  };

  // Use profiles if available, otherwise fallback to empty array
  const currentUsers = profiles || [];

  const filtered = currentUsers.filter(u => {
    const matchSearch = u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === 'all' || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  return (
    <div>
      <TopBar title="User Management" subtitle="Manage system users and access control" />
      <div className="p-6 space-y-6">

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {(['super_admin', 'manager', 'accountant', 'finance', 'attendant'] as const).map(role => (
            <div key={role} className="stat-card">
              <div className="text-2xl font-bold" style={{ color: '#1d4ed8' }}>
                {currentUsers.filter(u => u.role === role).length}
              </div>
              <div className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>{getRoleLabel(role)}s</div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="stat-card">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted-foreground)' }} />
              <input
                type="text"
                placeholder="Search users..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '36px' }}
              />
            </div>
            <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className="form-select" style={{ width: 'auto' }}>
              <option value="all">All Roles</option>
              <option value="super_admin">Super Admin</option>
              <option value="manager">Manager</option>
              <option value="accountant">Accountant</option>
              <option value="finance">Finance</option>
              <option value="attendant">Attendant</option>
            </select>
            <button onClick={() => setShowAdd(true)} className="btn btn-primary gap-2">
              <Plus size={16} /> Add User
            </button>
          </div>
        </div>

        {/* Users table */}
        <div className="stat-card overflow-hidden">
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Last Login</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(user => (
                  <tr key={user.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                          style={{ background: '#1d4ed8' }}
                        >
                          {user.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <div className="font-medium" style={{ color: 'var(--foreground)' }}>{user.name}</div>
                          <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${getRoleColor(user.role)}`}>{getRoleLabel(user.role)}</span>
                    </td>
                    <td style={{ color: 'var(--muted-foreground)' }}>{user.phone || '—'}</td>
                    <td>
                      <span className={`badge ${user.isActive ? 'status-active' : 'status-cancelled'}`}>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                      {user.lastLogin ? formatDateTime(user.lastLogin) : '—'}
                    </td>
                    <td style={{ color: 'var(--muted-foreground)' }}>{formatDate(user.createdAt)}</td>
                    <td>
                      <div className="flex gap-1">
                        <button 
                          className="btn btn-secondary btn-sm"
                          onClick={() => startEdit(user)}
                        >
                          Edit
                        </button>
                        <button 
                          className="btn btn-secondary btn-sm" 
                          style={{ color: user.isActive ? '#dc2626' : '#16a34a' }}
                          onClick={() => handleToggle(user.id, user.isActive)}
                        >
                          {user.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* RBAC permissions */}
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-4">
            <Shield size={18} style={{ color: '#1d4ed8' }} />
            <h3 className="font-semibold" style={{ color: 'var(--foreground)' }}>Role Permissions Matrix</h3>
          </div>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Permission</th>
                  <th>Super Admin</th>
                  <th>Manager</th>
                  <th>Accountant</th>
                  <th>Attendant</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Start/End Sessions', true, true, false, true],
                  ['View Dashboard', true, true, true, true],
                  ['Manage Drivers', true, true, false, false],
                  ['Manage Wallets', true, true, true, false],
                  ['View Reports', true, true, true, false],
                  ['Manage Pricing', true, false, false, false],
                  ['Manage Users', true, false, false, false],
                  ['Override Debt Block', true, true, false, false],
                  ['Export Data', true, true, true, false],
                  ['View Audit Logs', true, true, false, false],
                ].map(([perm, ...perms]) => (
                  <tr key={perm as string}>
                    <td className="font-medium">{perm as string}</td>
                    {(perms as boolean[]).map((has, i) => (
                      <td key={i} className="text-center">
                        <span style={{ color: has ? '#16a34a' : '#94a3b8', fontSize: '1.1rem' }}>
                          {has ? '✓' : '✗'}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Add/Edit user modal */}
        {(showAdd || editingUser) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
            <div className="stat-card max-w-lg w-full">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-lg" style={{ color: 'var(--foreground)' }}>
                  {editingUser ? 'Edit User' : 'Add New User'}
                </h2>
                <button 
                  onClick={() => {
                    setShowAdd(false);
                    setEditingUser(null);
                    setFormData({ name: '', email: '', phone: '', role: 'attendant', password: '' });
                  }} 
                  className="text-gray-400 hover:text-gray-600 text-xl"
                >
                  &times;
                </button>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">Full Name *</label>
                    <input 
                      className="form-input" 
                      placeholder="Full name" 
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="form-label">Phone *</label>
                    <input 
                      className="form-input" 
                      placeholder="+233 24 000 0000" 
                      value={formData.phone}
                      onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label className="form-label">Email *</label>
                  <input 
                    type="email" 
                    className="form-input" 
                    placeholder="user@spero.com" 
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                <div>
                  <label className="form-label">Role *</label>
                  <select 
                    className="form-select"
                    value={formData.role}
                    onChange={e => setFormData({ ...formData, role: e.target.value })}
                  >
                    <option value="attendant">Attendant</option>
                    <option value="accountant">Accountant</option>
                    <option value="finance">Finance</option>
                    <option value="manager">Manager</option>
                    <option value="super_admin">Super Admin</option>
                  </select>
                </div>
                {!editingUser && (
                  <div>
                    <label className="form-label">Temporary Password *</label>
                    <input 
                      type="password" 
                      className="form-input" 
                      placeholder="Min 8 characters" 
                      value={formData.password}
                      onChange={e => setFormData({ ...formData, password: e.target.value })}
                    />
                  </div>
                )}
                <div className="flex gap-3">
                  <button 
                    onClick={() => {
                      setShowAdd(false);
                      setEditingUser(null);
                      setFormData({ name: '', email: '', phone: '', role: 'attendant', password: '' });
                    }} 
                    className="btn btn-secondary flex-1" 
                    disabled={loading}
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={editingUser ? handleUpdateUser : handleAddUser} 
                    className="btn btn-primary flex-1"
                    disabled={loading || !formData.email || !formData.name}
                  >
                    {loading ? (editingUser ? 'Updating...' : 'Creating...') : (editingUser ? 'Update User' : 'Create User')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Success Modal */}
        {showSuccess && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
            <div className="stat-card max-w-sm w-full text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Shield className="text-green-600" size={32} />
              </div>
              <h2 className="font-bold text-xl mb-2" style={{ color: 'var(--foreground)' }}>{successMessage.title}</h2>
              <p className="text-sm mb-6" style={{ color: 'var(--muted-foreground)' }}>{successMessage.message}</p>
              <button 
                onClick={() => setShowSuccess(false)}
                className="btn btn-primary w-full"
              >
                Continue
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
