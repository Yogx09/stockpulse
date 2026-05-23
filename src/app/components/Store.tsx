"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { formatDistanceToNowStrict, differenceInSeconds } from "date-fns";
import { Box, Clock, CheckCircle2, AlertCircle, Loader2, X, ChevronRight, Plus, Minus, RefreshCw, BarChart3, PackageCheck, Layers, Activity } from "lucide-react";
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
    transition: { staggerChildren: 0.05 }
  }
};

const itemVariant: Variants = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 400, damping: 30 } }
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
      if (!silent) showMessage("Network error fetching inventory", true);
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
    
    // Total reservation time is 10 minutes (600 seconds)
    const TOTAL_SECONDS = 600;
    
    const interval = setInterval(() => {
      const expiry = new Date(reservation.expiresAt);
      const now = new Date();
      
      if (expiry <= now) {
        setTimeLeft("Expired");
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
    if (quantity > maxStock) return showMessage(`Only ${maxStock} available`, true);
    
    setProcessing(true);
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ inventoryId, quantity }),
      });

      const data = await res.json();
      if (!res.ok) {
        showMessage(data.error || "Failed to reserve", true);
        fetchProducts(true);
      } else {
        setReservation(data.reservation);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch {
      showMessage("Network error during reservation", true);
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
        showMessage(data.error || "Failed to confirm", true);
        if (res.status === 410) setReservation(null);
      } else {
        showMessage("Order confirmed successfully.", false);
        setReservation(null);
      }
      fetchProducts(true);
    } catch {
      showMessage("Network error during confirmation", true);
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
      showMessage("Reservation released.", false);
      setReservation(null);
      fetchProducts(true);
    } catch {
      showMessage("Network error releasing reservation", true);
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

  // Analytics Calculations
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
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto p-4 md:p-8 pt-8 md:pt-12 pb-32">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-slate-900 flex items-center gap-3">
            <Box className="w-8 h-8 text-indigo-600" strokeWidth={2.5} />
            StockPulse
          </h1>
          <p className="text-slate-500 mt-2 font-medium tracking-tight">Real-Time Inventory Reservation Platform</p>
        </div>
        
        <button 
          onClick={() => { setIsRefreshing(true); fetchProducts(false); }}
          disabled={isRefreshing}
          className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-sm"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin text-indigo-600" : ""}`} />
          Sync Data
        </button>
      </div>

      {/* Analytics Dashboard */}
      {!reservation && (
        <motion.div 
          variants={staggerContainer} initial="hidden" animate="show"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-12"
        >
          <motion.div variants={itemVariant} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div className="flex justify-between items-center mb-4">
              <span className="text-slate-500 text-sm font-medium">Total Products</span>
              <PackageCheck className="w-5 h-5 text-indigo-500" />
            </div>
            <div className="text-3xl font-semibold text-slate-900">{stats.productCount}</div>
          </motion.div>
          
          <motion.div variants={itemVariant} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div className="flex justify-between items-center mb-4">
              <span className="text-slate-500 text-sm font-medium">Active Warehouses</span>
              <Layers className="w-5 h-5 text-indigo-500" />
            </div>
            <div className="text-3xl font-semibold text-slate-900">{stats.warehouseCount}</div>
          </motion.div>
          
          <motion.div variants={itemVariant} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div className="flex justify-between items-center mb-4">
              <span className="text-slate-500 text-sm font-medium">Global Stock</span>
              <Box className="w-5 h-5 text-indigo-500" />
            </div>
            <div className="text-3xl font-semibold text-slate-900">{stats.globalStock}</div>
          </motion.div>
          
          <motion.div variants={itemVariant} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div className="flex justify-between items-center mb-4">
              <span className="text-slate-500 text-sm font-medium">Inventory Utilization</span>
              <Activity className="w-5 h-5 text-indigo-500" />
            </div>
            <div className="flex items-end gap-3">
              <div className="text-3xl font-semibold text-slate-900">{stats.utilization}%</div>
              <div className="flex-1 mb-2 h-2 bg-slate-100 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }} animate={{ width: `${stats.utilization}%` }} transition={{ duration: 1, ease: "easeOut" }}
                  className="h-full bg-indigo-500 rounded-full"
                />
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Main Content Area */}
      <AnimatePresence mode="wait">
        {reservation ? (
          <motion.div
            key="checkout"
            initial={{ opacity: 0, scale: 0.98, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -10 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="w-full max-w-xl mx-auto"
          >
            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
              {/* Progress Bar Header */}
              <div className="h-1.5 w-full bg-slate-100">
                <motion.div 
                  className={`h-full ${timerPercent < 20 ? 'bg-red-500' : 'bg-indigo-500'}`}
                  initial={{ width: '100%' }}
                  animate={{ width: `${timerPercent}%` }}
                  transition={{ ease: "linear", duration: 1 }}
                />
              </div>

              <div className="p-8">
                <div className="flex justify-between items-start mb-8">
                  <div>
                    <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Complete Order</h2>
                    <p className="text-slate-500 mt-1">Inventory is locked.</p>
                  </div>
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full font-semibold text-sm border ${timeLeft === "Expired" ? "bg-red-50 text-red-600 border-red-100" : "bg-slate-50 text-slate-700 border-slate-200"}`}>
                    <Clock className="w-4 h-4" />
                    {timeLeft}
                  </div>
                </div>
                
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-6 mb-8 flex items-center justify-between">
                   <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-white rounded-xl shadow-sm border border-slate-200 flex items-center justify-center">
                         <PackageCheck className="w-6 h-6 text-indigo-600" />
                      </div>
                      <div>
                        <div className="text-slate-900 font-semibold">Reserved Units</div>
                        <div className="text-slate-500 text-sm">Valid for {timeLeft}</div>
                      </div>
                   </div>
                   <div className="text-2xl font-semibold text-slate-900">{reservation.quantity}x</div>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={handleConfirm}
                    disabled={processing || timeLeft === "Expired"}
                    className="flex-1 bg-indigo-600 text-white font-semibold py-3.5 rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center shadow-sm"
                  >
                    {processing ? <Loader2 className="w-5 h-5 animate-spin" /> : "Confirm Order"}
                  </button>
                  <button
                    onClick={handleRelease}
                    disabled={processing}
                    className="bg-white text-slate-600 border border-slate-200 font-semibold py-3.5 px-6 rounded-xl hover:bg-slate-50 transition-all disabled:opacity-50 flex justify-center items-center"
                  >
                    {processing ? <Loader2 className="w-5 h-5 animate-spin" /> : "Release"}
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
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {products.map((product) => (
              <motion.div 
                variants={itemVariant}
                key={product.id} 
                className="bg-white rounded-2xl flex flex-col border border-slate-200 shadow-sm hover:shadow-md transition-shadow duration-300 overflow-hidden"
              >
                <div className="p-6 border-b border-slate-100 flex gap-5">
                  <div className="w-20 h-20 rounded-xl bg-slate-50 border border-slate-100 overflow-hidden flex-shrink-0">
                    {product.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={product.image} alt={product.name} className="object-cover w-full h-full" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 tracking-tight leading-tight mb-1">{product.name}</h3>
                    <p className="text-slate-500 text-sm line-clamp-2 leading-relaxed">{product.description}</p>
                  </div>
                </div>
                
                <div className="p-6 bg-slate-50/50 flex-1 flex flex-col gap-4">
                  {product.inventories.map((inv) => {
                    const isAvailable = inv.availableStock > 0;
                    const isLowStock = isAvailable && inv.availableStock <= 5;
                    const selectedQty = quantities[inv.id] || 1;

                    return (
                      <div key={inv.id} className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">{inv.warehouse.name}</div>
                            <div className="flex items-center gap-1.5 mt-1">
                              {/* Smart Badge */}
                              <div className={`w-2 h-2 rounded-full ${!isAvailable ? "bg-slate-300" : isLowStock ? "bg-amber-500 animate-pulse" : "bg-emerald-500"}`} />
                              <span className={`text-xs font-medium ${!isAvailable ? "text-slate-500" : isLowStock ? "text-amber-600" : "text-emerald-600"}`}>
                                {!isAvailable ? "Out of Stock" : isLowStock ? `${inv.availableStock} Left - Expiring Soon` : `${inv.availableStock} Available`}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg">
                            <button 
                              onClick={() => updateQuantity(inv.id, -1, inv.availableStock)}
                              disabled={!isAvailable || selectedQty <= 1 || processing}
                              className="p-2.5 text-slate-500 hover:text-slate-900 disabled:opacity-30 transition-colors"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <div className="w-8 text-center text-sm font-semibold text-slate-900">
                              {isAvailable ? selectedQty : 0}
                            </div>
                            <button 
                              onClick={() => updateQuantity(inv.id, 1, inv.availableStock)}
                              disabled={!isAvailable || selectedQty >= inv.availableStock || processing}
                              className="p-2.5 text-slate-500 hover:text-slate-900 disabled:opacity-30 transition-colors"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <button
                            onClick={() => handleReserve(inv.id, inv.availableStock)}
                            disabled={!isAvailable || processing}
                            className={`flex-1 flex items-center justify-center gap-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                              isAvailable 
                                ? "bg-slate-900 text-white hover:bg-slate-800 shadow-sm" 
                                : "bg-slate-100 text-slate-400 cursor-not-allowed"
                            }`}
                          >
                            Reserve
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

      {/* Minimal Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
            className="fixed bottom-6 right-6 p-4 rounded-xl shadow-lg border bg-white flex items-center gap-3 max-w-sm z-50"
            style={{ borderColor: toast.isError ? '#fecaca' : '#bbf7d0' }}
          >
            {toast.isError ? (
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
            )}
            <p className="font-medium text-sm text-slate-700">{toast.msg}</p>
            <button onClick={() => setToast(null)} className="ml-auto text-slate-400 hover:text-slate-600 transition">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
