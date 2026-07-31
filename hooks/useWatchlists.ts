// hooks/useWatchlists.ts
"use client";

import { useState, useEffect, useCallback } from "react";

export interface Watchlist {
    id: string;
    name: string;
    tickers: string[];
    isDefault?: boolean;
}

const DEFAULT_WATCHLISTS: Watchlist[] = [
    {
        id: "large_cap_leaders",
        name: "Large Cap Leaders",
        tickers: [
            "RELIANCE.NS",
            "TCS.NS",
            "HDFCBANK.NS",
            "INFY.NS",
            "ICICIBANK.NS",
            "BHARTIARTL.NS",
            "LT.NS",
            "SBIN.NS",
            "TATASTEEL.NS",
            "MARUTI.NS",
        ],
        isDefault: true,
    },
    {
        id: "banking_and_financials",
        name: "Banking & Financials",
        tickers: [
            "HDFCBANK.NS",
            "ICICIBANK.NS",
            "SBIN.NS",
            "KOTAKBANK.NS",
            "AXISBANK.NS",
            "BAJFINANCE.NS",
            "CHOLAFIN.NS",
            "SHRIRAMFIN.NS",
        ],
        isDefault: true,
    },
    {
        id: "tech_and_software",
        name: "Tech & Software",
        tickers: [
            "TCS.NS",
            "INFY.NS",
            "HCLTECH.NS",
            "WIPRO.NS",
            "TECHM.NS",
            "PERSISTENT.NS",
            "LTIM.NS",
            "OFSS.NS",
            "COFORGE.NS",
        ],
        isDefault: true,
    },
    {
        id: "auto_and_ev",
        name: "Auto & EV Ecosystem",
        tickers: [
            "TATAMOTORS.NS",
            "M&M.NS",
            "MARUTI.NS",
            "BAJAJ-AUTO.NS",
            "HEROMOTOCO.NS",
            "TVSMOTOR.NS",
            "EICHERMOT.NS",
            "BOSCHLTD.NS",
        ],
        isDefault: true,
    },
];

const STORAGE_KEY = "custom_rrg_watchlists";
const ACTIVE_KEY = "active_rrg_watchlist_id";

export function useWatchlists() {
    const [watchlists, setWatchlists] = useState<Watchlist[]>(DEFAULT_WATCHLISTS);
    const [activeId, setActiveId] = useState<string>("large_cap_leaders");
    const [isLoaded, setIsLoaded] = useState<boolean>(false);

    // Initial load from localStorage
    useEffect(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    setWatchlists(parsed);
                }
            }

            const savedActive = localStorage.getItem(ACTIVE_KEY);
            if (savedActive) {
                setActiveId(savedActive);
            }
        } catch {
            // fallback to default
        } finally {
            setIsLoaded(true);
        }
    }, []);

    // Sync state changes to localStorage
    const saveWatchlists = useCallback((updated: Watchlist[]) => {
        setWatchlists(updated);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        } catch {
            // ignore
        }
    }, []);

    const changeActiveId = useCallback((id: string) => {
        setActiveId(id);
        try {
            localStorage.setItem(ACTIVE_KEY, id);
        } catch {
            // ignore
        }
    }, []);

    // Get current active watchlist
    const activeWatchlist = watchlists.find((w) => w.id === activeId) || watchlists[0] || DEFAULT_WATCHLISTS[0];

    // Create a new watchlist
    const createWatchlist = useCallback(
        (name: string, initialTickers: string[] = []) => {
            const id = `wl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            const newWl: Watchlist = {
                id,
                name: name.trim() || "New Watchlist",
                tickers: initialTickers,
            };
            const updated = [...watchlists, newWl];
            saveWatchlists(updated);
            changeActiveId(id);
            return id;
        },
        [watchlists, saveWatchlists, changeActiveId]
    );

    // Rename active or specific watchlist
    const renameWatchlist = useCallback(
        (id: string, newName: string) => {
            const trimmed = newName.trim();
            if (!trimmed) return;
            const updated = watchlists.map((w) => (w.id === id ? { ...w, name: trimmed } : w));
            saveWatchlists(updated);
        },
        [watchlists, saveWatchlists]
    );

    // Delete a watchlist
    const deleteWatchlist = useCallback(
        (id: string) => {
            if (watchlists.length <= 1) return; // Prevent deleting the last watchlist
            const updated = watchlists.filter((w) => w.id !== id);
            saveWatchlists(updated);
            if (activeId === id) {
                changeActiveId(updated[0].id);
            }
        },
        [watchlists, activeId, saveWatchlists, changeActiveId]
    );

    // Add ticker to active watchlist
    const addTicker = useCallback(
        (ticker: string) => {
            const formatted = ticker.trim().toUpperCase();
            if (!formatted) return;

            const updated = watchlists.map((w) => {
                if (w.id === activeId) {
                    if (w.tickers.includes(formatted)) return w;
                    return { ...w, tickers: [...w.tickers, formatted] };
                }
                return w;
            });
            saveWatchlists(updated);
        },
        [watchlists, activeId, saveWatchlists]
    );

    // Add multiple tickers to active watchlist
    const addMultipleTickers = useCallback(
        (tickers: string[]) => {
            const newTickers = tickers.map((t) => t.trim().toUpperCase()).filter(Boolean);
            if (newTickers.length === 0) return;

            const updated = watchlists.map((w) => {
                if (w.id === activeId) {
                    const set = new Set([...w.tickers, ...newTickers]);
                    return { ...w, tickers: Array.from(set) };
                }
                return w;
            });
            saveWatchlists(updated);
        },
        [watchlists, activeId, saveWatchlists]
    );

    // Remove ticker from active watchlist
    const removeTicker = useCallback(
        (ticker: string) => {
            const updated = watchlists.map((w) => {
                if (w.id === activeId) {
                    return { ...w, tickers: w.tickers.filter((t) => t !== ticker) };
                }
                return w;
            });
            saveWatchlists(updated);
        },
        [watchlists, activeId, saveWatchlists]
    );

    // Clear all tickers in active watchlist
    const clearActiveWatchlist = useCallback(() => {
        const updated = watchlists.map((w) => {
            if (w.id === activeId) {
                return { ...w, tickers: [] };
            }
            return w;
        });
        saveWatchlists(updated);
    }, [watchlists, activeId, saveWatchlists]);

    // Reset watchlists to factory defaults
    const resetToDefaults = useCallback(() => {
        saveWatchlists(DEFAULT_WATCHLISTS);
        changeActiveId(DEFAULT_WATCHLISTS[0].id);
    }, [saveWatchlists, changeActiveId]);

    // Export watchlists as JSON string
    const exportWatchlistsJson = useCallback(() => {
        return JSON.stringify(watchlists, null, 2);
    }, [watchlists]);

    // Import watchlists from JSON string
    const importWatchlistsJson = useCallback(
        (jsonString: string) => {
            try {
                const parsed = JSON.parse(jsonString);
                if (!Array.isArray(parsed) || parsed.length === 0) {
                    throw new Error("Invalid format: expected array of watchlists");
                }
                // Basic validation
                const valid = parsed.map((w: Partial<Watchlist>, idx: number) => ({
                    id: w.id || `imported_${idx}_${Date.now()}`,
                    name: w.name || `Imported List ${idx + 1}`,
                    tickers: Array.isArray(w.tickers) ? w.tickers : [],
                }));
                saveWatchlists(valid);
                changeActiveId(valid[0].id);
                return true;
            } catch (err) {
                console.error("Failed to import watchlists:", err);
                return false;
            }
        },
        [saveWatchlists, changeActiveId]
    );

    return {
        watchlists,
        activeWatchlist,
        activeId,
        isLoaded,
        setActiveId: changeActiveId,
        createWatchlist,
        renameWatchlist,
        deleteWatchlist,
        addTicker,
        addMultipleTickers,
        removeTicker,
        clearActiveWatchlist,
        resetToDefaults,
        exportWatchlistsJson,
        importWatchlistsJson,
    };
}
