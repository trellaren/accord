import { useState } from "react";
import clsx from "clsx";
import { Plus, Link, Zap } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { ServerInfo } from "../../lib/tauri";
import { CreateServerModal } from "./CreateServerModal";
import { JoinServerModal } from "./JoinServerModal";
import { ServerContextMenu } from "./ServerContextMenu";
import { DeleteServerModal } from "./DeleteServerModal";
import { ServerSettingsModal } from "./ServerSettingsModal";
import styles from "./ServerRail.module.css";

interface ContextMenuState {
  serverId: string;
  serverName: string;
  serverAvatarUrl: string;
  isOwner: boolean;
  x: number;
  y: number;
}

export function ServerRail() {
  const {
    servers,
    activeServerId,
    localPeerId,
    selectServer,
    loadChannels,
    leaveExistingServer,
    deleteExistingServer,
  } = useAppStore();
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [settingsTarget, setSettingsTarget] = useState<{
    id: string;
    name: string;
    avatarUrl: string;
  } | null>(null);

  function handleSelectServer(id: string) {
    selectServer(id);
    loadChannels(id);
  }

  function handleContextMenu(
    e: React.MouseEvent,
    serverId: string,
    serverName: string,
    serverAvatarUrl: string,
    isOwner: boolean,
  ) {
    e.preventDefault();
    setContextMenu({ serverId, serverName, serverAvatarUrl, isOwner, x: e.clientX, y: e.clientY });
  }

  function handleDisconnect() {
    selectServer(null);
    loadChannels(null);
  }

  async function handleLeave(serverId: string) {
    await leaveExistingServer(serverId);
  }

  function handleDeleteRequest(serverId: string, serverName: string) {
    setDeleteTarget({ id: serverId, name: serverName });
  }

  function handleSettingsRequest(serverId: string, serverName: string, serverAvatarUrl: string) {
    setSettingsTarget({ id: serverId, name: serverName, avatarUrl: serverAvatarUrl });
  }

  return (
    <>
      <nav className={styles.rail}>
        {/* Home / direct messages icon */}
        <button
          className={clsx(styles.serverBtn, activeServerId === null && styles.serverBtnActive)}
          onClick={() => {
            selectServer(null);
            // Pass null to load channels without a server filter
            loadChannels(null);
          }}
          title="Home"
        >
          <Zap size={20} />
        </button>

        <div className={styles.divider} />

        {servers.map((s) => (
          <ServerAvatarButton
            key={s.id}
            server={s}
            isActive={s.id === activeServerId}
            onSelect={() => handleSelectServer(s.id)}
            onContextMenu={(e) =>
              handleContextMenu(e, s.id, s.name, s.avatar_url, s.owner_peer_id === localPeerId)
            }
          />
        ))}

        <div className={styles.divider} />

        {/* Create server */}
        <button
          className={clsx(styles.serverBtn, styles.serverBtnAdd)}
          onClick={() => setShowCreate(true)}
          title="Create a server"
        >
          <Plus size={20} />
        </button>

        {/* Join server */}
        <button
          className={clsx(styles.serverBtn, styles.serverBtnAdd)}
          onClick={() => setShowJoin(true)}
          title="Join a server"
        >
          <Link size={20} />
        </button>
      </nav>

      {showCreate && <CreateServerModal onClose={() => setShowCreate(false)} />}
      {showJoin && <JoinServerModal onClose={() => setShowJoin(false)} />}

      {contextMenu && (
        <ServerContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          serverId={contextMenu.serverId}
          serverName={contextMenu.serverName}
          isOwner={contextMenu.isOwner}
          onClose={() => setContextMenu(null)}
          onDisconnect={handleDisconnect}
          onLeave={() => handleLeave(contextMenu.serverId)}
          onDelete={() => handleDeleteRequest(contextMenu.serverId, contextMenu.serverName)}
          onSettings={() =>
            handleSettingsRequest(
              contextMenu.serverId,
              contextMenu.serverName,
              contextMenu.serverAvatarUrl,
            )
          }
        />
      )}

      {deleteTarget && (
        <DeleteServerModal
          serverName={deleteTarget.name}
          onConfirm={() => deleteExistingServer(deleteTarget.id)}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      {settingsTarget && (
        <ServerSettingsModal
          serverId={settingsTarget.id}
          serverName={settingsTarget.name}
          serverAvatarUrl={settingsTarget.avatarUrl}
          onClose={() => setSettingsTarget(null)}
        />
      )}
    </>
  );
}

// ── Sub-component ─────────────────────────────────────────────────────────────

interface ServerAvatarButtonProps {
  server: ServerInfo;
  isActive: boolean;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

/** Server button that gracefully falls back to initials when the avatar fails to load. */
function ServerAvatarButton({ server, isActive, onSelect, onContextMenu }: ServerAvatarButtonProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = !!server.avatar_url && !imgFailed;

  return (
    <button
      className={clsx(styles.serverBtn, isActive && styles.serverBtnActive)}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      title={server.name}
    >
      {showImage ? (
        <img
          src={server.avatar_url}
          alt={server.name}
          className={styles.serverAvatar}
          onError={() => setImgFailed(true)}
        />
      ) : (
        server.name.slice(0, 2).toUpperCase()
      )}
    </button>
  );
}
