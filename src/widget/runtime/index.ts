/**
 * EpiFive Website Privacy Kit — embed runtime (public/w.js), plan §7.3.
 *
 *   <script src="https://…/w.js" data-site="pk_live_…" async></script>
 *
 * - Purpose-wise banner with equal-weight Accept all / Reject all / Let me choose (C1)
 * - Preference centre: every optional purpose off by default; "needed" purposes
 *   listed without a toggle; withdrawal as easy as giving consent (C2)
 * - Script gating: <script type="text/plain" data-wpk-purpose="analytics">,
 *   <iframe data-wpk-purpose="ads" data-wpk-src="…">
 * - Google Consent Mode v2: default denied, update on choice
 * - wpk.form(formEl, { purposes, subject, primary }) for form-level consent
 * - [data-wpk-open] opens the preference centre; [data-wpk-withdraw] withdraws all
 * - Children mode (s.9): an age question first; under 18 -> nothing is recorded
 *   and everything optional stays off (the parental-consent flow is in the Pro
 *   edition); tracking/ads can never be switched on for a child (s.9(3))
 * - Talks only to the platform that served this script; no third-party calls,
 *   no cookies (one localStorage entry per site). No personal data in the bundle.
 *
 * Must stay ≤ 10 KB gzip (scripts/build-widget.mjs, tests/widget.test.ts).
 */
import { EN, type Strings } from "./i18n/en";

declare const __WPK_CSS__: string;
declare const __WPK_VERSION__: string;

type Bi = { en: string; hi: string };
type Lang = "en" | "hi";
interface Purpose {
  key: string;
  name: Bi;
  desc: Bi;
  items: { en: string[]; hi: string[] };
  vendors?: string[];
  keep?: Bi | null;
  basis?: Bi;
  tracking?: boolean;
}
interface Config {
  v: string;
  org: string;
  notice: { version: number } | null;
  links: { notice: string; rights: string; withdraw: string; board: string };
  contact: { name: string; email: string; phone: string } | null;
  purposes: Purpose[];
  children?: boolean;
  brand?: { t: string; u: string };
  necessary: Purpose[];
  voluntary: Array<{ key: string; name: Bi }>;
  theme: { primary: string; background: string; text: string; position: string; lang: string; floating: boolean };
  gcm: Record<string, string>;
}
interface Stored {
  id: string;
  c: Record<string, boolean>;
  nv: number;
  l: Lang;
}
type Choices = Record<string, boolean>;
type Listener = (c: Choices) => void;
interface FormOpts {
  purposes?: string[];
  subject?: string;
  primary?: string;
}

((w: Window & { wpk?: unknown; dataLayer?: unknown[] }, d: Document) => {
  if (w.wpk) return;
  const me = (d.currentScript || d.querySelector("script[data-site]")) as HTMLScriptElement | null;
  const pk = me?.getAttribute("data-site") || "";
  if (!me || !pk) return;
  const src = new URL(me.src, location.href);
  const api = (me.getAttribute("data-api") || src.origin).replace(/\/+$/, "");
  const KEY = "wpk_" + pk;
  const AK = "wpka_" + pk;
  // Children mode: { a: "a" } adult, { a: "c", id } under 18 (only the answer and a random id are kept).
  let age: { a: string; id?: string } | null = null;
  const kid = () => !!(cfg && cfg.children && age && age.a === "c");
  const strings: Record<string, Strings> = { en: EN };
  const listeners: Listener[] = [];
  let cfg: Config | null = null;
  let st: Stored | null = null;
  let lang: Lang = "en";
  let root: ShadowRoot | null = null;
  let last: Element | null = null;

  const T = () => strings[lang] || EN;
  const e = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => "&#" + c.charCodeAt(0) + ";");
  const f = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
  const b = (x: Bi) => x[lang] || x.en;
  const ls = {
    get(k: string) {
      try {
        return JSON.parse(localStorage.getItem(k) || "null");
      } catch {
        return null;
      }
    },
    set(k: string, v: unknown) {
      try {
        localStorage.setItem(k, JSON.stringify(v));
      } catch {
        /* storage blocked: the choice lasts for this page view */
      }
    },
  };
  const uid = () => {
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    return Array.from(a, (x) => (x + 256).toString(16).slice(1)).join("");
  };
  const granted = (k: string) => !!(st && st.c[k]);
  const choices = (): Choices => ({ ...(st ? st.c : {}) });

  // ── Google Consent Mode v2: everything optional denied until a choice is made ──
  w.dataLayer = w.dataLayer || [];
  // gtag() must push the arguments object itself, as Google's snippet does.
  const gtag: (...a: unknown[]) => void = function () {
    // eslint-disable-next-line prefer-rest-params
    w.dataLayer!.push(arguments);
  };
  const GCM = ["ad_storage", "ad_user_data", "ad_personalization", "analytics_storage", "personalization_storage"];
  const gcmState = (all?: boolean) => {
    const o: Record<string, string> = { functionality_storage: "granted", security_storage: "granted" };
    for (const t of GCM) o[t] = all !== undefined ? (all ? "granted" : "denied") : cfg && cfg.gcm[t] && granted(cfg.gcm[t]) ? "granted" : "denied";
    return o;
  };
  gtag("consent", "default", { ...gcmState(false), wait_for_update: 500 });

  // ── Script / iframe gating ──
  const gate = () => {
    d.querySelectorAll<HTMLElement>("[data-wpk-purpose]").forEach((el) => {
      const need = (el.getAttribute("data-wpk-purpose") || "").split(/[\s,]+/).filter(Boolean);
      if (!need.length || !need.every(granted)) return;
      if (el.tagName === "SCRIPT") {
        if ((el as HTMLScriptElement).type !== "text/plain") return;
        const s = d.createElement("script");
        for (const a of Array.from(el.attributes)) if (a.name !== "type" && a.name.indexOf("data-wpk-") !== 0) s.setAttribute(a.name, a.value);
        // The browser hides the nonce attribute on pages with a CSP header; copy the property instead.
        if ((el as HTMLScriptElement).nonce) s.nonce = (el as HTMLScriptElement).nonce;
        s.type = el.getAttribute("data-wpk-type") || "text/javascript";
        if (!s.src) s.text = el.textContent || "";
        s.async = false;
        el.replaceWith(s);
      } else {
        const v = el.getAttribute("data-wpk-src");
        el.removeAttribute("data-wpk-purpose");
        if (v) el.setAttribute("src", v);
      }
    });
  };

  // ── Server ──
  const send = (c: Choices, extra?: Record<string, unknown>) => {
    if (!cfg || !cfg.notice) return Promise.resolve(null);
    if (kid()) return Promise.resolve(null);
    const body = JSON.stringify({ site: pk, sid: st ? st.id : uid(), c, l: lang, nv: cfg.notice.version, ch: "banner", u: location.href, wv: __WPK_VERSION__, ...extra });
    const url = api + "/api/v1/consent";
    if (!extra && navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], { type: "text/plain" }))) return Promise.resolve(null);
    return fetch(url, { method: "POST", body, keepalive: true, credentials: "omit", mode: "cors" })
      .then((r) => r.json())
      .catch(() => null);
  };

  const emit = () => {
    const c = choices();
    for (const fn of listeners) {
      try {
        fn(c);
      } catch {
        /* a site listener must not break the banner */
      }
    }
    d.dispatchEvent(new CustomEvent("wpk:change", { detail: c }));
  };

  const decide = (c: Choices) => {
    if (!cfg || !cfg.notice) return;
    if (kid()) return show("kid");
    const changed: Choices = {};
    for (const p of cfg.purposes) {
      const v = !!c[p.key];
      if (!st || st.c[p.key] !== v || st.nv !== cfg.notice.version) changed[p.key] = v;
    }
    st = { id: st ? st.id : uid(), c: Object.fromEntries(cfg.purposes.map((p) => [p.key, !!c[p.key]])), nv: cfg.notice.version, l: lang };
    ls.set(KEY, st);
    if (Object.keys(changed).length) send(changed);
    gtag("consent", "update", gcmState());
    gate();
    emit();
    show("done");
  };
  const all = (v: boolean) => (cfg ? Object.fromEntries(cfg.purposes.map((p) => [p.key, v])) : {});

  // ── UI ──
  // Constructable stylesheet: works on host pages with a strict style-src CSP (no unsafe-inline);
  // a <style> element only in browsers without adoptedStyleSheets.
  let sheet: CSSStyleSheet | null | undefined;
  const styles = (r: ShadowRoot) => {
    if (sheet === undefined) {
      try {
        sheet = new CSSStyleSheet();
        sheet.replaceSync(__WPK_CSS__);
      } catch {
        sheet = null;
      }
    }
    if (sheet) {
      r.adoptedStyleSheets = [sheet];
      return "";
    }
    return `<style>${__WPK_CSS__}</style>`;
  };
  const mount = () => {
    if (root) return root;
    const host = d.createElement("div");
    host.id = "wpk-root";
    const th = cfg!.theme;
    host.style.cssText = `--p:${th.primary};--b:${th.background};--t:${th.text}`;
    root = host.attachShadow({ mode: "open" });
    d.body.appendChild(host);
    root.addEventListener("click", onClick);
    root.addEventListener("keydown", onKey as EventListener);
    return root;
  };
  const btn = (a: string, label: string, cls = "btn") => `<button type="button" class="${cls}" data-a="${a}">${e(label)}</button>`;
  const langBtn = () => btn("lang", T().other, "lk").replace("<button", `<button lang="${lang === "en" ? "hi" : "en"}"`);
  const brand = () => (cfg!.brand ? ` · ${cfg!.brand.u ? `<a href="${e(cfg!.brand.u)}" target="_blank" rel="noopener">${e(cfg!.brand.t)}</a>` : e(cfg!.brand.t)}` : "");
  const contact = () => (cfg!.contact ? e(f(T().contact, { c: [cfg!.contact.name, cfg!.contact.email, cfg!.contact.phone].filter(Boolean).join(", ") })) : "");
  const noticeLink = () => `<a href="${e(cfg!.links.notice)}?lang=${lang}" target="_blank" rel="noopener">${e(T().notice)}</a>`;

  const banner = () => {
    const t = T();
    const list = cfg!.purposes.map((p) => b(p.name)).join(", ");
    return `<div class="w ${e(cfg!.theme.position === "center" ? "ov" : cfg!.theme.position)}"><div class="b" role="dialog" aria-modal="${cfg!.theme.position === "center"}" aria-labelledby="wt" aria-describedby="wd" lang="${lang}"><div class="h"><h2 id="wt">${e(t.title)}</h2>${langBtn()}</div><p id="wd">${e(f(t.body, { org: cfg!.org }))}</p>${list ? `<p>${e(f(t.summary, { list }))}</p>` : ""}<p class="s">${noticeLink()} ${contact()}${brand()}</p><div class="btns">${btn("accept", t.accept)}${btn("reject", t.reject)}${btn("choose", t.choose)}</div></div></div>`;
  };

  const details = (p: Purpose) => {
    const t = T();
    const rows = [
      [t.data, p.items[lang].join(", ")],
      [t.basis, p.basis ? b(p.basis) : ""],
      [t.shared, (p.vendors || []).join(", ")],
      [t.keep, p.keep ? b(p.keep) : ""],
    ].filter((r) => r[1]);
    return rows.length ? `<details><summary>${e(t.details)}</summary>${rows.map((r) => `<div><strong>${e(r[0])}:</strong> ${e(r[1])}</div>`).join("")}</details>` : "";
  };

  const centre = () => {
    const t = T();
    const c = cfg!;
    const any = c.purposes.some((p) => granted(p.key));
    const nec = c.necessary.map((p) => `<div class="p"><div class="r"><strong>${e(b(p.name))}</strong><span class="tag">${e(t.alwaysOn)}</span></div><p class="s">${e(b(p.desc))}</p>${details(p)}</div>`).join("");
    const opt = c.purposes
      .map((p, i) => {
        const on = granted(p.key);
        return `<div class="p"><div class="r"><strong id="wn${i}">${e(b(p.name))}</strong><button type="button" class="sw" role="switch" aria-checked="${on}" aria-labelledby="wn${i}" data-k="${e(p.key)}">${e(on ? t.on : t.off)}</button></div><p class="s">${e(b(p.desc))}</p>${details(p)}</div>`;
      })
      .join("");
    const links = [noticeLink(), `<a href="${e(c.links.rights)}" target="_blank" rel="noopener">${e(t.rights)}</a>`, `<a href="${e(c.links.board)}" target="_blank" rel="noopener">${e(t.board)}</a>`].join(" · ");
    return `<div class="w ov"><div class="b" role="dialog" aria-modal="true" aria-labelledby="wp" lang="${lang}"><div class="h"><h2 id="wp">${e(f(t.pcTitle, { org: c.org }))}</h2><span>${langBtn()} ${btn("close", "×", "x").replace("<button", `<button aria-label="${e(t.close)}"`)}</span></div><p>${e(t.pcIntro)}</p>${nec ? `<h3>${e(t.necessary)}</h3>${nec}` : ""}${opt ? `<h3>${e(t.optional)}</h3>${opt}` : ""}<div class="btns">${btn("accept", t.accept)}${btn("reject", any ? t.withdrawAll : t.reject)}${btn("save", t.save)}</div><p class="s">${links}</p><p class="s">${contact()}</p><p class="s">${e(f(t.footer, { org: c.org }))}</p></div></div>`;
  };

  const ageView = () => {
    const t = T();
    return `<div class="w ov"><div class="b" role="dialog" aria-modal="true" aria-labelledby="wa" lang="${lang}"><div class="h"><h2 id="wa">${e(t.ageQ)}</h2>${langBtn()}</div><p>${e(f(t.ageWhy, { org: cfg!.org }))}</p><div class="btns">${btn("adult", t.ageYes)}${btn("child", t.ageNo)}</div><p class="s">${noticeLink()}</p></div></div>`;
  };
  const kidView = () => {
    const t = T();
    return `<div class="w ov"><div class="b" role="dialog" aria-modal="true" aria-labelledby="wk" lang="${lang}"><div class="h"><h2 id="wk">${e(t.kidTitle)}</h2><span>${langBtn()} ${btn("close", "×", "x").replace("<button", `<button aria-label="${e(t.close)}"`)}</span></div><p>${e(t.kidBody)}</p><p>${e(t.kidBlocked)}</p><div class="btns">${btn("reage", t.kidChange)}</div><p class="s">${noticeLink()} ${contact()}</p></div></div>`;
  };

  let view = "";
  const show = (v: "banner" | "centre" | "done" | "none" | "age" | "kid") => {
    if (!cfg) return;
    const r = mount();
    const t = T();
    view = v;
    const fl = cfg.theme.floating ? `<button type="button" class="w f${cfg.theme.position === "bottom-right" ? " rt" : ""}" data-a="open" lang="${lang}">${e(t.floating)}</button>` : "";
    const html =
      v === "age" ? ageView() : v === "kid" ? kidView() : v === "banner" ? banner() : v === "centre" ? centre() : v === "done" ? `${fl}<div class="w toast" role="status">${e(t.saved)}</div>` : fl;
    r.innerHTML = `${styles(r)}${html}`;
    if (v === "done") setTimeout(() => view === "done" && show("none"), 5000);
    const first = r.querySelector<HTMLElement>(v === "centre" ? ".sw,.btn" : ".btn");
    if (v === "centre" || v === "age" || v === "kid" || (v === "banner" && cfg.theme.position === "center")) first?.focus();
    if (v === "none" || v === "done") (last as HTMLElement | null)?.focus?.();
  };

  const open = () => {
    if (!cfg) return;
    if (view !== "centre" && view !== "kid" && view !== "age") last = d.activeElement;
    show(cfg.children && !age ? "age" : kid() ? "kid" : "centre");
  };
  // Only what a verified parent switched on (never tracking/ads) comes back from the server.
  const loadKid = () => {
    if (!kid()) return;
    fetch(`${api}/api/v1/consent?site=${encodeURIComponent(pk)}&sid=${encodeURIComponent(age!.id || "")}`, { credentials: "omit" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { c?: Choices } | null) => {
        if (!j || !j.c || !cfg || !cfg.notice) return;
        st = { id: age!.id!, c: Object.fromEntries(cfg.purposes.filter((p) => !p.tracking).map((p) => [p.key, !!j.c![p.key]])), nv: cfg.notice.version, l: lang };
        gtag("consent", "update", gcmState());
        gate();
        emit();
      })
      .catch(() => {});
  };

  function onClick(ev: Event) {
    const el = (ev.target as Element).closest("button");
    if (!el || !root) return;
    const k = el.getAttribute("data-k");
    if (k) {
      const on = el.getAttribute("aria-checked") !== "true";
      el.setAttribute("aria-checked", String(on));
      el.textContent = on ? T().on : T().off;
      return;
    }
    const a = el.getAttribute("data-a");
    if (a === "accept") decide(all(true));
    else if (a === "reject") decide(all(false));
    else if (a === "choose" || a === "open") open();
    else if (a === "close") show(kid() || (st && st.nv === cfg!.notice!.version) ? "none" : "banner");
    else if (a === "adult") {
      age = { a: "a" };
      ls.set(AK, age);
      show(st && st.nv === cfg!.notice!.version ? "none" : "banner");
    } else if (a === "child") {
      // Under 18: nothing is sent; an earlier choice on this device is dropped and scripts stay blocked.
      age = { a: "c", id: uid() };
      ls.set(AK, age);
      st = null;
      ls.set(KEY, null);
      gtag("consent", "update", gcmState(false));
      emit();
      show("kid");
    } else if (a === "reage") {
      age = null;
      ls.set(AK, null);
      show("age");
    }
    else if (a === "save") {
      const c: Choices = {};
      root.querySelectorAll(".sw").forEach((s) => (c[s.getAttribute("data-k")!] = s.getAttribute("aria-checked") === "true"));
      decide(c);
    } else if (a === "lang") setLang(lang === "en" ? "hi" : "en", true);
  }

  function onKey(ev: KeyboardEvent) {
    if (ev.key === "Escape") {
      // Closing is never consent: the banner returns on the next page if no choice was made.
      if (view === "centre") show(st && st.nv === cfg!.notice!.version ? "none" : "banner");
      else if (view === "banner" || view === "kid" || view === "age") show("none");
      return;
    }
    if (ev.key !== "Tab" || !root) return;
    const modal = root.querySelector(".ov");
    if (!modal) return;
    const items = Array.from(modal.querySelectorAll<HTMLElement>("button,a,summary"));
    const i = items.indexOf(root.activeElement as HTMLElement);
    const next = ev.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : i === items.length - 1 ? 0 : i + 1;
    items[next]?.focus();
    ev.preventDefault();
  }

  const setLang = (l: Lang, rerender?: boolean) => {
    const go = () => {
      lang = strings[l] ? l : "en";
      if (st && rerender) {
        st.l = lang;
        ls.set(KEY, st);
      }
      if (rerender) show(view === "none" || view === "done" ? (st || kid() ? "none" : "banner") : (view as "banner" | "centre" | "age" | "kid"));
      return lang;
    };
    if (strings[l]) return Promise.resolve(go());
    return new Promise<Lang>((res) => {
      const s = d.createElement("script");
      s.src = new URL("w-" + l + ".js", src).href + src.search;
      s.onload = s.onerror = () => res(go());
      d.head.appendChild(s);
    });
  };

  // ── Form consent helper (M3) ──
  const form = (el: HTMLFormElement, o: FormOpts = {}) => {
    const run = () => {
      // Under 18: no form consent from the child (a parent consents on the hosted page).
      if (!cfg || !cfg.notice || !el || el.querySelector("[data-wpk-form]") || kid()) return;
      const t = T();
      const ps = cfg.purposes.filter((p) => !o.purposes || o.purposes.includes(p.key));
      const prim = cfg.voluntary.find((p) => p.key === o.primary);
      const host = d.createElement("div");
      host.setAttribute("data-wpk-form", "");
      const th = cfg.theme;
      host.style.cssText = `--p:${th.primary};--b:${th.background};--t:${th.text}`;
      const r = host.attachShadow({ mode: "open" });
      r.innerHTML = `${styles(r)}<div class="w fm" lang="${lang}"><p>${prim ? e(f(t.formNotice, { p: b(prim.name) })) + " " : ""}${e(t.formSee)} <a href="${e(cfg.links.notice)}?lang=${lang}" target="_blank" rel="noopener">${e(cfg.links.notice)}</a></p>${ps
        .map((p) => `<label><input type="checkbox" data-k="${e(p.key)}"> <span>${e(f(t.formAgree, { p: b(p.name) }))}</span></label>`)
        .join("")}<p class="s">${e(f(t.formWithdraw, { u: "" }))}<a href="${e(cfg.links.withdraw)}" target="_blank" rel="noopener">${e(cfg.links.withdraw)}</a></p></div>`;
      const submit = el.querySelector("[type=submit]");
      if (submit && submit.parentNode) submit.parentNode.insertBefore(host, submit);
      else el.appendChild(host);
      el.addEventListener("submit", () => {
        const c: Choices = {};
        r.querySelectorAll("input").forEach((i) => (c[i.getAttribute("data-k")!] = i.checked));
        const field = el.elements.namedItem(o.subject || "email") as HTMLInputElement | null;
        const v = field && field.value ? field.value : "";
        if (!v || !Object.keys(c).length) return;
        const kind = field!.type === "tel" || /phone|mobile|whatsapp/i.test(field!.name) ? "phone" : "email";
        send(c, { ch: "form", s: { k: kind, v } }).then((res) => el.dispatchEvent(new CustomEvent("wpk:form", { detail: res })));
      });
    };
    if (cfg) run();
    else ready.then(run);
  };

  // ── Boot ──
  let done: () => void = () => {};
  const ready = new Promise<void>((r) => (done = r));
  const boot = (c: Config) => {
    cfg = c;
    if (!c.notice) return; // nothing published yet: stay inactive, scripts stay blocked
    st = ls.get(KEY);
    if (st && (typeof st.id !== "string" || !st.c)) st = null;
    age = c.children ? ls.get(AK) : null;
    if (age && age.a !== "a" && !(age.a === "c" && typeof age.id === "string")) age = null;
    if (kid()) st = null;
    gtag("consent", "update", gcmState());
    gate();
    const auto = c.theme.lang === "auto" ? (/^hi\b/i.test(navigator.language) ? "hi" : "en") : c.theme.lang;
    const want = (st && st.l) || me.getAttribute("data-lang") || auto;
    const fresh = st && st.nv === c.notice.version && c.purposes.every((p) => p.key in st!.c);
    const start = () => {
      setLang(want === "hi" ? "hi" : "en").then(() => {
        show(c.children && !age ? "age" : kid() || fresh ? "none" : "banner");
        loadKid();
        done();
      });
    };
    if (d.body) start();
    else d.addEventListener("DOMContentLoaded", start);
    d.addEventListener("click", (ev) => {
      const t = (ev.target as Element).closest && (ev.target as Element).closest("[data-wpk-open],[data-wpk-withdraw]");
      if (!t) return;
      ev.preventDefault();
      if (t.hasAttribute("data-wpk-open")) open();
      else decide(all(false));
    });
    d.addEventListener("DOMContentLoaded", gate);
  };

  const CK = "wpkc_" + pk;
  const cached = ls.get(CK);
  if (cached && cached.c && Date.now() - cached.t < 3e5) boot(cached.c);
  else
    fetch(`${api}/api/v1/sites/${encodeURIComponent(pk)}/config`, { credentials: "omit" })
      .then((r) => (r.ok ? r.json() : null))
      .then((c: Config | null) => {
        if (!c) return;
        ls.set(CK, { t: Date.now(), c });
        boot(c);
      })
      .catch(() => {
        /* offline or blocked: optional scripts simply stay blocked */
      });

  w.wpk = {
    version: __WPK_VERSION__,
    open,
    get: choices,
    on(ev: string, fn: Listener) {
      if (ev === "change") listeners.push(fn);
    },
    form,
    withdrawAll() {
      decide(all(false));
    },
    lang: (l: Lang) => setLang(l, true),
    _lang(code: string, s: Strings) {
      strings[code] = s;
    },
  };
})(window, document);

export {};
