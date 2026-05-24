export default function RestrictedPage() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: "#f0f4ff" }}
    >
      <div
        className="w-full max-w-sm bg-white rounded-3xl shadow-sm flex flex-col items-center px-8 py-10"
        style={{ border: "1px solid #e8ecf0" }}
      >
        <img
          src="/404-illustration.png"
          alt=""
          className="w-52 h-52 object-contain mb-6"
          draggable={false}
        />

        <h1
          className="text-xl font-extrabold text-center mb-4"
          style={{ color: "#1a1a1a" }}
          data-testid="text-restricted-title"
        >
          Ooups, La page n'a pas été trouvée
        </h1>

        <p
          className="text-sm text-center leading-relaxed mb-8"
          style={{ color: "#666" }}
          data-testid="text-restricted-message"
        >
          Nous sommes vraiment désolés pour ce désagrément. Il semble que vous
          essayez d'accéder à une page qui a été supprimée ou qui n'a jamais
          existé.
        </p>

        <button
          onClick={() => window.history.back()}
          className="w-full py-3.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 active:opacity-80"
          style={{ background: "#2563eb" }}
          data-testid="button-go-back"
        >
          Revenir à la page précédente
        </button>
      </div>
    </div>
  );
}
