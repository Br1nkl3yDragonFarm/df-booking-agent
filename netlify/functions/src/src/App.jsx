import { useState, useRef, useEffect } from "react";
import "./index.css";

const SYSTEM_PROMPT = `You are the official AI Booking Agent for Dragon Farm — a premier music entertainment company. Sharp, industry-savvy, and efficient.

Dragon Farm operates across four booking verticals:
1. 🎪 MUSIC FESTIVALS — Booking artists for Dragon Farm's signature festival lineup
2. 🎤 MUSIC VENUES — Connecting artists with stages, clubs, amphitheaters, and concert halls
3. 🤝 ARTIST COLLABORATIONS — Syncing Dragon Farm artists with similar touring acts for joint tours and co-headliners
4. 🎬 SYNC LICENSING — Placing Dragon Farm music in film, TV, streaming, sports broadcasts, and commercials

THREE INTEGRATED TOOLS:
1. BOOKING-AGENT.IO → Trigger [SHOW_BAIO] for venue research, talent buyer contacts, tour market research.
2. GIGWELL → Trigger [SHOW_GIGWELL] for contracts, payments, EPK, booking admin.
3. MASTER TOUR → Trigger [SHOW_MASTERTOUR] for active tour logistics, travel, crew, itinerary, guest lists.

BOOKING INTAKE: collect booking type, artist name, dates, venue, territory, budget, contact name/email/phone.
TONE: Professional, direct, music-industry confident.`;

const WELCOME_MESSAGE = `Welcome to Dragon Farm Booking. 🐉

I'm your AI booking agent — festivals, venues, touring collabs, and sync licensing.

Three specialist platforms are integrated:
**Booking-Agent.io** — find venues & talent buyer contacts
**Gigwell** — contracts, payments & booking management
**Master Tour** — itineraries, crew & tour logistics

What are you looking to book?`;

const TABS = [
  { id: "baio", label: "Booking-Agent.io", short: "B-A.io" },
  { id: "gigwell", label: "Gigwell", short: "Gigwell" },
  { id: "mastertour", label: "Master Tour", short: "M. Tour" },
];

const STORAGE_KEY = "df_api_key";

function SettingsScreen({ onSave, existingKey = "", onCancel }) {
  const [key, setKey] = useState(existingKey);
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const handleSave = () => {
    const trimmed = key.trim();
    if (!trimmed.startsWith("sk-ant-")) { setError("Key should start with sk-ant-"); return; }
    setError(""); onSave(trimmed);
  };
  return (
    <div className="setup-root">
      <div className="setup-card">
        <div className="setup-logo">🐉 Dragon Farm</div>
        <div className="setup-title">Booking Agent Setup</div>
        <div className="setup-desc">Enter your Anthropic API key to power the booking agent.</div>
        <div className="setup-field">
          <label className="setup-label">Anthropic API Key</label>
          <div className="setup-input-wrap">
            <input className="setup-input" type={show ? "text" : "password"} placeholder="sk-ant-api03-..." value={key}
              onChange={e => { setKey(e.target.value); setError(""); }}
              onKeyDown={e => e.key === "Enter" && handleSave()}
              spellCheck={false} autoComplete="off" autoFocus />
            <button className="setup-eye" onClick={() => setShow(v => !v)}>{show ? "🙈" : "👁"}</button>
          </div>
          {error && <div className="setup-error">{error}</div>}
        </div>
        <button className="setup-btn" onClick={handleSave} disabled={!key.trim()}>Launch Booking Agent →</button>
        {onCancel && <button className="setup-cancel" onClick={onCancel}>← Back</button>}
        <div className="setup-help">Get your key at <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" className="setup-link">console.anthropic.com ↗</a></div>
        <div className="setup-note">
          <div className="setup-note-title">What your key enables</div>
          <div className="setup-note-row">⚡ AI booking agent powered by Claude</div>
          <div className="setup-note-row">🔍 Live web search for contacts</div>
          <div className="setup-note-row">💾 Key saved to your browser only</div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(STORAGE_KEY) || "");
  const [showSettings, setShowSettings] = useState(false);
  const [messages, setMessages] = useState([{ role: "assistant", content: WELCOME_MESSAGE }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("baio");
  const [baioInput, setBaioInput] = useState("");
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const handleSaveKey = (key) => { localStorage.setItem(STORAGE_KEY, key); setApiKey(key); setShowSettings(false); };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      if (res.status === 401) { setMessages(prev => [...prev, { role: "assistant", content: "⚠️ Invalid API key. Tap ⚙ to update it." }]); setLoading(false); return; }
      const data = await res.json();
      if (data.error) { setMessages(prev => [...prev, { role: "assistant", content: `⚠️ ${data.error?.message || data.error}` }]); setLoading(false); return; }
      let text = data.content?.filter(b => b.type === "text")?.map(b => b.text)?.join("\n") || "Something went wrong.";
      let tab = null;
      if (text.includes("[SHOW_BAIO]")) { text = text.replace(/\[SHOW_BAIO\]/g, "").trim(); tab = "baio"; }
      if (text.includes("[SHOW_GIGWELL]")) { text = text.replace(/\[SHOW_GIGWELL\]/g, "").trim(); tab = tab || "gigwell"; }
      if (text.includes("[SHOW_MASTERTOUR]")) { text = text.replace(/\[SHOW_MASTERTOUR\]/g, "").trim(); tab = tab || "mastertour"; }
      if (tab) { setSidebarOpen(true); setActiveTab(tab); }
      setMessages(prev => [...prev, { role: "assistant", content: text }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", content: `Connection error: ${err.message}` }]);
    } finally { setLoading(false); }
  };

  const handleKeyDown = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } };
  const autoResize = e => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; };
  const openBAIO = () => window.open(baioInput.trim() ? `https://booking-agent.io/?artist=${encodeURIComponent(baioInput.trim())}` : "https://booking-agent.io", "_blank");
  const bold = text => text.split(/(\*\*[^*]+\*\*)/).map((p, i) => p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2,-2)}</strong> : p);

  const quickActions = ["Book a festival slot", "Find venue contacts", "Collab / joint tour", "Sync licensing", "Manage tour logistics"];
  const baioFeatures = [["🎯","Venue Matching","Venues that booked similar artists."],["📇","Talent Buyer Contacts","Direct emails for venue bookers."],["📍","City & Genre Search","Filter by city or genre."],["📊","Capacity Data","Pitch at the right level."],["🗓","Upcoming Shows","Spot support slot opportunities."],["✉️","Email Accuracy","Cross-checked against Apollo."]];
  const gigwellFeatures = [["📝","Contract Builder","E-sign contracts in minutes."],["💳","FlexPay Payments","Automated invoices."],["🗺","Tour IQ","Global venue database."],["📱","Mobile Itinerary","Real-time logistics."],["🎤","Artist EPK","Press kit with booking forms."],["📈","Revenue Analytics","Track settlements."]];
  const masterTourFeatures = [["🗓","Tour Itineraries","Day-by-day schedules."],["✈️","Travel Management","Flights and hotels."],["👥","Crew Coordination","Assign roles to your team."],["🎟","Guest List","Manage pass types."],["🏟","15,000+ Venues","Search worldwide."],["📲","Offline Mobile","Works without signal."],["💰","Settlement","Tour accounting."],["🔒","Battle-Tested","Metallica, Ed Sheeran & Live Nation."]];

  if (!apiKey || showSettings) return <SettingsScreen onSave={handleSaveKey} existingKey={apiKey} onCancel={apiKey ? () => setShowSettings(false) : null} />;

  return (
    <div className="root">
      <div className="main">
        <div className="glow" />
        <header className="hdr">
          <div className="brand"><div className="logo">🐉 Dragon Farm</div><div className="badge">Booking Agent</div></div>
          <div className="hdr-tools">
            <div className="status"><div className="sdot" />Online</div>
            {TABS.map(t => (
              <button key={t.id} className={`tool-btn${sidebarOpen && activeTab === t.id ? " on" : ""}`}
                onClick={() => { setActiveTab(t.id); setSidebarOpen(v => activeTab === t.id ? !v : true); }}>
                <div className="tdot" />{t.short}
              </button>
            ))}
            <button className="tool-btn settings-btn" onClick={() => setShowSettings(true)}>⚙</button>
          </div>
        </header>
        <div className="caps">
          {[["🎪","Festivals"],["🎤","Venues"],["🤝","Collabs"],["🎬","Sync"],["🔍","Contacts"]].map(([i,l])=>(<div key={l} className="cap"><span>{i} </span>{l}</div>))}
          <div className="cap hi">⚡ Booking-Agent.io</div><div className="cap hi">⚡ Gigwell</div><div className="cap hi">⚡ Master Tour</div>
        </div>
        <div className="msgs">
          {messages.map((msg, idx) => (
            <div key={idx} className={`msg ${msg.role === "user" ? "u" : "a"}`}>
              <div className="lbl">{msg.role === "user" ? "You" : "Dragon Farm"}</div>
              <div className="bbl">{bold(msg.content)}</div>
            </div>
          ))}
          {loading && <div className="thk"><div className="thk-lbl">Dragon Farm</div><div className="thk-bbl"><div className="d"/><div className="d"/><div className="d"/></div></div>}
          <div ref={messagesEndRef} />
        </div>
        {messages.length <= 1 && <div className="quick">{quickActions.map(a => (<button key={a} className="qbtn" disabled={loading} onClick={() => { setInput(a); setTimeout(() => textareaRef.current?.focus(), 50); }}>{a}</button>))}</div>}
        <div className="inp-area">
          <textarea ref={textareaRef} className="ta" value={input} rows={1}
            onChange={e => { setInput(e.target.value); autoResize(e); }}
            onKeyDown={handleKeyDown} placeholder="Type your booking inquiry…" disabled={loading} />
          <button className="sbtn" onClick={sendMessage} disabled={loading || !input.trim()}>Send</button>
        </div>
      </div>
      <div className={`sb${sidebarOpen ? " open" : ""}`}>
        <div className="sb-tabs">
          {TABS.map(t => (<button key={t.id} className={`sb-tab${activeTab === t.id ? " active" : ""}`} onClick={() => setActiveTab(t.id)}>{t.label}</button>))}
          <button className="sb-close-btn" onClick={() => setSidebarOpen(false)}>✕</button>
        </div>
        {activeTab === "baio" && <div className="sb-panel"><div className="sb-hdr"><div className="sb-name">Booking-Agent.io</div><div className="sb-sub">Venue & Talent Buyer Research</div></div><div className="sb-desc">Search by <strong>similar artist</strong> to find venues and <strong>talent buyer contacts</strong>.</div><div className="sb-srch"><div className="sb-lbl">Search by similar artist</div><input className="sb-inp" placeholder="e.g. Tame Impala…" value={baioInput} onChange={e => setBaioInput(e.target.value)} onKeyDown={e => e.key === "Enter" && openBAIO()} /><button className="sb-go" onClick={openBAIO}>Search on Booking-Agent.io ↗</button></div><div className="sb-feats">{baioFeatures.map(([icon,title,desc]) => (<div key={title} className="feat"><div className="fi">{icon}</div><div><div className="ft">{title}</div><div className="fd">{desc}</div></div></div>))}</div><div className="sb-foot"><button className="visit" onClick={() => window.open("https://booking-agent.io","_blank")}>Open Booking-Agent.io ↗</button><div className="pwrd">From $49.99/mo</div></div></div>}
        {activeTab === "gigwell" && <div className="sb-panel"><div className="sb-hdr"><div className="sb-name">Gigwell</div><div className="sb-sub">End-to-End Booking Management</div></div><div className="sb-desc">The <strong>full booking workflow</strong> — contracts, payments, EPK, and revenue tracking.</div><div className="sb-actions"><button className="act-btn p" onClick={() => window.open("https://www.gigwell.com","_blank")}>Open Gigwell ↗</button><button className="act-btn s" onClick={() => window.open("https://www.gigwell.com/artist-booking-platform-software-system","_blank")}>Book a Demo ↗</button></div><div className="sb-feats">{gigwellFeatures.map(([icon,title,desc]) => (<div key={title} className="feat"><div className="fi">{icon}</div><div><div className="ft">{title}</div><div className="fd">{desc}</div></div></div>))}</div><div className="sb-foot"><button className="visit" onClick={() => window.open("https://www.gigwell.com","_blank")}>Get Started ↗</button><div className="pwrd">From $49/mo</div></div></div>}
        {activeTab === "mastertour" && <div className="sb-panel"><div className="sb-hdr"><div className="sb-name">Master Tour</div><div className="sb-sub">Tour Operations by Eventric</div></div><div className="sb-desc">The <strong>industry standard</strong> for live tour management.</div><div className="sb-actions"><button className="act-btn p" onClick={() => window.open("https://www.eventric.com/master-tour-management-software/","_blank")}>Open Master Tour ↗</button><button className="act-btn s" onClick={() => window.open("https://www.eventric.com/master-tour-management-software/","_blank")}>Free Trial ↗</button></div><div className="sb-feats">{masterTourFeatures.map(([icon,title,desc]) => (<div key={title} className="feat"><div className="fi">{icon}</div><div><div className="ft">{title}</div><div className="fd">{desc}</div></div></div>))}</div><div className="sb-foot"><button className="visit" onClick={() => window.open("https://www.eventric.com/master-tour-management-software/","_blank")}>Get Master Tour ↗</button><div className="pwrd">14-day free trial</div></div></div>}
      </div>
    </div>
  );
                                   }
