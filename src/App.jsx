import { useState, useEffect, useCallback } from "react";

const CONTRACT_ADDRESS = "0x36C1eae3a088A580354B65F8df5558ECEAd5Ea4C";
const SEPOLIA_CHAIN_ID = "0xaa36a7"; // 11155111 in hex

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
  const [wrongNetwork, setWrongNetwork] = useState(false);
  const [entries, setEntries] = useState([]);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState(null);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [ethersLib, setEthersLib] = useState(null);
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("theme") || "dark";
  });

  useEffect(() => {
    document.documentElement.className = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  const disconnectWallet = () => {
    setAccount(null);
    localStorage.setItem("wallet_disconnected", "true");
    setStatus(null);
  };

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
    const isDisconnected = localStorage.getItem("wallet_disconnected") === "true";
    if (!isDisconnected) {
      window.ethereum.request({ method: "eth_accounts" }).then((accounts) => {
        if (accounts.length) setAccount(accounts[0]);
      });
    }
    window.ethereum.request({ method: "eth_chainId" }).then((id) => {
      setWrongNetwork(id !== SEPOLIA_CHAIN_ID);
    });
    const handler = (accounts) => {
      if (accounts.length > 0) {
        setAccount(accounts[0]);
        localStorage.removeItem("wallet_disconnected");
      } else {
        setAccount(null);
      }
    };
    const chainHandler = (id) => setWrongNetwork(id !== SEPOLIA_CHAIN_ID);
    window.ethereum.on("accountsChanged", handler);
    window.ethereum.on("chainChanged", chainHandler);
    return () => {
      window.ethereum.removeListener("accountsChanged", handler);
      window.ethereum.removeListener("chainChanged", chainHandler);
    };
  }, []);

  const switchToSepolia = async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: SEPOLIA_CHAIN_ID }],
      });
    } catch (err) {
      // 4902 = chain not added to MetaMask yet
      if (err.code === 4902) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: SEPOLIA_CHAIN_ID,
              chainName: "Sepolia",
              nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
              rpcUrls: ["https://rpc.sepolia.org"],
              blockExplorerUrls: ["https://sepolia.etherscan.io"],
            }],
          });
        } catch (addErr) {
          setStatus({ type: "error", text: "Couldn't add Sepolia network." });
        }
      } else {
        setStatus({ type: "error", text: "Network switch rejected." });
      }
    }
  };

  const connectWallet = async () => {
    if (!window.ethereum) {
      setStatus({ type: "error", text: "MetaMask not found. Please install it." });
      return;
    }
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      setAccount(accounts[0]);
      localStorage.removeItem("wallet_disconnected");
      const id = await window.ethereum.request({ method: "eth_chainId" });
      if (id !== SEPOLIA_CHAIN_ID) {
        setWrongNetwork(true);
        await switchToSepolia();
      } else {
        setWrongNetwork(false);
      }
      setStatus(null);
    } catch {
      setStatus({ type: "error", text: "Connection rejected." });
    }
  };

  const signGuestbook = async () => {
    if (!message.trim() || !account) return;
    const id = await window.ethereum.request({ method: "eth_chainId" });
    if (id !== SEPOLIA_CHAIN_ID) {
      setWrongNetwork(true);
      setStatus({ type: "error", text: "Wrong network — switch to Sepolia first." });
      await switchToSepolia();
      return;
    }
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
        @import url('https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;700;800;900&family=Space+Grotesk:wght@400;500;700&display=swap');
        
        :root {
          --bg-primary: #121214;
          --bg-card: #1e1e24;
          --border-color: #000000;
          --text-primary: #ffffff;
          --text-secondary: #c084fc;
          --text-muted: #a1a1aa;
          
          --accent-purple: #c084fc;
          --accent-green: #4ade80;
          --accent-yellow: #fef08a;
          --accent-pink: #ec4899;

          --btn-bg: #84cc16;
          --btn-fg: #000000;
          --btn-hover-bg: #a3e635;
          --box-shadow: 4px 4px 0px #000000;
          --box-shadow-active: 1px 1px 0px #000000;

          --status-success-bg: #166534;
          --status-success-color: #4ade80;
          --status-success-border: #000000;
          --status-error-bg: #991b1b;
          --status-error-color: #f87171;
          --status-error-border: #000000;
        }

        .light {
          --bg-primary: #faf6f0;
          --bg-card: #ffffff;
          --border-color: #000000;
          --text-primary: #000000;
          --text-secondary: #2563eb;
          --text-muted: #52525b;

          --accent-purple: #e9d5ff;
          --accent-green: #bbf7d0;
          --accent-yellow: #fef08a;
          --accent-pink: #fbcfe8;

          --btn-bg: #2563eb;
          --btn-fg: #ffffff;
          --btn-hover-bg: #1d4ed8;
          --box-shadow: 4px 4px 0px #000000;
          --box-shadow-active: 1px 1px 0px #000000;

          --status-success-bg: #dcfce7;
          --status-success-color: #15803d;
          --status-success-border: #000000;
          --status-error-bg: #fee2e2;
          --status-error-color: #b91c1c;
          --status-error-border: #000000;
        }

        body, .root, .compose-box, .nav-badge, .connect-btn, .theme-toggle-btn, .disconnect-btn, .entry, .sign-btn, .no-wallet-note, .status, .hero {
          transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease, transform 0.1s ease;
        }

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { 
          background: var(--bg-primary); 
          background-attachment: fixed;
        }

        .root {
          min-height: 100vh;
          background: transparent;
          color: var(--text-primary);
          font-family: 'Space Grotesk', sans-serif;
          font-size: 14px;
        }

        /* ── NAV ── */
        .nav {
          max-width: 720px;
          margin: 0 auto;
          padding: 2rem 1.5rem 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .nav-logo {
          font-family: 'Lexend', sans-serif;
          font-size: 15px;
          letter-spacing: -0.02em;
          text-transform: uppercase;
          color: var(--text-primary);
          font-weight: 900;
          border: 2px solid #000000;
          background: var(--accent-pink);
          color: #000000;
          padding: 6px 12px;
          box-shadow: 2px 2px 0px #000000;
        }
        .nav-badge-container {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .nav-badge {
          display: flex; align-items: center; gap: 8px;
          padding: 6px 14px;
          background: var(--accent-purple);
          border: 2px solid #000000;
          font-size: 12px;
          color: #000000;
          font-weight: bold;
          box-shadow: var(--box-shadow);
        }
        .nav-badge .dot {
          width: 8px; height: 8px; border-radius: 50%; background: #00ff88;
          border: 1.5px solid #000000;
          animation: pulse-dot 2.5s infinite ease-in-out;
        }
        @keyframes pulse-dot {
          0% { transform: scale(0.9); opacity: 0.8; }
          50% { transform: scale(1.25); opacity: 1; }
          100% { transform: scale(0.9); opacity: 0.8; }
        }
        .connect-btn {
          padding: 8px 18px;
          background: var(--accent-green);
          border: 2px solid #000000;
          color: #000000;
          font-family: 'Lexend', sans-serif;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: var(--box-shadow);
        }
        .connect-btn:hover { 
          transform: translate(-1px, -1px);
          box-shadow: 5px 5px 0px #000000;
        }
        .connect-btn:active {
          transform: translate(2px, 2px);
          box-shadow: var(--box-shadow-active);
        }

        .theme-toggle-btn {
          background: var(--accent-yellow);
          border: 2px solid #000000;
          color: #000000;
          padding: 8px 16px;
          cursor: pointer;
          font-size: 12px;
          font-weight: bold;
          font-family: 'Lexend', sans-serif;
          box-shadow: var(--box-shadow);
        }
        .theme-toggle-btn:hover {
          transform: translate(-1px, -1px);
          box-shadow: 5px 5px 0px #000000;
        }
        .theme-toggle-btn:active {
          transform: translate(2px, 2px);
          box-shadow: var(--box-shadow-active);
        }

        .disconnect-btn {
          padding: 8px 14px;
          background: var(--accent-pink);
          border: 2px solid #000000;
          color: #000000;
          font-family: 'Lexend', sans-serif;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: var(--box-shadow);
        }
        .disconnect-btn:hover {
          transform: translate(-1px, -1px);
          box-shadow: 5px 5px 0px #000000;
        }
        .disconnect-btn:active {
          transform: translate(2px, 2px);
          box-shadow: var(--box-shadow-active);
        }

        /* ── HERO HUD TERMINAL ── */
        .hero {
          max-width: 720px;
          margin: 3rem auto 1.5rem;
          border: 2px solid #000000;
          background: var(--bg-card);
          padding: 3rem 2rem;
          box-shadow: var(--box-shadow);
        }
        .hero h1 {
          font-family: 'Lexend', sans-serif;
          font-size: clamp(2.8rem, 8vw, 4.8rem);
          line-height: 1.0;
          letter-spacing: -0.03em;
          color: var(--text-primary);
          font-weight: 900;
        }
        .hero-highlight {
          display: inline-block;
          background: var(--accent-purple);
          color: #000000;
          padding: 2px 14px;
          border: 2px solid #000000;
          margin-top: 8px;
          transform: rotate(-1deg);
        }
        .hero-sub {
          margin-top: 1.5rem;
          font-size: 12px;
          color: var(--text-muted);
          text-transform: uppercase;
          font-weight: bold;
        }
        .hero-sub a {
          color: var(--text-secondary);
          text-decoration: underline;
        }

        /* ── COMPOSE ── */
        .main { max-width: 720px; margin: 0 auto; padding: 1.5rem 1.5rem 6rem; }

        .compose-box {
          background: var(--bg-card);
          border: 2px solid #000000;
          padding: 1.5rem;
          margin-bottom: 1.5rem;
          box-shadow: var(--box-shadow);
        }
        .compose-label {
          font-size: 11px;
          color: var(--text-primary);
          letter-spacing: 0.12em;
          text-transform: uppercase;
          margin-bottom: 1rem;
          font-family: 'Lexend', sans-serif;
          font-weight: 800;
        }
        textarea {
          width: 100%;
          background: var(--bg-primary);
          border: 2px solid #000000;
          outline: none;
          color: var(--text-primary);
          font-family: 'Space Grotesk', sans-serif;
          font-size: 15px;
          padding: 12px;
          resize: none;
          min-height: 90px;
        }
        textarea::placeholder { color: var(--text-muted); }
        .compose-footer {
          display: flex; align-items: center; justify-content: space-between;
          margin-top: 1rem;
        }
        .char-count { font-size: 12px; color: var(--text-muted); font-weight: bold; }
        .char-count.over { color: #f43f5e; }
        .sign-btn {
          padding: 10px 24px;
          background: var(--btn-bg);
          color: var(--btn-fg);
          border: 2px solid #000000;
          font-family: 'Lexend', sans-serif;
          font-size: 12px;
          font-weight: bold;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          cursor: pointer;
          box-shadow: var(--box-shadow);
        }
        .sign-btn:hover:not(:disabled) { 
          background: var(--btn-hover-bg, var(--btn-bg));
          transform: translate(-1px, -1px);
          box-shadow: 5px 5px 0px #000000;
        }
        .sign-btn:active:not(:disabled) {
          transform: translate(2px, 2px);
          box-shadow: var(--box-shadow-active);
        }
        .sign-btn:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; transform: none; }

        /* ── STATUS ── */
        .status {
          padding: 12px 16px;
          font-size: 13px;
          font-weight: bold;
          display: flex; align-items: center; gap: 10px;
          margin-bottom: 1.5rem;
          box-shadow: var(--box-shadow);
          border: 2px solid #000000;
        }
        .status.loading { background: var(--accent-yellow); color: #000000; }
        .status.success { background: var(--status-success-bg); color: var(--status-success-color); border-color: var(--status-success-border); }
        .status.error   { background: var(--status-error-bg); color: var(--status-error-color); border-color: var(--status-error-border); }

        /* ── NO WALLET ── */
        .no-wallet-note {
          margin-bottom: 1.5rem;
          padding: 14px 18px;
          background: var(--accent-yellow);
          border: 2px solid #000000;
          font-size: 13px;
          color: #000000;
          font-weight: bold;
          display: flex; align-items: center; gap: 10px;
          box-shadow: var(--box-shadow);
        }
        .no-wallet-note a { color: #000000; text-decoration: underline; }
        .no-wallet-note.warning {
          background: var(--status-error-bg);
          color: var(--status-error-color);
        }

        /* ── ENTRIES ── */
        .entries-header {
          display: flex; align-items: baseline; justify-content: space-between;
          padding: 2.5rem 0.5rem 1rem;
          border-bottom: 2px solid #000000;
          margin-bottom: 1.5rem;
        }
        .entries-title { 
          font-size: 14px; 
          color: var(--text-primary); 
          letter-spacing: 0.05em; 
          text-transform: uppercase; 
          font-family: 'Lexend', sans-serif;
          font-weight: 900;
        }
        .entries-count { font-size: 12px; color: var(--text-muted); font-weight: bold; }

        .entry {
          display: grid;
          grid-template-columns: 50px 1fr;
          gap: 16px;
          padding: 1.5rem;
          background: var(--bg-card);
          border: 2px solid #000000;
          margin-bottom: 1rem;
          box-shadow: var(--box-shadow);
          animation: fadeUp .35s ease both;
        }
        .entry:hover {
          transform: translate(-1px, -1px);
          box-shadow: 5px 5px 0px #000000;
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .avatar {
          width: 50px; height: 50px; border-radius: 4px;
          display: flex; align-items: center; justify-content: center;
          font-size: 12px; font-weight: 900; color: #000000;
          flex-shrink: 0;
          letter-spacing: 0.04em;
          background: var(--accent-pink);
          border: 2px solid #000000;
          font-family: 'Lexend', sans-serif;
        }

        .entry-meta {
          display: flex; align-items: center; gap: 10px; margin-bottom: 6px;
        }
        .entry-addr { 
          font-size: 13px; 
          color: var(--text-secondary); 
          font-weight: 700;
          text-decoration: underline;
        }
        .entry-addr:hover { color: var(--text-primary); }
        .entry-time { font-size: 11px; color: var(--text-muted); font-weight: bold; }

        .entry-msg {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 14px;
          color: var(--text-primary);
          line-height: 1.5;
          word-break: break-word;
        }

        .empty {
          padding: 5rem 0; text-align: center;
          font-size: 14px; color: var(--text-muted); font-weight: bold;
        }

        .loader { display: flex; gap: 5px; justify-content: center; padding: 4rem 0; }
        .loader span {
          width: 8px; height: 8px; border-radius: 50%; background: var(--text-primary);
          border: 1px solid #000000;
          animation: pulse 1.2s ease-in-out infinite;
        }
        .loader span:nth-child(2) { animation-delay: 0.2s; }
        .loader span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes pulse {
          0%,80%,100% { opacity: .2; transform: scale(.8); }
          40% { opacity: 1; transform: scale(1); }
        }

        .etherscan-link {
          font-size: 12px; color: var(--text-muted);
          text-decoration: underline; display: inline-flex; align-items: center; gap: 4px;
          font-family: 'Lexend', sans-serif;
          font-weight: bold;
        }
        .etherscan-link:hover { color: var(--text-primary); }
      `}</style>

      {/* NAV */}
      <nav className="nav">
        <span className="nav-logo">GUESTBOOK.DB</span>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button className="theme-toggle-btn" onClick={toggleTheme} aria-label="Toggle Theme">
            {theme === "dark" ? "CYBER_DARK" : "PASTEL_LIGHT"}
          </button>
          {account ? (
            <div className="nav-badge-container">
              <div className="nav-badge">
                <span className="dot" />
                {shortAddr(account)}
              </div>
              <button className="disconnect-btn" onClick={disconnectWallet}>
                DISCONNECT
              </button>
            </div>
          ) : (
            <button className="connect-btn" onClick={connectWallet}>
              CONNECT WALLET
            </button>
          )}
        </div>
      </nav>

      {/* HERO */}
      <header className="hero">
        <h1>
          SIGN THE<br />
          <span className="hero-highlight">CHAIN.</span>
        </h1>
        <p className="hero-sub">
          PERMANENT MESSAGES ON SEPOLIA ·{" "}
          <a
            href={`https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}`}
            target="_blank"
            rel="noreferrer"
          >
            VIEW CONTRACT ↗
          </a>
        </p>
      </header>

      {/* MAIN */}
      <main className="main">

        {status && (
          <div className={`status ${status.type}`}>
            {status.type === "loading" && "⏳ "}
            {status.type === "success" && "✓ "}
            {status.type === "error" && "✗ "}
            {status.text}
          </div>
        )}

        {account && wrongNetwork && (
          <div className="no-wallet-note warning">
            ⚠ WRONG NETWORK! Expected Sepolia [11155111] ·{" "}
            <a href="#" onClick={(e) => { e.preventDefault(); switchToSepolia(); }} style={{ color: "inherit" }}>
              SWITCH NETWORK
            </a>
          </div>
        )}

        {!window.ethereum && (
          <div className="no-wallet-note">
            ⚠ NO INJECTED PROVIDER!{" "}
            <a href="https://metamask.io" target="_blank" rel="noreferrer">
              INSTALL METAMASK
            </a>{" "}
            to authenticate. Read-only mode active.
          </div>
        )}

        <div className="compose-box">
          <p className="compose-label">Leave your mark</p>
          <textarea
            placeholder="Write something permanent on-chain..."
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
                wrongNetwork ||
                status?.type === "loading"
              }
            >
              {status?.type === "loading" ? "EXECUTING..." : "SIGN MESSAGE"}
            </button>
          </div>
        </div>

        {!account && window.ethereum && (
          <p style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "1.25rem", marginRight: "0.5rem", textAlign: "right", fontFamily: "Lexend, sans-serif", fontWeight: "bold" }}>
            // Connect wallet to write data records
          </p>
        )}

        {/* ENTRIES */}
        <div className="entries-header">
          <span className="entries-title">All messages</span>
          <span className="entries-count">{entries.length} RECORDS ON-CHAIN</span>
        </div>

        {loadingEntries ? (
          <div className="loader"><span /><span /><span /></div>
        ) : entries.length === 0 ? (
          <div className="empty">No signatures found. Be the first to leave a record.</div>
        ) : (
          entries.map((e, i) => (
            <div className="entry" key={i} style={{ animationDelay: `${Math.min(i * 40, 400)}ms` }}>
              <div className="avatar" style={{ background: avatarColor(e.author) }}>
                {e.author.slice(2, 6).toUpperCase()}
              </div>
              <div>
                <div className="entry-meta">
                  <a
                     className="entry-addr"
                     href={`https://sepolia.etherscan.io/address/${e.author}`}
                     target="_blank"
                     rel="noreferrer"
                     style={{ textDecoration: "none" }}
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

        <div style={{ marginTop: "3.5rem", textAlign: "center" }}>
          <a
            className="etherscan-link"
            href={`https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}`}
            target="_blank"
            rel="noreferrer"
          >
            [VIEW_ON_ETHERSCAN]
          </a>
        </div>
      </main>
    </div>
  );
}
