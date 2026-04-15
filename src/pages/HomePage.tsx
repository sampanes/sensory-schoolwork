import { Link } from "react-router-dom";

type ActivityCard = {
  title: string;
  description: string;
  to?: string;
  accent: string;
  badge?: string;
};

const activities: ActivityCard[] = [
  {
    title: "Handwriting math",
    description: "Addition and subtraction with digit recognition.",
    to: "/math",
    accent: "from-cyan-500 via-sky-500 to-indigo-600",
  },
  {
    title: "Handwriting spelling",
    description: "Letter-by-letter spelling with speech and checks.",
    to: "/spelling",
    accent: "from-fuchsia-500 via-violet-500 to-indigo-600",
  },
  {
    title: "A-maze-ing sentences",
    description: "Trace a path through the word grid to build the hidden sentence.",
    to: "/sentences",
    accent: "from-amber-500 via-orange-500 to-rose-600",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_top,_rgba(167,139,250,0.18),_transparent_40%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_45%,_#f8fafc_100%)] text-slate-900">
      <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-4 px-4 pb-4 pt-4 sm:max-w-xl sm:px-6 sm:pb-6 sm:pt-6">
        <header className="rounded-[1.75rem] border border-white/70 bg-white/90 p-5 shadow-[0_24px_80px_-48px_rgba(76,29,149,0.45)] backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-violet-600">Grade 1</p>
          <h1 className="mt-1.5 text-[1.75rem] font-black tracking-tight text-slate-950">Practice home</h1>
          <p className="mt-2 text-sm leading-snug text-slate-600">
            Pick an activity. For presets and options, use{" "}
            <Link to="/configurations" className="font-semibold text-violet-700 underline-offset-2 hover:underline">
              Configurations
            </Link>
            .
          </p>
        </header>

        <section className="grid gap-3">
          {activities.map((item) => {
            const inner = (
              <>
                <div
                  className={`h-1.5 w-full rounded-full bg-gradient-to-r ${item.accent} ${item.to ? "opacity-90" : "opacity-50"}`}
                  aria-hidden
                />
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-950">{item.title}</h2>
                    <p className="mt-1 text-sm leading-snug text-slate-600">{item.description}</p>
                  </div>
                  {item.badge ? (
                    <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
                      {item.badge}
                    </span>
                  ) : null}
                </div>
                {item.to ? (
                  <span className="mt-1 inline-flex text-sm font-bold text-violet-700">Open -&gt;</span>
                ) : (
                  <span className="mt-1 text-sm font-semibold text-slate-400">Not linked yet</span>
                )}
              </>
            );

            const cardClass =
              "block rounded-[1.5rem] border border-white/70 bg-white/90 p-4 text-left shadow-[0_20px_70px_-45px_rgba(15,23,42,0.35)] backdrop-blur transition hover:-translate-y-0.5 hover:shadow-[0_28px_80px_-40px_rgba(76,29,149,0.35)]";

            return item.to ? (
              <Link key={item.title} to={item.to} className={cardClass}>
                {inner}
              </Link>
            ) : (
              <div key={item.title} className={`${cardClass} cursor-not-allowed opacity-80`}>
                {inner}
              </div>
            );
          })}
        </section>

        <footer className="mt-auto rounded-2xl border border-slate-200 bg-white/80 px-4 py-2 text-center text-[11px] leading-tight text-slate-500">
          Built for a first grader to be used on a phone or tablet with a pen.
        </footer>
      </div>
    </div>
  );
}
