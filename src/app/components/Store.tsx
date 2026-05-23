"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { formatDistanceToNowStrict, differenceInSeconds } from "date-fns";
import { Crosshair, Clock, CheckCircle2, AlertOctagon, Loader2, X, ChevronRight, Plus, Minus, RefreshCw, Activity, Cpu, ShieldAlert, Fingerprint } from "lucide-react";
import { motion, AnimatePresence, Variants } from "framer-motion";

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
};

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.2 }
  }
};

const itemVariant: Variants = {
  hidden: { opacity: 0, scale: 0.95, y: 30, filter: "blur(10px)" },
  show: { opacity: 1, scale: 1, y: 0, filter: "blur(0px)", transition: { type: "spring", stiffness: 300, damping: 24 } }
};

const glitchVariant: Variants = {
  hidden: { opacity: 0, x: -20 },
  show: { 
    opacity: 1, 
    x: 0, 
    transition: { type: "spring", stiffness: 400, damping: 20 } 
  }
};

export default function Store() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [reservation, setReservation] = useState<Reservation | null>(null);
  
  const [toast, setToast] = useState<{ msg: string, isError: boolean, id: number } | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>("");
  const [timerPercent, setTimerPercent] = useState<number>(100);
  const [processing, setProcessing] = useState(false);
  
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);

  const showMessage = (msg: string, isError: boolean) => {
    setToast({ msg, isError, id: Date.now() });
    setTimeout(() => setToast(null), 5000);
  };

  const fetchProducts = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/products");
      if (res.ok) {
        setProducts(await res.json());
      }
    } catch {
      if (!silent) showMessage("SYSTEM_ERROR: Telemetry disconnected.", true);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchProducts();
    const pollInterval = setInterval(() => { fetchProducts(true); }, 5000);
    return () => clearInterval(pollInterval);
  }, [fetchProducts]);

  useEffect(() => {
    if (!reservation) return;
    
    const TOTAL_SECONDS = 600;
    
    const interval = setInterval(() => {
      const expiry = new Date(reservation.expiresAt);
      const now = new Date();
      
      if (expiry <= now) {
        setTimeLeft("EXPIRED");
        setTimerPercent(0);
        clearInterval(interval);
      } else {
        setTimeLeft(formatDistanceToNowStrict(expiry));
        const diff = differenceInSeconds(expiry, now);
        setTimerPercent(Math.max(0, Math.min(100, (diff / TOTAL_SECONDS) * 100)));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [reservation]);

  const handleReserve = async (inventoryId: string, maxStock: number) => {
    const quantity = quantities[inventoryId] || 1;
    if (quantity > maxStock) return showMessage(`OVERRIDE_DENIED: Max limit ${maxStock}`, true);
    
    setProcessing(true);
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ inventoryId, quantity }),
      });

      const data = await res.json();
      if (!res.ok) {
        showMessage(data.error || "LOCK_FAILURE", true);
        fetchProducts(true);
      } else {
        setReservation(data.reservation);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch {
      showMessage("NETWORK_ANOMALY DETECTED", true);
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirm = async () => {
    if (!reservation) return;
    setProcessing(true);
    try {
      const res = await fetch(`/api/reservations/${reservation.id}/confirm`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      const data = await res.json();
      if (!res.ok) {
        showMessage(data.error || "CONFIRM_FAILED", true);
        if (res.status === 410) setReservation(null);
      } else {
        showMessage("TRANSACTION SECURED.", false);
        setReservation(null);
      }
      fetchProducts(true);
    } catch {
      showMessage("UPLINK ERROR", true);
    } finally {
      setProcessing(false);
    }
  };

  const handleRelease = async () => {
    if (!reservation) return;
    setProcessing(true);
    try {
      await fetch(`/api/reservations/${reservation.id}/release`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      showMessage("LOCK ABORTED.", false);
      setReservation(null);
      fetchProducts(true);
    } catch {
      showMessage("RELEASE FAILED", true);
    } finally {
      setProcessing(false);
    }
  };

  const updateQuantity = (invId: string, delta: number, max: number) => {
    setQuantities(prev => {
      const current = prev[invId] || 1;
      const next = Math.max(1, Math.min(max, current + delta));
      return { ...prev, [invId]: next };
    });
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

    const utilization = globalStock === 0 ? 0 : Math.round((globalReserved / globalStock) * 100);

    return {
      productCount: products.length,
      warehouseCount: warehouses.size,
      globalStock,
      utilization
    };
  }, [products]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="relative">
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }} className="absolute inset-0 rounded-full border-t-2 border-cyan-500 w-16 h-16 opacity-50"></motion.div>
          <motion.div animate={{ rotate: -360 }} transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }} className="rounded-full border-r-2 border-blue-500 w-16 h-16"></motion.div>
          <div className="absolute inset-0 flex items-center justify-center">
            <Fingerprint className="w-6 h-6 text-cyan-400 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto p-4 md:p-8 pt-8 md:pt-12 pb-32">
      {/* HUD Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}
        className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4 border-b border-cyan-900/50 pb-6 relative"
      >
        <div className="absolute bottom-0 left-0 w-32 h-[1px] bg-gradient-to-r from-cyan-400 to-transparent" />
        
        <div>
          <h1 className="text-3xl md:text-5xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-blue-400 to-indigo-400 flex items-center gap-4 uppercase font-mono">
            <Crosshair className="w-10 h-10 text-cyan-400 animate-[spin_10s_linear_infinite]" strokeWidth={1.5} />
            StockPulse_OS
          </h1>
          <div className="flex items-center gap-3 mt-3">
            <div className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse shadow-[0_0_8px_#06b6d4]" />
            <p className="text-cyan-600/80 font-mono text-sm tracking-widest uppercase">System Online // Sync Protocol Active</p>
          </div>
        </div>
        
        <button 
          onClick={() => { setIsRefreshing(true); fetchProducts(false); }}
          disabled={isRefreshing}
          className="flex items-center gap-3 bg-black/50 hover:bg-cyan-950/30 text-cyan-400 border border-cyan-800/50 hover:border-cyan-500/50 px-6 py-3 rounded-none font-mono text-xs tracking-widest uppercase transition-all shadow-[inset_0_0_20px_rgba(6,182,212,0.05)] hover:shadow-[inset_0_0_20px_rgba(6,182,212,0.2),0_0_15px_rgba(6,182,212,0.2)] group"
        >
          <RefreshCw className={`w-4 h-4 group-hover:text-cyan-300 ${isRefreshing ? "animate-spin text-cyan-300" : ""}`} />
          [ MANUAL OVERRIDE ]
        </button>
      </motion.div>

      {/* Cyber HUD Stats Panel */}
      {!reservation && (
        <motion.div 
          variants={staggerContainer} initial="hidden" animate="show"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16"
        >
          {[
            { label: "ASSET COUNT", value: stats.productCount, icon: Cpu, color: "text-cyan-400" },
            { label: "FACILITIES", value: stats.warehouseCount, icon: Activity, color: "text-blue-400" },
            { label: "GLOBAL RESERVE", value: stats.globalStock, icon: ShieldAlert, color: "text-indigo-400" },
            { label: "SYS LOAD", value: `${stats.utilization}%`, icon: Fingerprint, color: "text-amber-400" }
          ].map((stat, i) => (
            <motion.div key={i} variants={glitchVariant} className="relative group">
              {/* Corner Accents */}
              <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-cyan-500/50" />
              <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-cyan-500/50" />
              <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-cyan-500/50" />
              <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-cyan-500/50" />
              
              <div className="bg-black/40 backdrop-blur-md p-6 border border-cyan-900/30 flex flex-col justify-between h-full group-hover:bg-cyan-950/20 group-hover:border-cyan-500/30 transition-all duration-500">
                <div className="flex justify-between items-center mb-6">
                  <span className="text-cyan-700 font-mono text-xs tracking-widest">{stat.label}</span>
                  <stat.icon className={`w-5 h-5 ${stat.color} opacity-70 group-hover:opacity-100 group-hover:animate-pulse`} />
                </div>
                <div className="text-4xl font-black text-white font-mono tracking-tighter">{stat.value}</div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Main Holographic Array */}
      <AnimatePresence mode="wait">
        {reservation ? (
          <motion.div
            key="checkout"
            initial={{ opacity: 0, scale: 0.9, filter: "brightness(2) blur(10px)" }}
            animate={{ opacity: 1, scale: 1, filter: "brightness(1) blur(0px)" }}
            exit={{ opacity: 0, scale: 0.9, filter: "brightness(0) blur(10px)" }}
            transition={{ duration: 0.5, ease: "circOut" }}
            className="w-full max-w-3xl mx-auto relative group"
          >
            {/* Holographic glowing aura */}
            <div className="absolute -inset-2 bg-gradient-to-r from-cyan-500 via-indigo-500 to-amber-500 rounded-none blur-2xl opacity-20 animate-pulse"></div>
            
            <div className="relative bg-black/80 backdrop-blur-2xl border border-cyan-500/40 shadow-[0_0_50px_rgba(6,182,212,0.15)]">
              {/* Top Tech Border */}
              <div className="h-1 w-full bg-cyan-950">
                <motion.div 
                  className={`h-full shadow-[0_0_10px_currentColor] ${timerPercent < 20 ? 'bg-amber-500 text-amber-500' : 'bg-cyan-400 text-cyan-400'}`}
                  initial={{ width: '100%' }}
                  animate={{ width: `${timerPercent}%` }}
                  transition={{ ease: "linear", duration: 1 }}
                />
              </div>

              <div className="p-8 md:p-10 border-t border-b border-cyan-900/50">
                <div className="flex justify-between items-start mb-10">
                  <div>
                    <h2 className="text-2xl font-black text-white tracking-widest uppercase flex items-center gap-3 font-mono">
                      <ShieldAlert className="w-6 h-6 text-amber-400" />
                      Lock Established
                    </h2>
                    <p className="text-cyan-600/80 mt-2 font-mono text-sm uppercase tracking-widest">Awaiting final authorization sequence.</p>
                  </div>
                  <div className={`flex items-center gap-2 px-4 py-2 bg-black border font-mono text-sm shadow-[0_0_15px_inset_currentColor] ${timeLeft === "EXPIRED" ? "text-red-500 border-red-500/50" : "text-cyan-400 border-cyan-500/50"}`}>
                    <Clock className="w-4 h-4" />
                    {timeLeft}
                  </div>
                </div>
                
                <div className="bg-cyan-950/20 border border-cyan-800/40 p-6 mb-10 flex items-center justify-between">
                   <div className="flex items-center gap-5">
                      <div className="w-14 h-14 bg-black border border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.3)] flex items-center justify-center">
                         <Fingerprint className="w-7 h-7 text-cyan-400" />
                      </div>
                      <div>
                        <div className="text-cyan-100 font-mono text-lg uppercase tracking-wider">Asset Secured</div>
                        <div className="text-cyan-600/80 font-mono text-xs uppercase tracking-widest mt-1">TTL: {timeLeft}</div>
                      </div>
                   </div>
                   <div className="text-3xl font-black text-cyan-300 font-mono">QTY: {reservation.quantity}</div>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-4">
                  <button
                    onClick={handleConfirm}
                    disabled={processing || timeLeft === "EXPIRED"}
                    className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-black font-black uppercase tracking-widest py-4 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center shadow-[0_0_20px_rgba(6,182,212,0.4)] hover:shadow-[0_0_30px_rgba(6,182,212,0.6)] font-mono"
                  >
                    {processing ? <Loader2 className="w-5 h-5 animate-spin" /> : "[ AUTHORIZE ]"}
                  </button>
                  <button
                    onClick={handleRelease}
                    disabled={processing}
                    className="bg-black text-cyan-500 border border-cyan-500/30 font-black uppercase tracking-widest py-4 px-8 hover:bg-cyan-950/50 hover:border-cyan-400 transition-all disabled:opacity-50 flex justify-center items-center font-mono hover:shadow-[0_0_15px_rgba(6,182,212,0.2)]"
                  >
                    {processing ? <Loader2 className="w-5 h-5 animate-spin" /> : "[ ABORT ]"}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="store"
            variants={staggerContainer}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
          >
            {products.map((product) => (
              <motion.div 
                variants={itemVariant}
                key={product.id} 
                className="group relative bg-black/40 backdrop-blur-md flex flex-col border border-cyan-900/30 hover:border-cyan-500/50 transition-all duration-500 overflow-hidden shadow-[0_0_0_rgba(6,182,212,0)] hover:shadow-[0_0_30px_rgba(6,182,212,0.15)]"
              >
                {/* Tech Corners */}
                <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-cyan-500/0 group-hover:border-cyan-400 transition-all duration-300 z-20" />
                <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-cyan-500/0 group-hover:border-cyan-400 transition-all duration-300 z-20" />

                <div className="p-6 border-b border-cyan-900/30 flex gap-5 relative">
                  <div className="w-24 h-24 bg-black border border-cyan-800/50 overflow-hidden flex-shrink-0 relative">
                    <div className="absolute inset-0 bg-cyan-500/10 mix-blend-overlay z-10 group-hover:bg-transparent transition-colors"></div>
                    {product.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={product.image} alt={product.name} className="object-cover w-full h-full grayscale group-hover:grayscale-0 transition-all duration-700 opacity-80 group-hover:opacity-100 scale-100 group-hover:scale-110" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-white tracking-widest uppercase font-mono mb-2 group-hover:text-cyan-300 transition-colors">{product.name}</h3>
                    <p className="text-cyan-600/70 text-xs font-mono line-clamp-3 leading-relaxed uppercase tracking-wider">{product.description}</p>
                  </div>
                </div>
                
                <div className="p-6 bg-cyan-950/10 flex-1 flex flex-col gap-5">
                  {product.inventories.map((inv) => {
                    const isAvailable = inv.availableStock > 0;
                    const isLowStock = isAvailable && inv.availableStock <= 5;
                    const selectedQty = quantities[inv.id] || 1;

                    return (
                      <div key={inv.id} className="relative bg-black/60 p-5 border border-cyan-900/40 group/inv overflow-hidden hover:border-cyan-500/40 transition-colors">
                        {/* Scanline effect */}
                        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/5 to-transparent -translate-y-full group-hover/inv:animate-[scan_2s_linear_infinite]" />

                        <div className="flex justify-between items-start mb-5 relative z-10">
                          <div>
                            <div className="text-xs font-black text-cyan-50 uppercase tracking-widest font-mono">{inv.warehouse.name}</div>
                            <div className="flex items-center gap-2 mt-2">
                              <div className={`w-1.5 h-1.5 shadow-[0_0_8px_currentColor] ${!isAvailable ? "bg-slate-600 text-slate-600" : isLowStock ? "bg-amber-400 text-amber-400 animate-pulse" : "bg-cyan-400 text-cyan-400"}`} />
                              <span className={`text-[10px] font-black uppercase tracking-widest font-mono ${!isAvailable ? "text-slate-500" : isLowStock ? "text-amber-400" : "text-cyan-400"}`}>
                                {!isAvailable ? "DEPLETED" : isLowStock ? `CRITICAL: ${inv.availableStock} REMAINING` : `OPTIMAL: ${inv.availableStock} UNITS`}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 relative z-10">
                          <div className="flex items-center bg-black border border-cyan-800/50">
                            <button 
                              onClick={() => updateQuantity(inv.id, -1, inv.availableStock)}
                              disabled={!isAvailable || selectedQty <= 1 || processing}
                              className="p-3 text-cyan-600 hover:text-cyan-300 hover:bg-cyan-900/30 disabled:opacity-30 transition-colors"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <div className="w-10 text-center text-sm font-black text-white font-mono">
                              {isAvailable ? selectedQty : 0}
                            </div>
                            <button 
                              onClick={() => updateQuantity(inv.id, 1, inv.availableStock)}
                              disabled={!isAvailable || selectedQty >= inv.availableStock || processing}
                              className="p-3 text-cyan-600 hover:text-cyan-300 hover:bg-cyan-900/30 disabled:opacity-30 transition-colors"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>

                          <button
                            onClick={() => handleReserve(inv.id, inv.availableStock)}
                            disabled={!isAvailable || processing}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-black uppercase tracking-widest transition-all font-mono ${
                              isAvailable 
                                ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/50 hover:bg-cyan-400 hover:text-black hover:shadow-[0_0_20px_rgba(6,182,212,0.5)]" 
                                : "bg-black text-slate-600 border border-slate-800 cursor-not-allowed"
                            }`}
                          >
                            [ {isAvailable ? "INITIALIZE" : "LOCKED"} ]
                            {isAvailable && <ChevronRight className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cyberpunk Terminal Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, x: 50, filter: "brightness(2)" }}
            animate={{ opacity: 1, x: 0, filter: "brightness(1)" }}
            exit={{ opacity: 0, x: 50, filter: "brightness(0)" }}
            className="fixed bottom-8 right-8 p-5 border bg-black/90 backdrop-blur-xl flex items-start gap-4 max-w-md z-50 shadow-[0_0_30px_rgba(0,0,0,0.5)]"
            style={{ borderColor: toast.isError ? 'rgba(239, 68, 68, 0.5)' : 'rgba(6, 182, 212, 0.5)' }}
          >
            {toast.isError ? (
              <AlertOctagon className="w-6 h-6 text-red-500 shrink-0 mt-0.5 animate-pulse" />
            ) : (
              <CheckCircle2 className="w-6 h-6 text-cyan-400 shrink-0 mt-0.5" />
            )}
            <div>
              <p className={`font-mono text-xs tracking-widest uppercase mb-1 ${toast.isError ? "text-red-400" : "text-cyan-500"}`}>
                {toast.isError ? "SYSTEM_ALERT" : "OPERATION_SUCCESS"}
              </p>
              <p className="font-mono text-sm text-white tracking-wider">{toast.msg}</p>
            </div>
            <button onClick={() => setToast(null)} className="ml-auto text-cyan-700 hover:text-cyan-400 transition mt-0.5">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
