import { useState, useEffect } from "react";

export function useLocalStorage<T>(key: string, initialValue: T | (() => T)): [T, (value: T | ((val: T) => T)) => void] {
    const getInitial = () => (initialValue instanceof Function ? initialValue() : initialValue);

    const [storedValue, setStoredValue] = useState<T>(getInitial);

    // Sync from localStorage after hydration (client-side only)
    useEffect(() => {
        try {
            const item = window.localStorage.getItem(key);
            if (item !== null) {
                const parsed = JSON.parse(item);
                if (parsed !== undefined) {
                    setStoredValue(parsed);
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

