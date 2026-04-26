import styles from "./Welcome.module.css";

interface Props {
  peerId: string;
}

export function Welcome({ peerId }: Props) {
  return (
    <div className={styles.root}>
      <h1 className={styles.title}>⚡ Accord</h1>
      <p className={styles.subtitle}>
        Peer-to-peer voice, video &amp; text — no servers required.
      </p>
      {peerId && (
        <div className={styles.peerIdBox}>
          <p className={styles.peerIdLabel}>Your Peer ID</p>
          <code className={styles.peerId}>{peerId}</code>
        </div>
      )}
      <div className={styles.tips}>
        <h2>Getting Started</h2>
        <ol>
          <li>Click <strong>↺</strong> in the sidebar to discover peers on your local network via mDNS.</li>
          <li>Share your Peer ID with friends on the internet to connect directly.</li>
          <li>Select a <strong>Text</strong> channel to chat, a <strong>Voice</strong> channel to talk, or a <strong>Video</strong> channel to stream.</li>
        </ol>
      </div>
    </div>
  );
}
