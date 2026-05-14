import { useState, useEffect, useCallback } from "react";
import {
  fetchAdminUsers,
  fetchAdminRoles,
  updateUserRole,
  updateUserStatus,
  createUser,
  deleteUser,
  inviteUser,
  fetchInvitations,
  type AdminUser,
  type AdminRole,
} from "../api/client";
import { getUser } from "../api/auth";
import { timeAgo } from "../utils/format";

const ROLE_COLORS: Record<string, string> = {
  admin: "#ef4444",
  bd_manager: "#f59e0b",
  capture_lead: "#3b82f6",
  analyst: "#8b5cf6",
  viewer: "#6b7280",
};

export default function UserManagement() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("viewer");
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [inviting, setInviting] = useState(false);
  const [invitations, setInvitations] = useState<Array<{ id: string; email: string; role: string; created_at: string; expires_at: string; accepted_at: string | null }>>([]);
  const currentUser = getUser();

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      const [usersRes, rolesRes] = await Promise.all([
        fetchAdminUsers(),
        fetchAdminRoles(),
      ]);
      if (usersRes.success && usersRes.data) {
        setUsers(usersRes.data.users);
      }
      if (rolesRes.success && rolesRes.data) {
        setRoles(rolesRes.data.roles);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
    fetchInvitations().then((res) => {
      if (res.success && res.data) setInvitations(res.data.invitations);
    }).catch(() => {});
  }, [loadUsers]);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const res = await inviteUser(inviteEmail.trim(), inviteRole);
      if (res.success && res.data) {
        setActionMsg(`Invitation sent to ${inviteEmail} (${inviteRole}). Link: ${res.data.invite_url}`);
        setInviteEmail("");
        setShowInvite(false);
        fetchInvitations().then((r) => { if (r.success && r.data) setInvitations(r.data.invitations); }).catch(() => {});
      }
    } catch (err) {
      setActionMsg(`Error: ${err instanceof Error ? err.message : "Failed to invite"}`);
    }
    setInviting(false);
    setTimeout(() => setActionMsg(null), 10000);
  };

  const handleRoleChange = async (userId: string, role: string) => {
    try {
      const res = await updateUserRole(userId, role);
      if (res.success) {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, role } : u))
        );
        setActionMsg(`Role updated to ${role}`);
        setTimeout(() => setActionMsg(null), 3000);
      }
    } catch (err) {
      setActionMsg(`Error: ${err instanceof Error ? err.message : "Failed"}`);
      setTimeout(() => setActionMsg(null), 5000);
    }
  };

  const handleToggleActive = async (userId: string, currentActive: boolean) => {
    try {
      const res = await updateUserStatus(userId, !currentActive);
      if (res.success) {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, is_active: !currentActive } : u))
        );
        setActionMsg(!currentActive ? "User activated" : "User deactivated");
        setTimeout(() => setActionMsg(null), 3000);
      }
    } catch (err) {
      setActionMsg(`Error: ${err instanceof Error ? err.message : "Failed"}`);
      setTimeout(() => setActionMsg(null), 5000);
    }
  };

  const handleDelete = async (userId: string, email: string) => {
    if (!window.confirm(`Permanently delete ${email}? This cannot be undone.`)) return;
    try {
      const res = await deleteUser(userId);
      if (res.success) {
        setUsers((prev) => prev.filter((u) => u.id !== userId));
        setActionMsg("User deleted");
        setTimeout(() => setActionMsg(null), 3000);
      }
    } catch (err) {
      setActionMsg(`Error: ${err instanceof Error ? err.message : "Failed"}`);
      setTimeout(() => setActionMsg(null), 5000);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !newPassword || !newName) return;
    setCreating(true);
    try {
      const res = await createUser(newEmail, newPassword, newName, newRole);
      if (res.success && res.data) {
        setUsers((prev) => [
          { ...res.data!, is_active: true, avatar_url: null, last_login_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
          ...prev,
        ]);
        setShowCreate(false);
        setNewEmail("");
        setNewName("");
        setNewPassword("");
        setNewRole("viewer");
        setActionMsg("User created");
        setTimeout(() => setActionMsg(null), 3000);
      }
    } catch (err) {
      setActionMsg(`Error: ${err instanceof Error ? err.message : "Failed"}`);
      setTimeout(() => setActionMsg(null), 5000);
    } finally {
      setCreating(false);
    }
  };

  const cardStyle: React.CSSProperties = {
    background: "#1e293b",
    borderRadius: 8,
    border: "1px solid #334155",
    padding: 20,
  };

  const btnStyle: React.CSSProperties = {
    padding: "6px 14px",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 500,
  };

  if (loading) {
    return (
      <div style={{ padding: 32, color: "#94a3b8" }}>Loading users...</div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 32 }}>
        <div style={{ ...cardStyle, borderColor: "#ef4444" }}>
          <h2 style={{ color: "#ef4444", margin: "0 0 8px" }}>Access Denied</h2>
          <p style={{ color: "#94a3b8", margin: 0 }}>
            {error.includes("403") || error.includes("Insufficient")
              ? "You need admin privileges to manage users."
              : error}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: "0 0 4px", fontSize: 22, color: "#f1f5f9" }}>
            User Management
          </h1>
          <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>
            {users.length} user{users.length !== 1 ? "s" : ""} &middot;{" "}
            {users.filter((u) => u.is_active).length} active
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setShowInvite(!showInvite)}
            style={{ ...btnStyle, background: showInvite ? "#475569" : "#22c55e", color: "#fff" }}
          >
            {showInvite ? "Cancel Invite" : "Invite User"}
          </button>
          <button
            onClick={() => setShowCreate(!showCreate)}
            style={{ ...btnStyle, background: showCreate ? "#475569" : "#3b82f6", color: "#fff" }}
          >
            {showCreate ? "Cancel" : "+ New User"}
          </button>
        </div>
      </div>

      {/* Invite user form */}
      {showInvite && (
        <div style={{ ...cardStyle, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 250px" }}>
            <label style={{ display: "block", color: "#94a3b8", fontSize: 12, marginBottom: 4 }}>Email Address</label>
            <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="user@company.com" style={{ width: "100%", padding: "8px 12px", background: "#0f172a", border: "1px solid #475569", borderRadius: 6, color: "#f1f5f9", fontSize: 14 }} />
          </div>
          <div style={{ flex: "0 0 160px" }}>
            <label style={{ display: "block", color: "#94a3b8", fontSize: 12, marginBottom: 4 }}>Role</label>
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} style={{ width: "100%", padding: "8px 12px", background: "#0f172a", border: "1px solid #475569", borderRadius: 6, color: "#f1f5f9", fontSize: 14 }}>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>
          <button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()} style={{ ...btnStyle, background: inviting ? "#475569" : "#22c55e", color: "#fff", padding: "8px 20px" }}>
            {inviting ? "Sending..." : "Send Invitation"}
          </button>
        </div>
      )}

      {/* Action message */}
      {actionMsg && (
        <div
          style={{
            padding: "10px 16px",
            borderRadius: 6,
            background: actionMsg.startsWith("Error") ? "#7f1d1d" : "#14532d",
            color: actionMsg.startsWith("Error") ? "#fca5a5" : "#86efac",
            fontSize: 14,
          }}
        >
          {actionMsg}
        </div>
      )}

      {/* Create user form */}
      {showCreate && (
        <form onSubmit={handleCreate} style={{ ...cardStyle, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 200px" }}>
            <label style={{ display: "block", color: "#94a3b8", fontSize: 12, marginBottom: 4 }}>Display Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Jane Smith"
              required
              style={{ width: "100%", padding: "8px 12px", background: "#0f172a", border: "1px solid #475569", borderRadius: 6, color: "#f1f5f9", fontSize: 14 }}
            />
          </div>
          <div style={{ flex: "1 1 200px" }}>
            <label style={{ display: "block", color: "#94a3b8", fontSize: 12, marginBottom: 4 }}>Email</label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="jane@company.com"
              required
              style={{ width: "100%", padding: "8px 12px", background: "#0f172a", border: "1px solid #475569", borderRadius: 6, color: "#f1f5f9", fontSize: 14 }}
            />
          </div>
          <div style={{ flex: "1 1 160px" }}>
            <label style={{ display: "block", color: "#94a3b8", fontSize: 12, marginBottom: 4 }}>Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min 6 chars"
              required
              minLength={6}
              style={{ width: "100%", padding: "8px 12px", background: "#0f172a", border: "1px solid #475569", borderRadius: 6, color: "#f1f5f9", fontSize: 14 }}
            />
          </div>
          <div style={{ flex: "0 0 160px" }}>
            <label style={{ display: "block", color: "#94a3b8", fontSize: 12, marginBottom: 4 }}>Role</label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", background: "#0f172a", border: "1px solid #475569", borderRadius: 6, color: "#f1f5f9", fontSize: 14 }}
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={creating}
            style={{ ...btnStyle, background: "#22c55e", color: "#fff", padding: "8px 20px" }}
          >
            {creating ? "Creating..." : "Create User"}
          </button>
        </form>
      )}

      {/* Role legend */}
      <div style={{ ...cardStyle, padding: 16 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 14, color: "#94a3b8" }}>Roles &amp; Permissions</h3>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {roles.map((r) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: ROLE_COLORS[r.id] ?? "#6b7280",
                }}
              />
              <span style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>{r.label}</span>
              <span style={{ color: "#64748b", fontSize: 12 }}>— {r.description}</span>
            </div>
          ))}
        </div>
      </div>

      {/* User table */}
      <div style={cardStyle}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #334155" }}>
              {["User", "Email", "Role", "Status", "Last Login", "Actions"].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    padding: "10px 12px",
                    color: "#64748b",
                    fontSize: 12,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isSelf = currentUser?.id === u.id;
              return (
                <tr
                  key={u.id}
                  style={{
                    borderBottom: "1px solid #1e293b",
                    opacity: u.is_active ? 1 : 0.5,
                  }}
                >
                  <td style={{ padding: "12px", color: "#f1f5f9", fontSize: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: "50%",
                          background: ROLE_COLORS[u.role] ?? "#6b7280",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#fff",
                          fontSize: 13,
                          fontWeight: 600,
                        }}
                      >
                        {(u.display_name ?? "?").charAt(0).toUpperCase()}
                      </div>
                      <span>
                        {u.display_name}
                        {isSelf && (
                          <span style={{ color: "#64748b", fontSize: 11, marginLeft: 6 }}>(you)</span>
                        )}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: "12px", color: "#94a3b8", fontSize: 13 }}>
                    {u.email}
                  </td>
                  <td style={{ padding: "12px" }}>
                    <select
                      value={u.role}
                      onChange={(e) => handleRoleChange(u.id, e.target.value)}
                      disabled={isSelf}
                      style={{
                        padding: "4px 8px",
                        background: "#0f172a",
                        border: `1px solid ${ROLE_COLORS[u.role] ?? "#475569"}`,
                        borderRadius: 4,
                        color: ROLE_COLORS[u.role] ?? "#94a3b8",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: isSelf ? "not-allowed" : "pointer",
                      }}
                    >
                      <option value="admin">Admin</option>
                      <option value="bd_manager">BD Manager</option>
                      <option value="capture_lead">Capture Lead</option>
                      <option value="analyst">Analyst</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </td>
                  <td style={{ padding: "12px" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "3px 10px",
                        borderRadius: 12,
                        fontSize: 12,
                        fontWeight: 600,
                        background: u.is_active ? "#14532d" : "#7f1d1d",
                        color: u.is_active ? "#86efac" : "#fca5a5",
                      }}
                    >
                      {u.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td style={{ padding: "12px", color: "#64748b", fontSize: 13 }}>
                    {u.last_login_at ? timeAgo(u.last_login_at) : "Never"}
                  </td>
                  <td style={{ padding: "12px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      {!isSelf && (
                        <>
                          <button
                            onClick={() => handleToggleActive(u.id, u.is_active)}
                            style={{
                              ...btnStyle,
                              background: u.is_active ? "#7f1d1d" : "#14532d",
                              color: u.is_active ? "#fca5a5" : "#86efac",
                              padding: "4px 10px",
                              fontSize: 12,
                            }}
                          >
                            {u.is_active ? "Deactivate" : "Activate"}
                          </button>
                          <button
                            onClick={() => handleDelete(u.id, u.email)}
                            style={{
                              ...btnStyle,
                              background: "transparent",
                              border: "1px solid #475569",
                              color: "#ef4444",
                              padding: "4px 10px",
                              fontSize: 12,
                            }}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <div style={{ ...cardStyle }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 16, color: "#f1f5f9" }}>
            Pending Invitations ({invitations.filter((i) => !i.accepted_at).length})
          </h3>
          <div style={{ display: "grid", gap: 8 }}>
            {invitations.map((inv) => (
              <div key={inv.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#0f172a", borderRadius: 6, border: "1px solid #334155" }}>
                <div>
                  <span style={{ color: "#f1f5f9", fontSize: 13, fontWeight: 600 }}>{inv.email}</span>
                  <span style={{ marginLeft: 8, fontSize: 11, padding: "1px 6px", borderRadius: 4, background: `${ROLE_COLORS[inv.role] ?? "#6b7280"}20`, color: ROLE_COLORS[inv.role] ?? "#6b7280" }}>{inv.role}</span>
                </div>
                <div style={{ fontSize: 11, color: "#64748b" }}>
                  {inv.accepted_at ? <span style={{ color: "#22c55e" }}>Accepted</span> : `Sent ${timeAgo(inv.created_at)}`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
