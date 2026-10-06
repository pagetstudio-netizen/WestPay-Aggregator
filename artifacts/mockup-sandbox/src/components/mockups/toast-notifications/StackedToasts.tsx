import { CircleHelp } from "lucide-react";
import "./_group.css";

const notification =
  "Veuillez saisir vos informations de connexion lorsque vous y êtes invité.";

export function StackedToasts() {
  return (
    <main className="min-h-screen bg-[#293349] p-4 sm:p-6">
      <style>{`
        @keyframes toastEnter {
          from { opacity: 0; transform: translateY(-12px) scale(0.985); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      <div className="ml-auto flex w-full max-w-[460px] flex-col gap-2.5">
        {[0, 1].map((item) => (
          <article
            key={item}
            role="status"
            className="flex min-h-[100px] items-center gap-4 rounded-[12px] border border-[#f4e7d0] bg-[#fff7e8] px-4 py-4 shadow-[0_5px_16px_rgba(0,0,0,0.14)] sm:px-5"
            style={{
              animation: "toastEnter 260ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
              animationDelay: `${item * 90}ms`,
            }}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center text-[#e1c31a]">
              <CircleHelp className="h-9 w-9" strokeWidth={1.8} />
            </span>
            <p className="text-[15px] leading-[1.45] text-[#806d50] sm:text-[16px]">
              {notification}
            </p>
          </article>
        ))}
      </div>
    </main>
  );
}
