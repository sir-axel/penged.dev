export function getReturnTo() {
  let e = new URLSearchParams(window.location.search).get("returnTo");
  if (!e) return "/";
  try {
    let t = new URL(e, window.location.origin);
    if (t.origin !== window.location.origin) return "/";
    for (let e of [
      "access_token",
      "clear_access_token",
      "app_id",
      "app_base_url",
      "functions_version",
      "from_url",
    ])
      t.searchParams.delete(e);
    let n = t.pathname + t.search;
    return !n.startsWith("/") || n.startsWith("//") || n.includes("\\") ? "/" : n;
  } catch {
    return "/";
  }
}
