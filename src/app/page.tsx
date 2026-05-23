import Store from "./components/Store";

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-cyan-50 font-sans selection:bg-cyan-500/30 overflow-x-hidden antialiased relative">
      <div className="fixed inset-0 bg-[linear-gradient(to_right,#082f49_1px,transparent_1px),linear-gradient(to_bottom,#082f49_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-20 z-0 pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(6,182,212,0.15),transparent_50%)] z-0 pointer-events-none" />
      <div className="relative z-10">
        <Store />
      </div>
    </main>
  );
}
