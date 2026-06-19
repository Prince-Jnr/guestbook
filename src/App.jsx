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
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
        
        :root {
          --bg-primary: #070707;
          --bg-gradient: radial-gradient(circle at 10% 10%, #161616 0%, #070707 70%);
          --bg-secondary: rgba(18, 18, 18, 0.6);
          --bg-tertiary: #141414;
          --border-color: rgba(255, 255, 255, 0.08);
          --border-muted: rgba(255, 255, 255, 0.04);
          --text-primary: #ede9df;
          --text-secondary: #a39f93;
          --text-muted: #6e6b60;
          --text-deep-muted: #3a3a35;
          --btn-bg: #ede9df;
          --btn-fg: #0a0a0a;
          --btn-hover-opacity: 0.95;
          --box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37), inset 0 1px 0 rgba(255, 255, 255, 0.05);

          --status-success-bg: rgba(12, 31, 20, 0.6);
          --status-success-color: #4ade80;
          --status-success-border: rgba(74, 222, 128, 0.2);
          --status-error-bg: rgba(31, 12, 12, 0.6);
          --status-error-color: #f87171;
          --status-error-border: rgba(248, 113, 113, 0.2);
        }

        .light {
          --bg-primary: #faf9f6;
          --bg-gradient: radial-gradient(circle at 10% 10%, #ffffff 0%, #faf9f6 70%);
          --bg-secondary: rgba(243, 241, 235, 0.7);
          --bg-tertiary: #ebe9e0;
          --border-color: rgba(0, 0, 0, 0.08);
          --border-muted: rgba(0, 0, 0, 0.04);
          --text-primary: #1c1a17;
          --text-secondary: #6e6b60;
          --text-muted: #949081;
          --text-deep-muted: #b5b1a2;
          --btn-bg: #1c1a17;
          --btn-fg: #faf9f6;
          --btn-hover-opacity: 0.95;
          --box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.03), inset 0 1px 0 rgba(255, 255, 255, 0.8);

          --status-success-bg: rgba(230, 246, 236, 0.7);
          --status-success-color: #16a34a;
          --status-success-border: rgba(22, 163, 74, 0.2);
          --status-error-bg: rgba(253, 242, 242, 0.7);
          --status-error-color: #dc2626;
          --status-error-border: rgba(220, 38, 38, 0.2);
        }

        body, .root, .compose-box, .nav-badge, .connect-btn, .theme-toggle-btn, .disconnect-btn, .entry, .sign-btn, .no-wallet-note, .status {
          transition: background-color 0.4s cubic-bezier(0.16, 1, 0.3, 1), 
                      border-color 0.4s cubic-bezier(0.16, 1, 0.3, 1), 
                      color 0.4s cubic-bezier(0.16, 1, 0.3, 1), 
                      box-shadow 0.4s cubic-bezier(0.16, 1, 0.3, 1),
                      opacity 0.2s ease, transform 0.2s ease;
        }

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { 
          background: var(--bg-primary); 
          background-image: var(--bg-gradient);
          background-attachment: fixed;
        }

        .root {
          min-height: 100vh;
          background: transparent;
          color: var(--text-primary);
          font-family: 'Inter', sans-serif;
          letter-spacing: -0.01em;
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
          font-family: 'DM Mono', monospace;
          font-size: 11px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--text-muted);
          font-weight: 500;
        }
        .nav-badge-container {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .nav-badge {
          display: flex; align-items: center; gap: 8px;
          padding: 6px 14px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 99px;
          font-size: 11px;
          color: var(--text-secondary);
          font-family: 'DM Mono', monospace;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          box-shadow: var(--box-shadow);
        }
        .nav-badge .dot {
          width: 6px; height: 6px; border-radius: 50%; background: #4ade80;
          box-shadow: 0 0 8px #4ade80;
          animation: pulse-dot 2.5s infinite ease-in-out;
        }
        @keyframes pulse-dot {
          0% { transform: scale(0.9); opacity: 0.6; }
          50% { transform: scale(1.2); opacity: 1; box-shadow: 0 0 12px #4ade80; }
          100% { transform: scale(0.9); opacity: 0.6; }
        }
        .connect-btn {
          padding: 8px 18px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          color: var(--text-secondary);
          font-family: 'DM Mono', monospace;
          font-size: 11px;
          letter-spacing: 0.06em;
          cursor: pointer;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          box-shadow: var(--box-shadow);
        }
        .connect-btn:hover { 
          border-color: var(--text-muted); 
          color: var(--text-primary); 
          transform: translateY(-1px);
        }
        .connect-btn:active {
          transform: translateY(0);
        }

        .theme-toggle-btn {
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          color: var(--text-primary);
          width: 34px;
          height: 34px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 14px;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          box-shadow: var(--box-shadow);
        }
        .theme-toggle-btn:hover {
          background: var(--bg-tertiary);
          border-color: var(--text-muted);
          transform: rotate(15deg) scale(1.05);
        }

        .disconnect-btn {
          padding: 8px 14px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          color: var(--text-muted);
          font-family: 'DM Mono', monospace;
          font-size: 11px;
          cursor: pointer;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          box-shadow: var(--box-shadow);
        }
        .disconnect-btn:hover {
          border-color: rgba(248, 113, 113, 0.4);
          color: #f87171;
          background: rgba(248, 113, 113, 0.05);
          transform: translateY(-1px);
        }
        .disconnect-btn:active {
          transform: translateY(0);
        }

        /* ── HERO ── */
        .hero {
          max-width: 720px;
          margin: 0 auto;
          padding: 5rem 1.5rem 3rem;
          border-bottom: 1px solid var(--border-color);
        }
        .hero h1 {
          font-family: 'Instrument Serif', serif;
          font-style: italic;
          font-weight: 400;
          font-size: clamp(3.2rem, 8.5vw, 6rem);
          line-height: 0.95;
          letter-spacing: -0.03em;
          color: var(--text-primary);
        }
        .hero h1 span { color: var(--text-deep-muted); }
        .hero-sub {
          margin-top: 1.25rem;
          font-size: 11px;
          color: var(--text-muted);
          letter-spacing: 0.1;
          text-transform: uppercase;
          font-family: 'DM Mono', monospace;
        }
        .hero-sub a {
          color: var(--text-secondary);
          text-decoration: none;
          border-bottom: 1px solid transparent;
          transition: border-color 0.2s;
        }
        .hero-sub a:hover { color: var(--text-primary); border-color: var(--text-primary); }

        /* ── COMPOSE ── */
        .main { max-width: 720px; margin: 0 auto; padding: 3rem 1.5rem 6rem; }

        .compose-box {
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 14px;
          padding: 1.5rem 1.75rem;
          margin-bottom: 1rem;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          box-shadow: var(--box-shadow);
        }
        .compose-box:focus-within {
          border-color: var(--text-secondary);
          box-shadow: 0 0 0 1px var(--text-secondary), var(--box-shadow);
        }
        .compose-label {
          font-size: 10px;
          color: var(--text-muted);
          letter-spacing: 0.14em;
          text-transform: uppercase;
          margin-bottom: 1rem;
          font-family: 'DM Mono', monospace;
          font-weight: 500;
        }
        textarea {
          width: 100%;
          background: transparent;
          border: none;
          outline: none;
          color: var(--text-primary);
          font-family: 'Instrument Serif', serif;
          font-style: italic;
          font-size: 1.3rem;
          line-height: 1.5;
          resize: none;
          min-height: 100px;
        }
        textarea::placeholder { color: var(--text-deep-muted); }
        .compose-footer {
          display: flex; align-items: center; justify-content: space-between;
          padding-top: 1rem;
          border-top: 1px solid var(--border-muted);
          margin-top: 0.75rem;
        }
        .char-count { font-size: 11px; color: var(--text-deep-muted); font-family: 'DM Mono', monospace; }
        .char-count.over { color: #f87171; }
        .sign-btn {
          padding: 10px 24px;
          background: var(--btn-bg);
          color: var(--btn-fg);
          border: none;
          border-radius: 6px;
          font-family: 'DM Mono', monospace;
          font-size: 12px;
          font-weight: 500;
          letter-spacing: 0.06em;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .sign-btn:hover:not(:disabled) { 
          opacity: var(--btn-hover-opacity); 
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        .sign-btn:active:not(:disabled) { transform: translateY(1px); }
        .sign-btn:disabled { opacity: 0.25; cursor: not-allowed; transform: none; box-shadow: none; }

        /* ── STATUS ── */
        .status {
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 12px;
          letter-spacing: 0.03em;
          display: flex; align-items: center; gap: 10px;
          margin-bottom: 1rem;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          box-shadow: var(--box-shadow);
        }
        .status.loading { background: var(--bg-secondary); color: var(--text-secondary); border: 1px solid var(--border-color); }
        .status.success { background: var(--status-success-bg); color: var(--status-success-color); border: 1px solid var(--status-success-border); }
        .status.error   { background: var(--status-error-bg); color: var(--status-error-color); border: 1px solid var(--status-error-border); }

        /* ── NO WALLET ── */
        .no-wallet-note {
          margin-bottom: 1.25rem;
          padding: 14px 18px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 10px;
          font-size: 12px;
          color: var(--text-secondary);
          display: flex; align-items: center; gap: 10px;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          box-shadow: var(--box-shadow);
        }
        .no-wallet-note a { color: var(--text-secondary); text-decoration: underline; }
        .no-wallet-note.warning {
          border-color: var(--status-error-border);
          color: var(--status-error-color);
        }

        /* ── ENTRIES ── */
        .entries-header {
          display: flex; align-items: baseline; justify-content: space-between;
          padding: 3rem 0.5rem 1.25rem;
          border-bottom: 1px solid var(--border-color);
          margin-bottom: 1.5rem;
        }
        .entries-title { 
          font-size: 10px; 
          color: var(--text-muted); 
          letter-spacing: 0.14em; 
          text-transform: uppercase; 
          font-family: 'DM Mono', monospace;
          font-weight: 500;
        }
        .entries-count { font-size: 11px; color: var(--text-muted); font-family: 'DM Mono', monospace; }

        .entry {
          display: grid;
          grid-template-columns: 44px 1fr;
          gap: 16px;
          padding: 1.5rem;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 12px;
          margin-bottom: 0.5rem;
          animation: fadeUp .35s ease both;
        }
        .entry:hover {
          background: var(--bg-secondary);
          border-color: var(--border-color);
          box-shadow: var(--box-shadow);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .avatar {
          width: 44px; height: 44px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 600; color: var(--bg-primary);
          flex-shrink: 0; margin-top: 2px;
          letter-spacing: 0.04em;
          border: 1px solid var(--border-color);
          box-shadow: 0 2px 6px rgba(0,0,0,0.05);
        }

        .entry-meta {
          display: flex; align-items: center; gap: 10px; margin-bottom: 6px;
        }
        .entry-addr { 
          font-size: 12px; 
          color: var(--text-secondary); 
          letter-spacing: 0.02em; 
          font-family: 'DM Mono', monospace;
          font-weight: 500;
        }
        .entry-addr:hover { color: var(--text-primary); }
        .entry-time { font-size: 11px; color: var(--text-muted); }

        .entry-msg {
          font-family: 'Instrument Serif', serif;
          font-style: italic;
          font-size: 1.25rem;
          color: var(--text-primary);
          opacity: 0.95;
          line-height: 1.55;
          word-break: break-word;
        }

        .empty {
          padding: 5rem 0; text-align: center;
          font-size: 12px; color: var(--text-muted); letter-spacing: 0.06em;
          font-family: 'DM Mono', monospace;
        }

        .loader { display: flex; gap: 5px; justify-content: center; padding: 4rem 0; }
        .loader span {
          width: 6px; height: 6px; border-radius: 50%; background: var(--text-muted);
          animation: pulse 1.2s ease-in-out infinite;
        }
        .loader span:nth-child(2) { animation-delay: 0.2s; }
        .loader span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes pulse {
          0%,80%,100% { opacity: .2; transform: scale(.8); }
          40% { opacity: 1; transform: scale(1); }
        }

        .etherscan-link {
          font-size: 10px; color: var(--text-muted); letter-spacing: 0.08em;
          text-decoration: none; display: inline-flex; align-items: center; gap: 4px;
          font-family: 'DM Mono', monospace;
          border-bottom: 1px solid transparent;
          transition: border-color 0.2s;
        }
        .etherscan-link:hover { color: var(--text-secondary); border-color: var(--text-secondary); }
      `}</style>

      {/* NAV */}
      <nav className="nav">
        <span className="nav-logo">Guestbook</span>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button className="theme-toggle-btn" onClick={toggleTheme} aria-label="Toggle Theme">
            {theme === "dark" ? "☼" : "☾"}
          </button>
          {account ? (
            <div className="nav-badge-container">
              <div className="nav-badge">
                <span className="dot" />
                {shortAddr(account)}
              </div>
              <button className="disconnect-btn" onClick={disconnectWallet}>
                Disconnect
              </button>
            </div>
          ) : (
            <button className="connect-btn" onClick={connectWallet}>
              Connect Wallet
            </button>
          )}
        </div>
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

        {account && wrongNetwork && (
          <div className="no-wallet-note warning">
            ⚠ &nbsp;
            <span>
              You're on the wrong network. This contract lives on Sepolia.{" "}
              <a href="#" onClick={(e) => { e.preventDefault(); switchToSepolia(); }} style={{ color: "inherit", textDecoration: "underline" }}>
                Switch to Sepolia
              </a>
            </span>
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
                wrongNetwork ||
                status?.type === "loading"
              }
            >
              {status?.type === "loading" ? "Signing…" : "Sign →"}
            </button>
          </div>
        </div>

        {!account && window.ethereum && (
          <p style={{ fontSize: "11px", color: "var(--text-deep-muted)", marginBottom: "1.25rem", marginRight: "0.5rem", textAlign: "right", fontFamily: "DM Mono, monospace" }}>
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
            View contract on Sepolia Etherscan ↗
          </a>
        </div>
      </main>
    </div>
  );
}
