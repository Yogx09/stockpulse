import Store from "./components/Store";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-pink-500/30 overflow-x-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-pink-100 via-slate-50 to-slate-50 -z-10" />
      <Store />
    </main>
  );
}
