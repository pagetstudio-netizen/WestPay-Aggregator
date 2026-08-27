export default function Bank2UnavailablePage() {
  return (
    <main
      className="min-h-screen w-full flex items-center justify-center p-6"
      style={{ background: "#f0f4ff" }}
    >
      <section
        className="w-full max-w-sm bg-white rounded-3xl shadow-sm flex flex-col items-center px-8 py-10"
        style={{ border: "1px solid #e8ecf0" }}
        aria-labelledby="bank2-unavailable-title"
      >
        <img
          src="/404-illustration.png"
          alt="404"
          className="w-52 h-52 object-contain mb-6"
          draggable={false}
        />

        <div
          className="text-6xl font-extrabold tracking-tight mb-3"
          style={{ color: "#ef765c" }}
          aria-hidden="true"
        >
          404
        </div>

        <h1
          id="bank2-unavailable-title"
          className="text-xl font-extrabold text-center mb-3"
          style={{ color: "#1a1a1a" }}
        >
          RobotPay 页面不可用
        </h1>

        <p
          className="text-sm text-center leading-relaxed"
          style={{ color: "#666" }}
        >
          此页面当前不可用。
        </p>
      </section>
    </main>
  );
}