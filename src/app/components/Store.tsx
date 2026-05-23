"use client";

import { useState, useEffect, useCallback } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { Package, Clock, CheckCircle2, AlertTriangle, Loader2, Sparkles, X, ChevronRight, Plus, Minus, Timer, RefreshCw } from "lucide-react";
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
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariant: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
};

export default function Store() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [reservation, setReservation] = useState<Reservation | null>(null);
  
  const [toast, setToast] = useState<{ msg: string, isError: boolean, id: number } | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>("");
  const [processing, setProcessing] = useState(false);
  
  // Custom quantities map by inventory ID
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [extended, setExtended] = useState(false);

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
      if (!silent) showMessage("Network error fetching products", true);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchProducts();
    
    // Auto-polling for live stock updates every 5 seconds
    const pollInterval = setInterval(() => {
      fetchProducts(true);
    }, 5000);
    
    return () => clearInterval(pollInterval);
  }, [fetchProducts]);

  useEffect(() => {
    if (!reservation) return;
    const interval = setInterval(() => {
      const expiry = new Date(reservation.expiresAt);
      if (expiry <= new Date()) {
        setTimeLeft("Expired");
        clearInterval(interval);
      } else {
        setTimeLeft(formatDistanceToNowStrict(expiry));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [reservation]);

  const handleReserve = async (inventoryId: string, maxStock: number) => {
    const quantity = quantities[inventoryId] || 1;
    if (quantity > maxStock) {
      showMessage(`Only ${maxStock} units available`, true);
      return;
    }
    
    setProcessing(true);
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({ inventoryId, quantity }),
      });

      const data = await res.json();
      if (!res.ok) {
        showMessage(data.error || "Failed to reserve", true);
        fetchProducts();
      } else {
        setReservation(data.reservation);
        setExtended(false);
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
        if (res.status === 410) {
          setReservation(null);
        }
      } else {
        showMessage("Purchase confirmed successfully!", false);
        setReservation(null);
      }
      fetchProducts();
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
      showMessage("Reservation cancelled", false);
      setReservation(null);
      fetchProducts();
    } catch {
      showMessage("Network error during cancellation", true);
    } finally {
      setProcessing(false);
    }
  };

  const handleExtend = async () => {
    if (!reservation) return;
    setProcessing(true);
    try {
      const res = await fetch(`/api/reservations/${reservation.id}/extend`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      const data = await res.json();
      if (!res.ok) {
        showMessage(data.error || "Failed to extend", true);
      } else {
        setReservation(data.reservation);
        setExtended(true);
        showMessage("Reservation extended by 5 minutes", false);
      }
    } catch {
      showMessage("Network error extending reservation", true);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>
          <Loader2 className="w-10 h-10 text-indigo-500" />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8 pt-12 md:pt-20 pb-32">
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="flex flex-col md:flex-row justify-between items-start md:items-center mb-16 gap-4"
      >
        <div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white flex items-center gap-3">
            <Package className="w-10 h-10 text-indigo-500" />
            Stockpulse
            <Sparkles className="w-6 h-6 text-indigo-400 opacity-80" />
          </h1>
          <p className="text-zinc-400 mt-2 text-lg">High-concurrency reservation engine with live tracking.</p>
        </div>
        
        {!reservation && (
          <button 
            onClick={() => { setIsRefreshing(true); fetchProducts(false); }}
            disabled={isRefreshing}
            className="flex items-center gap-2 bg-zinc-900/50 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 px-4 py-2.5 rounded-xl font-medium transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin text-indigo-400" : ""}`} />
            Live Sync
          </button>
        )}
      </motion.div>

      <AnimatePresence mode="wait">
        {reservation ? (
          <motion.div
            key="checkout"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="w-full max-w-2xl mx-auto relative group"
          >
            <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
            <div className="relative bg-zinc-900/90 backdrop-blur-xl border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl">
              <div className="bg-zinc-900/50 border-b border-zinc-800 px-8 py-5 flex items-center justify-between">
                <h2 className="text-xl font-bold text-white">Checkout</h2>
                <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full font-bold text-sm ${timeLeft === "Expired" ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.2)]"}`}>
                  <Clock className="w-4 h-4" />
                  {timeLeft}
                </div>
              </div>
              <div className="p-8">
                <p className="text-zinc-300 mb-8 text-lg leading-relaxed">
                  You have successfully reserved <span className="text-white font-bold px-2 py-1 bg-zinc-800 rounded-md border border-zinc-700 mx-1">{reservation.quantity} unit(s)</span>. Your reservation is active and will expire soon. Please confirm your purchase to secure the items.
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                  <button
                    onClick={handleConfirm}
                    disabled={processing || timeLeft === "Expired"}
                    className="flex-1 bg-indigo-600 text-white font-bold py-4 rounded-xl hover:bg-indigo-500 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center shadow-[0_0_20px_rgba(79,70,229,0.3)] hover:shadow-[0_0_30px_rgba(79,70,229,0.5)]"
                  >
                    {processing ? <Loader2 className="w-5 h-5 animate-spin" /> : "Confirm Purchase"}
                  </button>
                  <button
                    onClick={handleExtend}
                    disabled={processing || extended || timeLeft === "Expired"}
                    className="bg-zinc-800 text-indigo-400 border border-indigo-500/30 font-bold py-4 px-6 rounded-xl hover:bg-zinc-700 hover:text-indigo-300 transition-all duration-200 disabled:opacity-50 flex justify-center items-center group relative overflow-hidden"
                  >
                    {processing ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                      <>
                        <Timer className="w-5 h-5 mr-2" />
                        +5m Time
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleRelease}
                    disabled={processing}
                    className="bg-zinc-800 text-zinc-400 border border-zinc-700 font-bold py-4 px-6 rounded-xl hover:bg-red-950/50 hover:text-red-400 hover:border-red-900/50 transition-all duration-200 disabled:opacity-50 flex justify-center items-center"
                  >
                    {processing ? <Loader2 className="w-5 h-5 animate-spin" /> : "Cancel"}
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
            exit={{ opacity: 0, y: -20 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
          >
            {products.map((product) => (
              <motion.div 
                variants={itemVariant}
                key={product.id} 
                className="group bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 hover:border-zinc-700 rounded-2xl overflow-hidden flex flex-col transition-all duration-300 hover:shadow-2xl hover:shadow-indigo-900/20"
              >
                <div className="aspect-[4/3] bg-zinc-800 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-transparent to-transparent z-10" />
                  {product.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.image} alt={product.name} className="object-cover w-full h-full absolute inset-0 transform group-hover:scale-105 transition-transform duration-700 ease-out" />
                  )}
                  <div className="absolute bottom-4 left-5 z-20">
                    <h3 className="text-2xl font-bold text-white mb-1 drop-shadow-md">{product.name}</h3>
                  </div>
                </div>
                
                <div className="p-6 flex-1 flex flex-col">
                  <p className="text-zinc-400 text-sm mb-6 line-clamp-2">{product.description}</p>
                  
                  <div className="mt-auto space-y-4">
                    {product.inventories.map((inv) => {
                      const isAvailable = inv.availableStock > 0;
                      const isLowStock = isAvailable && inv.availableStock <= 5;
                      const selectedQty = quantities[inv.id] || 1;

                      return (
                        <div key={inv.id} className="flex flex-col gap-3 bg-zinc-950/60 rounded-xl p-4 border border-zinc-800/80 relative overflow-hidden">
                          {isLowStock && (
                            <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-full blur-3xl -mr-10 -mt-10 animate-pulse pointer-events-none" />
                          )}
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="text-sm font-bold text-zinc-200">{inv.warehouse.name}</div>
                              <div className={`text-xs font-semibold mt-0.5 flex items-center gap-1.5 ${
                                isLowStock ? "text-red-400" : isAvailable ? "text-emerald-400" : "text-zinc-500"
                              }`}>
                                {isAvailable ? (
                                  <>
                                    <div className={`w-1.5 h-1.5 rounded-full ${isLowStock ? "bg-red-400 animate-pulse" : "bg-emerald-400"}`} />
                                    {inv.availableStock} in stock {isLowStock && "(Low!)"}
                                  </>
                                ) : "Out of stock"}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between mt-1">
                            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                              <button 
                                onClick={() => updateQuantity(inv.id, -1, inv.availableStock)}
                                disabled={!isAvailable || selectedQty <= 1 || processing}
                                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-30 transition"
                              >
                                <Minus className="w-4 h-4" />
                              </button>
                              <div className="w-10 text-center text-sm font-bold text-white">
                                {isAvailable ? selectedQty : 0}
                              </div>
                              <button 
                                onClick={() => updateQuantity(inv.id, 1, inv.availableStock)}
                                disabled={!isAvailable || selectedQty >= inv.availableStock || processing}
                                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-30 transition"
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>

                            <button
                              onClick={() => handleReserve(inv.id, inv.availableStock)}
                              disabled={!isAvailable || processing}
                              className={`flex items-center gap-1 px-5 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 ${
                                isAvailable 
                                  ? "bg-white text-black hover:bg-zinc-200 shadow-[0_0_15px_rgba(255,255,255,0.1)] hover:shadow-[0_0_20px_rgba(255,255,255,0.2)] active:scale-95" 
                                  : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                              }`}
                            >
                              {isAvailable ? "Reserve" : "Sold Out"}
                              {isAvailable && <ChevronRight className="w-4 h-4 -mr-1" />}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
            className={`fixed bottom-6 right-6 p-4 rounded-xl shadow-2xl flex items-center gap-3 max-w-sm border backdrop-blur-xl z-50 ${
              toast.isError 
                ? "bg-red-950/90 border-red-900 text-red-200" 
                : "bg-emerald-950/90 border-emerald-900 text-emerald-200"
            }`}
          >
            {toast.isError ? (
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
            )}
            <p className="font-medium text-sm">{toast.msg}</p>
            <button onClick={() => setToast(null)} className="ml-auto p-1 rounded-md hover:bg-white/10 transition">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
