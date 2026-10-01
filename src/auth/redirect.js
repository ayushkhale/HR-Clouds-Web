// `?redirect=` only ever points inside the app — reject absolute and
// protocol-relative URLs ("https://…", "//…") so it can't send users off-site.
export const safeRedirect = (value) => (value && /^\/(?![/\\])/.test(value) ? value : null);
