import { useEffect, useState } from "react";

/** Tiny typed wrapper around localStorage with a `useState`-like API. */
export function useLocalSetting<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return initial;
      return JSON.parse(raw) as T;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* quota / disabled — ignore */
    }
  }, [key, value]);

  return [value, setValue];
}
