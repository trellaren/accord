import { useEffect, useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import { ServerRole } from "../../lib/tauri";
import styles from "./Modal.module.css";
import memberStyles from "./ServerMembersModal.module.css";

interface Props {
  serverId: string;
  onClose: () => void;
}

export function ServerMembersModal({ serverId, onClose }: Props) {
  const {
    loadServerMembers,
    kickServerMember,
    localPeerId,
    servers,
    invitePeer,
    serverRoles,
    loadRoles,
    fetchMemberRoles,
    assignRole,
    revokeRole,
  } = useAppStore();
  const [members, setMembers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [peerAddress, setPeerAddress] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);

  // Role management state
  const [memberRoles, setMemberRoles] = useState<Record<string, ServerRole[]>>({});
  const [expandedMember, setExpandedMember] = useState<string | null>(null);

  const server = servers.find((s) => s.id === serverId);
  const isOwner = server?.owner_peer_id === localPeerId;
  const roles = serverRoles[serverId] ?? [];

  useEffect(() => {
    loadServerMembers(serverId)
      .then(setMembers)
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));
    loadRoles(serverId).catch(() => {});
  }, [serverId, loadServerMembers, loadRoles]);

  async function handleKick(peerId: string) {
    if (!window.confirm(`Remove peer ${peerId.slice(0, 12)}…?`)) return;
    await kickServerMember(serverId, peerId);
    setMembers((prev) => prev.filter((p) => p !== peerId));
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    const addr = peerAddress.trim();
    if (!addr) return;
    setInviteLoading(true);
    setInviteError(null);
    setInviteSuccess(false);
    try {
      await invitePeer(addr, serverId);
      setInviteSuccess(true);
      setPeerAddress("");
    } catch (err) {
      setInviteError(String(err));
    } finally {
      setInviteLoading(false);
    }
  }

  async function toggleExpand(peerId: string) {
    if (expandedMember === peerId) {
      setExpandedMember(null);
      return;
    }
    setExpandedMember(peerId);
    // Load roles for this member if not yet loaded.
    if (!memberRoles[peerId]) {
      try {
        const roles = await fetchMemberRoles(serverId, peerId);
        setMemberRoles((prev) => ({ ...prev, [peerId]: roles }));
      } catch {
        setMemberRoles((prev) => ({ ...prev, [peerId]: [] }));
      }
    }
  }

  async function handleAssignRole(peerId: string, roleId: string) {
    await assignRole(serverId, peerId, roleId);
    const updated = await fetchMemberRoles(serverId, peerId);
    setMemberRoles((prev) => ({ ...prev, [peerId]: updated }));
  }

  async function handleRevokeRole(peerId: string, roleId: string) {
    await revokeRole(serverId, peerId, roleId);
    setMemberRoles((prev) => ({
      ...prev,
      [peerId]: (prev[peerId] ?? []).filter((r) => r.id !== roleId),
    }));
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>Server Members</h2>
        {loading ? (
          <p className={styles.subtitle}>Loading…</p>
        ) : (
          <ul className={memberStyles.list}>
            {members.map((peerId) => {
              const isExpanded = expandedMember === peerId;
              const assignedRoles = memberRoles[peerId] ?? [];
              const assignedIds = new Set(assignedRoles.map((r) => r.id));

              return (
                <li key={peerId} className={memberStyles.item}>
                  <div className={memberStyles.memberRow}>
                    <span className={memberStyles.avatar}>
                      {peerId.slice(0, 2).toUpperCase()}
                    </span>
                    <span className={memberStyles.peerId} title={peerId}>
                      {peerId === localPeerId ? "You" : peerId.slice(0, 20) + "…"}
                    </span>
                    {peerId === server?.owner_peer_id && (
                      <span className={memberStyles.ownerBadge}>Owner</span>
                    )}
                    {/* Assigned role pills */}
                    {assignedRoles.map((r) => (
                      <span
                        key={r.id}
                        className={memberStyles.rolePill}
                        style={{ background: r.color + "33", color: r.color, borderColor: r.color + "66" }}
                      >
                        {r.name}
                      </span>
                    ))}
                    <div className={memberStyles.memberActions}>
                      {isOwner && (
                        <button
                          className={memberStyles.roleBtn}
                          onClick={() => toggleExpand(peerId)}
                          title="Manage roles"
                        >
                          {isExpanded ? "▲" : "Roles"}
                        </button>
                      )}
                      {isOwner && peerId !== localPeerId && (
                        <button
                          className={memberStyles.kickBtn}
                          onClick={() => handleKick(peerId)}
                          title="Remove from server"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Role assignment panel */}
                  {isExpanded && isOwner && roles.length > 0 && (
                    <div className={memberStyles.rolePanel}>
                      <p className={memberStyles.rolePanelTitle}>Assign Roles</p>
                      <div className={memberStyles.roleChips}>
                        {roles.map((role) => {
                          const assigned = assignedIds.has(role.id);
                          return (
                            <button
                              key={role.id}
                              className={`${memberStyles.roleChip} ${assigned ? memberStyles.roleChipActive : ""}`}
                              style={
                                assigned
                                  ? { background: role.color + "33", borderColor: role.color, color: role.color }
                                  : {}
                              }
                              onClick={() =>
                                assigned
                                  ? handleRevokeRole(peerId, role.id)
                                  : handleAssignRole(peerId, role.id)
                              }
                            >
                              {assigned ? "✓ " : ""}{role.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {isExpanded && isOwner && roles.length === 0 && (
                    <p className={memberStyles.noRoles}>
                      No roles defined. Create roles in Server Settings → Roles.
                    </p>
                  )}
                </li>
              );
            })}
            {members.length === 0 && (
              <p className={styles.subtitle}>No members yet.</p>
            )}
          </ul>
        )}

        {isOwner && (
          <form onSubmit={handleInvite} className={styles.form}>
            <label className={styles.label}>Invite by peer address</label>
            <input
              className={styles.input}
              placeholder="/ip4/192.168.1.5/tcp/4001"
              value={peerAddress}
              onChange={(e) => setPeerAddress(e.target.value)}
              disabled={inviteLoading}
            />
            {inviteError && <p className={styles.error}>{inviteError}</p>}
            {inviteSuccess && (
              <p className={memberStyles.inviteSuccess}>
                Invite sent! They will join automatically once connected.
              </p>
            )}
            <div className={styles.actions}>
              <button
                type="submit"
                className={styles.btnPrimary}
                disabled={inviteLoading || !peerAddress.trim()}
              >
                {inviteLoading ? "Inviting…" : "Invite"}
              </button>
            </div>
          </form>
        )}

        <div className={styles.actions}>
          <button className={styles.btnPrimary} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
