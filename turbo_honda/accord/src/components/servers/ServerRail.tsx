import { useState } from "react";
import clsx from "clsx";
import { useAppStore } from "../../store/useAppStore";
import { CreateServerModal } from "./CreateServerModal";
import { JoinServerModal } from "./JoinServerModal";
import styles from "./ServerRail.module.css";

export function ServerRail() {
  const { servers, activeServerId, selectServer, loadChannels } = useAppStore();
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  function handleSelectServer(id: string) {
    selectServer(id);
    loadChannels(id);
  }

  return (
    <>
      <nav className={styles.rail}>
        {/* Home / direct messages icon */}
        <button
          className={clsx(styles.serverBtn, activeServerId === null && styles.serverBtnActive)}
          onClick={() => {
            selectServer("" as string);
            // Pass null to load channels without a server filter
            loadChannels(null);
          }}
          title="Home"
        >
          ⚡
        </button>

        <div className={styles.divider} />

        {servers.map((s) => (
          <button
            key={s.id}
            className={clsx(
              styles.serverBtn,
              s.id === activeServerId && styles.serverBtnActive,
            )}
            onClick={() => handleSelectServer(s.id)}
            title={s.name}
          >
            {s.name.slice(0, 2).toUpperCase()}
          </button>
        ))}

        <div className={styles.divider} />

        {/* Create server */}
        <button
          className={clsx(styles.serverBtn, styles.serverBtnAdd)}
          onClick={() => setShowCreate(true)}
          title="Create a server"
        >
          +
        </button>

        {/* Join server */}
        <button
          className={clsx(styles.serverBtn, styles.serverBtnAdd)}
          onClick={() => setShowJoin(true)}
          title="Join a server"
        >
          🔗
        </button>
      </nav>

      {showCreate && <CreateServerModal onClose={() => setShowCreate(false)} />}
      {showJoin && <JoinServerModal onClose={() => setShowJoin(false)} />}
    </>
  );
}
