"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { formatDistanceToNowStrict, differenceInSeconds, format } from "date-fns";
import { 
  Package, Calendar, Building2, BarChart2, FileText, Settings, Search, Bell, Moon, LogOut,
  MoreVertical, Activity, ChevronDown, CheckCircle2, AlertCircle, Loader2, X, Clock,
  Plus, CalendarDays, Timer, CheckCircle, XCircle, ChevronRight, ChevronLeft, Maximize2, AlertTriangle
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type Product = {
  id: string;
  name: string;
  description: string;
  image: string;
  inventories: {
    id: string;
    warehouseId: string;
    totalStock: number;
    reservedStock: number;
    availableStock: number;
    warehouse: {
      name: string;
      location: string;
    };
  }[];
};

type Reservation = {
  id: string;
  inventoryId: string;
  quantity: number;
  status: string;
  expiresAt: string;
  createdAt: string;
  productName?: string;
  warehouseName?: string;
  image?: string;
  isMock?: boolean;
};

// Expanded mock data for the reservations table
const MOCK_RESERVATIONS: Reservation[] = [
  { id: "RES-2024-000341", productName: "MacBook Pro M4", warehouseName: "Hyderabad Warehouse", quantity: 1, status: "CONFIRMED", expiresAt: new Date(Date.now() - 100000).toISOString(), createdAt: new Date(Date.now() - 700000).toISOString(), isMock: true, image: "https://images.unsplash.com/photo-1517336714739-489689fd1ca8" },
  { id: "RES-2024-000340", productName: "Sony Alpha a7 IV", warehouseName: "Mumbai Warehouse", quantity: 1, status: "PENDING", expiresAt: new Date(Date.now() + 135000).toISOString(), createdAt: new Date(Date.now() - 465000).toISOString(), isMock: true, image: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32" },
  { id: "RES-2024-000339", productName: "Logitech MX Master 3S", warehouseName: "Delhi Warehouse", quantity: 1, status: "EXPIRED", expiresAt: new Date(Date.now() - 500000).toISOString(), createdAt: new Date(Date.now() - 1100000).toISOString(), isMock: true, image: "https://images.unsplash.com/photo-1615663245857-ac93bb7c3c9c" },
  { id: "RES-2024-000338", productName: "iPhone 15 Pro", warehouseName: "Bangalore Warehouse", quantity: 2, status: "ACTIVE", expiresAt: new Date(Date.now() + 514000).toISOString(), createdAt: new Date(Date.now() - 86000).toISOString(), isMock: true, image: "https://images.unsplash.com/photo-1695048133142-1a20484d2569" },
  { id: "RES-2024-000337", productName: "MacBook Pro M4", warehouseName: "Hyderabad Warehouse", quantity: 2, status: "PENDING", expiresAt: new Date(Date.now() + 402000).toISOString(), createdAt: new Date(Date.now() - 198000).toISOString(), isMock: true, image: "https://images.unsplash.com/photo-1517336714739-489689fd1ca8" },
  { id: "RES-2024-000336", productName: "Sony Alpha a7 IV", warehouseName: "Mumbai Warehouse", quantity: 1, status: "RELEASED", expiresAt: new Date(Date.now() - 800000).toISOString(), createdAt: new Date(Date.now() - 1400000).toISOString(), isMock: true, image: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32" },
  { id: "RES-2024-000335", productName: "PlayStation 5 Pro", warehouseName: "Delhi Warehouse", quantity: 1, status: "ACTIVE", expiresAt: new Date(Date.now() + 680000).toISOString(), createdAt: new Date(Date.now() - 20000).toISOString(), isMock: true, image: "https://images.unsplash.com/photo-1606813907291-d86efa9b94db" },
];

export default function Store() {
  const [currentView, setCurrentView] = useState<"Dashboard" | "Reservations">("Dashboard");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeReservation, setActiveReservation] = useState<Reservation | null>(null);
  const [selectedRes, setSelectedRes] = useState<Reservation | null>(null);
  
  const [toast, setToast] = useState<{ msg: string, isError: boolean, id: number } | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>("");
  const [timerPercent, setTimerPercent] = useState<number>(100);
  const [processing, setProcessing] = useState<string | null>(null);

  const showMessage = (msg: string, isError: boolean) => {
    setToast({ msg, isError, id: Date.now() });
    setTimeout(() => setToast(null), 5000);
  };

  const fetchProducts = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/products");
      if (res.ok) setProducts(await res.json());
    } catch {
      if (!silent) showMessage("Error fetching data", true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchProducts();
    const interval = setInterval(() => fetchProducts(true), 5000);
    return () => clearInterval(interval);
  }, [fetchProducts]);

  // Global timer for the active real reservation (or selected mock reservation)
  useEffect(() => {
    const target = selectedRes || activeReservation;
    if (!target) return;
    
    const TOTAL_SECONDS = 600;
    
    const interval = setInterval(() => {
      const expiry = new Date(target.expiresAt);
      const now = new Date();
      
      if (expiry <= now || target.status === "EXPIRED" || target.status === "CONFIRMED" || target.status === "RELEASED") {
        setTimeLeft("00:00");
        setTimerPercent(0);
        clearInterval(interval);
      } else {
        const diff = differenceInSeconds(expiry, now);
        const m = Math.floor(diff / 60).toString().padStart(2, '0');
        const s = (diff % 60).toString().padStart(2, '0');
        setTimeLeft(`${m}:${s}`);
        setTimerPercent(Math.max(0, Math.min(100, (diff / TOTAL_SECONDS) * 100)));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [activeReservation, selectedRes]);

  const handleReserve = async (product: Product, inventoryId: string, maxStock: number) => {
    if (maxStock <= 0) return;
    setProcessing(inventoryId);
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ inventoryId, quantity: 1 }),
      });

      const data = await res.json();
      if (!res.ok) {
        showMessage(data.error || "Reservation failed", true);
        fetchProducts(true);
      } else {
        const inv = product.inventories.find(i => i.id === inventoryId);
        const newRes = {
          ...data.reservation,
          productName: product.name,
          warehouseName: inv?.warehouse.name || "Main Warehouse",
          image: product.image,
          createdAt: new Date().toISOString()
        };
        setActiveReservation(newRes);
        setSelectedRes(newRes);
        setCurrentView("Reservations");
        window.scrollTo({ top: 0, behavior: "smooth" });
        showMessage("Reservation created.", false);
      }
    } catch {
      showMessage("Network error", true);
    } finally {
      setProcessing(null);
    }
  };

  const handleConfirm = async () => {
    const target = selectedRes || activeReservation;
    if (!target || target.isMock) return showMessage("Cannot interact with mock data.", true);
    setProcessing("confirm");
    try {
      const res = await fetch(`/api/reservations/${target.id}/confirm`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      if (res.ok) {
        showMessage("Order Confirmed Successfully!", false);
        const updated = { ...target, status: "CONFIRMED" };
        setActiveReservation(null);
        setSelectedRes(updated);
      } else {
        showMessage("Confirmation Failed", true);
      }
      fetchProducts(true);
    } finally {
      setProcessing(null);
    }
  };

  const handleRelease = async () => {
    const target = selectedRes || activeReservation;
    if (!target || target.isMock) return showMessage("Cannot interact with mock data.", true);
    setProcessing("release");
    try {
      await fetch(`/api/reservations/${target.id}/release`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      showMessage("Reservation released.", false);
      const updated = { ...target, status: "RELEASED" };
      setActiveReservation(null);
      setSelectedRes(updated);
      fetchProducts(true);
    } finally {
      setProcessing(null);
    }
  };

  const stats = useMemo(() => {
    let globalStock = 0;
    let globalReserved = 0;
    const warehouses = new Set<string>();

    products.forEach(p => {
      p.inventories.forEach(inv => {
        globalStock += inv.totalStock;
        globalReserved += inv.reservedStock;
        warehouses.add(inv.warehouseId);
      });
    });

    return { productCount: products.length, warehouseCount: warehouses.size, globalStock, activeRes: globalReserved };
  }, [products]);

  const tableData = useMemo(() => {
    return products.map(p => {
      const totalStock = p.inventories.reduce((sum, inv) => sum + inv.totalStock, 0);
      const reserved = p.inventories.reduce((sum, inv) => sum + inv.reservedStock, 0);
      const available = p.inventories.reduce((sum, inv) => sum + inv.availableStock, 0);
      const activeWarehouses = p.inventories.filter(inv => inv.totalStock > 0).length;
      const bestInv = [...p.inventories].sort((a,b) => b.availableStock - a.availableStock)[0];
      return { ...p, totalStock, reserved, available, activeWarehouses, bestInv };
    });
  }, [products]);

  const allReservations = useMemo(() => {
    const list = [...MOCK_RESERVATIONS];
    if (activeReservation) list.unshift(activeReservation);
    return list;
  }, [activeReservation]);

  const displayRes = selectedRes || activeReservation || MOCK_RESERVATIONS[0];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0b0e14]">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  const renderSidebar = () => (
    <aside className="w-64 bg-[#11151d] border-r border-slate-800 flex-col hidden md:flex h-full">
      <div className="h-20 flex items-center px-6 gap-3 flex-shrink-0">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
          <Activity className="w-5 h-5 text-white" />
        </div>
        <span className="text-xl font-bold text-white tracking-tight">StockPulse</span>
      </div>

      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
        <button onClick={() => setCurrentView("Dashboard")} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${currentView === "Dashboard" ? "bg-blue-600 text-white shadow-md shadow-blue-500/10" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"}`}>
          <BarChart2 className="w-5 h-5" /> Dashboard
        </button>
        <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors font-medium">
          <Package className="w-5 h-5" /> Products
        </button>
        <button onClick={() => setCurrentView("Reservations")} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${currentView === "Reservations" ? "bg-[#1f1b3b] text-indigo-400 border border-indigo-500/20" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"}`}>
          <CalendarDays className="w-5 h-5" /> Reservations
        </button>
        <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors font-medium">
          <Building2 className="w-5 h-5" /> Warehouses
        </button>
        <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors font-medium">
          <Activity className="w-5 h-5" /> Analytics
        </button>
        <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors font-medium">
          <FileText className="w-5 h-5" /> Reports
        </button>
        <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors font-medium">
          <AlertCircle className="w-5 h-5" /> Alerts
        </button>
        <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors font-medium">
          <Settings className="w-5 h-5" /> Settings
        </button>
      </nav>

      <div className="p-4 border-t border-slate-800 flex-shrink-0">
        <div className="bg-[#161b22] rounded-xl p-4 border border-slate-800/60 mb-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
            <span className="text-sm font-semibold text-slate-200">System Status</span>
          </div>
          <span className="text-xs text-emerald-500/80 font-medium">All Systems Operational</span>
        </div>

        <div className="flex items-center gap-3 px-2 py-2 cursor-pointer hover:bg-slate-800/50 rounded-xl transition">
          <div className="w-10 h-10 rounded-full bg-slate-700 overflow-hidden flex-shrink-0">
            <img src="https://i.pravatar.cc/150?u=a042581f4e29026704d" alt="User" className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-white truncate">Arjun Patel</div>
            <div className="text-[11px] text-slate-500 truncate">Administrator</div>
          </div>
          <ChevronDown className="w-4 h-4 text-slate-500" />
        </div>
      </div>
    </aside>
  );

  const renderTopbar = () => (
    <header className="h-20 flex items-center justify-between px-8 bg-[#0b0e14]/80 backdrop-blur-md sticky top-0 z-20 border-b border-slate-800/50">
      <div className="flex items-center md:hidden">
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center mr-3">
          <Activity className="w-5 h-5 text-white" />
        </div>
        <span className="text-xl font-bold text-white">StockPulse</span>
      </div>

      <div className="hidden md:flex flex-1 items-center gap-2 text-sm text-slate-500 font-medium">
        <span className="cursor-pointer hover:text-slate-300">Home</span>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-slate-300">{currentView}</span>
      </div>

      <div className="flex items-center gap-6 flex-1 justify-end">
        <div className="relative group w-full max-w-sm hidden lg:block">
          <Search className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
          <input 
            type="text" 
            placeholder="Search products, reservations, warehouses..." 
            className="w-full bg-[#161b22] border border-slate-800 rounded-full pl-11 pr-16 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all placeholder-slate-500"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <kbd className="text-[10px] font-medium bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">Ctrl</kbd>
            <kbd className="text-[10px] font-medium bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">K</kbd>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button className="relative text-slate-400 hover:text-white transition-colors">
            <Bell className="w-5 h-5" />
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-[9px] font-bold text-white rounded-full flex items-center justify-center border-2 border-[#0b0e14]">3</span>
          </button>
          <button className="text-slate-400 hover:text-white transition-colors">
            <Moon className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-[#0b0e14] text-slate-300 font-sans selection:bg-indigo-500/30">
      {renderSidebar()}

      <main className="flex-1 flex flex-col overflow-hidden relative">
        {renderTopbar()}

        <div className="flex-1 overflow-y-auto p-4 md:p-8 pt-4 pb-24 scroll-smooth">
          <div className="max-w-[1600px] mx-auto space-y-6">
            
            {currentView === "Dashboard" && (
              <AnimatePresence mode="wait">
                <motion.div key="dashboard" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
                  {/* Dashboard Header */}
                  <div className="mb-8">
                    <h1 className="text-3xl font-bold text-white mb-2">Welcome back, Arjun! 👋</h1>
                    <p className="text-slate-400">Here&apos;s what&apos;s happening with your inventory today.</p>
                  </div>

                  {/* Stat Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-[#161b22] border border-slate-800/60 rounded-2xl p-6 flex items-center gap-5 shadow-sm">
                      <div className="w-14 h-14 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/20 flex-shrink-0">
                        <Package className="w-7 h-7 text-white" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-400 mb-1">Total Products</div>
                        <div className="text-2xl font-bold text-white">{stats.productCount}</div>
                        <div className="text-xs text-emerald-500 font-medium mt-1">↑ 12.5% <span className="text-slate-500 font-normal">from last month</span></div>
                      </div>
                    </div>

                    <div className="bg-[#161b22] border border-slate-800/60 rounded-2xl p-6 flex items-center gap-5 shadow-sm">
                      <div className="w-14 h-14 rounded-xl bg-purple-600 flex items-center justify-center shadow-lg shadow-purple-600/20 flex-shrink-0">
                        <Calendar className="w-7 h-7 text-white" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-400 mb-1">Active Reservations</div>
                        <div className="text-2xl font-bold text-white">{stats.activeRes}</div>
                        <div className="text-xs text-emerald-500 font-medium mt-1">↑ 18.2% <span className="text-slate-500 font-normal">from last month</span></div>
                      </div>
                    </div>

                    <div className="bg-[#161b22] border border-slate-800/60 rounded-2xl p-6 flex items-center gap-5 shadow-sm">
                      <div className="w-14 h-14 rounded-xl bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-600/20 flex-shrink-0">
                        <Building2 className="w-7 h-7 text-white" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-400 mb-1">Warehouses</div>
                        <div className="text-2xl font-bold text-white">{stats.warehouseCount}</div>
                        <div className="text-xs text-slate-500 font-normal mt-1">No change from last month</div>
                      </div>
                    </div>

                    <div className="bg-[#161b22] border border-slate-800/60 rounded-2xl p-6 flex items-center gap-5 shadow-sm">
                      <div className="w-14 h-14 rounded-xl bg-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/20 flex-shrink-0">
                        <BarChart2 className="w-7 h-7 text-white" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-400 mb-1">Total Inventory</div>
                        <div className="text-2xl font-bold text-white">{(stats.globalStock).toLocaleString()}</div>
                        <div className="text-xs text-emerald-500 font-medium mt-1">↑ 8.4% <span className="text-slate-500 font-normal">from last month</span></div>
                      </div>
                    </div>
                  </div>

                  {/* Middle Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 bg-[#161b22] border border-slate-800/60 rounded-2xl p-6 shadow-sm flex flex-col min-h-[400px]">
                      <div className="flex justify-between items-center mb-6">
                        <h2 className="text-lg font-bold text-white">Inventory Overview</h2>
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 rounded-lg border border-slate-700/50 text-xs font-medium text-slate-300 cursor-pointer hover:bg-slate-800 transition">
                          <Calendar className="w-3.5 h-3.5" /> This Week <ChevronDown className="w-3.5 h-3.5 ml-1" />
                        </div>
                      </div>
                      <div className="flex-1 relative w-full flex items-end pt-10">
                        <div className="absolute inset-0 flex flex-col justify-between pb-8 pt-4">
                          {[40, 30, 20, 10, 0].map(val => (
                            <div key={val} className="w-full flex items-center gap-4">
                              <span className="text-[10px] text-slate-500 w-6 text-right">{val ? `${val}K` : '0'}</span>
                              <div className="flex-1 h-[1px] bg-slate-800/50" />
                            </div>
                          ))}
                        </div>
                        <div className="absolute inset-0 left-10 pb-8 pt-4">
                          <svg viewBox="0 0 1000 300" preserveAspectRatio="none" className="w-full h-full overflow-visible">
                            <defs>
                              <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
                                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                              </linearGradient>
                            </defs>
                            <path d="M0,180 C100,120 200,80 300,140 C400,200 450,110 500,115 C550,120 600,60 700,80 C800,100 850,130 900,140 C950,150 980,110 1000,90 L1000,300 L0,300 Z" fill="url(#chartGradient)" />
                            <path d="M0,180 C100,120 200,80 300,140 C400,200 450,110 500,115 C550,120 600,60 700,80 C800,100 850,130 900,140 C950,150 980,110 1000,90" fill="none" stroke="#3b82f6" strokeWidth="3" />
                            <circle cx="500" cy="115" r="4" fill="#60a5fa" stroke="#fff" strokeWidth="2" className="drop-shadow-lg" />
                          </svg>
                          <div className="absolute top-[80px] left-[45%] -translate-x-1/2 bg-[#161b22] border border-slate-700 p-3 rounded-xl shadow-xl z-10 flex flex-col items-center">
                            <span className="text-[10px] text-slate-400 font-medium mb-1">Thursday</span>
                            <span className="text-sm font-bold text-white tracking-tight">{(stats.globalStock).toLocaleString()} <span className="text-[10px] text-slate-500 font-normal">items</span></span>
                          </div>
                        </div>
                        <div className="absolute bottom-0 left-10 right-0 flex justify-between text-[11px] font-medium text-slate-500">
                          <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
                        </div>
                      </div>
                    </div>

                    {/* Donut Chart */}
                    <div className="bg-[#161b22] border border-slate-800/60 rounded-2xl p-6 shadow-sm flex flex-col">
                      <h2 className="text-lg font-bold text-white mb-6">Warehouse Distribution</h2>
                      <div className="flex-1 flex flex-col items-center justify-center">
                        <div className="relative w-48 h-48 mb-6">
                          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90 filter drop-shadow-md">
                            <circle cx="50" cy="50" r="40" fill="transparent" stroke="#1e293b" strokeWidth="20" />
                            <circle cx="50" cy="50" r="40" fill="transparent" stroke="#3b82f6" strokeWidth="20" strokeDasharray="251.2" strokeDashoffset="0" className="opacity-90" />
                            <circle cx="50" cy="50" r="40" fill="transparent" stroke="#0ea5e9" strokeWidth="20" strokeDasharray="251.2" strokeDashoffset="65" className="opacity-90" />
                            <circle cx="50" cy="50" r="40" fill="transparent" stroke="#10b981" strokeWidth="20" strokeDasharray="251.2" strokeDashoffset="120" className="opacity-90" />
                            <circle cx="50" cy="50" r="40" fill="transparent" stroke="#f59e0b" strokeWidth="20" strokeDasharray="251.2" strokeDashoffset="170" className="opacity-90" />
                            <circle cx="50" cy="50" r="40" fill="transparent" stroke="#ef4444" strokeWidth="20" strokeDasharray="251.2" strokeDashoffset="210" className="opacity-90" />
                            <circle cx="50" cy="50" r="40" fill="transparent" stroke="#8b5cf6" strokeWidth="20" strokeDasharray="251.2" strokeDashoffset="240" className="opacity-90" />
                          </svg>
                          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#161b22] rounded-full w-32 h-32 m-auto border-[10px] border-[#161b22]">
                            <span className="text-xl font-bold text-white tracking-tight">{(stats.globalStock).toLocaleString()}</span>
                            <span className="text-[10px] text-slate-500 font-medium">Total Items</span>
                          </div>
                        </div>
                        <div className="w-full space-y-2.5">
                          {[
                            { name: "Bangalore", val: "26.6%", color: "bg-blue-500" },
                            { name: "Hyderabad", val: "21.7%", color: "bg-sky-500" },
                            { name: "Mumbai", val: "19.8%", color: "bg-emerald-500" },
                            { name: "Delhi", val: "16.8%", color: "bg-amber-500" }
                          ].map(w => (
                            <div key={w.name} className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${w.color}`} />
                                <span className="text-slate-300 font-medium">{w.name}</span>
                              </div>
                              <span className="text-slate-400 font-mono">{w.val}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Top Products Table */}
                  <div className="bg-[#161b22] border border-slate-800/60 rounded-2xl p-6 shadow-sm overflow-hidden flex flex-col">
                    <div className="flex justify-between items-center mb-6">
                      <h2 className="text-lg font-bold text-white">Top Products</h2>
                      <button className="text-xs font-semibold text-slate-300 hover:text-white bg-slate-800/50 px-3 py-1.5 rounded-lg border border-slate-700/50 hover:bg-slate-800 transition">View all</button>
                    </div>
                    
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse min-w-[600px]">
                        <thead>
                          <tr className="border-b border-slate-800">
                            <th className="pb-3 text-xs font-semibold text-slate-400 font-sans tracking-wide">Product</th>
                            <th className="pb-3 text-xs font-semibold text-slate-400 font-sans tracking-wide text-right">Total Stock</th>
                            <th className="pb-3 text-xs font-semibold text-slate-400 font-sans tracking-wide text-right">Reserved</th>
                            <th className="pb-3 text-xs font-semibold text-slate-400 font-sans tracking-wide text-right">Available</th>
                            <th className="pb-3 text-xs font-semibold text-slate-400 font-sans tracking-wide text-center">Status</th>
                            <th className="pb-3 w-10"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {tableData.slice(0,5).map((p) => {
                            const inStock = p.available > 0;
                            return (
                              <tr key={p.id} className="hover:bg-slate-800/30 transition-colors group">
                                <td className="py-4">
                                  <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 overflow-hidden flex-shrink-0">
                                      {p.image && <img src={p.image} alt={p.name} className="w-full h-full object-cover" />}
                                    </div>
                                    <div>
                                      <div className="text-sm font-semibold text-slate-200">{p.name}</div>
                                      <div className="text-[11px] text-slate-500 truncate max-w-[200px]">{p.description}</div>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-4 text-right font-semibold text-white text-sm">{p.totalStock.toLocaleString()}</td>
                                <td className="py-4 text-right font-semibold text-red-400 text-sm">{p.reserved.toLocaleString()}</td>
                                <td className="py-4 text-right font-semibold text-emerald-400 text-sm">{p.available.toLocaleString()}</td>
                                <td className="py-4 text-center">
                                  <span className={`inline-flex items-center px-2 py-1 rounded text-[9px] font-bold tracking-wider border ${
                                    inStock ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-red-500/10 text-red-500 border-red-500/20"
                                  }`}>
                                    {inStock ? "IN STOCK" : "DEPLETED"}
                                  </span>
                                </td>
                                <td className="py-4 text-right relative">
                                   {inStock && p.bestInv && (
                                      <button 
                                        onClick={() => handleReserve(p, p.bestInv.id, p.bestInv.availableStock)}
                                        disabled={processing === p.bestInv.id}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3 py-1.5 rounded flex items-center justify-center w-20 shadow-md absolute top-1/2 -translate-y-1/2 right-2"
                                      >
                                        {processing === p.bestInv.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Reserve"}
                                      </button>
                                   )}
                                  <button className={`text-slate-500 hover:text-white p-1 rounded-md hover:bg-slate-700 transition ${inStock ? 'group-hover:opacity-0' : ''}`}>
                                    <MoreVertical className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            )}

            {currentView === "Reservations" && (
              <AnimatePresence mode="wait">
                <motion.div key="reservations" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
                  {/* Reservations Header */}
                  <div className="flex justify-between items-start md:items-center mb-8">
                    <div>
                      <h1 className="text-3xl font-bold text-white mb-2">Reservations</h1>
                      <p className="text-slate-400">Manage and track all inventory reservations in real-time.</p>
                    </div>
                    <button onClick={() => setCurrentView("Dashboard")} className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2 px-4 rounded-xl flex items-center gap-2 shadow-lg shadow-indigo-500/20 transition-all">
                      <Plus className="w-4 h-4" /> New Reservation
                    </button>
                  </div>

                  {/* Res Stat Cards */}
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                    {[
                      { title: "Total Reservations", val: "342", color: "bg-indigo-600", icon: CalendarDays, change: "↑ 18.2%", type: "pos" },
                      { title: "Active Reservations", val: "126", color: "bg-blue-600", icon: Clock, change: "↑ 12.5%", type: "pos" },
                      { title: "Expiring Soon", val: "18", color: "bg-orange-500", icon: Timer, change: "Within next 30 minutes", type: "warn" },
                      { title: "Confirmed", val: "156", color: "bg-emerald-600", icon: CheckCircle, change: "↑ 8.4%", type: "pos" },
                      { title: "Expired / Released", val: "42", color: "bg-red-500", icon: XCircle, change: "↑ 5.3%", type: "neg" },
                    ].map((s, i) => (
                      <div key={i} className="bg-[#161b22] border border-slate-800/60 rounded-2xl p-4 shadow-sm flex flex-col">
                        <div className="flex items-center gap-3 mb-3">
                          <div className={`w-10 h-10 rounded-lg ${s.color} flex items-center justify-center shadow-lg`}>
                            <s.icon className="w-5 h-5 text-white" />
                          </div>
                          <div className="text-xs font-semibold text-slate-400 leading-tight">{s.title}</div>
                        </div>
                        <div className="text-2xl font-bold text-white mb-1">{s.val}</div>
                        <div className={`text-[10px] font-medium ${s.type === 'pos' ? 'text-emerald-500' : s.type === 'warn' ? 'text-orange-500' : 'text-red-500'}`}>
                          {s.change}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[700px]">
                    {/* All Reservations Table (Left) */}
                    <div className="lg:col-span-2 bg-[#161b22] border border-slate-800/60 rounded-2xl p-6 shadow-sm flex flex-col h-full overflow-hidden">
                      <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
                        <h2 className="text-lg font-bold text-white">All Reservations</h2>
                        <div className="flex items-center gap-3">
                           <button className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 rounded-lg border border-slate-700/50 text-xs font-medium text-slate-300">All Warehouses <ChevronDown className="w-3.5 h-3.5" /></button>
                           <button className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 rounded-lg border border-slate-700/50 text-xs font-medium text-slate-300">Status <ChevronDown className="w-3.5 h-3.5" /></button>
                           <button className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 rounded-lg border border-slate-700/50 text-xs font-medium text-slate-300">Date Range <Calendar className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>

                      <div className="flex gap-6 mb-4 text-sm font-medium border-b border-slate-800/50">
                         <div className="text-indigo-400 border-b-2 border-indigo-500 pb-3">All</div>
                         <div className="text-slate-500 hover:text-slate-300 cursor-pointer pb-3">Active</div>
                         <div className="text-slate-500 hover:text-slate-300 cursor-pointer pb-3">Pending</div>
                         <div className="text-slate-500 hover:text-slate-300 cursor-pointer pb-3">Expiring Soon</div>
                         <div className="text-slate-500 hover:text-slate-300 cursor-pointer pb-3">Confirmed</div>
                      </div>

                      <div className="flex-1 overflow-y-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-slate-800">
                              <th className="pb-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Reservation ID</th>
                              <th className="pb-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Product</th>
                              <th className="pb-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Warehouse</th>
                              <th className="pb-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider text-center">Qty</th>
                              <th className="pb-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider text-center">Status</th>
                              <th className="pb-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider text-right">Reserved At</th>
                              <th className="pb-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider text-right">Expires In</th>
                              <th className="pb-3 w-8"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/40">
                            {allReservations.map((res) => {
                              const isSelected = displayRes?.id === res.id;
                              return (
                                <tr key={res.id} onClick={() => setSelectedRes(res)} className={`cursor-pointer transition-colors ${isSelected ? 'bg-indigo-900/10' : 'hover:bg-slate-800/30'}`}>
                                  <td className="py-4 text-xs font-mono text-slate-400">{res.id}</td>
                                  <td className="py-4">
                                    <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 rounded-md bg-slate-800 overflow-hidden flex-shrink-0">
                                        {res.image && <img src={res.image} alt={res.productName} className="w-full h-full object-cover" />}
                                      </div>
                                      <div>
                                        <div className={`text-sm font-semibold truncate max-w-[120px] ${isSelected ? 'text-indigo-400' : 'text-slate-200'}`}>{res.productName}</div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-4 text-xs text-slate-400">{res.warehouseName}</td>
                                  <td className="py-4 text-center text-xs font-semibold text-white">{res.quantity}</td>
                                  <td className="py-4 text-center">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold tracking-wider border ${
                                      res.status === 'CONFIRMED' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                                      res.status === 'ACTIVE' || res.status === 'PENDING' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                                      res.status === 'EXPIRED' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                                      'bg-slate-500/10 text-blue-400 border-blue-500/20'
                                    }`}>
                                      {res.status}
                                    </span>
                                  </td>
                                  <td className="py-4 text-right text-xs text-slate-400">
                                    {format(new Date(res.createdAt), "MMM d, yyyy")} <br/>
                                    <span className="text-[10px] text-slate-500">{format(new Date(res.createdAt), "hh:mm a")}</span>
                                  </td>
                                  <td className="py-4 text-right text-xs">
                                     {res.status === 'ACTIVE' || res.status === 'PENDING' ? (
                                        <div className="text-amber-500 font-bold flex items-center justify-end gap-1"><Clock className="w-3 h-3" /> {res.id === activeReservation?.id ? timeLeft : '04:59'}</div>
                                     ) : (
                                        <div className="text-slate-600 font-bold">—</div>
                                     )}
                                  </td>
                                  <td className="py-4 text-right"><MoreVertical className="w-4 h-4 text-slate-500" /></td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                      
                      <div className="pt-4 border-t border-slate-800 flex justify-between items-center text-xs text-slate-500">
                        <span>Showing 1 to 8 of 342 reservations</span>
                        <div className="flex gap-1">
                           <button className="w-6 h-6 flex items-center justify-center rounded border border-slate-700"><ChevronLeft className="w-3 h-3" /></button>
                           <button className="w-6 h-6 flex items-center justify-center rounded bg-indigo-600 text-white">1</button>
                           <button className="w-6 h-6 flex items-center justify-center rounded border border-slate-700 hover:bg-slate-800 text-slate-300">2</button>
                           <button className="w-6 h-6 flex items-center justify-center rounded border border-slate-700"><ChevronRight className="w-3 h-3" /></button>
                        </div>
                      </div>
                    </div>

                    {/* Reservation Details Panel (Right) */}
                    <div className="bg-[#161b22] border border-slate-800/60 rounded-2xl p-6 shadow-sm flex flex-col h-full overflow-y-auto">
                      <div className="flex justify-between items-center mb-6">
                        <h2 className="text-lg font-bold text-white">Reservation Details</h2>
                        <button className="text-slate-500 hover:text-white"><Maximize2 className="w-4 h-4" /></button>
                      </div>

                      {displayRes ? (
                        <>
                          <div className="flex items-center gap-4 mb-6">
                            <div className="w-14 h-14 bg-slate-800 rounded-xl overflow-hidden flex-shrink-0">
                               {displayRes.image && <img src={displayRes.image} alt={displayRes.productName} className="w-full h-full object-cover" />}
                            </div>
                            <div className="flex-1">
                               <div className="text-sm font-bold text-white mb-1">{displayRes.productName}</div>
                               <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold tracking-wider border ${
                                  displayRes.status === 'CONFIRMED' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                                  displayRes.status === 'ACTIVE' || displayRes.status === 'PENDING' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' :
                                  'bg-red-500/10 text-red-500 border-red-500/20'
                                }`}>
                                  {displayRes.status}
                                </span>
                            </div>
                          </div>

                          <div className="space-y-4 text-xs mb-8 bg-[#11151d] p-4 rounded-xl border border-slate-800">
                             <div className="flex justify-between border-b border-slate-800/50 pb-2">
                               <span className="text-slate-500 flex items-center gap-2"><Package className="w-3.5 h-3.5" /> Reservation ID</span>
                               <span className="text-slate-300 font-mono">{displayRes.id}</span>
                             </div>
                             <div className="flex justify-between border-b border-slate-800/50 pb-2">
                               <span className="text-slate-500 flex items-center gap-2"><Building2 className="w-3.5 h-3.5" /> Warehouse</span>
                               <span className="text-slate-300">{displayRes.warehouseName}</span>
                             </div>
                             <div className="flex justify-between border-b border-slate-800/50 pb-2">
                               <span className="text-slate-500 flex items-center gap-2"><Activity className="w-3.5 h-3.5" /> Quantity</span>
                               <span className="text-slate-300">{displayRes.quantity} Units</span>
                             </div>
                             <div className="flex justify-between border-b border-slate-800/50 pb-2">
                               <span className="text-slate-500 flex items-center gap-2"><Calendar className="w-3.5 h-3.5" /> Reserved At</span>
                               <span className="text-slate-300">{format(new Date(displayRes.createdAt), "MMM dd, yyyy hh:mm a")}</span>
                             </div>
                             <div className="flex justify-between">
                               <span className="text-slate-500 flex items-center gap-2"><Clock className="w-3.5 h-3.5" /> Expires At</span>
                               <span className="text-slate-300">{format(new Date(displayRes.expiresAt), "MMM dd, yyyy hh:mm a")}</span>
                             </div>
                          </div>

                          {/* Large Countdown Timer */}
                          {(displayRes.status === 'ACTIVE' || displayRes.status === 'PENDING') && (
                            <div className="bg-[#1e1915] border border-amber-900/30 rounded-xl p-5 mb-8 relative overflow-hidden">
                               <div className="absolute top-0 left-0 h-1 bg-amber-500 transition-all duration-1000 ease-linear" style={{ width: `${displayRes.id === activeReservation?.id ? timerPercent : 50}%` }} />
                               <div className="text-[10px] text-amber-500/80 font-bold uppercase tracking-wider mb-2 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Expires In</div>
                               <div className="flex items-end gap-2 mb-2">
                                  <div className="text-4xl font-bold text-amber-500 font-mono tracking-tighter">
                                    {displayRes.id === activeReservation?.id ? timeLeft.split(':')[0] : '04'}
                                  </div>
                                  <div className="text-sm text-amber-500/50 font-bold mb-1">min</div>
                                  <div className="text-4xl font-bold text-amber-500/50 pb-1">:</div>
                                  <div className="text-4xl font-bold text-amber-500 font-mono tracking-tighter">
                                    {displayRes.id === activeReservation?.id ? timeLeft.split(':')[1] : '59'}
                                  </div>
                                  <div className="text-sm text-amber-500/50 font-bold mb-1">sec</div>
                               </div>
                               <div className="text-[10px] text-amber-500/60 font-medium">Reservation will be automatically released after expiry.</div>
                            </div>
                          )}

                          {/* Timeline */}
                          <div className="mb-8">
                             <h3 className="text-sm font-bold text-white mb-4">Reservation Timeline</h3>
                             <div className="space-y-4 relative before:absolute before:inset-0 before:ml-1.5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-slate-800">
                                <div className="relative flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <div className="w-3 h-3 rounded-full bg-emerald-500 ring-4 ring-[#161b22] z-10" />
                                    <span className="text-xs font-semibold text-white">Reservation Created</span>
                                  </div>
                                  <span className="text-[10px] text-slate-500">{format(new Date(displayRes.createdAt), "MMM dd hh:mm a")}</span>
                                </div>
                                <div className="relative flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <div className="w-3 h-3 rounded-full bg-emerald-500 ring-4 ring-[#161b22] z-10" />
                                    <span className="text-xs font-semibold text-white">Stock Locked</span>
                                  </div>
                                  <span className="text-[10px] text-slate-500">{format(new Date(displayRes.createdAt), "MMM dd hh:mm a")}</span>
                                </div>
                                <div className="relative flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <div className={`w-3 h-3 rounded-full ${displayRes.status === 'CONFIRMED' ? 'bg-emerald-500' : 'bg-emerald-500 animate-pulse'} ring-4 ring-[#161b22] z-10`} />
                                    <span className={`text-xs font-semibold ${displayRes.status === 'CONFIRMED' ? 'text-slate-400 line-through' : 'text-white'}`}>Awaiting Confirmation</span>
                                  </div>
                                  <span className="text-[10px] text-slate-500">—</span>
                                </div>
                             </div>
                          </div>

                          <div className="mt-auto space-y-3">
                             <div className="flex gap-3">
                                <button 
                                  onClick={handleConfirm}
                                  disabled={processing === "confirm" || displayRes.status !== "PENDING" && displayRes.status !== "ACTIVE"}
                                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-3 rounded-xl transition shadow-lg shadow-indigo-500/20 disabled:opacity-50 flex justify-center items-center"
                                >
                                  {processing === "confirm" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm Reservation"}
                                </button>
                                <button 
                                  onClick={handleRelease}
                                  disabled={processing === "release" || displayRes.status !== "PENDING" && displayRes.status !== "ACTIVE"}
                                  className="flex-1 bg-transparent border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs font-bold py-3 rounded-xl transition disabled:opacity-50 flex justify-center items-center"
                                >
                                  {processing === "release" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Release Reservation"}
                                </button>
                             </div>
                             <button className="w-full bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 text-slate-300 text-xs font-medium py-3 rounded-xl transition flex justify-center items-center gap-2">
                               View Product Details <Maximize2 className="w-3.5 h-3.5" />
                             </button>
                          </div>
                        </>
                      ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center">
                          <Package className="w-12 h-12 text-slate-700 mb-4" />
                          <p className="text-slate-400 text-sm">Select a reservation to view details</p>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            )}
            
          </div>
        </div>
      </main>

      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
            className="fixed bottom-6 right-6 p-4 rounded-xl shadow-lg border bg-[#1e2532] flex items-center gap-3 max-w-sm z-50 shadow-black/50"
            style={{ borderColor: toast.isError ? '#ef4444' : '#3b82f6' }}
          >
            {toast.isError ? <AlertCircle className="w-5 h-5 text-red-500 shrink-0" /> : <CheckCircle2 className="w-5 h-5 text-blue-500 shrink-0" />}
            <p className="font-medium text-sm text-slate-200">{toast.msg}</p>
            <button onClick={() => setToast(null)} className="ml-auto text-slate-500 hover:text-slate-300 transition"><X className="w-4 h-4" /></button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
