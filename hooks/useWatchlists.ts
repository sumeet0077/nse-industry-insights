// hooks/useWatchlists.ts
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { cleanTicker, normalizeTickerSymbol } from "@/lib/utils";

export interface Watchlist {
    id: string;
    name: string;
    tickers: string[];
    folder?: string;
    isSystem?: boolean;
    isDefault?: boolean;
    createdAt?: string;
}

const DEFAULT_WATCHLISTS: Watchlist[] = [
    {
        id: "large_cap_leaders",
        name: "Large Cap Leaders",
        folder: "Core Themes",
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
        folder: "Core Themes",
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
        folder: "Core Themes",
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
        folder: "Core Themes",
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

export function useWatchlists(systemWatchlists?: Watchlist[]) {
    const [userWatchlists, setUserWatchlists] = useState<Watchlist[]>(DEFAULT_WATCHLISTS);
    const [activeId, setActiveId] = useState<string>("large_cap_leaders");
    const [isLoaded, setIsLoaded] = useState<boolean>(false);

    // Initial load from localStorage with migration
    useEffect(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    const migrated: Watchlist[] = parsed
                        .filter((w: Watchlist) => !w.isSystem)
                        .map((w: Watchlist) => ({
                            ...w,
                            folder: w.folder || (w.isDefault ? "Core Themes" : "Custom"),
                        }));
                    if (migrated.length > 0) {
                        setUserWatchlists(migrated);
                    }
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

    // Sync state changes to localStorage (strip system watchlists)
    const saveUserWatchlists = useCallback((updated: Watchlist[]) => {
        const userOnly = updated.filter((w) => !w.isSystem);
        setUserWatchlists(userOnly);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(userOnly));
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

    // Combine system watchlists with user watchlists (system watchlists first or dynamic)
    const watchlists = useMemo(() => {
        if (!systemWatchlists || systemWatchlists.length === 0) {
            return userWatchlists;
        }
        const seenIds = new Set<string>();
        const combined: Watchlist[] = [];
        for (const w of userWatchlists) {
            if (!seenIds.has(w.id)) {
                seenIds.add(w.id);
                combined.push(w);
            }
        }
        for (const w of systemWatchlists) {
            if (!seenIds.has(w.id)) {
                seenIds.add(w.id);
                combined.push(w);
            }
        }
        return combined;
    }, [systemWatchlists, userWatchlists]);

    // Get current active watchlist
    const activeWatchlist = watchlists.find((w) => w.id === activeId) || watchlists[0] || DEFAULT_WATCHLISTS[0];

    // Create a new watchlist
    const createWatchlist = useCallback(
        (name: string, initialTickers: string[] = [], folder: string = "Custom") => {
            const id = `wl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            const newWl: Watchlist = {
                id,
                name: name.trim() || "New Watchlist",
                tickers: initialTickers.map(normalizeTickerSymbol).filter(Boolean),
                folder: folder.trim() || "Custom",
                createdAt: new Date().toISOString(),
            };
            const updated = [...userWatchlists, newWl];
            saveUserWatchlists(updated);
            changeActiveId(id);
            return id;
        },
        [userWatchlists, saveUserWatchlists, changeActiveId]
    );

    // Clone an existing watchlist (e.g. dynamic system watchlist) into a custom folder
    const cloneWatchlist = useCallback(
        (sourceId: string, targetFolder: string = "52W Scans", customName?: string) => {
            const source = watchlists.find((w) => w.id === sourceId);
            if (!source) return null;
            const newName = customName || `${source.name} (Copy)`;
            return createWatchlist(newName, [...source.tickers], targetFolder);
        },
        [watchlists, createWatchlist]
    );

    // Rename a user watchlist
    const renameWatchlist = useCallback(
        (id: string, newName: string) => {
            const trimmed = newName.trim();
            if (!trimmed) return;
            const target = userWatchlists.find((w) => w.id === id);
            if (!target || target.isSystem) return; // Prevent renaming system watchlists
            const updated = userWatchlists.map((w) => (w.id === id ? { ...w, name: trimmed } : w));
            saveUserWatchlists(updated);
        },
        [userWatchlists, saveUserWatchlists]
    );

    // Delete a user watchlist
    const deleteWatchlist = useCallback(
        (id: string) => {
            const target = userWatchlists.find((w) => w.id === id);
            if (!target || target.isSystem) return; // Prevent deleting system watchlists
            if (userWatchlists.length <= 1) return; // Prevent deleting the last watchlist
            const updated = userWatchlists.filter((w) => w.id !== id);
            saveUserWatchlists(updated);
            if (activeId === id) {
                changeActiveId(updated[0].id);
            }
        },
        [userWatchlists, activeId, saveUserWatchlists, changeActiveId]
    );

    // Rename a folder across user watchlists
    const renameFolder = useCallback(
        (oldFolder: string, newFolder: string) => {
            const trimmed = newFolder.trim();
            if (!trimmed || trimmed === oldFolder) return;
            const updated = userWatchlists.map((w) =>
                w.folder === oldFolder ? { ...w, folder: trimmed } : w
            );
            saveUserWatchlists(updated);
        },
        [userWatchlists, saveUserWatchlists]
    );

    // Dissolve a folder (moves its watchlists to "Custom", preventing accidental ticker loss)
    const dissolveFolder = useCallback(
        (folder: string) => {
            const updated = userWatchlists.map((w) =>
                w.folder === folder ? { ...w, folder: "Custom" } : w
            );
            saveUserWatchlists(updated);
        },
        [userWatchlists, saveUserWatchlists]
    );

    // Delete a folder and all watchlists inside it
    const deleteFolderAndWatchlists = useCallback(
        (folder: string) => {
            const remaining = userWatchlists.filter((w) => w.folder !== folder);
            if (remaining.length === 0) {
                saveUserWatchlists(DEFAULT_WATCHLISTS);
                changeActiveId(DEFAULT_WATCHLISTS[0].id);
                return;
            }
            saveUserWatchlists(remaining);
            if (activeWatchlist.folder === folder) {
                changeActiveId(remaining[0].id);
            }
        },
        [userWatchlists, activeWatchlist, saveUserWatchlists, changeActiveId]
    );

    // Add ticker to active watchlist (if user list)
    const addTicker = useCallback(
        (ticker: string) => {
            const formatted = normalizeTickerSymbol(ticker);
            if (!formatted) return;
            const targetClean = cleanTicker(formatted).toUpperCase();

            const isUserList = userWatchlists.some((w) => w.id === activeId);
            if (!isUserList) return;

            const updated = userWatchlists.map((w) => {
                if (w.id === activeId) {
                    const cleanSet = new Set(w.tickers.map((t) => cleanTicker(t).toUpperCase()));
                    if (cleanSet.has(targetClean)) return w;
                    return { ...w, tickers: [...w.tickers, formatted] };
                }
                return w;
            });
            saveUserWatchlists(updated);
        },
        [userWatchlists, activeId, saveUserWatchlists]
    );

    // Add multiple tickers to active watchlist
    const addMultipleTickers = useCallback(
        (tickers: string[]) => {
            const newTickers = tickers.map(normalizeTickerSymbol).filter(Boolean);
            if (newTickers.length === 0) return;

            const isUserList = userWatchlists.some((w) => w.id === activeId);
            if (!isUserList) return;

            const updated = userWatchlists.map((w) => {
                if (w.id === activeId) {
                    const seen = new Set<string>();
                    const merged: string[] = [];
                    for (const t of w.tickers) {
                        const clean = cleanTicker(t).toUpperCase();
                        if (clean && !seen.has(clean)) {
                            seen.add(clean);
                            merged.push(t.endsWith(".NS") ? t : `${clean}.NS`);
                        }
                    }
                    for (const t of newTickers) {
                        const clean = cleanTicker(t).toUpperCase();
                        if (clean && !seen.has(clean)) {
                            seen.add(clean);
                            merged.push(t);
                        }
                    }
                    return { ...w, tickers: merged };
                }
                return w;
            });
            saveUserWatchlists(updated);
        },
        [userWatchlists, activeId, saveUserWatchlists]
    );

    // Replace all tickers in active watchlist
    const setTickers = useCallback(
        (tickers: string[]) => {
            const newTickers = tickers.map(normalizeTickerSymbol).filter(Boolean);
            const isUserList = userWatchlists.some((w) => w.id === activeId);
            if (!isUserList) return;

            const updated = userWatchlists.map((w) => {
                if (w.id === activeId) {
                    const seen = new Set<string>();
                    const unique: string[] = [];
                    for (const t of newTickers) {
                        const clean = cleanTicker(t).toUpperCase();
                        if (clean && !seen.has(clean)) {
                            seen.add(clean);
                            unique.push(t);
                        }
                    }
                    return { ...w, tickers: unique };
                }
                return w;
            });
            saveUserWatchlists(updated);
        },
        [userWatchlists, activeId, saveUserWatchlists]
    );

    // Remove ticker from active watchlist
    const removeTicker = useCallback(
        (ticker: string) => {
            const targetClean = cleanTicker(ticker).toUpperCase();
            const isUserList = userWatchlists.some((w) => w.id === activeId);
            if (!isUserList) return;

            const updated = userWatchlists.map((w) => {
                if (w.id === activeId) {
                    return { ...w, tickers: w.tickers.filter((t) => cleanTicker(t).toUpperCase() !== targetClean) };
                }
                return w;
            });
            saveUserWatchlists(updated);
        },
        [userWatchlists, activeId, saveUserWatchlists]
    );

    // Clear all tickers in active watchlist
    const clearActiveWatchlist = useCallback(() => {
        const isUserList = userWatchlists.some((w) => w.id === activeId);
        if (!isUserList) return;

        const updated = userWatchlists.map((w) => {
            if (w.id === activeId) {
                return { ...w, tickers: [] };
            }
            return w;
        });
        saveUserWatchlists(updated);
    }, [userWatchlists, activeId, saveUserWatchlists]);

    // Reset watchlists to factory defaults
    const resetToDefaults = useCallback(() => {
        saveUserWatchlists(DEFAULT_WATCHLISTS);
        changeActiveId(DEFAULT_WATCHLISTS[0].id);
    }, [saveUserWatchlists, changeActiveId]);

    // Export user watchlists as JSON string
    const exportWatchlistsJson = useCallback(() => {
        const exportable = userWatchlists.map(({ id, name, tickers, folder, isDefault, createdAt }) => ({
            id,
            name,
            tickers,
            folder: folder || "Custom",
            isDefault,
            createdAt,
        }));
        return JSON.stringify(exportable, null, 2);
    }, [userWatchlists]);

    // Import watchlists from JSON string
    const importWatchlistsJson = useCallback(
        (jsonString: string) => {
            try {
                const parsed = JSON.parse(jsonString);
                if (!Array.isArray(parsed) || parsed.length === 0) {
                    throw new Error("Invalid format: expected array of watchlists");
                }
                const valid = parsed
                    .filter((w: Partial<Watchlist>) => !w.isSystem)
                    .map((w: Partial<Watchlist>, idx: number) => ({
                        id: w.id || `imported_${idx}_${Date.now()}`,
                        name: w.name || `Imported List ${idx + 1}`,
                        tickers: Array.isArray(w.tickers) ? w.tickers : [],
                        folder:
                            w.folder && typeof w.folder === "string" && w.folder.trim()
                                ? w.folder.trim()
                                : w.isDefault
                                ? "Core Themes"
                                : "Custom",
                        isDefault: Boolean(w.isDefault),
                        createdAt: w.createdAt || new Date().toISOString(),
                    }));
                if (valid.length === 0) {
                    throw new Error("No valid user watchlists found in import data");
                }
                saveUserWatchlists(valid);
                changeActiveId(valid[0].id);
                return true;
            } catch (err) {
                console.error("Failed to import watchlists:", err);
                return false;
            }
        },
        [saveUserWatchlists, changeActiveId]
    );

    return {
        watchlists,
        userWatchlists,
        activeWatchlist,
        activeId,
        isLoaded,
        setActiveId: changeActiveId,
        createWatchlist,
        cloneWatchlist,
        renameWatchlist,
        deleteWatchlist,
        renameFolder,
        dissolveFolder,
        deleteFolderAndWatchlists,
        addTicker,
        addMultipleTickers,
        setTickers,
        removeTicker,
        clearActiveWatchlist,
        resetToDefaults,
        exportWatchlistsJson,
        importWatchlistsJson,
    };
}
