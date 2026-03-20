import { useState } from "react";

interface HelpForm {
  name: string;
  email: string;
  whatsapp: string;
  message: string;
}

const EMPTY: HelpForm = { name: "", email: "", whatsapp: "", message: "" };

export default function HelpButton() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<HelpForm>(EMPTY);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const page = typeof window !== "undefined" ? window.location.pathname + window.location.search : "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      setError("Veuillez remplir les champs obligatoires (Nom, Email, Message).");
      return;
    }
    setError("");
    setSending(true);
    try {
      const res = await fetch("/api/support/help", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, page }),
      });
      if (!res.ok) throw new Error("Erreur");
      setSent(true);
      setForm(EMPTY);
      setTimeout(() => { setSent(false); setOpen(false); }, 3000);
    } catch {
      setError("Erreur lors de l'envoi. Veuillez réessayer.");
    } finally {
      setSending(false);
    }
  };

  const inp = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white text-gray-800";

  return (
    <>
      <button
        onClick={() => { setOpen(true); setSent(false); setError(""); }}
        data-testid="button-help"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          margin: "8px auto 0",
          width: "fit-content",
          background: "#1f2937",
          color: "#fff",
          border: "none",
          borderRadius: "999px",
          padding: "5px 12px",
          fontSize: "11px",
          fontWeight: 600,
          cursor: "pointer",
          boxShadow: "0 2px 8px rgba(0,0,0,0.20)",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ fontSize: "13px" }}>🧑‍💻</span>
        Besoin d&apos;aide ?
        <span style={{ fontSize: "10px", opacity: 0.7 }}>↗</span>
      </button>

      {open && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 10000,
            background: "rgba(0,0,0,0.55)",
            display: "flex", alignItems: "flex-end", justifyContent: "center",
            padding: "0 0 0 0",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "20px 20px 0 0",
              width: "100%",
              maxWidth: "480px",
              maxHeight: "90vh",
              overflowY: "auto",
              padding: "24px 20px 32px",
              boxShadow: "0 -4px 30px rgba(0,0,0,0.15)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div>
                <p style={{ fontSize: "17px", fontWeight: 700, color: "#111827", margin: 0 }}>Besoin d&apos;aide ?</p>
                <p style={{ fontSize: "12px", color: "#6b7280", marginTop: "2px" }}>Notre équipe vous répond rapidement</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "#f3f4f6", border: "none", borderRadius: "50%", width: "32px", height: "32px", cursor: "pointer", fontSize: "16px", color: "#374151" }}
                data-testid="button-help-close"
              >×</button>
            </div>

            {sent ? (
              <div style={{ textAlign: "center", padding: "24px 0" }}>
                <div style={{ fontSize: "40px", marginBottom: "8px" }}>✅</div>
                <p style={{ fontWeight: 700, color: "#111827", fontSize: "15px" }}>Message envoyé !</p>
                <p style={{ color: "#6b7280", fontSize: "13px", marginTop: "4px" }}>Nous vous répondrons dès que possible.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "4px" }}>
                    Nom <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <input
                    className={inp}
                    placeholder="Votre nom"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    data-testid="input-help-name"
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "4px" }}>
                    Email <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <input
                    className={inp}
                    type="email"
                    placeholder="votre@email.com"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    data-testid="input-help-email"
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "4px" }}>
                    Numéro WhatsApp <span style={{ color: "#9ca3af", fontWeight: 400 }}>(optionnel)</span>
                  </label>
                  <input
                    className={inp}
                    placeholder="+229 00 00 00 00"
                    value={form.whatsapp}
                    onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))}
                    data-testid="input-help-whatsapp"
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "4px" }}>
                    Message <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <textarea
                    className={inp}
                    rows={4}
                    placeholder="Décrivez votre problème..."
                    value={form.message}
                    onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                    style={{ resize: "none" }}
                    data-testid="input-help-message"
                  />
                </div>

                {error && (
                  <p style={{ color: "#ef4444", fontSize: "12px", margin: 0 }}>{error}</p>
                )}

                <button
                  type="submit"
                  disabled={sending}
                  data-testid="button-help-submit"
                  style={{
                    background: sending ? "#9ca3af" : "#00b050",
                    color: "#fff",
                    border: "none",
                    borderRadius: "10px",
                    padding: "12px",
                    fontSize: "14px",
                    fontWeight: 700,
                    cursor: sending ? "not-allowed" : "pointer",
                    marginTop: "4px",
                  }}
                >
                  {sending ? "Envoi en cours..." : "Envoyer le message"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
