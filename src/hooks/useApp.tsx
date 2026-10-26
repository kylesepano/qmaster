import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { configured, supabase } from "../lib/supabase";
import { loadData } from "../services/api";
import { EMPTY_DATA } from "../types";
import type { AppData } from "../types";

interface AppContextValue {
  user: User | null;
  authLoading: boolean;
  configured: boolean;
  data: AppData;
  loading: boolean;
  error: string | null;
  busy: boolean;
  notice: { text: string; error: boolean } | null;
  refresh: () => Promise<void>;
  act: (work: () => Promise<unknown>, success?: string) => Promise<boolean>;
  clearNotice: () => void;
  live: boolean;
}
const AppContext = createContext<AppContextValue | null>(null);
export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(configured);
  const [data, setData] = useState<AppData>(EMPTY_DATA);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(false);
  const [notice, setNotice] = useState<AppContextValue["notice"]>(null);
  const request = useRef(0);
  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (mounted) {
          setUser(data.session?.user ?? null);
          setAuthLoading(false);
          if (error) setError(error.message);
        }
      })
      .catch((e) => {
        if (mounted) {
          setError(String(e));
          setAuthLoading(false);
        }
      });
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
        setAuthLoading(false);
      },
    );
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);
  const refresh = useCallback(async () => {
    if (!user || !configured) return;
    const current = ++request.current;
    setLoading(true);
    try {
      const fresh = await loadData(user.id);
      if (current === request.current) {
        setData(fresh);
        setError(null);
      }
    } catch (e) {
      if (current === request.current)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (current === request.current) setLoading(false);
    }
  }, [user?.id]);
  useEffect(() => {
    if (!user || !supabase) {
      request.current++;
      setData(EMPTY_DATA);
      setLoading(false);
      return;
    }
    setData(EMPTY_DATA);
    void refresh();
    let timer: ReturnType<typeof setTimeout>;
    const channel = supabase.channel(`organizer-${user.id}`);
    for (const table of [
      "players",
      "tournaments",
      "tournament_entries",
      "tournament_matches",
      "queue_sessions",
      "queue_members",
      "queue_matches",
    ]) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          clearTimeout(timer);
          timer = setTimeout(() => void refresh(), 180);
        },
      );
    }
    channel.subscribe((status) => {
      setLive(status === "SUBSCRIBED");
      if (status === "SUBSCRIBED") void refresh();
    });
    const interval = setInterval(() => void refresh(), 30000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      void supabase!.removeChannel(channel);
      setLive(false);
    };
  }, [user?.id, refresh]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(
      () => setNotice(null),
      notice.error ? 10000 : 4500,
    );
    return () => clearTimeout(timer);
  }, [notice]);
  const act = async (work: () => Promise<unknown>, success?: string) => {
    if (busy) return false;
    setBusy(true);
    try {
      await work();
      if (success) setNotice({ text: success, error: false });
      await refresh();
      return true;
    } catch (e) {
      setNotice({
        text: e instanceof Error ? e.message : String(e),
        error: true,
      });
      return false;
    } finally {
      setBusy(false);
    }
  };
  return (
    <AppContext.Provider
      value={{
        user,
        authLoading,
        configured,
        data,
        loading,
        error,
        refresh,
        act,
        busy,
        notice,
        clearNotice: () => setNotice(null),
        live,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
export function useApp() {
  const app = useContext(AppContext);
  if (!app) throw new Error("AppProvider is missing");
  return app;
}
