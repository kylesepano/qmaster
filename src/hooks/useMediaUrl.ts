import { useEffect, useState } from "react";
import { mediaUrl } from "../services/media";

export function useMediaUrl(path?: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setUrl(null);
    if (!path) return;
    const refresh = () =>
      void mediaUrl(path)
        .then((value) => {
          if (active) setUrl(value);
        })
        .catch(() => {
          if (active) setUrl(null);
        });
    refresh();
    const interval = setInterval(refresh, 50 * 60 * 1000);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [path]);
  return url;
}
