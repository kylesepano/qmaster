import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

export function usePublicData<T>(
  loader: () => Promise<T>,
  tables: string[],
  filter?: string,
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const version = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++version.current;
    try {
      const result = await loader();
      if (current === version.current) {
        setData(result);
        setError("");
      }
    } catch (e) {
      if (current === version.current)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (current === version.current) setLoading(false);
    }
  }, [loader]);
  const tableKey = tables.join(",");
  useEffect(() => {
    setData(null);
    setLoading(true);
    void refresh();
    if (!supabase)
      return () => {
        version.current++;
      };
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 150);
    };
    const channel = supabase.channel(`spectators-${crypto.randomUUID()}`);
    for (const table of tableKey.split(","))
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, ...(filter ? { filter } : {}) },
        update,
      );
    channel.subscribe((status) => {
      setLive(status === "SUBSCRIBED");
      if (status === "SUBSCRIBED") void refresh();
    });
    const interval = setInterval(() => void refresh(), 20000);
    window.addEventListener("focus", update);
    return () => {
      version.current++;
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener("focus", update);
      void supabase!.removeChannel(channel);
      setLive(false);
    };
  }, [refresh, tableKey, filter]);
  return { data, loading, error, live, refresh };
}
