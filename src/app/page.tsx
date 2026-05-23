import Store from "./components/Store";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#09090b] text-zinc-50 font-sans selection:bg-indigo-500/30 overflow-x-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-[#09090b] to-[#09090b] -z-10" />
      <Store />
    </main>
  );
}
