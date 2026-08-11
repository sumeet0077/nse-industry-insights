import { useState, useEffect } from "react";

export function useLocalStorage<T>(key: string, initialValue: T | (() => T)): [T, (value: T | ((val: T) => T)) => void] {
    const getInitial = () => (initialValue instanceof Function ? initialValue() : initialValue);

    const [storedValue, setStoredValue] = useState<T>(getInitial);

    // Sync from localStorage after hydration (client-side only) with strict type validation
    useEffect(() => {
        try {
            const item = window.localStorage.getItem(key);
            if (item !== null && item !== "undefined" && item !== "null") {
                const parsed = JSON.parse(item);
                const defaultVal = getInitial();

                // Ensure restored item matches type of initial default value
                if (Array.isArray(defaultVal)) {
                    if (Array.isArray(parsed)) {
                        setStoredValue(parsed as T);
                    }
                } else if (typeof defaultVal === "number") {
                    if (typeof parsed === "number" && !isNaN(parsed)) {
                        setStoredValue(parsed as T);
                    }
                } else if (typeof defaultVal === "boolean") {
                    if (typeof parsed === "boolean") {
                        setStoredValue(parsed as T);
                    }
                } else if (typeof defaultVal === "string") {
                    if (typeof parsed === "string") {
                        setStoredValue(parsed as T);
                    }
                } else if (parsed !== null && parsed !== undefined) {
                    setStoredValue(parsed as T);
                }
            }
        } catch (error) {
            console.warn(`Error reading localStorage key "${key}":`, error);
        }
    }, [key]);

    const setValue = (value: T | ((val: T) => T)) => {
        try {
            setStoredValue((currentValue) => {
                const valueToStore = value instanceof Function ? value(currentValue) : value;

                if (typeof window !== "undefined") {
                    window.localStorage.setItem(key, JSON.stringify(valueToStore));
                }

                return valueToStore;
            });
        } catch (error) {
            console.warn(`Error setting localStorage key "${key}":`, error);
        }
    };

    return [storedValue, setValue];
}


