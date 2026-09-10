export function wireRouteSync(router, win) {
  router.addEventListener("pod-os:route-changed", event => {
    const uri = event.detail;
    if (win.location.href !== uri) win.location = uri;
  });
}

if (typeof document !== "undefined") {
  document.addEventListener("pod-os:loaded", () => {
    const router = document.querySelector("pos-router");
    if (router) wireRouteSync(router, window);
  });
}
