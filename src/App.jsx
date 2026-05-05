import { useState, useEffect, useCallback } from "react";

const CONTRACT_ADDRESS = "0x36C1eae3a088A580354B65F8df5558ECEAd5Ea4C";

const ABI = [
  {
    inputs: [{ internalType: "string", name: "message", type: "string" }],
    name: "sign",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "getEntries",
    outputs: [
      {
        components: [
          { internalType: "address", name: "author", type: "address" },
          { internalType: "string", name: "message", type: "string" },
          { internalType: "uint256", name: "timestamp", type: "uint256" },
        ],
        internalType: "struct Guestbook.Entry[]",
        name: "",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getEntryCount",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "author", type: "address" },
      { indexed: false, internalType: "string", name: "message", type: "string" },
      { indexed: false, internalType: "uint256", name: "timestamp", type: "uint256" },
    ],
    name: "MessageSigned",
    type: "event",
  },
];

const shortAddr = (addr) =>
  addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "";

const timeAgo = (timestamp) => {
  const diff = Math.floor(Date.now() / 1000) - Number(timestamp);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

const avatarColor = (addr) => {
  const colors = [
    "#E76F51","#2A9D8F","#E9C46A","#6A4C93",
    "#1982C4","#8AC926","#FF595E","#F4A261","#6D6875","#264653",
  ];
  if (!addr) return colors[0];
  return colors[parseInt(addr.slice(2, 4), 16) % colors.length];
};

export default function App() {
  const [account, setAccount] = useState(null);
  const [entries, setEntries] = useState([]);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState(null);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [ethersLib, setEthersLib] = useState(null);

  useEffect(() => {
    if (window.ethers) { setEthersLib(window.ethers); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/ethers/6.7.0/ethers.umd.min.js";
    s.onload = () => setEthersLib(window.ethers);
    document.head.appendChild(s);
  }, []);

  const getContract = useCallback(async (withSigner = false) => {
    if (!ethersLib || !window.ethereum) return null;
    const provider = new ethersLib.BrowserProvider(window.ethereum);
    if (withSigner) {
      const signer = await provider.getSigner();
      return new ethersLib.Contract(CONTRACT_ADDRESS, ABI, signer);
    }
    return new ethersLib.Contract(CONTRACT_ADDRESS, ABI, provider);
  }, [ethersLib]);

  const fetchEntries = useCallback(async () => {
    if (!ethersLib || !window.ethereum) return;
    setLoadingEntries(true);
    try {
      const contract = await getContract(false);
      if (!contract) return;
      const raw = await contract.getEntries();
      setEntries([...raw].reverse().map((e) => ({
        author: e.author,
        message: e.message,
        timestamp: e.timestamp,
      })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingEntries(false);
    }
  }, [ethersLib, getContract]);

  useEffect(() => { if (ethersLib) fetchEntries(); }, [ethersLib, fetchEntries]);

  useEffect(() => {
    if (!window.ethereum) return;
    window.ethereum.request({ method: "eth_accounts" }).then((accounts) => {
      if (accounts.length) setAccount(accounts[0]);
    });
    const handler = (accounts) => setAccount(accounts[0] || null);
    window.ethereum.on("accountsChanged", handler);
    return () => window.ethereum.removeListener("accountsChanged", handler);
  }, []);

  const connectWallet = async () => {
    if (!window.ethereum) {
      setStatus({ type: "error", text: "MetaMask not found. Please install it." });
      return;
    }
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      setAccount(accounts[0]);
      setStatus(null);
    } catch {
      setStatus({ type: "error", text: "Connection rejected." });
    }
  };

  const signGuestbook = async () => {
    if (!message.trim() || !account) return;
    setStatus({ type: "loading", text: "Confirm in MetaMask…" });
    try {
      const contract = await getContract(true);
      const tx = await contract.sign(message.trim());
      setStatus({ type: "loading", text: "Waiting for block confirmation…" });
      await tx.wait();
      setMessage("");
      setStatus({ type: "success", text: "Signed! Your message is now on-chain forever." });
      await fetchEntries();
      setTimeout(() => setStatus(null), 5000);
    } catch (e) {
      setStatus({ type: "error", text: e?.reason || e?.message || "Transaction failed." });
    }
  };

  const charCount = message.length;
  const overLimit = charCount > 280;

  return (
    <div className="root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0a0a0a; }

        .root {
          min-height: 100vh;
          background: #0a0a0a;
          color: #ede9df;
          font-family: 'DM Mono', monospace;
        }

        /* ── NAV ── */
        .nav {
          max-width: 720px;
          margin: 0 auto;
          padding: 1.5rem 1.5rem 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .nav-logo {
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #444;
        }
        .nav-badge {
          display: flex; align-items: center; gap: 7px;
          padding: 5px 12px;
          background: #141414;
          border: 1px solid #222;
          border-radius: 99px;
          font-size: 11px;
          color: #666;
        }
        .nav-badge .dot {
          width: 6px; height: 6px; border-radius: 50%; background: #4ade80;
        }
        .connect-btn {
          padding: 7px 16px;
          background: transparent;
          border: 1px solid #2a2a2a;
          border-radius: 6px;
          color: #888;
          font-family: 'DM Mono', monospace;
          font-size: 11px;
          letter-spacing: 0.06em;
          cursor: pointer;
          transition: border-color .2s, color .2s;
        }
        .connect-btn:hover { border-color: #555; color: #ccc; }

        /* ── HERO ── */
        .hero {
          max-width: 720px;
          margin: 0 auto;
          padding: 4rem 1.5rem 2.5rem;
          border-bottom: 1px solid #181818;
        }
        .hero h1 {
          font-family: 'Instrument Serif', serif;
          font-style: italic;
          font-weight: 400;
          font-size: clamp(3rem, 8vw, 5.5rem);
          line-height: 1.0;
          letter-spacing: -0.02em;
          color: #ede9df;
        }
        .hero h1 span { color: #333; }
        .hero-sub {
          margin-top: 1rem;
          font-size: 11px;
          color: #3a3a3a;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .hero-sub a {
          color: #555;
          text-decoration: none;
        }
        .hero-sub a:hover { color: #888; }

        /* ── COMPOSE ── */
        .main { max-width: 720px; margin: 0 auto; padding: 2.5rem 1.5rem 5rem; }

        .compose-box {
          background: #111;
          border: 1px solid #1e1e1e;
          border-radius: 10px;
          padding: 1.25rem 1.5rem;
          margin-bottom: 0.75rem;
        }
        .compose-label {
          font-size: 10px;
          color: #3a3a3a;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          margin-bottom: 0.9rem;
        }
        textarea {
          width: 100%;
          background: transparent;
          border: none;
          outline: none;
          color: #ede9df;
          font-family: 'Instrument Serif', serif;
          font-style: italic;
          font-size: 1.15rem;
          line-height: 1.7;
          resize: none;
          min-height: 90px;
        }
        textarea::placeholder { color: #262626; }
        .compose-footer {
          display: flex; align-items: center; justify-content: space-between;
          padding-top: 0.9rem;
          border-top: 1px solid #1a1a1a;
          margin-top: 0.5rem;
        }
        .char-count { font-size: 11px; color: #333; }
        .char-count.over { color: #f87171; }
        .sign-btn {
          padding: 9px 22px;
          background: #ede9df;
          color: #0a0a0a;
          border: none;
          border-radius: 5px;
          font-family: 'DM Mono', monospace;
          font-size: 12px;
          font-weight: 500;
          letter-spacing: 0.06em;
          cursor: pointer;
          transition: opacity .15s, transform .1s;
        }
        .sign-btn:hover:not(:disabled) { opacity: 0.85; }
        .sign-btn:active:not(:disabled) { transform: scale(0.97); }
        .sign-btn:disabled { opacity: 0.25; cursor: not-allowed; }

        /* ── STATUS ── */
        .status {
          padding: 10px 14px;
          border-radius: 7px;
          font-size: 12px;
          letter-spacing: 0.03em;
          display: flex; align-items: center; gap: 9px;
          margin-bottom: 0.75rem;
        }
        .status.loading { background: #141414; color: #666; border: 1px solid #222; }
        .status.success { background: #0c1f14; color: #4ade80; border: 1px solid #193d25; }
        .status.error   { background: #1f0c0c; color: #f87171; border: 1px solid #3d1919; }

        /* ── NO WALLET ── */
        .no-wallet-note {
          margin-bottom: 1rem;
          padding: 12px 16px;
          background: #111;
          border: 1px solid #1e1e1e;
          border-radius: 8px;
          font-size: 12px;
          color: #444;
          display: flex; align-items: center; gap: 10px;
        }
        .no-wallet-note a { color: #666; }

        /* ── ENTRIES ── */
        .entries-header {
          display: flex; align-items: baseline; justify-content: space-between;
          padding: 2.5rem 0 1rem;
          border-bottom: 1px solid #141414;
        }
        .entries-title { font-size: 10px; color: #333; letter-spacing: 0.12em; text-transform: uppercase; }
        .entries-count { font-size: 10px; color: #2a2a2a; }

        .entry {
          display: grid;
          grid-template-columns: 38px 1fr;
          gap: 14px;
          padding: 1.4rem 0;
          border-bottom: 1px solid #141414;
          animation: fadeUp .35s ease both;
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .avatar {
          width: 38px; height: 38px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 10px; font-weight: 500; color: #0a0a0a;
          flex-shrink: 0; margin-top: 3px;
          letter-spacing: 0.04em;
        }

        .entry-meta {
          display: flex; align-items: center; gap: 10px; margin-bottom: 5px;
        }
        .entry-addr { font-size: 11px; color: #444; letter-spacing: 0.04em; }
        .entry-time { font-size: 10px; color: #2a2a2a; }

        .entry-msg {
          font-family: 'Instrument Serif', serif;
          font-style: italic;
          font-size: 1.05rem;
          color: #b0aca3;
          line-height: 1.7;
          word-break: break-word;
        }

        .empty {
          padding: 4rem 0; text-align: center;
          font-size: 12px; color: #2a2a2a; letter-spacing: 0.06em;
        }

        .loader { display: flex; gap: 5px; justify-content: center; padding: 3rem 0; }
        .loader span {
          width: 5px; height: 5px; border-radius: 50%; background: #2a2a2a;
          animation: pulse 1.2s ease-in-out infinite;
        }
        .loader span:nth-child(2) { animation-delay: 0.2s; }
        .loader span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes pulse {
          0%,80%,100% { opacity: .2; transform: scale(.8); }
          40% { opacity: 1; transform: scale(1); }
        }

        .etherscan-link {
          font-size: 10px; color: #2a2a2a; letter-spacing: 0.06em;
          text-decoration: none; display: inline-flex; align-items: center; gap: 4px;
        }
        .etherscan-link:hover { color: #555; }
      `}</style>

      {/* NAV */}
      <nav className="nav">
        <span className="nav-logo">Guestbook</span>
        {account ? (
          <div className="nav-badge">
            <span className="dot" />
            {shortAddr(account)}
          </div>
        ) : (
          <button className="connect-btn" onClick={connectWallet}>
            Connect Wallet
          </button>
        )}
      </nav>

      {/* HERO */}
      <header className="hero">
        <h1>
          Sign the<br />
          <span>chain.</span>
        </h1>
        <p className="hero-sub">
          Permanent messages on Sepolia ·{" "}
          <a
            href={`https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}`}
            target="_blank"
            rel="noreferrer"
          >
            View contract ↗
          </a>
        </p>
      </header>

      {/* MAIN */}
      <main className="main">

        {status && (
          <div className={`status ${status.type}`}>
            {status.type === "loading" && "⏳"}
            {status.type === "success" && "✓"}
            {status.type === "error" && "✗"}
            {status.text}
          </div>
        )}

        {!window.ethereum && (
          <div className="no-wallet-note">
            ⚠ &nbsp;
            <span>
              No wallet detected.{" "}
              <a href="https://metamask.io" target="_blank" rel="noreferrer">
                Install MetaMask
              </a>{" "}
              to sign the guestbook. You can still read all entries below.
            </span>
          </div>
        )}

        <div className="compose-box">
          <p className="compose-label">Leave your mark</p>
          <textarea
            placeholder="Write something permanent…"
            value={message}
            maxLength={300}
            rows={3}
            onChange={(e) => setMessage(e.target.value)}
            disabled={!account}
          />
          <div className="compose-footer">
            <span className={`char-count ${overLimit ? "over" : ""}`}>
              {charCount}/280
            </span>
            <button
              className="sign-btn"
              onClick={signGuestbook}
              disabled={
                !message.trim() ||
                overLimit ||
                !account ||
                status?.type === "loading"
              }
            >
              {status?.type === "loading" ? "Signing…" : "Sign →"}
            </button>
          </div>
        </div>

        {!account && window.ethereum && (
          <p style={{ fontSize: "11px", color: "#333", marginBottom: "1rem", textAlign: "right" }}>
            Connect your wallet above to sign
          </p>
        )}

        {/* ENTRIES */}
        <div className="entries-header">
          <span className="entries-title">All entries</span>
          <span className="entries-count">{entries.length} messages on-chain</span>
        </div>

        {loadingEntries ? (
          <div className="loader"><span /><span /><span /></div>
        ) : entries.length === 0 ? (
          <div className="empty">No messages yet — be the first to sign.</div>
        ) : (
          entries.map((e, i) => (
            <div className="entry" key={i} style={{ animationDelay: `${Math.min(i * 40, 400)}ms` }}>
              <div className="avatar" style={{ background: avatarColor(e.author) }}>
                {e.author.slice(2, 4).toUpperCase()}
              </div>
              <div>
                <div className="entry-meta">
                  <a
                    className="entry-addr"
                    href={`https://sepolia.etherscan.io/address/${e.author}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#444", textDecoration: "none" }}
                  >
                    {shortAddr(e.author)}
                  </a>
                  <span className="entry-time">{timeAgo(e.timestamp)}</span>
                </div>
                <p className="entry-msg">{e.message}</p>
              </div>
            </div>
          ))
        )}

        <div style={{ marginTop: "3rem", textAlign: "center" }}>
          <a
            className="etherscan-link"
            href={`https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}`}
            target="_blank"
            rel="noreferrer"
          >
            View contract on Sepolia Etherscan ↗
          </a>
        </div>
      </main>
    </div>
  );
}
