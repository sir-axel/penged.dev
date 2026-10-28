        return O;
      },
    }
  );
}
var bg = typeof window > `u`,
  xg = {
    ...(!bg &&
      new URLSearchParams(window.location.search).get(`clear_access_token`) ===
        `true` &&
      (window.localStorage.removeItem(`base44_access_token`),
      window.localStorage.removeItem(`token`)),
    {
      appId: `6ae21c4a201480439351f37f`,
      token: yp(),
      functionsVersion:
        (!bg &&
          new URLSearchParams(window.location.search)
            .get(`functions_version`)
            ?.trim()) ||
        `prod`,
      appBaseUrl: void 0,
    }),
  },
  { appId: Sg, token: Cg, functionsVersion: wg, appBaseUrl: Tg } = xg,
  $ = yg({
    appId: Sg,
    token: Cg,
    functionsVersion: wg,
    serverUrl: ``,
    appBaseUrl: Tg,
  });
function Eg({}) {
  let e = ts().pathname.substring(1),
    { data: t, isFetched: n } = Ca({
      queryKey: [`user`],
      queryFn: async () => {
        try {
          return { user: await $.auth.me(), isAuthenticated: !0 };
        } catch {
          return { user: null, isAuthenticated: !1 };
        }
      },
    });
  return (0, P.jsx)(`div`, {
    className: `min-h-screen flex items-center justify-center p-6 bg-slate-50`,
    children: (0, P.jsx)(`div`, {
      className: `max-w-md w-full`,
      children: (0, P.jsxs)(`div`, {
        className: `text-center space-y-6`,
        children: [
          (0, P.jsxs)(`div`, {
            className: `space-y-2`,
            children: [
              (0, P.jsx)(`h1`, {
                className: `text-7xl font-light text-slate-300`,
                children: `404`,
              }),
              (0, P.jsx)(`div`, {
                className: `h-0.5 w-16 bg-slate-200 mx-auto`,
              }),
            ],
          }),
          (0, P.jsxs)(`div`, {
            className: `space-y-3`,
            children: [
              (0, P.jsx)(`h2`, {
                className: `text-2xl font-medium text-slate-800`,
                children: `Page Not Found`,
              }),
              (0, P.jsxs)(`p`, {
                className: `text-slate-600 leading-relaxed`,
                children: [
                  `The page `,
                  (0, P.jsxs)(`span`, {
                    className: `font-medium text-slate-700`,
                    children: [`"`, e, `"`],
                  }),
                  ` could not be found in this application.`,
                ],
              }),
            ],
          }),
          n &&
            t.isAuthenticated &&
            t.user?.role === `admin` &&
            (0, P.jsx)(`div`, {
              className: `mt-8 p-4 bg-slate-100 rounded-lg border border-slate-200`,
              children: (0, P.jsxs)(`div`, {
                className: `flex items-start space-x-3`,
                children: [
                  (0, P.jsx)(`div`, {
                    className: `flex-shrink-0 w-5 h-5 rounded-full bg-orange-100 flex items-center justify-center mt-0.5`,
                    children: (0, P.jsx)(`div`, {
                      className: `w-2 h-2 rounded-full bg-orange-400`,
                    }),
                  }),
                  (0, P.jsxs)(`div`, {
                    className: `text-left space-y-1`,
                    children: [
                      (0, P.jsx)(`p`, {
                        className: `text-sm font-medium text-slate-700`,
                        children: `Admin Note`,
                      }),
                      (0, P.jsx)(`p`, {
                        className: `text-sm text-slate-600 leading-relaxed`,
                        children: `This could mean that the AI hasn't implemented this page yet. Ask it to implement it in the chat.`,
                      }),
                    ],
                  }),
                ],
              }),
            }),
          (0, P.jsx)(`div`, {
            className: `pt-6`,
            children: (0, P.jsxs)(`button`, {
              onClick: () => (window.location.href = `/`),
              className: `inline-flex items-center px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500`,
              children: [
                (0, P.jsx)(`svg`, {
                  className: `w-4 h-4 mr-2`,
                  fill: `none`,
                  stroke: `currentColor`,
                  viewBox: `0 0 24 24`,
                  children: (0, P.jsx)(`path`, {
                    strokeLinecap: `round`,
                    strokeLinejoin: `round`,
                    strokeWidth: 2,
                    d: `M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6`,
                  }),
                }),
                `Go Home`,
              ],
            }),
          }),
        ],
      }),
    }),
  });
}
var Dg = (0, _.createContext)(),
  Og = ({ children: e }) => {
    let [t, n] = (0, _.useState)(null),
      [r, i] = (0, _.useState)(!1),
      [a, o] = (0, _.useState)(!0),
      [s, c] = (0, _.useState)(!0),
      [l, u] = (0, _.useState)(null),
      [d, f] = (0, _.useState)(!1),
      [p, m] = (0, _.useState)(null);
    (0, _.useEffect)(() => {
      h();
    }, []);
    let h = async () => {
        try {
          c(!0), u(null);
          try {
            let e = await $.app.getPublicSettings();
            m(e), xg.token ? await g() : (o(!1), i(!1), f(!0)), c(!1);
          } catch (e) {
            if (
              (console.error(`App state check failed:`, e),
              e.status === 403 && e.data?.extra_data?.reason)
            ) {
              let t = e.data.extra_data.reason;
              u(
                t === `auth_required`
                  ? {
                      type: `auth_required`,
                      message: `Authentication required`,
                    }
                  : t === `user_not_registered`
                    ? {
                        type: `user_not_registered`,
                        message: `User not registered for this app`,
                      }
                    : { type: t, message: e.message },
              );
            } else
              u({
                type: `unknown`,
                message: e.message || `Failed to load app`,
              });
            c(!1), o(!1);
          }
        } catch (e) {
          console.error(`Unexpected error:`, e),
            u({
              type: `unknown`,
              message: e.message || `An unexpected error occurred`,
            }),
            c(!1),
            o(!1);
        }
      },
      g = async () => {
        try {
          o(!0);
          let e = await $.auth.me();
          n(e), i(!0), o(!1), f(!0);
        } catch (e) {
          console.error(`User auth check failed:`, e),
            o(!1),
            i(!1),
            f(!0),
            (e.status === 401 || e.status === 403) &&
              u({ type: `auth_required`, message: `Authentication required` });
        }
      };
    return (0, P.jsx)(Dg.Provider, {
      value: {
        user: t,
        isAuthenticated: r,
        isLoadingAuth: a,
        isLoadingPublicSettings: s,
        authError: l,
        appPublicSettings: p,
        authChecked: d,
        logout: (e = !0) => {
          n(null),
            i(!1),
            e ? $.auth.logout(window.location.href) : $.auth.logout();
        },
        navigateToLogin: () => {
          $.auth.redirectToLogin(window.location.href);
        },
        checkUserAuth: g,
        checkAppState: h,
      },
      children: e,
    });
  },
  kg = () => {
    let e = (0, _.useContext)(Dg);
    if (!e) throw Error(`useAuth must be used within an AuthProvider`);
    return e;
  },
  Ag = () =>
    (0, P.jsx)(`div`, {
      className: `flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-white to-slate-50`,
      children: (0, P.jsx)(`div`, {
        className: `max-w-md w-full p-8 bg-white rounded-lg shadow-lg border border-slate-100`,
        children: (0, P.jsxs)(`div`, {
          className: `text-center`,
          children: [
            (0, P.jsx)(`div`, {
              className: `inline-flex items-center justify-center w-16 h-16 mb-6 rounded-full bg-orange-100`,
              children: (0, P.jsx)(`svg`, {
                className: `w-8 h-8 text-orange-600`,
                fill: `none`,
                stroke: `currentColor`,
                viewBox: `0 0 24 24`,
                children: (0, P.jsx)(`path`, {
                  strokeLinecap: `round`,
                  strokeLinejoin: `round`,
                  strokeWidth: `2`,
                  d: `M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z`,
                }),
              }),
            }),
            (0, P.jsx)(`h1`, {
              className: `text-3xl font-bold text-slate-900 mb-4`,
              children: `Access Restricted`,
            }),
            (0, P.jsx)(`p`, {
              className: `text-slate-600 mb-8`,
              children: `You are not registered to use this application. Please contact the app administrator to request access.`,
            }),
            (0, P.jsxs)(`div`, {
              className: `p-4 bg-slate-50 rounded-md text-sm text-slate-600`,
              children: [
                (0, P.jsx)(`p`, {
                  children: `If you believe this is an error, you can:`,
                }),
                (0, P.jsxs)(`ul`, {
                  className: `list-disc list-inside mt-2 space-y-1`,
                  children: [
                    (0, P.jsx)(`li`, {
                      children: `Verify you are logged in with the correct account`,
                    }),
                    (0, P.jsx)(`li`, {
                      children: `Contact the app administrator for access`,
                    }),
                    (0, P.jsx)(`li`, {
                      children: `Try logging out and back in again`,
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      }),
    }),
  jg = (e) => {
    let t = e.slice(1);
    try {
      return decodeURIComponent(t);
    } catch {
      return t;
    }
  };
function Mg() {
  let { pathname: e, hash: t } = ts(),
    n = ns();
  return (
    (0, _.useEffect)(() => {
      if (n !== `POP`) {
        if (t) {
          let e = jg(t),
            n = window.setTimeout(() => {
              document
                .getElementById(e)
                ?.scrollIntoView({ behavior: `smooth` });
            }, 50);
          return () => window.clearTimeout(n);
        }
        window.scrollTo({ top: 0, left: 0, behavior: `instant` });
      }
    }, [e, t, n]),
    null
  );
}
function Ng({ className: e = ``, showWordmark: t = !0 }) {
  return (0, P.jsxs)(`span`, {
    className: `inline-flex items-center gap-2 ${e}`,
    children: [
      (0, P.jsxs)(`svg`, {
        width: `24`,
        height: `24`,
        viewBox: `0 0 16 16`,
        "aria-hidden": `true`,
        className: `shrink-0`,
        shapeRendering: `crispEdges`,
        children: [
          (0, P.jsx)(`rect`, {
            x: `1`,
            y: `1`,
            width: `5`,
            height: `6`,
            fill: `currentColor`,
          }),
          (0, P.jsx)(`rect`, {
            x: `2`,
            y: `7`,
            width: `3`,
            height: `6`,
            fill: `currentColor`,
          }),
          (0, P.jsx)(`rect`, {
            x: `10`,
            y: `2`,
            width: `4`,
            height: `4`,
            fill: `hsl(var(--brand))`,
          }),
          (0, P.jsx)(`rect`, {
            x: `9`,
            y: `3`,
            width: `1`,
            height: `2`,
            fill: `hsl(var(--brand))`,
            opacity: `0.45`,
          }),
          (0, P.jsx)(`rect`, {
            x: `14`,
            y: `3`,
            width: `1`,
            height: `2`,
            fill: `hsl(var(--brand))`,
            opacity: `0.45`,
          }),
        ],
      }),
      t &&
        (0, P.jsxs)(`span`, {
          className: `font-display text-[0.72rem] leading-none tracking-tight`,
          children: [
            `PENGED`,
            (0, P.jsx)(`span`, { className: `text-brand`, children: `.DEV` }),
          ],
        }),
    ],
  });
}
var Pg = [
  { to: `/leaderboard`, label: `Leaderboard`, short: `Ladder`, icon: xn },
  { to: `/matches/new`, label: `Record a match`, short: `Record`, icon: hn },
  { to: `/challenges`, label: `Challenges`, short: `Challenges`, icon: vn },
];
function Fg() {
  let { isAuthenticated: e } = kg();
  return (0, P.jsxs)(`div`, {
    className: `flex min-h-screen flex-col bg-background`,
    children: [
      (0, P.jsx)(`header`, {
        className: `sticky top-0 z-30 border-b-2 border-foreground/80 bg-background/95 backdrop-blur`,
        children: (0, P.jsxs)(`div`, {
          className: `mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6`,
          children: [
            (0, P.jsx)(q, {
              to: `/`,
              "aria-label": `Penged.dev home`,
              className: `rounded-none py-1`,
              children: (0, P.jsx)(Ng, {}),
            }),
            (0, P.jsx)(`nav`, {
              "aria-label": `Main`,
              className: `hidden items-center gap-1 md:flex`,
              children: Pg.map(({ to: e, label: t }) =>
                (0, P.jsx)(
                  xc,
                  {
                    to: e,
                    className: ({ isActive: e }) =>
                      `px-3 py-2 font-display text-[0.58rem] uppercase tracking-[0.14em] transition-colors ${e ? `text-foreground` : `text-muted-foreground hover:text-foreground`}`,
                    children: t,
                  },
                  e,
                ),
              ),
            }),
            e
              ? (0, P.jsxs)(q, {
                  to: `/profile`,
                  className: `inline-flex items-center gap-1.5 border border-foreground bg-card px-2.5 py-1.5 font-display text-[0.55rem] uppercase tracking-[0.12em] hover:bg-secondary`,
                  children: [
                    (0, P.jsx)(Cn, {
                      className: `h-3.5 w-3.5`,
                      "aria-hidden": `true`,
                    }),
                    `My profile`,
                  ],
                })
              : (0, P.jsxs)(q, {
                  to: `/login`,
                  className: `inline-flex items-center gap-1.5 border border-foreground bg-card px-2.5 py-1.5 font-display text-[0.55rem] uppercase tracking-[0.12em] hover:bg-secondary`,
                  children: [
                    (0, P.jsx)(dn, {
                      className: `h-3.5 w-3.5`,
                      "aria-hidden": `true`,
                    }),
                    `Sign in`,
                  ],
                }),
          ],
        }),
      }),
      (0, P.jsx)(`main`, {
        className: `flex-1 pb-24 md:pb-0`,
        children: (0, P.jsx)(Ms, {}),
      }),
      (0, P.jsx)(`footer`, {
        className: `border-t border-border px-4 py-8 sm:px-6`,
        children: (0, P.jsxs)(`div`, {
          className: `mx-auto flex max-w-5xl flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between`,
          children: [
            (0, P.jsx)(Ng, { showWordmark: !0 }),
            (0, P.jsx)(`p`, {
              className: `font-mono uppercase tracking-[0.14em]`,
              children: `penged.dev — verified match play`,
            }),
          ],
        }),
      }),
      (0, P.jsx)(`nav`, {
        "aria-label": `Primary`,
        className: `fixed inset-x-0 bottom-0 z-30 border-t-2 border-foreground/80 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden`,
        children: (0, P.jsx)(`ul`, {
          className: `grid grid-cols-3`,
          children: Pg.map(({ to: e, short: t, icon: n }) =>
            (0, P.jsx)(
              `li`,
              {
                children: (0, P.jsxs)(xc, {
                  to: e,
                  className: ({ isActive: e }) =>
                    `flex min-h-[58px] flex-col items-center justify-center gap-1 font-display text-[0.5rem] uppercase tracking-[0.12em] ${e ? `text-brand` : `text-muted-foreground`}`,
                  children: [
                    (0, P.jsx)(n, {
                      className: `h-5 w-5`,
                      "aria-hidden": `true`,
                    }),
                    t,
                  ],
                }),
              },
              e,
            ),
          ),
        }),
      }),
    ],
  });
}
var Ig = () =>
  (0, P.jsx)(`div`, {
    className: `fixed inset-0 flex items-center justify-center`,
    children: (0, P.jsx)(`div`, {
      className: `w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin`,
    }),
  });
function Lg({ fallback: e = (0, P.jsx)(Ig, {}), unauthenticatedElement: t }) {
  let {
    isAuthenticated: n,
    isLoadingAuth: r,
    authChecked: i,
    authError: a,
    checkUserAuth: o,
  } = kg();
  return (
    (0, _.useEffect)(() => {
      !i && !r && o();
    }, [i, r, o]),
    r || !i
      ? e
      : a
        ? a.type === `user_not_registered`
          ? (0, P.jsx)(Ag, {})
          : t
        : n
          ? (0, P.jsx)(Ms, {})
          : t
  );
}
function Rg() {
  let { user: e, isAuthenticated: t } = kg(),
    {
      data: n,
      isLoading: r,
      refetch: i,
    } = Ca({
      queryKey: [`my-player`, e?.id],
      enabled: !!(t && e?.id),
      queryFn: async () => {
        let { items: t } = await $.entities.Player.filter(
          { user_id: e.id },
          { limit: 1 },
        );
        return t[0] || null;
      },
    });
  return { player: n ?? null, isLoading: !!(t && r), refetch: i };
}
function zg() {
  let { player: e, isLoading: t } = Rg();
  return t
    ? (0, P.jsx)(`div`, {
        className: `flex min-h-[50vh] items-center justify-center`,
        children: (0, P.jsx)(`div`, {
          className: `h-7 w-7 animate-spin rounded-full border-2 border-border border-t-foreground`,
        }),
      })
    : e
      ? (0, P.jsx)(Ms, {})
      : (0, P.jsx)(js, { to: `/welcome`, replace: !0 });
}
var Bg = Symbol.for(`react.lazy`),
  Vg = _.use;
function Hg(e) {
  return typeof e == `object` && !!e && `then` in e;
}
function Ug(e) {
  return (
    typeof e == `object` &&
    !!e &&
    `$$typeof` in e &&
    e.$$typeof === Bg &&
    `_payload` in e &&
    Hg(e._payload)
  );
}
function Wg(e) {
  let t = Kg(e),
    n = _.forwardRef((e, n) => {
      let { children: r, ...i } = e;
      Ug(r) && typeof Vg == `function` && (r = Vg(r._payload));
      let a = _.Children.toArray(r),
        o = a.find(Jg);
      if (o) {
        let e = o.props.children,
          r = a.map((t) =>
            t === o
              ? _.Children.count(e) > 1
                ? _.Children.only(null)
                : _.isValidElement(e)
                  ? e.props.children
                  : null
              : t,
          );
        return (0, P.jsx)(t, {
          ...i,
          ref: n,
          children: _.isValidElement(e) ? _.cloneElement(e, void 0, r) : null,
        });
      }
      return (0, P.jsx)(t, { ...i, ref: n, children: r });
    });
  return (n.displayName = `${e}.Slot`), n;
}
var Gg = Wg(`Slot`);
function Kg(e) {
  let t = _.forwardRef((e, t) => {
    let { children: n, ...r } = e;
    if (
      (Ug(n) && typeof Vg == `function` && (n = Vg(n._payload)),
      _.isValidElement(n))
    ) {
      let e = Xg(n),
        i = Yg(r, n.props);
      return (
        n.type !== _.Fragment && (i.ref = t ? j(t, e) : e), _.cloneElement(n, i)
      );
    }
    return _.Children.count(n) > 1 ? _.Children.only(null) : null;
  });
  return (t.displayName = `${e}.SlotClone`), t;
}
var qg = Symbol(`radix.slottable`);
function Jg(e) {
  return (
    _.isValidElement(e) &&
    typeof e.type == `function` &&
    `__radixId` in e.type &&
    e.type.__radixId === qg
  );
}
function Yg(e, t) {
  let n = { ...t };
  for (let r in t) {
    let i = e[r],
      a = t[r];
    /^on[A-Z]/.test(r)
      ? i && a
        ? (n[r] = (...e) => {
            let t = a(...e);
            return i(...e), t;
          })
        : i && (n[r] = i)
      : r === `style`
        ? (n[r] = { ...i, ...a })
        : r === `className` && (n[r] = [i, a].filter(Boolean).join(` `));
  }
  return { ...e, ...n };
}
function Xg(e) {
  let t = Object.getOwnPropertyDescriptor(e.props, `ref`)?.get,
    n = t && `isReactWarning` in t && t.isReactWarning;
  return n
    ? e.ref
    : ((t = Object.getOwnPropertyDescriptor(e, `ref`)?.get),
      (n = t && `isReactWarning` in t && t.isReactWarning),
      n ? e.props.ref : e.props.ref || e.ref);
}
var Zg = Xt(
    `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0`,
    {
      variants: {
        variant: {
          default: `bg-primary text-primary-foreground shadow hover:bg-primary/90`,
          destructive: `bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90`,
          outline: `border border-input bg-transparent shadow-sm hover:bg-accent hover:text-accent-foreground`,
          secondary: `bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80`,
          ghost: `hover:bg-accent hover:text-accent-foreground`,
          link: `text-primary underline-offset-4 hover:underline`,
        },
        size: {
          default: `h-9 px-4 py-2`,
          sm: `h-8 rounded-md px-3 text-xs`,
          lg: `h-10 rounded-md px-8`,
          icon: `h-9 w-9`,
        },
      },
      defaultVariants: { variant: `default`, size: `default` },
    },
  ),
  Qg = _.forwardRef(
    ({ className: e, variant: t, size: n, asChild: r = !1, ...i }, a) =>
      (0, P.jsx)(r ? Gg : `button`, {
        className: V(Zg({ variant: t, size: n, className: e })),
        ref: a,
        ...i,
      }),
  );
Qg.displayName = `Button`;
function $g({ className: e = ``, withBall: t = !0 }) {
  return (0, P.jsxs)(`svg`, {
    viewBox: `0 0 200 120`,
    className: e,
    shapeRendering: `crispEdges`,
    "aria-hidden": `true`,
    focusable: `false`,
    children: [
      (0, P.jsx)(`rect`, {
        x: `0`,
        y: `0`,
        width: `200`,
        height: `120`,
        fill: `hsl(var(--secondary))`,
      }),
      (0, P.jsx)(`rect`, {
        x: `6`,
        y: `6`,
        width: `188`,
        height: `108`,
        fill: `none`,
        stroke: `currentColor`,
        strokeWidth: `2`,
      }),
      (0, P.jsx)(`rect`, {
        x: `14`,
        y: `14`,
        width: `172`,
        height: `92`,
        fill: `hsl(var(--card))`,
        opacity: `0.55`,
      }),
      [10, 22, 34, 46, 58, 70, 82, 94, 106].map((e) =>
        (0, P.jsx)(
          `rect`,
          {
            x: `98`,
            y: e,
            width: `4`,
            height: `8`,
            fill: `currentColor`,
            opacity: `0.7`,
          },
          e,
        ),
      ),
      (0, P.jsx)(`rect`, {
        x: `18`,
        y: `42`,
        width: `5`,
        height: `34`,
        fill: `currentColor`,
      }),
      (0, P.jsx)(`rect`, {
        x: `177`,
        y: `50`,
        width: `5`,
        height: `34`,
        fill: `currentColor`,
      }),
      t &&
        (0, P.jsx)(`rect`, {
          className: `pong-ball`,
          x: `34`,
          y: `54`,
          width: `6`,
          height: `6`,
          fill: `hsl(var(--brand))`,
        }),
    ],
  });
}
var e_ = (e = []) =>
  e
    .map((e) => e.username || e.display_name)
    .filter(Boolean)
    .join(` + `) || `—`;
function t_({ match: e }) {
  let t = !!e,
    n = t ? e_(e.side_a) : `Player one`,
    r = t ? e_(e.side_b) : `Player two`,
    i = t ? `${e.games_a ?? 0}–${e.games_b ?? 0}` : `00–00`;
  return (0, P.jsxs)(`div`, {
    className: `pixel-frame relative border border-foreground bg-card`,
    children: [
      (0, P.jsxs)(`div`, {
        className: `flex items-center justify-between border-b border-foreground bg-secondary px-3 py-2 font-display text-[0.55rem] uppercase tracking-[0.16em]`,
        children: [
          (0, P.jsx)(`span`, { children: `Table 01` }),
          (0, P.jsx)(`span`, {
            children: t ? `Game ${e.games?.length || 1}` : `Warming up`,
          }),
        ],
      }),
      (0, P.jsxs)(`div`, {
        className: `scanlines p-3 sm:p-4`,
        children: [
          (0, P.jsx)($g, { className: `w-full text-foreground/80` }),
          (0, P.jsxs)(`div`, {
            className: `mt-3 flex items-end justify-between gap-2`,
            children: [
              (0, P.jsxs)(`div`, {
                className: `min-w-0`,
                children: [
                  (0, P.jsx)(`p`, {
                    className: `truncate font-display text-[0.58rem] uppercase tracking-[0.1em]`,
                    children: n,
                  }),
                  (0, P.jsx)(`p`, {
                    className: `mt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground`,
                    children: `Side a`,
                  }),
                ],
              }),
              (0, P.jsx)(`p`, {
                className: `shrink-0 font-display text-base tabular-nums leading-none`,
                children: i,
              }),
              (0, P.jsxs)(`div`, {
                className: `min-w-0 text-right`,
                children: [
                  (0, P.jsx)(`p`, {
                    className: `truncate font-display text-[0.58rem] uppercase tracking-[0.1em]`,
                    children: r,
                  }),
                  (0, P.jsx)(`p`, {
                    className: `mt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground`,
                    children: `Side b`,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
      (0, P.jsxs)(`div`, {
        className: `flex items-center gap-1.5 border-t border-foreground/25 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground`,
        children: [
          (0, P.jsx)(an, {
            className: `h-3.5 w-3.5 shrink-0 text-brand`,
            "aria-hidden": `true`,
          }),
          t ? `Confirmed by all players` : `Waiting on the first result`,
        ],
      }),
    ],
  });
}
var n_ = (0, P.jsxs)(P.Fragment, {
  children: [
    (0, P.jsx)(`rect`, {
      x: `3`,
      y: `1`,
      width: `7`,
      height: `9`,
      fill: `currentColor`,
    }),
    (0, P.jsx)(`rect`, {
      x: `5`,
      y: `10`,
      width: `3`,
      height: `6`,
      fill: `currentColor`,
    }),
  ],
});
function r_({ className: e = `` }) {
  return (0, P.jsxs)(`div`, {
    className: `pointer-events-none absolute inset-0 overflow-hidden ${e}`,
    "aria-hidden": `true`,
    children: [
      (0, P.jsx)(`svg`, {
        viewBox: `0 0 16 16`,
        shapeRendering: `crispEdges`,
        className: `absolute -left-3 top-10 h-20 w-20 -rotate-[16deg] text-foreground/[0.07]`,
        children: n_,
      }),
      (0, P.jsx)(`svg`, {
        viewBox: `0 0 16 16`,
        shapeRendering: `crispEdges`,
        className: `absolute right-[38%] top-6 h-12 w-12 rotate-[28deg] text-foreground/[0.06]`,
        children: n_,
      }),
      (0, P.jsx)(`svg`, {
        viewBox: `0 0 4 4`,
        shapeRendering: `crispEdges`,
        className: `absolute left-[46%] top-24 h-5 w-5 text-brand/30`,
        children: (0, P.jsx)(`rect`, {
          x: `1`,
          y: `1`,
          width: `2`,
          height: `2`,
          fill: `currentColor`,
        }),
      }),
      (0, P.jsx)(`svg`, {
        viewBox: `0 0 4 4`,
        shapeRendering: `crispEdges`,
        className: `absolute bottom-8 left-10 h-4 w-4 text-foreground/15`,
        children: (0, P.jsx)(`rect`, {
          x: `1`,
          y: `1`,
          width: `2`,
          height: `2`,
          fill: `currentColor`,
        }),
      }),
      (0, P.jsx)(`svg`, {
        viewBox: `0 0 16 16`,
        shapeRendering: `crispEdges`,
        className: `absolute -bottom-4 right-6 h-24 w-24 rotate-[12deg] text-foreground/[0.05]`,
        children: n_,
      }),
    ],
  });
}
function i_({
  players: e = 0,
  verified: t = 0,
  pending: n = 0,
  match: r = null,
}) {
  return (0, P.jsxs)(`section`, {
    className: `relative overflow-hidden border-b border-border`,
    children: [
      (0, P.jsx)(`div`, {
        className: `arcade-grid absolute inset-0`,
        "aria-hidden": `true`,
      }),
      (0, P.jsx)(`div`, {
        className: `absolute inset-0 bg-gradient-to-b from-background/30 via-background/60 to-background`,
        "aria-hidden": `true`,
      }),
      (0, P.jsx)(r_, {}),
      (0, P.jsxs)(`div`, {
        className: `relative mx-auto grid max-w-5xl gap-10 px-4 pb-12 pt-10 sm:px-6 sm:pb-16 sm:pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center`,
        children: [
          (0, P.jsxs)(`div`, {
            children: [
              (0, P.jsx)(`p`, {
                className: `font-display text-[0.58rem] uppercase tracking-[0.18em] text-brand`,
                children: `Penged.dev · office table tennis`,
              }),
              (0, P.jsxs)(`h1`, {
                className: `mt-4 font-heading text-[2rem] font-bold leading-[1.02] tracking-[-0.01em] sm:text-[2.85rem]`,
                children: [
                  `Settle it on the table.`,
                  (0, P.jsx)(`br`, {}),
                  (0, P.jsx)(`span`, {
                    className: `mt-1.5 inline-block bg-foreground px-1.5 pb-0.5 text-background`,
                    children: `Rank it on the board.`,
                  }),
                ],
              }),
              (0, P.jsx)(`p`, {
                className: `mt-5 max-w-md text-[15px] leading-relaxed text-muted-foreground`,
                children: `Singles and doubles. Everyone who played confirms the score. Elo settles who owns the table.`,
              }),
              (0, P.jsxs)(`div`, {
                className: `mt-7 flex flex-col gap-2.5 sm:flex-row`,
                children: [
                  (0, P.jsx)(Qg, {
                    asChild: !0,
                    size: `lg`,
                    className: `h-12 rounded-none font-display text-[0.68rem] uppercase tracking-[0.12em]`,
                    children: (0, P.jsxs)(q, {
                      to: `/matches/new`,
                      children: [
                        `Record a match`,
                        (0, P.jsx)(nn, {
                          className: `ml-2 h-4 w-4`,
                          "aria-hidden": `true`,
                        }),
                      ],
                    }),
                  }),
                  (0, P.jsx)(Qg, {
                    asChild: !0,
                    size: `lg`,
                    variant: `outline`,
                    className: `h-12 rounded-none border-foreground/70 bg-card font-display text-[0.68rem] uppercase tracking-[0.12em]`,
                    children: (0, P.jsx)(q, {
                      to: `/leaderboard`,
                      children: `View leaderboard`,
                    }),
                  }),
                ],
              }),
              (0, P.jsx)(`dl`, {
                className: `mt-9 grid grid-cols-3 gap-2 sm:max-w-md sm:gap-3`,
                children: [
                  { label: `Players rated`, value: e },
                  { label: `Verified matches`, value: t },
                  { label: `Awaiting confirmation`, value: n },
                ].map((e) =>
                  (0, P.jsxs)(
                    `div`,
                    {
                      className: `pixel-frame-soft rounded-none border border-border bg-card px-3 py-3`,
                      children: [
                        (0, P.jsx)(`dd`, {
                          className: `font-display text-lg tabular-nums leading-none sm:text-xl`,
                          children: String(e.value).padStart(2, `0`),
                        }),
                        (0, P.jsx)(`dt`, {
                          className: `mt-2 text-[9px] uppercase leading-tight tracking-[0.12em] text-muted-foreground`,
                          children: e.label,
                        }),
                      ],
                    },
                    e.label,
                  ),
                ),
              }),
            ],
          }),
          (0, P.jsx)(t_, { match: r }),
        ],
      }),
    ],
  });
}
function a_({ className: e = `` }) {
  return (0, P.jsxs)(`div`, {
    className: `relative h-11 overflow-hidden border-y border-border bg-card ${e}`,
    "aria-hidden": `true`,
    children: [
      (0, P.jsx)(`div`, {
        className: `absolute inset-x-0 top-1/2 h-px bg-border`,
      }),
      (0, P.jsx)(`div`, {
        className: `absolute left-1/2 top-2 bottom-2 w-px bg-border/80`,
      }),
      (0, P.jsx)(`div`, {
        className: `ball-track absolute top-1.5 h-2.5 w-2.5 bg-brand`,
        children: (0, P.jsx)(`div`, {
          className: `ball-bounce h-full w-full bg-brand`,
        }),
      }),
      (0, P.jsxs)(`svg`, {
        className: `paddle-swing absolute right-5 bottom-1 h-8 w-8 text-foreground/25`,
        viewBox: `0 0 16 16`,
        shapeRendering: `crispEdges`,
        children: [
          (0, P.jsx)(`rect`, {
            x: `2`,
            y: `1`,
            width: `6`,
            height: `8`,
            fill: `currentColor`,
          }),
          (0, P.jsx)(`rect`, {
            x: `4`,
            y: `9`,
            width: `2`,
            height: `6`,
            fill: `currentColor`,
          }),
        ],
      }),
    ],
  });
}
var o_ = {
    "media.base44.com": `/images/public/`,
    "static.wixstatic.com": `/media/`,
  },
  s_ = { OPTIMIZED: `optimized`, ORIGINAL: `original`, FALLBACK: `fallback` },
  c_ = [1, 2, 3],
  l_ = 6e3;
function u_(e) {
  let t = {},
    n = {};
  for (let [r, i] of Object.entries(e))
    r.startsWith(`data-`) ? (t[r] = i) : (n[r] = i);
  return { wrapperProps: t, imageProps: n };
}
function d_(e, t, n) {
  let r = new Set((e || ``).split(/\s+/)),
    i = new Set(n.split(/\s+/));
  return t
    .split(/\s+/)
    .filter(
      (e) => ![`inline-block`, `relative`].includes(e) || !i.has(e) || r.has(e),
    )
    .join(` `);
}
function f_(e) {
  try {
    let t = new URL(e);
    if (
      t.protocol !== `https:` ||
      t.username ||
      t.password ||
      (t.port && t.port !== `443`)
    )
      return null;
    let n = o_[t.hostname];
    if (!n) return null;
    let r = t.pathname.match(/^(.*)\/v1\/(?:fill|fit)\/[^/]+\/[^/]+$/i),
      i = r ? r[1] : t.pathname,
      a = i.split(`/`).pop();
    return !i.startsWith(n) ||
      !a ||
      !/\.[a-z0-9]+$/i.test(a) ||
      /\.svg$/i.test(a)
      ? null
      : { baseUrl: `${t.origin}${i}`, filename: a };
  } catch {
    return null;
  }
}
var p_ = (e) => Math.min(Math.max(Math.round(e), 1), l_),
  m_ = (e) => Math.min(1, Math.max(0, e));
function h_(
  { baseUrl: e, filename: t },
  { width: n, height: r, crop: i, focalPoint: a, quality: o },
) {
  let s = [`w_${p_(n)}`, `h_${p_(r || n)}`];
  i && s.push(a ? `fp_${m_(a.x).toFixed(2)}_${m_(a.y).toFixed(2)}` : `al_c`);
  let c = /\.gif$/i.test(t) ? `enc_webp` : `enc_auto`;
  return (
    s.push(`q_${o}`, `usm_0.66_1.00_0.01`, c, `quality_auto`),
    `${e}/v1/${i ? `fill` : `fit`}/${s.join(`,`)}/${t}`
  );
}
function g_(e, t) {
  return c_
    .map(
      (n) =>
        `${h_(e, { ...t, width: t.width * n, height: t.height ? t.height * n : void 0 })} ${n}x`,
    )
    .join(`, `);
}
function __(e, t) {
  return t?.baseUrl || e;
}
function v_(e) {
  return e === s_.OPTIMIZED ? s_.ORIGINAL : s_.FALLBACK;
}
function y_(e) {
  let [t, n] = _.useState(null);
  return (
    _.useLayoutEffect(() => {
      let t = e.current;
      if (!t) return;
      let r = t.getBoundingClientRect();
      n({ width: r.width, height: r.height });
      let i = new ResizeObserver(([e]) => {
        let { width: t, height: r } = e.contentRect;
        n({ width: t, height: r });
      });
      return i.observe(t), () => i.disconnect();
    }, [e]),
    t
  );
}
function b_(
  {
    parsed: e,
    fittingType: t,
    focalPoint: n,
    quality: r,
    className: i,
    onLoad: a,
    onSourceChange: o,
  },
  s,
) {
  let c = _.useRef(null),
    l = _.useRef(null),
    u = y_(c),
    [d, f] = _.useState(!1);
  _.useImperativeHandle(s, () => l.current),
    _.useEffect(() => f(!1), [e.baseUrl]),
    _.useEffect(() => {
      let e = c.current,
        t = (t) =>
          o(t.detail.src, d_(i, e.className, V(`inline-block relative`, i)));
      return (
        e.addEventListener(`base44:image-replace`, t),
        () => e.removeEventListener(`base44:image-replace`, t)
      );
    }, [i, o]);
  let p = t !== `fit`;
  return {
    wrapperRef: c,
    imgRef: l,
    loaded: d,
    options: u && {
      width: u.width || 1024,
      height: u.height || void 0,
      crop: p,
      focalPoint: p ? n : void 0,
      quality: r,
    },
    handleLoad: (e) => {
      f(!0), a?.(e);
    },
  };
}
var x_ = _.forwardRef(
  (
    {
      src: e,
      parsed: t,
      fittingType: n,
      focalPoint: r,
      quality: i,
      className: a,
      style: o,
      aspectRatio: s,
      onLoad: c,
      onSourceChange: l,
      ...u
    },
    d,
  ) => {
    let {
        wrapperRef: f,
        imgRef: p,
        loaded: m,
        options: h,
        handleLoad: g,
      } = b_(
        {
          parsed: t,
          fittingType: n,
          focalPoint: r,
          quality: i,
          className: a,
          onLoad: c,
          onSourceChange: l,
        },
        d,
      ),
      { wrapperProps: _, imageProps: v } = u_(u);
    return (0, P.jsx)(`span`, {
      ref: f,
      className: V(`inline-block relative`, a),
      style: { aspectRatio: s, ...o },
      ..._,
      "data-base44-image": ``,
      "data-base44-image-src": e,
      children: (0, P.jsxs)(`span`, {
        "data-source-location": void 0,
        className: `block relative w-full h-full overflow-hidden`,
        children: [
          h &&
            !m &&
            (0, P.jsx)(`img`, {
              "data-source-location": void 0,
              src: h_(t, {
                ...h,
                width: 20,
                height: h.height
                  ? Math.max(1, Math.round((20 * h.height) / h.width))
                  : void 0,
                quality: 20,
              }),
              alt: ``,
              "aria-hidden": `true`,
              className: `w-full h-full inset-0 absolute`,
              style: {
                objectFit: n === `fit` ? `contain` : `cover`,
                filter: `blur(10px)`,
                transform: `scale(1.1)`,
              },
            }),
          h &&
            (0, P.jsx)(`img`, {
              "data-source-location": void 0,
              ref: p,
              src: h_(t, h),
              srcSet: g_(t, h),
              loading: `lazy`,
              className: V(
                `w-full h-full inset-0 absolute`,
                n === `fit` ? `object-contain` : `object-cover`,
              ),
              onLoad: g,
              ...v,
            }),
        ],
      }),
    });
  },
);
x_.displayName = `ResponsiveImage`;
var S_ = `https://static.wixstatic.com/media/12d367_4f26ccd17f8f4e3a8958306ea08c2332~mv2.png`,
  C_ = _.forwardRef(
    (
      {
        src: e,
        fittingType: t = `fill`,
        originWidth: n,
        originHeight: r,
        focalPointX: i,
        focalPointY: a,
        quality: o = 90,
        onError: s,
        ...c
      },
      l,
    ) => {
      let [u, d] = _.useState(null),
        f = u?.source === e ? u : null,
        p = f ? f.value : e,
        m = (t, n) =>
          d({
            source: e,
            value: t,
            className: n,
            sourceClassName: c.className,
          });
      _.useEffect(() => d(null), [e]);
      let h = p && p !== S_ ? f_(p) : null,
        g = h ? s_.OPTIMIZED : s_.ORIGINAL,
        [v, y] = _.useState({ src: p, mode: g }),
        b = v.src === p ? v.mode : g;
      _.useEffect(() => {
        y({ src: p, mode: g });
      }, [p, g]);
      let x = (e) => {
          if (b === s_.FALLBACK) return;
          let t = v_(b);
          y({ src: p, mode: t }), t === s_.FALLBACK && s?.(e);
        },
        S = {
          ...c,
          className:
            f && f.sourceClassName === c.className ? f.className : c.className,
          onError: x,
        };
      if (!p)
        return (0, P.jsx)(`img`, {
          ref: l,
          src: S_,
          ...S,
          "data-empty-image": !0,
        });
      let C = b === s_.OPTIMIZED ? h : null;
      if (!C) {
        let e = b === s_.FALLBACK,
          t = e ? S_ : __(p, h);
        return (0, P.jsx)(`img`, {
          ref: l,
          src: t,
          ...S,
          "data-error-image": e || void 0,
        });
      }
      let w =
          typeof i == `number` && typeof a == `number`
            ? { x: i, y: a }
            : void 0,
        T = n && r ? `${n} / ${r}` : void 0;
      return (0, P.jsx)(x_, {
        ref: l,
        src: p,
        parsed: C,
        onSourceChange: m,
        fittingType: t,
        focalPoint: w,
        quality: o,
        aspectRatio: T,
        ...S,
      });
    },
  );
C_.displayName = `Image`;
function w_({ name: e, src: t, size: n = 36, className: r = `` }) {
  let i =
    (e || `?`)
      .replace(/[^a-zA-Z0-9]/g, ``)
      .slice(0, 2)
      .toUpperCase() || `?`;
  return (0, P.jsx)(`span`, {
    className: `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border bg-secondary ${r}`,
    style: { width: n, height: n },
    children: t
      ? (0, P.jsx)(C_, {
          src: t,
          alt: e ? `${e}'s profile picture` : `Player`,
          className: `h-full w-full object-cover`,
        })
      : (0, P.jsx)(`span`, {
          className: `font-display text-[0.55rem] text-muted-foreground`,
          children: i,
        }),
  });
}
function T_(e) {
  if (!e) return ``;
  let t = new Date(e);
  return Number.isNaN(t.getTime())
    ? ``
    : t.toLocaleDateString(void 0, { day: `numeric`, month: `short` });
}
function E_(e = 0, t = 0) {
  return `${e || 0}–${t || 0}`;
}
function D_(e) {
  let t = Math.max(0, Number(e) || 0);
  return Math.max(1, Math.floor(Math.sqrt(t / 40)) + 1);
}
function O_(e) {
  let t = Math.max(0, Number(e) || 0),
    n = D_(t),
    r = (n - 1) ** 2 * 40,
    i = n ** 2 * 40,
    a = i === r ? 1 : (t - r) / (i - r);
  return {
    level: n,
    ratio: Math.max(0, Math.min(1, a)),
    toNext: Math.max(0, i - t),
  };
}
function k_(e) {
  if (!e) return ``;
  let t = new Date(e).getTime() - Date.now();
  if (Number.isNaN(t) || t <= 0) return `Window closed`;
  let n = Math.floor(t / 36e5),
    r = Math.floor(n / 24);
  return r >= 1
    ? `${r}d ${n % 24}h left`
    : `${n}h ${Math.floor((t % 36e5) / 6e4)}m left`;
}
function A_(e, t) {
  let n = t === `doubles` ? `doubles` : `singles`;
  return (Number(e?.[`${n}_wins`]) || 0) + (Number(e?.[`${n}_losses`]) || 0);
}
function j_(e) {
  let t = A_(e, `singles`),
    n = A_(e, `doubles`),
    r = t + n;
  if (!r) return 1400;
  let i =
    (Number(e.singles_rating) || 1400) * t +
    (Number(e.doubles_rating) || 1400) * n;
  return Math.round(i / r);
}
function M_(e) {
  return e?.display_name || e?.username || `Player`;
}
function N_({ rank: e, player: t, rating: n, wins: r = 0, losses: i = 0 }) {
  return (0, P.jsx)(`li`, {
    className: `border-b border-border last:border-0`,
    children: (0, P.jsxs)(q, {
      to: `/players/${t.username}`,
      className: `flex min-h-[52px] items-center gap-3 px-3 py-2.5 transition-colors hover:bg-secondary/60`,
      children: [
        (0, P.jsx)(`span`, {
          className: `w-7 shrink-0 font-mono text-xs tabular-nums text-muted-foreground`,
          children: String(e).padStart(2, `0`),
        }),
        (0, P.jsx)(w_, { name: M_(t), src: t.avatar_url, size: 30 }),
        (0, P.jsxs)(`span`, {
          className: `min-w-0 flex-1`,
          children: [
            (0, P.jsxs)(`span`, {
              className: `flex items-center gap-1.5`,
              children: [
                (0, P.jsx)(`span`, {
                  className: `truncate font-heading text-sm font-semibold`,
                  children: M_(t),
                }),
                t.under_review &&
                  (0, P.jsx)(`span`, {
                    className: `shrink-0 rounded-sm border border-destructive/40 px-1 font-mono text-[9px] uppercase tracking-[0.08em] text-destructive`,
                    children: `review`,
                  }),
              ],
            }),
            (0, P.jsxs)(`span`, {
              className: `mt-0.5 block font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground`,
              children: [`lvl `, t.level || 1, ` · `, r, `W–`, i, `L`],
            }),
          ],
        }),
        (0, P.jsx)(`span`, {
          className: `w-12 shrink-0 text-right font-mono text-sm tabular-nums`,
          children: n,
        }),
      ],
    }),
  });
}
function P_({ players: e = [] }) {
  return (0, P.jsxs)(`section`, {
    className: `mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16`,
    children: [
      (0, P.jsxs)(`div`, {
        className: `flex items-end justify-between gap-4`,
        children: [
          (0, P.jsxs)(`div`, {
            children: [
              (0, P.jsx)(`h2`, {
                className: `font-display text-[0.6rem] uppercase tracking-[0.22em] text-muted-foreground`,
                children: `Singles ladder`,
              }),
              (0, P.jsx)(`p`, {
                className: `mt-2 font-heading text-2xl font-semibold tracking-tight`,
                children: `Top of the table`,
              }),
            ],
          }),
          (0, P.jsxs)(q, {
            to: `/leaderboard`,
            className: `inline-flex shrink-0 items-center gap-1 rounded-sm py-2 text-sm font-medium text-brand hover:underline`,
            children: [
              `Full ladder`,
              (0, P.jsx)(nn, {
                className: `h-3.5 w-3.5`,
                "aria-hidden": `true`,
              }),
            ],
          }),
        ],
      }),
      (0, P.jsxs)(`div`, {
        className: `mt-5 overflow-hidden rounded-sm border border-border bg-card`,
        children: [
          (0, P.jsxs)(`div`, {
            className: `flex items-center gap-3 border-b border-border bg-secondary/60 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground`,
            children: [
              (0, P.jsx)(`span`, { className: `w-7`, children: `#` }),
              (0, P.jsx)(`span`, { className: `w-[30px]` }),
              (0, P.jsx)(`span`, { className: `flex-1`, children: `Player` }),
              (0, P.jsx)(`span`, {
                className: `w-12 text-right`,
                children: `Rating`,
              }),
            ],
          }),
          e.length === 0
            ? (0, P.jsxs)(`div`, {
                className: `px-4 py-8 text-center`,
                children: [
                  (0, P.jsx)(`p`, {
                    className: `font-heading text-sm font-semibold`,
                    children: `The ladder is empty`,
                  }),
                  (0, P.jsx)(`p`, {
                    className: `mt-1 text-xs text-muted-foreground`,
                    children: `The first profile created takes spot one.`,
                  }),
                  (0, P.jsx)(q, {
                    to: `/register`,
                    className: `mt-3 inline-flex rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground`,
                    children: `Join the ladder`,
                  }),
                ],
              })
            : (0, P.jsx)(`ul`, {
                children: e.map((e) =>
                  (0, P.jsx)(
                    N_,
                    {
                      rank: e.singles_rank,
                      player: e,
                      rating: e.singles_rating || 1400,
                      wins: e.singles_wins || 0,
                      losses: e.singles_losses || 0,
                    },
                    e.id,
                  ),
                ),
              }),
        ],
      }),
    ],
  });
}
var F_ = {
    verified: `bg-success/10 text-success border-success/30`,
    pending: `bg-warning/10 text-warning border-warning/30`,
    open: `bg-brand-soft text-brand border-brand/30`,
    accepted: `bg-success/10 text-success border-success/30`,
    declined: `bg-destructive/10 text-destructive border-destructive/30`,
    disputed: `bg-destructive/10 text-destructive border-destructive/30`,
    expired: `bg-secondary text-muted-foreground border-border`,
    forfeited: `bg-destructive/10 text-destructive border-destructive/30`,
    cancelled: `bg-secondary text-muted-foreground border-border`,
  },
  I_ = {
    verified: `Verified`,
    pending: `Awaiting sign-off`,
    open: `Open`,
    accepted: `Accepted`,
    declined: `Declined`,
    disputed: `Disputed`,
    expired: `Expired`,
    forfeited: `Forfeit`,
    cancelled: `Cancelled`,
  };
function L_({ status: e, label: t, className: n = `` }) {
  let r = F_[e] || F_.expired;
  return (0, P.jsxs)(`span`, {
    className: `inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${r} ${n}`,
    children: [
      (0, P.jsx)(`span`, { className: `h-1.5 w-1.5 rounded-full bg-current` }),
      t || I_[e] || e,
    ],
  });
}
function R_({ players: e, games: t, won: n }) {
  return (0, P.jsxs)(`div`, {
    className: `flex items-baseline justify-between gap-3`,
    children: [
      (0, P.jsxs)(`span`, {
        className: `min-w-0 truncate font-heading text-sm ${n ? `font-semibold text-foreground` : `text-muted-foreground`}`,
        children: [
          e.map((e) => e.display_name || e.username).join(` / `),
          n &&
            (0, P.jsx)(`span`, {
              className: `ml-1.5 font-mono text-[10px] uppercase text-success`,
              children: `win`,
            }),
        ],
      }),
      (0, P.jsx)(`span`, {
        className: `shrink-0 font-mono text-sm tabular-nums`,
        children: t,
      }),
    ],
  });
}
function z_({ match: e }) {
  let t = e.winner_side === `a`;
  return (0, P.jsx)(`li`, {
    className: `border-b border-border last:border-0`,
    children: (0, P.jsxs)(q, {
      to: `/matches/${e.id}`,
      className: `block px-3 py-3 transition-colors hover:bg-secondary/60`,
      children: [
        (0, P.jsxs)(`div`, {
          className: `mb-2 flex items-center justify-between gap-2`,
          children: [
            (0, P.jsxs)(`span`, {
              className: `font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground`,
              children: [
                e.format === `doubles` ? `Doubles` : `Singles`,
                ` · to `,
                e.target,
              ],
            }),
            (0, P.jsx)(L_, { status: e.status }),
          ],
        }),
        (0, P.jsxs)(`div`, {
          className: `space-y-1`,
          children: [
            (0, P.jsx)(R_, { players: e.side_a, games: e.games_a, won: t }),
            (0, P.jsx)(R_, { players: e.side_b, games: e.games_b, won: !t }),
          ],
        }),
      ],
    }),
  });
}
function B_({ matches: e = [] }) {
  return (0, P.jsx)(`section`, {
    className: `border-t border-border bg-secondary/30`,
    children: (0, P.jsxs)(`div`, {
      className: `mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16`,
      children: [
        (0, P.jsxs)(`div`, {
          className: `flex items-end justify-between gap-4`,
          children: [
            (0, P.jsxs)(`div`, {
              children: [
                (0, P.jsx)(`h2`, {
                  className: `font-display text-[0.6rem] uppercase tracking-[0.22em] text-muted-foreground`,
                  children: `Match feed`,
                }),
                (0, P.jsx)(`p`, {
                  className: `mt-2 font-heading text-2xl font-semibold tracking-tight`,
                  children: `Latest results`,
                }),
              ],
            }),
            (0, P.jsxs)(q, {
              to: `/matches`,
              className: `inline-flex shrink-0 items-center gap-1 rounded-sm py-2 text-sm font-medium text-brand hover:underline`,
              children: [
                `All matches`,
                (0, P.jsx)(nn, {
                  className: `h-3.5 w-3.5`,
                  "aria-hidden": `true`,
                }),
              ],
            }),
          ],
        }),
        e.length === 0
          ? (0, P.jsx)(`p`, {
              className: `mt-5 rounded-sm border border-dashed border-border bg-card/60 px-4 py-8 text-center text-sm text-muted-foreground`,
              children: `No verified matches yet. Record the first one and get everyone to sign off.`,
            })
          : (0, P.jsx)(`ul`, {
              className: `mt-5 overflow-hidden rounded-sm border border-border bg-card`,
              children: e.map((e) => (0, P.jsx)(z_, { match: e }, e.id)),
            }),
      ],
    }),
  });
}
var V_ = [
  {
    tag: `01`,
    title: `Every player signs off`,
    body: `A win only counts once each participant accepts the submitted result. Doubles needs all four. Declined or disputed matches never touch your rating.`,
  },
  {
    tag: `02`,
    title: `Rating is not level`,
    body: `Rating measures who you beat and moves only on verified results. Level is earned by showing up and playing — it never buys you rank.`,
  },
  {
    tag: `03`,
    title: `Challenges, not shortcuts`,
    body: `You climb by beating the player above you. A challenge has a 72-hour window, and silence never hands anyone a rank automatically.`,
  },
];
function H_() {
  return (0, P.jsxs)(`section`, {
    className: `mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16`,
    children: [
      (0, P.jsx)(`h2`, {
        className: `font-display text-[0.6rem] uppercase tracking-[0.22em] text-muted-foreground`,
        children: `House rules`,
      }),
      (0, P.jsx)(`div`, {
        className: `mt-5 grid gap-3 sm:grid-cols-3`,
        children: V_.map((e) =>
          (0, P.jsxs)(
            `article`,
            {
              className: `pixel-frame rounded-sm border border-border bg-card p-4`,
              children: [
                (0, P.jsx)(`span`, {
                  className: `font-mono text-[11px] text-brand`,
                  children: e.tag,
                }),
                (0, P.jsx)(`h3`, {
                  className: `mt-2 font-heading text-base font-semibold leading-tight`,
                  children: e.title,
                }),
                (0, P.jsx)(`p`, {
                  className: `mt-2 text-[13px] leading-relaxed text-muted-foreground`,
                  children: e.body,
                }),
              ],
            },
            e.tag,
          ),
        ),
      }),
    ],
  });
}
var U_ = [
    `Everyone starts at 1400.`,
    `Beating someone above you gains more than beating someone below you.`,
    `Losing to a stronger opponent costs fewer points.`,
    `K-factor: 48 for your first 10 matches, 32 until 30, then 24 for good.`,
    `One result moves you at most 45 points, and no rating ever drops below 700.`,
    `Rematches are worth less — every earlier meeting with the same opponent halves the gain, and after six in six months a win pays nothing.`,
    `Margins don't matter: 11-0 and 11-9 count exactly the same.`,
  ],
  W_ = `expected = 1 / (1 + 10 ^ ((opponentRating - yourRating) / 400))
newRating = yourRating + K * (result - expected) * repeatFactor

result       = 1 for a win, 0 for a loss
K            = 48 (first 10) / 32 (next 20) / 24 (after)
repeatFactor = 1 / (1 + 0.75 * earlier meetings)`,
  G_ = [
    `+25 xp for turning up`,
    `+25 xp for winning`,
    `+5 xp per game you take (five games max)`,
  ];
function K_() {
  return (0, P.jsx)(`section`, {
    id: `ratings`,
    className: `border-t border-border`,
    children: (0, P.jsxs)(`div`, {
      className: `mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16`,
      children: [
        (0, P.jsx)(`p`, {
          className: `font-display text-[0.58rem] uppercase tracking-[0.2em] text-brand`,
          children: `Ratings`,
        }),
        (0, P.jsx)(`h2`, {
          className: `mt-3 font-heading text-2xl font-bold tracking-tight sm:text-3xl`,
          children: `How ratings work`,
        }),
        (0, P.jsx)(`p`, {
          className: `mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground`,
          children: `Elo, like chess ratings. Your rating moves only once everyone who played has confirmed the result, so nobody can award themselves a win.`,
        }),
        (0, P.jsxs)(`div`, {
          className: `mt-6 grid gap-3 lg:grid-cols-2`,
          children: [
            (0, P.jsxs)(`article`, {
              className: `border border-foreground bg-card p-5`,
              children: [
                (0, P.jsx)(`h3`, {
                  className: `font-heading text-base font-semibold`,
                  children: `The short version`,
                }),
                (0, P.jsx)(`ul`, {
                  className: `mt-3 space-y-2`,
                  children: U_.map((e) =>
                    (0, P.jsxs)(
                      `li`,
                      {
                        className: `flex gap-2 text-[13px] leading-relaxed text-muted-foreground`,
                        children: [
                          (0, P.jsx)(`span`, {
                            className: `mt-1.5 h-1.5 w-1.5 shrink-0 bg-brand`,
                            "aria-hidden": `true`,
                          }),
                          e,
                        ],
                      },
                      e,
                    ),
                  ),
                }),
              ],
            }),
            (0, P.jsxs)(`div`, {
              className: `space-y-3`,
              children: [
                (0, P.jsxs)(`article`, {
                  className: `border border-foreground bg-card p-5`,
                  children: [
                    (0, P.jsx)(`h3`, {
                      className: `font-display text-[0.55rem] uppercase tracking-[0.18em] text-muted-foreground`,
                      children: `The maths`,
                    }),
                    (0, P.jsx)(`pre`, {
                      className: `mt-3 overflow-x-auto bg-secondary p-3 font-mono text-[11px] leading-relaxed text-foreground`,
                      children: W_,
                    }),
                  ],
                }),
                (0, P.jsxs)(`article`, {
                  className: `border border-foreground bg-card p-5`,
                  children: [
                    (0, P.jsx)(`h3`, {
                      className: `font-heading text-base font-semibold`,
                      children: `Level is not rating`,
                    }),
                    (0, P.jsx)(`p`, {
                      className: `mt-2 text-[13px] leading-relaxed text-muted-foreground`,
                      children: `Level counts the work you put in. Rating counts who you beat — so grinding easy games never buys rank.`,
                    }),
                    (0, P.jsx)(`ul`, {
                      className: `mt-3 space-y-1.5`,
                      children: G_.map((e) =>
                        (0, P.jsx)(
                          `li`,
                          {
                            className: `font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground`,
                            children: e,
                          },
                          e,
                        ),
                      ),
                    }),
                    (0, P.jsx)(`p`, {
                      className: `mt-3 font-mono text-[11px] text-muted-foreground`,
                      children: `level = floor(sqrt(xp / 40)) + 1 · level 5 opens at 640 xp`,
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
        (0, P.jsxs)(`article`, {
          className: `mt-3 border border-border bg-card p-5`,
          children: [
            (0, P.jsx)(`h3`, {
              className: `font-display text-[0.55rem] uppercase tracking-[0.18em] text-muted-foreground`,
              children: `Worked example`,
            }),
            (0, P.jsx)(`p`, {
              className: `mt-2 text-[13px] leading-relaxed text-muted-foreground`,
              children: `In your first match, a 1400-rated player beats a 1600-rated one. Expected score is 0.24, so the win is worth 48 × (1 − 0.24) = 36 points: the winner moves to 1436 and, because the win came against a higher rank, also takes that spot on the ladder.`,
            }),
            (0, P.jsx)(q, {
              to: `/rules`,
              className: `mt-3 inline-flex font-display text-[0.55rem] uppercase tracking-[0.16em] text-brand hover:underline`,
              children: `Full house rules`,
            }),
          ],
        }),
      ],
    }),
  });
}
function q_({ xp: e = 0, showNext: t = !0 }) {
  let { level: n, ratio: r, toNext: i } = O_(e);
  return (0, P.jsxs)(`div`, {
    children: [
      (0, P.jsxs)(`div`, {
        className: `flex items-baseline justify-between gap-2`,
        children: [
          (0, P.jsxs)(`span`, {
            className: `font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground`,
            children: [`Level `, n],
          }),
          t &&
            (0, P.jsxs)(`span`, {
              className: `font-mono text-[10px] text-muted-foreground`,
              children: [i, ` xp to next`],
            }),
        ],
      }),
      (0, P.jsx)(`div`, {
        className: `mt-1.5 h-1.5 w-full overflow-hidden rounded-sm bg-secondary`,
        children: (0, P.jsx)(`div`, {
          className: `h-full bg-brand transition-all`,
          style: { width: `${Math.round(r * 100)}%` },
        }),
      }),
    ],
  });
}
function J_({ player: e, toConfirm: t = 0 }) {
  return (0, P.jsx)(`section`, {
    className: `border-b border-border bg-card`,
    children: (0, P.jsxs)(`div`, {
      className: `mx-auto max-w-5xl px-4 py-5 sm:px-6`,
      children: [
        (0, P.jsxs)(`div`, {
          className: `flex flex-col gap-4 sm:flex-row sm:items-center`,
          children: [
            (0, P.jsxs)(`div`, {
              className: `flex flex-1 items-center gap-4`,
              children: [
                (0, P.jsxs)(`div`, {
                  children: [
                    (0, P.jsx)(`p`, {
                      className: `font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground`,
                      children: `Your spot`,
                    }),
                    (0, P.jsx)(`p`, {
                      className: `font-heading text-2xl font-bold leading-none`,
                      children: e.singles_rank ? `#${e.singles_rank}` : `—`,
                    }),
                  ],
                }),
                (0, P.jsx)(`div`, { className: `h-9 w-px bg-border` }),
                (0, P.jsxs)(`div`, {
                  className: `min-w-0`,
                  children: [
                    (0, P.jsx)(`p`, {
                      className: `truncate font-heading text-sm font-semibold`,
                      children: M_(e),
                    }),
                    (0, P.jsxs)(`p`, {
                      className: `font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground`,
                      children: [
                        e.singles_rating,
                        ` singles · `,
                        E_(e.singles_wins, e.singles_losses),
                      ],
                    }),
                  ],
                }),
                (0, P.jsx)(`div`, {
                  className: `ml-auto hidden w-32 sm:block`,
                  children: (0, P.jsx)(q_, { xp: e.xp || 0 }),
                }),
              ],
            }),
            (0, P.jsxs)(`div`, {
              className: `flex gap-2`,
              children: [
                t > 0 &&
                  (0, P.jsxs)(q, {
                    to: `/matches`,
                    className: `flex-1 rounded-sm border border-warning/40 bg-warning/10 px-3 py-2 text-center text-xs font-medium text-warning sm:flex-none`,
                    children: [t, ` to confirm`],
                  }),
                (0, P.jsx)(q, {
                  to: `/challenges`,
                  className: `flex-1 rounded-sm border border-border px-3 py-2 text-center text-xs font-medium hover:border-foreground/40 sm:flex-none`,
                  children: `Challenge up`,
                }),
              ],
            }),
          ],
        }),
        (0, P.jsx)(`div`, {
          className: `mt-4 sm:hidden`,
          children: (0, P.jsx)(q_, { xp: e.xp || 0 }),
        }),
      ],
    }),
  });
}
var Y_ = (e, t) => e.catch(() => t);
function X_() {
  let { user: e } = kg(),
    { player: t } = Rg(),
    { data: n = {} } = Ca({
      queryKey: [`home`],
      refetchOnMount: `always`,
      queryFn: async () => {
        let [e, t, n, r, i] = await Promise.all([
          Y_($.entities.Player.count(), 0),
          Y_($.entities.Match.count({ status: `verified` }), 0),
          Y_($.entities.Match.count({ status: `pending` }), 0),
          Y_($.entities.Player.list({ sort: `singles_rank`, limit: 5 }), {
            items: [],
          }),
          Y_(
            $.entities.Match.filter(
              { status: `verified` },
              { sort: `-created_date`, limit: 4 },
            ),
            { items: [] },
          ),
        ]);
        return {
          players: e,
          verified: t,
          pending: n,
          top: r.items || [],
          recent: i.items || [],
        };
      },
    }),
    { data: r = 0 } = Ca({
      queryKey: [`my-pending`, e?.id],
      enabled: !!e?.id,
      queryFn: async () =>
        (
          (
            await $.entities.Match.filter(
              { all_user_ids: e.id, status: `pending` },
              { limit: 20 },
            )
          ).items || []
        ).filter((t) => !(t.accepted_user_ids || []).includes(e.id)).length,
    });
  return (0, P.jsxs)(P.Fragment, {
    children: [
      (0, P.jsx)(i_, {
        players: n.players,
        verified: n.verified,
        pending: n.pending,
        match: n.recent?.[0] || null,
      }),
      (0, P.jsx)(a_, {}),
      t && (0, P.jsx)(J_, { player: t, toConfirm: r }),
      (0, P.jsx)(P_, { players: n.top }),
      (0, P.jsx)(a_, { className: `hidden sm:block` }),
      (0, P.jsx)(B_, { matches: n.recent }),
      (0, P.jsx)(H_, {}),
      (0, P.jsx)(K_, {}),
    ],
  });
}
function Z_({ eyebrow: e, title: t, description: n, action: r }) {
  return (0, P.jsx)(`div`, {
    className: `border-b border-border`,
    children: (0, P.jsxs)(`div`, {
      className: `mx-auto flex max-w-5xl flex-col gap-3 px-4 py-7 sm:flex-row sm:items-end sm:justify-between sm:px-6 sm:py-10`,
      children: [
        (0, P.jsxs)(`div`, {
          children: [
            e &&
              (0, P.jsx)(`p`, {
                className: `font-display text-[0.58rem] uppercase tracking-[0.22em] text-brand`,
                children: e,
              }),
            (0, P.jsx)(`h1`, {
              className: `mt-2 font-heading text-2xl font-bold tracking-tight sm:text-3xl`,
              children: t,
            }),
            n &&
              (0, P.jsx)(`p`, {
                className: `mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground`,
                children: n,
              }),
          ],
        }),
        r,
      ],
    }),
  });
}
function Q_({ title: e, body: t, action: n }) {
  return (0, P.jsxs)(`div`, {
    className: `rounded-sm border border-dashed border-border bg-card/60 px-5 py-10 text-center`,
    children: [
      (0, P.jsx)(`div`, {
        className: `mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-sm border border-border bg-secondary`,
        children: (0, P.jsx)(`span`, {
          className: `h-2 w-2 rounded-full bg-brand`,
        }),
      }),
      (0, P.jsx)(`p`, {
        className: `font-heading text-base font-semibold`,
        children: e,
      }),
      t &&
        (0, P.jsx)(`p`, {
          className: `mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted-foreground`,
          children: t,
        }),
      n &&
        (0, P.jsx)(`div`, {
          className: `mt-4 flex justify-center`,
          children: n,
        }),
    ],
  });
}
var $_ = [
  { key: `singles`, label: `Singles` },
  { key: `doubles`, label: `Doubles` },
  { key: `overall`, label: `Overall` },
];
function ev() {
  let [e, t] = (0, _.useState)(`singles`),
    { player: n } = Rg(),
    { data: r = [], isLoading: i } = Ca({
      queryKey: [`players`],
      queryFn: async () =>
        (await $.entities.Player.list({ limit: 300 })).items || [],
    }),
    a = (0, _.useMemo)(() => {
      let t = [...r];
      return e === `singles`
        ? t
            .filter((e) => Number(e.singles_rank) > 0)
            .sort((e, t) => e.singles_rank - t.singles_rank)
            .map((e) => ({
              player: e,
              rank: e.singles_rank,
              rating: e.singles_rating || 1400,
              wins: e.singles_wins || 0,
              losses: e.singles_losses || 0,
            }))
        : e === `doubles`
          ? t
              .sort(
                (e, t) =>
                  (t.doubles_rating || 1400) - (e.doubles_rating || 1400),
              )
              .map((e, t) => ({
                player: e,
                rank: t + 1,
                rating: e.doubles_rating || 1400,
                wins: e.doubles_wins || 0,
                losses: e.doubles_losses || 0,
              }))
          : t
              .sort((e, t) => j_(t) - j_(e))
              .map((e, t) => ({
                player: e,
                rank: t + 1,
                rating: j_(e),
                wins: (e.singles_wins || 0) + (e.doubles_wins || 0),
                losses: (e.singles_losses || 0) + (e.doubles_losses || 0),
              }));
    }, [r, e]);
  return (0, P.jsxs)(P.Fragment, {
    children: [
      (0, P.jsx)(Z_, {
        eyebrow: `Ladder`,
        title: `Leaderboard`,
        description: `Ranked on verified matches only. Singles runs a positional ladder; doubles and overall rank by rating.`,
      }),
      (0, P.jsx)(`div`, {
        className: `sticky top-14 z-20 border-b border-border bg-background/95 backdrop-blur`,
        children: (0, P.jsx)(`div`, {
          className: `mx-auto flex max-w-5xl gap-1 px-4 py-2 sm:px-6`,
          role: `tablist`,
          "aria-label": `Leaderboard view`,
          children: $_.map((n) =>
            (0, P.jsx)(
              `button`,
              {
                role: `tab`,
                "aria-selected": e === n.key,
                onClick: () => t(n.key),
                className: `min-h-[40px] flex-1 rounded-sm px-3 font-heading text-sm font-medium transition-colors sm:flex-none ${e === n.key ? `bg-primary text-primary-foreground` : `text-muted-foreground hover:bg-secondary`}`,
                children: n.label,
              },
              n.key,
            ),
          ),
        }),
      }),
      (0, P.jsxs)(`div`, {
        className: `mx-auto max-w-5xl px-4 py-6 sm:px-6`,
        children: [
          i
            ? (0, P.jsx)(`div`, {
                className: `flex justify-center py-16`,
                children: (0, P.jsx)(`div`, {
                  className: `h-7 w-7 animate-spin rounded-full border-2 border-border border-t-foreground`,
                }),
              })
            : a.length === 0
              ? (0, P.jsx)(Q_, {
                  title: `Nobody on the ladder yet`,
                  body: `Create a profile and record the first match to open the table.`,
                  action: (0, P.jsx)(q, {
                    to: n ? `/matches/new` : `/register`,
                    className: `rounded-sm bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground`,
                    children: n ? `Record a match` : `Join the ladder`,
                  }),
                })
              : (0, P.jsxs)(`div`, {
                  className: `overflow-hidden rounded-sm border border-border bg-card`,
                  children: [
                    (0, P.jsxs)(`div`, {
                      className: `flex items-center gap-3 border-b border-border bg-secondary/60 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground`,
                      children: [
                        (0, P.jsx)(`span`, { className: `w-7`, children: `#` }),
                        (0, P.jsx)(`span`, { className: `w-[30px]` }),
                        (0, P.jsx)(`span`, {
                          className: `flex-1`,
                          children: `Player`,
                        }),
                        (0, P.jsx)(`span`, {
                          className: `w-12 text-right`,
                          children:
                            e === `singles` || e === `doubles`
                              ? `Rating`
                              : `Score`,
                        }),
                      ],
                    }),
                    (0, P.jsx)(`ul`, {
                      children: a.map((e) =>
                        (0, P.jsx)(N_, { ...e }, e.player.id),
                      ),
                    }),
                  ],
                }),
          (0, P.jsxs)(`p`, {
            className: `mt-4 text-xs leading-relaxed text-muted-foreground`,
            children: [
              e === `singles`
                ? `Beating someone above you takes their place; everyone in between slides down one.`
                : e === `doubles`
                  ? `Doubles rating is a separate pool — it only moves on verified doubles results.`
                  : `Overall weights your singles and doubles ratings by how much you have played each.`,
              ` `,
              (0, P.jsx)(q, {
                to: `/rules`,
                className: `text-brand underline underline-offset-2`,
                children: `How ranking works`,
              }),
            ],
          }),
          n &&
            e === `overall` &&
            (0, P.jsxs)(`p`, {
              className: `mt-1 text-xs text-muted-foreground`,
              children: [
                `You have played `,
                A_(n, `singles`) + A_(n, `doubles`),
                ` verified matches.`,
              ],
            }),
        ],
      }),
    ],
  });
}
function tv() {
  let { user: e, isAuthenticated: t } = kg(),
    [n, r] = (0, _.useState)(`all`),
    { data: i, isLoading: a } = Ca({
      queryKey: [`matches`, n, e?.id],
      queryFn: async () =>
        n === `mine` && e?.id
          ? (
              await $.entities.Match.filter(
                { all_user_ids: e.id },
                { sort: `-created_date`, limit: 40 },
              )
            ).items || []
          : (await $.entities.Match.list({ sort: `-created_date`, limit: 40 }))
              .items || [],
    }),
    o = i || [];
  return (0, P.jsxs)(P.Fragment, {
    children: [
      (0, P.jsx)(Z_, {
        eyebrow: `Match log`,
        title: `Matches`,
        description: `Every submitted result, with its sign-off status.`,
        action: (0, P.jsx)(q, {
          to: `/matches/new`,
          className: `inline-flex min-h-[44px] items-center justify-center rounded-sm bg-primary px-4 text-sm font-medium text-primary-foreground`,
          children: `Record a match`,
        }),
      }),
      t &&
        (0, P.jsx)(`div`, {
          className: `mx-auto max-w-5xl px-4 pt-4 sm:px-6`,
          children: (0, P.jsx)(`div`, {
            className: `flex gap-1`,
            children: [
              { key: `all`, label: `All` },
              { key: `mine`, label: `Mine` },
            ].map((e) =>
              (0, P.jsx)(
                `button`,
                {
                  onClick: () => r(e.key),
                  className: `min-h-[38px] rounded-sm px-4 font-heading text-sm font-medium transition-colors ${n === e.key ? `bg-primary text-primary-foreground` : `border border-border bg-card text-muted-foreground hover:text-foreground`}`,
                  children: e.label,
                },
                e.key,
              ),
            ),
          }),
        }),
      (0, P.jsx)(`div`, {
        className: `mx-auto max-w-5xl px-4 py-5 sm:px-6`,
        children: a
          ? (0, P.jsx)(`div`, {
              className: `flex justify-center py-16`,
              children: (0, P.jsx)(`div`, {
                className: `h-7 w-7 animate-spin rounded-full border-2 border-border border-t-foreground`,
              }),
            })
          : o.length === 0
            ? (0, P.jsx)(Q_, {
                title: `No matches here yet`,
                body: `Record a result and it will show up here until everyone signs off.`,
                action: (0, P.jsx)(q, {
                  to: `/matches/new`,
                  className: `rounded-sm bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground`,
                  children: `Record a match`,
                }),
              })
            : (0, P.jsx)(`ul`, {
                className: `overflow-hidden rounded-sm border border-border bg-card`,
                children: o.map((e) => (0, P.jsx)(z_, { match: e }, e.id)),
              }),
      }),
    ],
  });
}
function nv({ side: e, gamesWon: t, winner: n, label: r }) {
  return (0, P.jsxs)(`div`, {
    className: `rounded-sm border p-3 ${n ? `border-success/40 bg-success/5` : `border-border bg-card`}`,
    children: [
      (0, P.jsxs)(`div`, {
        className: `flex items-baseline justify-between gap-2`,
        children: [
          (0, P.jsx)(`p`, {
            className: `font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground`,
            children: r,
          }),
          (0, P.jsx)(`p`, {
            className: `font-mono text-2xl leading-none tabular-nums ${n ? `text-success` : ``}`,
            children: t || 0,
          }),
        ],
      }),
      (0, P.jsx)(`ul`, {
        className: `mt-2.5 space-y-2`,
        children: (e || []).map((e) =>
          (0, P.jsxs)(
            `li`,
            {
              className: `flex items-center gap-2`,
              children: [
                (0, P.jsx)(w_, {
                  name: e.display_name || e.username,
                  src: e.avatar_url,
                  size: 26,
                }),
                (0, P.jsx)(q, {
                  to: `/players/${e.username}`,
                  className: `min-w-0 flex-1 truncate font-heading text-sm font-medium hover:underline`,
                  children: e.display_name || e.username,
                }),
                (0, P.jsx)(`span`, {
                  className: `shrink-0 rounded-sm border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground`,
                  children: e.paddle || `default`,
                }),
              ],
            },
            e.player_id,
          ),
        ),
      }),
    ],
  });
}
function rv() {
  let { id: e } = ls(),
    { user: t } = kg(),
    [n, r] = (0, _.useState)(``),
    [i, a] = (0, _.useState)(``),
    {
      data: o,
      isLoading: s,
      refetch: c,
    } = Ca({
      queryKey: [`match`, e],
      queryFn: async () =>
        $.entities.Match.get(e).catch((e) =>
          e.status === 404 ? null : Promise.reject(e),
        ),
    });
  (0, _.useEffect)(() => {
    if (!s && !o) {
      let e = document.createElement(`meta`);
      return (
        (e.name = `prerender-status-code`),
        (e.content = `404`),
        document.head.appendChild(e),
        () => e.remove()
      );
    }
  }, [s, o]);
  let l = async (t) => {
    r(t), a(``);
    try {
      let n = await $.functions.invoke(`respondMatch`, {
        match_id: e,
        decision: t,
      });
      if (n.data?.error) throw Error(n.data.error);
      await c();
    } catch (e) {
      a(
        e.response?.data?.error || e.message || `Could not save your response.`,
      );
    } finally {
      r(``);
    }
  };
  if (s)
    return (0, P.jsx)(`div`, {
      className: `flex justify-center py-24`,
      children: (0, P.jsx)(`div`, {
        className: `h-7 w-7 animate-spin rounded-full border-2 border-border border-t-foreground`,
      }),
    });
  if (!o)
    return (0, P.jsx)(`div`, {
      className: `mx-auto max-w-2xl px-4 py-16 sm:px-6`,
      children: (0, P.jsx)(Q_, {
        title: `Match not found`,
        body: `This result may have been removed.`,
        action: (0, P.jsx)(q, {
          to: `/matches`,
          className: `rounded-sm bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground`,
          children: `Back to matches`,
        }),
      }),
    });
  let u = o.all_user_ids || [],
    d = o.accepted_user_ids || [],
    f = t ? u.includes(t.id) : !1,
    p = t ? d.includes(t.id) : !1,
    m = u.filter((e) => !d.includes(e)),
    h = [...(o.side_a || []), ...(o.side_b || [])],
    g = (e) => {
      let t = h.find((t) => t.user_id === e);
      return t?.display_name || t?.username || `A player`;
    };
  return (0, P.jsxs)(P.Fragment, {
    children: [
      (0, P.jsx)(Z_, {
        eyebrow: `${o.format === `doubles` ? `Doubles` : `Singles`} · to ${o.target}`,
        title: `Match result`,
        description: `Submitted by ${o.submitted_by_name || `a player`} · ${T_(o.created_date)}`,
        action: (0, P.jsx)(L_, { status: o.status }),
      }),
      (0, P.jsxs)(`div`, {
        className: `mx-auto max-w-2xl space-y-5 px-4 py-6 sm:px-6`,
        children: [
          (0, P.jsxs)(`div`, {
            className: `grid grid-cols-2 gap-2`,
            children: [
              (0, P.jsx)(nv, {
                side: o.side_a,
                gamesWon: o.games_a,
                winner: o.winner_side === `a`,
                label: `Side A`,
              }),
              (0, P.jsx)(nv, {
                side: o.side_b,
                gamesWon: o.games_b,
                winner: o.winner_side === `b`,
                label: `Side B`,
              }),
            ],
          }),
          (0, P.jsxs)(`section`, {
            children: [
              (0, P.jsx)(`h2`, {
                className: `font-display text-[0.58rem] uppercase tracking-[0.22em] text-muted-foreground`,
                children: `Games`,
              }),
              (0, P.jsx)(`ul`, {
                className: `mt-2 divide-y divide-border overflow-hidden rounded-sm border border-border bg-card`,
                children: (o.games || []).map((e, t) => {
                  let n = Number(e.a) > Number(e.b);
                  return (0, P.jsxs)(
                    `li`,
                    {
                      className: `flex items-center justify-between px-3 py-2.5`,
                      children: [
                        (0, P.jsxs)(`span`, {
                          className: `font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground`,
                          children: [`Game `, t + 1],
                        }),
                        (0, P.jsxs)(`span`, {
                          className: `font-mono text-sm tabular-nums`,
                          children: [
                            (0, P.jsx)(`span`, {
                              className: n
                                ? `font-semibold`
                                : `text-muted-foreground`,
                              children: e.a,
                            }),
                            (0, P.jsx)(`span`, {
                              className: `mx-1.5 text-muted-foreground`,
                              children: `–`,
                            }),
                            (0, P.jsx)(`span`, {
                              className: n
                                ? `text-muted-foreground`
                                : `font-semibold`,
                              children: e.b,
                            }),
                          ],
                        }),
                      ],
                    },
                    t,
                  );
                }),
              }),
            ],
          }),
          (0, P.jsxs)(`section`, {
            children: [
              (0, P.jsx)(`h2`, {
                className: `font-display text-[0.58rem] uppercase tracking-[0.22em] text-muted-foreground`,
                children: `Sign-off`,
              }),
              (0, P.jsx)(`ul`, {
                className: `mt-2 divide-y divide-border overflow-hidden rounded-sm border border-border bg-card`,
                children: u.map((e) => {
                  let t = d.includes(e);
                  return (0, P.jsxs)(
                    `li`,
                    {
                      className: `flex items-center gap-2 px-3 py-2.5`,
                      children: [
                        t
                          ? (0, P.jsx)(an, {
                              className: `h-4 w-4 text-success`,
                              "aria-hidden": `true`,
                            })
                          : (0, P.jsx)(`span`, {
                              className: `h-4 w-4 rounded-full border border-border`,
                              "aria-hidden": `true`,
                            }),
                        (0, P.jsx)(`span`, {
                          className: `flex-1 truncate font-heading text-sm`,
                          children: g(e),
                        }),
                        (0, P.jsx)(`span`, {
                          className: `font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground`,
                          children: t
                            ? `Confirmed`
                            : o.status === `pending`
                              ? `Waiting`
                              : `No`,
                        }),
                      ],
                    },
                    e,
                  );
                }),
              }),
              o.status === `pending` &&
                (0, P.jsx)(`p`, {
                  className: `mt-2 text-xs text-muted-foreground`,
                  children:
                    m.length > 0
                      ? `Waiting on ${m.length} ${m.length === 1 ? `player` : `players`} before this counts.`
                      : `All players have confirmed.`,
                }),
              o.note &&
                (0, P.jsxs)(`p`, {
                  className: `mt-2 rounded-sm border border-border bg-card px-3 py-2 text-xs text-muted-foreground`,
                  children: [`Note: `, o.note],
                }),
            ],
          }),
          o.status === `pending` &&
            f &&
            !p &&
            (0, P.jsxs)(`section`, {
              className: `space-y-2`,
              children: [
                (0, P.jsx)(`p`, {
                  className: `font-display text-[0.58rem] uppercase tracking-[0.22em] text-muted-foreground`,
                  children: `Your call`,
                }),
                (0, P.jsxs)(Qg, {
                  onClick: () => l(`accept`),
                  disabled: !!n,
                  size: `lg`,
                  className: `h-12 w-full rounded-sm`,
                  children: [
                    n === `accept`
                      ? (0, P.jsx)(ln, {
                          className: `mr-2 h-4 w-4 animate-spin`,
                          "aria-hidden": `true`,
                        })
                      : (0, P.jsx)(an, {
                          className: `mr-2 h-4 w-4`,
                          "aria-hidden": `true`,
                        }),
                    `Confirm result`,
                  ],
                }),
                (0, P.jsxs)(`div`, {
                  className: `grid grid-cols-2 gap-2`,
                  children: [
                    (0, P.jsxs)(Qg, {
                      onClick: () => l(`dispute`),
                      disabled: !!n,
                      variant: `outline`,
                      className: `h-11 rounded-sm`,
                      children: [
                        (0, P.jsx)(bn, {
                          className: `mr-2 h-4 w-4`,
                          "aria-hidden": `true`,
                        }),
                        `Dispute`,
                      ],
                    }),
                    (0, P.jsxs)(Qg, {
                      onClick: () => l(`decline`),
                      disabled: !!n,
                      variant: `outline`,
                      className: `h-11 rounded-sm text-destructive`,
                      children: [
                        (0, P.jsx)(wn, {
                          className: `mr-2 h-4 w-4`,
                          "aria-hidden": `true`,
                        }),
                        `Decline`,
                      ],
                    }),
                  ],
                }),
                (0, P.jsx)(`p`, {
                  className: `text-xs text-muted-foreground`,
                  children: `Disputed and declined matches never change ratings, levels or records.`,
                }),
              ],
            }),
          i &&
            (0, P.jsx)(`p`, {
              className: `rounded-sm border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive`,
              children: i,
            }),
          o.status === `verified` &&
            (o.rating_changes || []).length > 0 &&
            (0, P.jsxs)(`section`, {
              children: [
                (0, P.jsx)(`h2`, {
                  className: `font-display text-[0.58rem] uppercase tracking-[0.22em] text-muted-foreground`,
                  children: `Rating change`,
                }),
                (0, P.jsx)(`ul`, {
                  className: `mt-2 divide-y divide-border overflow-hidden rounded-sm border border-border bg-card`,
                  children: o.rating_changes.map((e) =>
                    (0, P.jsxs)(
                      `li`,
                      {
                        className: `flex items-center gap-2 px-3 py-2.5`,
                        children: [
                          (0, P.jsx)(`span`, {
                            className: `flex-1 truncate font-heading text-sm`,
                            children: e.name,
                          }),
                          (0, P.jsxs)(`span`, {
                            className: `font-mono text-xs tabular-nums text-muted-foreground`,
                            children: [e.before, ` → `, e.after],
                          }),
                          (0, P.jsxs)(`span`, {
                            className: `w-10 text-right font-mono text-xs tabular-nums ${e.delta >= 0 ? `text-success` : `text-destructive`}`,
                            children: [e.delta >= 0 ? `+` : ``, e.delta],
                          }),
                        ],
                      },
                      e.player_id,
                    ),
                  ),
                }),
              ],
            }),
        ],
      }),
    ],
  });
}
var iv = _.useId || (() => void 0),
  av = 0;
function ov(e) {
  let [t, n] = _.useState(iv());
  return (
    Le(() => {
      e || n((e) => e ?? String(av++));
    }, [e]),
    e || (t ? `radix-${t}` : ``)
  );
}
var sv = `focusScope.autoFocusOnMount`,
  cv = `focusScope.autoFocusOnUnmount`,
  lv = { bubbles: !1, cancelable: !0 },
  uv = `FocusScope`,
  dv = _.forwardRef((e, t) => {
    let {
        loop: n = !1,
        trapped: r = !1,
        onMountAutoFocus: i,
        onUnmountAutoFocus: a,
        ...o
      } = e,
      [s, c] = _.useState(null),
      l = be(i),
      u = be(a),
      d = _.useRef(null),
      f = M(t, (e) => c(e)),
      p = _.useRef({
        paused: !1,
        pause() {
          this.paused = !0;
        },
        resume() {
          this.paused = !1;
        },
      }).current;
    _.useEffect(() => {
      if (r) {
        let e = function (e) {
            if (p.paused || !s) return;
            let t = e.target;
            s.contains(t) ? (d.current = t) : vv(d.current, { select: !0 });
          },
          t = function (e) {
            if (p.paused || !s) return;
            let t = e.relatedTarget;
            t !== null && (s.contains(t) || vv(d.current, { select: !0 }));
          },
          n = function (e) {
            if (document.activeElement === document.body)
              for (let t of e) t.removedNodes.length > 0 && vv(s);
          };
        document.addEventListener(`focusin`, e),
          document.addEventListener(`focusout`, t);
        let r = new MutationObserver(n);
        return (
          s && r.observe(s, { childList: !0, subtree: !0 }),
          () => {
            document.removeEventListener(`focusin`, e),
              document.removeEventListener(`focusout`, t),
              r.disconnect();
          }
        );
      }
    }, [r, s, p.paused]),
      _.useEffect(() => {
        if (s) {
          yv.add(p);
          let e = document.activeElement;
          if (!s.contains(e)) {
            let t = new CustomEvent(sv, lv);
            s.addEventListener(sv, l),
              s.dispatchEvent(t),
              t.defaultPrevented ||
                (fv(Sv(mv(s)), { select: !0 }),
                document.activeElement === e && vv(s));
          }
          return () => {
            s.removeEventListener(sv, l),
              setTimeout(() => {
                let t = new CustomEvent(cv, lv);
                s.addEventListener(cv, u),
                  s.dispatchEvent(t),
                  t.defaultPrevented || vv(e ?? document.body, { select: !0 }),
                  s.removeEventListener(cv, u),
                  yv.remove(p);
              }, 0);
          };
        }
      }, [s, l, u, p]);
    let m = _.useCallback(
      (e) => {
        if ((!n && !r) || p.paused) return;
        let t = e.key === `Tab` && !e.altKey && !e.ctrlKey && !e.metaKey,
          i = document.activeElement;
        if (t && i) {
          let t = e.currentTarget,
            [r, a] = pv(t);
          r && a
            ? !e.shiftKey && i === a
              ? (e.preventDefault(), n && vv(r, { select: !0 }))
              : e.shiftKey &&
                i === r &&
                (e.preventDefault(), n && vv(a, { select: !0 }))
            : i === t && e.preventDefault();
        }
      },
      [n, r, p.paused],
    );
    return (0, P.jsx)(ve.div, { tabIndex: -1, ...o, ref: f, onKeyDown: m });
  });
dv.displayName = uv;
function fv(e, { select: t = !1 } = {}) {
  let n = document.activeElement;
  for (let r of e)
    if ((vv(r, { select: t }), document.activeElement !== n)) return;
}
function pv(e) {
  let t = mv(e);
  return [hv(t, e), hv(t.reverse(), e)];
}
function mv(e) {
  let t = [],
    n = document.createTreeWalker(e, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (e) => {
        let t = e.tagName === `INPUT` && e.type === `hidden`;
        return e.disabled || e.hidden || t
          ? NodeFilter.FILTER_SKIP
          : e.tabIndex >= 0
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_SKIP;
      },
    });
  for (; n.nextNode(); ) t.push(n.currentNode);
  return t;
}
function hv(e, t) {
  for (let n of e) if (!gv(n, { upTo: t })) return n;
}
function gv(e, { upTo: t }) {
  if (getComputedStyle(e).visibility === `hidden`) return !0;
  for (; e; ) {
    if (t !== void 0 && e === t) return !1;
    if (getComputedStyle(e).display === `none`) return !0;
    e = e.parentElement;
  }
  return !1;
}
function _v(e) {
  return e instanceof HTMLInputElement && `select` in e;
}
function vv(e, { select: t = !1 } = {}) {
  if (e && e.focus) {
    let n = document.activeElement;
    e.focus({ preventScroll: !0 }), e !== n && _v(e) && t && e.select();
  }
}
var yv = bv();
function bv() {
  let e = [];
  return {
    add(t) {
      let n = e[0];
      t !== n && n?.pause(), (e = xv(e, t)), e.unshift(t);
    },
    remove(t) {
      (e = xv(e, t)), e[0]?.resume();
    },
  };
}
function xv(e, t) {
  let n = [...e],
    r = n.indexOf(t);
  return r !== -1 && n.splice(r, 1), n;
}
function Sv(e) {
  return e.filter((e) => e.tagName !== `A`);
}
var Cv = 0;
function wv() {
  _.useEffect(() => {
    let e = document.querySelectorAll(`[data-radix-focus-guard]`);
    return (
      document.body.insertAdjacentElement(`afterbegin`, e[0] ?? Tv()),
      document.body.insertAdjacentElement(`beforeend`, e[1] ?? Tv()),
      Cv++,
      () => {
        Cv === 1 &&
          document
            .querySelectorAll(`[data-radix-focus-guard]`)
            .forEach((e) => e.remove()),
          Cv--;
      }
    );
  }, []);
}
function Tv() {
  let e = document.createElement(`span`);
  return (
    e.setAttribute(`data-radix-focus-guard`, ``),
    (e.tabIndex = 0),
    (e.style.outline = `none`),
    (e.style.opacity = `0`),
    (e.style.position = `fixed`),
    (e.style.pointerEvents = `none`),
    e
  );
}
var Ev = function () {
  return (
    (Ev =
      Object.assign ||
      function (e) {
        for (var t, n = 1, r = arguments.length; n < r; n++)
          for (var i in ((t = arguments[n]), t))
            Object.prototype.hasOwnProperty.call(t, i) && (e[i] = t[i]);
        return e;
      }),
    Ev.apply(this, arguments)
  );
};
function Dv(e, t) {
  var n = {};
  for (var r in e)
    Object.prototype.hasOwnProperty.call(e, r) &&
      t.indexOf(r) < 0 &&
      (n[r] = e[r]);
  if (e != null && typeof Object.getOwnPropertySymbols == `function`)
    for (var i = 0, r = Object.getOwnPropertySymbols(e); i < r.length; i++)
      t.indexOf(r[i]) < 0 &&
        Object.prototype.propertyIsEnumerable.call(e, r[i]) &&
        (n[r[i]] = e[r[i]]);
  return n;
}
function Ov(e, t, n) {
  if (n || arguments.length === 2)
    for (var r = 0, i = t.length, a; r < i; r++)
      (a || !(r in t)) &&
        ((a ||= Array.prototype.slice.call(t, 0, r)), (a[r] = t[r]));
  return e.concat(a || Array.prototype.slice.call(t));
}
var kv = `right-scroll-bar-position`,
  Av = `width-before-scroll-bar`,
  jv = `with-scroll-bars-hidden`,
  Mv = `--removed-body-scroll-bar-size`;
function Nv(e, t) {
  return typeof e == `function` ? e(t) : e && (e.current = t), e;
}
function Pv(e, t) {
  var n = (0, _.useState)(function () {
    return {
      value: e,
      callback: t,
      facade: {
        get current() {
          return n.value;
        },
        set current(e) {
          var t = n.value;
          t !== e && ((n.value = e), n.callback(e, t));
        },
      },
    };
  })[0];
  return (n.callback = t), n.facade;
}
var Fv = typeof window < `u` ? _.useLayoutEffect : _.useEffect,
  Iv = new WeakMap();
function Lv(e, t) {
  var n = Pv(t || null, function (t) {
    return e.forEach(function (e) {
      return Nv(e, t);
    });
  });
  return (
    Fv(
      function () {
        var t = Iv.get(n);
        if (t) {
          var r = new Set(t),
            i = new Set(e),
            a = n.current;
          r.forEach(function (e) {
            i.has(e) || Nv(e, null);
          }),
            i.forEach(function (e) {
              r.has(e) || Nv(e, a);
            });
        }
        Iv.set(n, e);
      },
      [e],
    ),
    n
  );
}
function Rv(e) {
  return e;
}
function zv(e, t) {
  t === void 0 && (t = Rv);
  var n = [],
    r = !1;
  return {
    read: function () {
      if (r)
        throw Error(
          "Sidecar: could not `read` from an `assigned` medium. `read` could be used only with `useMedium`.",
        );
      return n.length ? n[n.length - 1] : e;
    },
    useMedium: function (e) {
      var i = t(e, r);
      return (
        n.push(i),
        function () {
          n = n.filter(function (e) {
            return e !== i;
          });
        }
      );
    },
    assignSyncMedium: function (e) {
      for (r = !0; n.length; ) {
        var t = n;
        (n = []), t.forEach(e);
      }
      n = {
        push: function (t) {
          return e(t);
        },
        filter: function () {
          return n;
        },
      };
    },
    assignMedium: function (e) {
      r = !0;
      var t = [];
      if (n.length) {
        var i = n;
        (n = []), i.forEach(e), (t = n);
      }
      var a = function () {
          var n = t;
          (t = []), n.forEach(e);
        },
        o = function () {
          return Promise.resolve().then(a);
        };
      o(),
        (n = {
          push: function (e) {
            t.push(e), o();
          },
          filter: function (e) {
            return (t = t.filter(e)), n;
          },
        });
    },
  };
}
function Bv(e) {
  e === void 0 && (e = {});
  var t = zv(null);
  return (t.options = Ev({ async: !0, ssr: !1 }, e)), t;
}
var Vv = function (e) {
  var t = e.sideCar,
    n = Dv(e, [`sideCar`]);
  if (!t)
    throw Error(
      "Sidecar: please provide `sideCar` property to import the right car",
    );
  var r = t.read();
  if (!r) throw Error(`Sidecar medium not found`);
  return _.createElement(r, Ev({}, n));
};
Vv.isSideCarExport = !0;
function Hv(e, t) {
  return e.useMedium(t), Vv;
}
var Uv = Bv(),
  Wv = function () {},
  Gv = _.forwardRef(function (e, t) {
    var n = _.useRef(null),
      r = _.useState({
        onScrollCapture: Wv,
        onWheelCapture: Wv,
        onTouchMoveCapture: Wv,
      }),
      i = r[0],
      a = r[1],
      o = e.forwardProps,
      s = e.children,
      c = e.className,
      l = e.removeScrollBar,
      u = e.enabled,
      d = e.shards,
      f = e.sideCar,
      p = e.noRelative,
      m = e.noIsolation,
      h = e.inert,
      g = e.allowPinchZoom,
      v = e.as,
      y = v === void 0 ? `div` : v,
      b = e.gapMode,
      x = Dv(e, [
        `forwardProps`,
        `children`,
        `className`,
        `removeScrollBar`,
        `enabled`,
        `shards`,
        `sideCar`,
        `noRelative`,
        `noIsolation`,
        `inert`,
        `allowPinchZoom`,
        `as`,
        `gapMode`,
      ]),
      S = f,
      C = Lv([n, t]),
      w = Ev(Ev({}, x), i);
    return _.createElement(
      _.Fragment,
      null,
      u &&
        _.createElement(S, {
          sideCar: Uv,
          removeScrollBar: l,
          shards: d,
          noRelative: p,
          noIsolation: m,
          inert: h,
          setCallbacks: a,
          allowPinchZoom: !!g,
          lockRef: n,
          gapMode: b,
        }),
      o
        ? _.cloneElement(_.Children.only(s), Ev(Ev({}, w), { ref: C }))
        : _.createElement(y, Ev({}, w, { className: c, ref: C }), s),
    );
  });
(Gv.defaultProps = { enabled: !0, removeScrollBar: !0, inert: !1 }),
  (Gv.classNames = { fullWidth: Av, zeroRight: kv });
var Kv,
  qv = function () {
    if (Kv) return Kv;
    if (typeof __webpack_nonce__ < `u`) return __webpack_nonce__;
  };
function Jv() {
  if (!document) return null;
  var e = document.createElement(`style`);
  e.type = `text/css`;
  var t = qv();
  return t && e.setAttribute(`nonce`, t), e;
}
function Yv(e, t) {
  e.styleSheet
    ? (e.styleSheet.cssText = t)
    : e.appendChild(document.createTextNode(t));
}
function Xv(e) {
  (document.head || document.getElementsByTagName(`head`)[0]).appendChild(e);
}
var Zv = function () {
    var e = 0,
      t = null;
    return {
      add: function (n) {
        e == 0 && (t = Jv()) && (Yv(t, n), Xv(t)), e++;
      },
      remove: function () {
        e--,
          !e && t && (t.parentNode && t.parentNode.removeChild(t), (t = null));
      },
    };
  },
  Qv = function () {
    var e = Zv();
    return function (t, n) {
      _.useEffect(
        function () {
          return (
            e.add(t),
            function () {
              e.remove();
            }
          );
        },
        [t && n],
      );
    };
  },
  $v = function () {
    var e = Qv();
    return function (t) {
      var n = t.styles,
        r = t.dynamic;
      return e(n, r), null;
    };
  },
  ey = { left: 0, top: 0, right: 0, gap: 0 },
  ty = function (e) {
    return parseInt(e || ``, 10) || 0;
  },
  ny = function (e) {
    var t = window.getComputedStyle(document.body),
      n = t[e === `padding` ? `paddingLeft` : `marginLeft`],
      r = t[e === `padding` ? `paddingTop` : `marginTop`],
      i = t[e === `padding` ? `paddingRight` : `marginRight`];
    return [ty(n), ty(r), ty(i)];
  },
  ry = function (e) {
    if ((e === void 0 && (e = `margin`), typeof window > `u`)) return ey;
    var t = ny(e),
      n = document.documentElement.clientWidth,
      r = window.innerWidth;
    return {
      left: t[0],
      top: t[1],
      right: t[2],
      gap: Math.max(0, r - n + t[2] - t[0]),
    };
  },
  iy = $v(),
  ay = `data-scroll-locked`,
  oy = function (e, t, n, r) {
    var i = e.left,
      a = e.top,
      o = e.right,
      s = e.gap;
    return (
      n === void 0 && (n = `margin`),
      `
  .${jv} {
   overflow: hidden ${r};
   padding-right: ${s}px ${r};
  }
  body[${ay}] {
    overflow: hidden ${r};
    overscroll-behavior: contain;
    ${[
      t && `position: relative ${r};`,
      n === `margin` &&
        `
    padding-left: ${i}px;
    padding-top: ${a}px;
    padding-right: ${o}px;
    margin-left:0;
    margin-top:0;
    margin-right: ${s}px ${r};
    `,
      n === `padding` && `padding-right: ${s}px ${r};`,
    ]
      .filter(Boolean)
      .join(``)}
  }
  
  .${kv} {
    right: ${s}px ${r};
  }
  
  .${Av} {
    margin-right: ${s}px ${r};
  }
  
  .${kv} .${kv} {
    right: 0 ${r};
  }
  
  .${Av} .${Av} {
    margin-right: 0 ${r};
  }
  
  body[${ay}] {
    ${Mv}: ${s}px;
  }
`
    );
  },
  sy = function () {
    var e = parseInt(
      document.body.getAttribute(`data-scroll-locked`) || `0`,
      10,
    );
    return isFinite(e) ? e : 0;
  },
  cy = function () {
    _.useEffect(function () {
      return (
        document.body.setAttribute(ay, (sy() + 1).toString()),
        function () {
          var e = sy() - 1;
          e <= 0
            ? document.body.removeAttribute(ay)
            : document.body.setAttribute(ay, e.toString());
        }
      );
    }, []);
  },
  ly = function (e) {
    var t = e.noRelative,
      n = e.noImportant,
      r = e.gapMode,
      i = r === void 0 ? `margin` : r;
    cy();
    var a = _.useMemo(
      function () {
        return ry(i);
      },
      [i],
    );
    return _.createElement(iy, { styles: oy(a, !t, i, n ? `` : `!important`) });
  },
  uy = !1;
if (typeof window < `u`)
  try {
    var dy = Object.defineProperty({}, "passive", {
      get: function () {
        return (uy = !0), !0;
      },
    });
    window.addEventListener(`test`, dy, dy),
      window.removeEventListener(`test`, dy, dy);
  } catch {
    uy = !1;
  }
var fy = uy ? { passive: !1 } : !1,
  py = function (e) {
    return e.tagName === `TEXTAREA`;
  },
  my = function (e, t) {
    if (!(e instanceof Element)) return !1;
    var n = window.getComputedStyle(e);
    return (
      n[t] !== `hidden` &&
      !(n.overflowY === n.overflowX && !py(e) && n[t] === `visible`)
    );
  },
  hy = function (e) {
    return my(e, `overflowY`);
  },
  gy = function (e) {
    return my(e, `overflowX`);
  },
  _y = function (e, t) {
    var n = t.ownerDocument,
      r = t;
    do {
      if (
        (typeof ShadowRoot < `u` && r instanceof ShadowRoot && (r = r.host),
        by(e, r))
      ) {
        var i = xy(e, r);
        if (i[1] > i[2]) return !0;
      }
      r = r.parentNode;
    } while (r && r !== n.body);
    return !1;
  },
  vy = function (e) {
    return [e.scrollTop, e.scrollHeight, e.clientHeight];
  },
  yy = function (e) {
    return [e.scrollLeft, e.scrollWidth, e.clientWidth];
  },
  by = function (e, t) {
    return e === `v` ? hy(t) : gy(t);
  },
  xy = function (e, t) {
    return e === `v` ? vy(t) : yy(t);
  },
  Sy = function (e, t) {
    return e === `h` && t === `rtl` ? -1 : 1;
  },
  Cy = function (e, t, n, r, i) {
    var a = Sy(e, window.getComputedStyle(t).direction),
      o = a * r,
      s = n.target,
      c = t.contains(s),
      l = !1,
      u = o > 0,
      d = 0,
      f = 0;
    do {
      if (!s) break;
      var p = xy(e, s),
        m = p[0],
        h = p[1] - p[2] - a * m;
      (m || h) && by(e, s) && ((d += h), (f += m));
      var g = s.parentNode;
      s = g && g.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? g.host : g;
    } while ((!c && s !== document.body) || (c && (t.contains(s) || t === s)));
    return (
      ((u && ((i && Math.abs(d) < 1) || (!i && o > d))) ||
        (!u && ((i && Math.abs(f) < 1) || (!i && -o > f)))) &&
        (l = !0),
      l
    );
  },
  wy = function (e) {
    return `changedTouches` in e
      ? [e.changedTouches[0].clientX, e.changedTouches[0].clientY]
      : [0, 0];
  },
  Ty = function (e) {
    return [e.deltaX, e.deltaY];
  },
  Ey = function (e) {
    return e && `current` in e ? e.current : e;
  },
  Dy = function (e, t) {
    return e[0] === t[0] && e[1] === t[1];
  },
  Oy = function (e) {
    return `
  .block-interactivity-${e} {pointer-events: none;}
  .allow-interactivity-${e} {pointer-events: all;}
`;
  },
  ky = 0,
  Ay = [];
function jy(e) {
  var t = _.useRef([]),
    n = _.useRef([0, 0]),
    r = _.useRef(),
    i = _.useState(ky++)[0],
    a = _.useState($v)[0],
    o = _.useRef(e);
  _.useEffect(
    function () {
      o.current = e;
    },
    [e],
  ),
    _.useEffect(
      function () {
        if (e.inert) {
          document.body.classList.add(`block-interactivity-${i}`);
          var t = Ov([e.lockRef.current], (e.shards || []).map(Ey), !0).filter(
            Boolean,
          );
          return (
            t.forEach(function (e) {
              return e.classList.add(`allow-interactivity-${i}`);
            }),
            function () {
              document.body.classList.remove(`block-interactivity-${i}`),
                t.forEach(function (e) {
                  return e.classList.remove(`allow-interactivity-${i}`);
                });
            }
          );
        }
      },
      [e.inert, e.lockRef.current, e.shards],
    );
  var s = _.useCallback(function (e, t) {
      if (
        (`touches` in e && e.touches.length === 2) ||
        (e.type === `wheel` && e.ctrlKey)
      )
        return !o.current.allowPinchZoom;
      var i = wy(e),
        a = n.current,
        s = `deltaX` in e ? e.deltaX : a[0] - i[0],
        c = `deltaY` in e ? e.deltaY : a[1] - i[1],
        l,
        u = e.target,
        d = Math.abs(s) > Math.abs(c) ? `h` : `v`;
      if (`touches` in e && d === `h` && u.type === `range`) return !1;
      var f = window.getSelection(),
        p = f && f.anchorNode;
      if (p && (p === u || p.contains(u))) return !1;
      var m = _y(d, u);
      if (!m) return !0;
      if ((m ? (l = d) : ((l = d === `v` ? `h` : `v`), (m = _y(d, u))), !m))
        return !1;
      if (
        (!r.current && `changedTouches` in e && (s || c) && (r.current = l), !l)
      )
        return !0;
      var h = r.current || l;
      return Cy(h, t, e, h === `h` ? s : c, !0);
    }, []),
    c = _.useCallback(function (e) {
      var n = e;
      if (!(!Ay.length || Ay[Ay.length - 1] !== a)) {
        var r = `deltaY` in n ? Ty(n) : wy(n),
          i = t.current.filter(function (e) {
            return (
              e.name === n.type &&
              (e.target === n.target || n.target === e.shadowParent) &&
              Dy(e.delta, r)
            );
          })[0];
        if (i && i.should) {
          n.cancelable && n.preventDefault();
          return;
        }
        if (!i) {
          var c = (o.current.shards || [])
            .map(Ey)
            .filter(Boolean)
            .filter(function (e) {
              return e.contains(n.target);
            });
          (c.length > 0 ? s(n, c[0]) : !o.current.noIsolation) &&
            n.cancelable &&
            n.preventDefault();
        }
      }
    }, []),
    l = _.useCallback(function (e, n, r, i) {
      var a = { name: e, delta: n, target: r, should: i, shadowParent: My(r) };
      t.current.push(a),
        setTimeout(function () {
          t.current = t.current.filter(function (e) {
            return e !== a;
          });
        }, 1);
    }, []),
    u = _.useCallback(function (e) {
      (n.current = wy(e)), (r.current = void 0);
    }, []),
    d = _.useCallback(function (t) {
      l(t.type, Ty(t), t.target, s(t, e.lockRef.current));
    }, []),
    f = _.useCallback(function (t) {
      l(t.type, wy(t), t.target, s(t, e.lockRef.current));
    }, []);
  _.useEffect(function () {
    return (
      Ay.push(a),
      e.setCallbacks({
        onScrollCapture: d,
        onWheelCapture: d,
        onTouchMoveCapture: f,
      }),
      document.addEventListener(`wheel`, c, fy),
      document.addEventListener(`touchmove`, c, fy),
      document.addEventListener(`touchstart`, u, fy),
      function () {
        (Ay = Ay.filter(function (e) {
          return e !== a;
        })),
          document.removeEventListener(`wheel`, c, fy),
          document.removeEventListener(`touchmove`, c, fy),
          document.removeEventListener(`touchstart`, u, fy);
      }
    );
  }, []);
  var p = e.removeScrollBar,
    m = e.inert;
  return _.createElement(
    _.Fragment,
    null,
    m ? _.createElement(a, { styles: Oy(i) }) : null,
    p
      ? _.createElement(ly, { noRelative: e.noRelative, gapMode: e.gapMode })
      : null,
  );
}
function My(e) {
  for (var t = null; e !== null; )
    e instanceof ShadowRoot && ((t = e.host), (e = e.host)), (e = e.parentNode);
  return t;
}
var Ny = Hv(Uv, jy),
  Py = _.forwardRef(function (e, t) {
    return _.createElement(Gv, Ev({}, e, { ref: t, sideCar: Ny }));
  });
Py.classNames = Gv.classNames;
var Fy = function (e) {
    return typeof document > `u`
      ? null
      : (Array.isArray(e) ? e[0] : e).ownerDocument.body;
  },
  Iy = new WeakMap(),
  Ly = new WeakMap(),
  Ry = {},
  zy = 0,
  By = function (e) {
    return e && (e.host || By(e.parentNode));
  },
  Vy = function (e, t) {
    return t
      .map(function (t) {
        if (e.contains(t)) return t;
        var n = By(t);
        return n && e.contains(n)
          ? n
          : (console.error(
              `aria-hidden`,
              t,
              `in not contained inside`,
              e,
              `. Doing nothing`,
            ),
            null);
      })
      .filter(function (e) {
        return !!e;
      });
  },
  Hy = function (e, t, n, r) {
    var i = Vy(t, Array.isArray(e) ? e : [e]);
    Ry[n] || (Ry[n] = new WeakMap());
    var a = Ry[n],
      o = [],
      s = new Set(),
      c = new Set(i),
      l = function (e) {
        !e || s.has(e) || (s.add(e), l(e.parentNode));
      };
    i.forEach(l);
    var u = function (e) {
      !e ||
        c.has(e) ||
        Array.prototype.forEach.call(e.children, function (e) {
          if (s.has(e)) u(e);
          else
            try {
              var t = e.getAttribute(r),
                i = t !== null && t !== `false`,
                c = (Iy.get(e) || 0) + 1,
                l = (a.get(e) || 0) + 1;
              Iy.set(e, c),
                a.set(e, l),
                o.push(e),
                c === 1 && i && Ly.set(e, !0),
                l === 1 && e.setAttribute(n, `true`),
                i || e.setAttribute(r, `true`);
            } catch (t) {
              console.error(`aria-hidden: cannot operate on `, e, t);
            }
        });
    };
    return (
      u(t),
      s.clear(),
      zy++,
      function () {
        o.forEach(function (e) {
          var t = Iy.get(e) - 1,
            i = a.get(e) - 1;
          Iy.set(e, t),
            a.set(e, i),
            t || (Ly.has(e) || e.removeAttribute(r), Ly.delete(e)),
            i || e.removeAttribute(n);
        }),
          zy--,
          zy ||
            ((Iy = new WeakMap()),
            (Iy = new WeakMap()),
            (Ly = new WeakMap()),
            (Ry = {}));
      }
    );
  },
  Uy = function (e, t, n) {
    n === void 0 && (n = `data-aria-hidden`);
    var r = Array.from(Array.isArray(e) ? e : [e]),
      i = t || Fy(e);
    return i
      ? (r.push.apply(r, Array.from(i.querySelectorAll(`[aria-live], script`))),
        Hy(r, i, n, `aria-hidden`))
      : function () {
          return null;
        };
  };
function Wy(e) {
  let t = Gy(e),
    n = _.forwardRef((e, n) => {
      let { children: r, ...i } = e,
        a = _.Children.toArray(r),
        o = a.find(qy);
      if (o) {
        let e = o.props.children,
          r = a.map((t) =>
            t === o
              ? _.Children.count(e) > 1
                ? _.Children.only(null)
                : _.isValidElement(e)
                  ? e.props.children
                  : null
              : t,
          );
        return (0, P.jsx)(t, {
          ...i,
          ref: n,
          children: _.isValidElement(e) ? _.cloneElement(e, void 0, r) : null,
        });
      }
      return (0, P.jsx)(t, { ...i, ref: n, children: r });
    });
  return (n.displayName = `${e}.Slot`), n;
}
function Gy(e) {
  let t = _.forwardRef((e, t) => {
    let { children: n, ...r } = e;
    if (_.isValidElement(n)) {
      let e = Yy(n),
        i = Jy(r, n.props);
      return (
        n.type !== _.Fragment && (i.ref = t ? j(t, e) : e), _.cloneElement(n, i)
      );
    }
    return _.Children.count(n) > 1 ? _.Children.only(null) : null;
  });
  return (t.displayName = `${e}.SlotClone`), t;
}
var Ky = Symbol(`radix.slottable`);
function qy(e) {
  return (
    _.isValidElement(e) &&
    typeof e.type == `function` &&
    `__radixId` in e.type &&
    e.type.__radixId === Ky
  );
}
function Jy(e, t) {
  let n = { ...t };
  for (let r in t) {
    let i = e[r],
      a = t[r];
    /^on[A-Z]/.test(r)
      ? i && a
        ? (n[r] = (...e) => {
            let t = a(...e);
            return i(...e), t;
          })
        : i && (n[r] = i)
      : r === `style`
        ? (n[r] = { ...i, ...a })
        : r === `className` && (n[r] = [i, a].filter(Boolean).join(` `));
  }
  return { ...e, ...n };
}
function Yy(e) {
  let t = Object.getOwnPropertyDescriptor(e.props, `ref`)?.get,
    n = t && `isReactWarning` in t && t.isReactWarning;
  return n
    ? e.ref
    : ((t = Object.getOwnPropertyDescriptor(e, `ref`)?.get),
      (n = t && `isReactWarning` in t && t.isReactWarning),
      n ? e.props.ref : e.props.ref || e.ref);
}
var Xy = `Dialog`,
  [Zy, Qy] = F(Xy),
  [$y, eb] = Zy(Xy),
  tb = (e) => {
    let {
        __scopeDialog: t,
        children: n,
        open: r,
        defaultOpen: i,
        onOpenChange: a,
        modal: o = !0,
      } = e,
      s = _.useRef(null),
      c = _.useRef(null),
      [l, u] = Ke({ prop: r, defaultProp: i ?? !1, onChange: a, caller: Xy });
    return (0, P.jsx)($y, {
      scope: t,
      triggerRef: s,
      contentRef: c,
      contentId: ov(),
      titleId: ov(),
      descriptionId: ov(),
      open: l,
      onOpenChange: u,
      onOpenToggle: _.useCallback(() => u((e) => !e), [u]),
      modal: o,
      children: n,
    });
  };
tb.displayName = Xy;
var nb = `DialogTrigger`,
  rb = _.forwardRef((e, t) => {
    let { __scopeDialog: n, ...r } = e,
      i = eb(nb, n),
      a = M(t, i.triggerRef);
    return (0, P.jsx)(ve.button, {
      type: `button`,
      "aria-haspopup": `dialog`,
      "aria-expanded": i.open,
      "aria-controls": i.contentId,
      "data-state": Cb(i.open),
      ...r,
      ref: a,
      onClick: A(e.onClick, i.onOpenToggle),
    });
  });
rb.displayName = nb;
var ib = `DialogPortal`,
  [ab, ob] = Zy(ib, { forceMount: void 0 }),
  sb = (e) => {
    let { __scopeDialog: t, forceMount: n, children: r, container: i } = e,
      a = eb(ib, t);
    return (0, P.jsx)(ab, {
      scope: t,
      forceMount: n,
      children: _.Children.map(r, (e) =>
        (0, P.jsx)(Ve, {
          present: n || a.open,
          children: (0, P.jsx)(ze, { asChild: !0, container: i, children: e }),
        }),
      ),
    });
  };
sb.displayName = ib;
var cb = `DialogOverlay`,
  lb = _.forwardRef((e, t) => {
    let n = ob(cb, e.__scopeDialog),
      { forceMount: r = n.forceMount, ...i } = e,
      a = eb(cb, e.__scopeDialog);
    return a.modal
      ? (0, P.jsx)(Ve, {
          present: r || a.open,
          children: (0, P.jsx)(db, { ...i, ref: t }),
        })
      : null;
  });
lb.displayName = cb;
var ub = Wy(`DialogOverlay.RemoveScroll`),
  db = _.forwardRef((e, t) => {
    let { __scopeDialog: n, ...r } = e,
      i = eb(cb, n);
    return (0, P.jsx)(Py, {
      as: ub,
      allowPinchZoom: !0,
      shards: [i.contentRef],
      children: (0, P.jsx)(ve.div, {
        "data-state": Cb(i.open),
        ...r,
        ref: t,
        style: { pointerEvents: `auto`, ...r.style },
      }),
    });
  }),
  fb = `DialogContent`,
  pb = _.forwardRef((e, t) => {
    let n = ob(fb, e.__scopeDialog),
      { forceMount: r = n.forceMount, ...i } = e,
      a = eb(fb, e.__scopeDialog);
    return (0, P.jsx)(Ve, {
      present: r || a.open,
      children: a.modal
        ? (0, P.jsx)(mb, { ...i, ref: t })
        : (0, P.jsx)(hb, { ...i, ref: t }),
    });
  });
pb.displayName = fb;
var mb = _.forwardRef((e, t) => {
    let n = eb(fb, e.__scopeDialog),
      r = _.useRef(null),
      i = M(t, n.contentRef, r);
    return (
      _.useEffect(() => {
        let e = r.current;
        if (e) return Uy(e);
      }, []),
      (0, P.jsx)(gb, {
        ...e,
        ref: i,
        trapFocus: n.open,
        disableOutsidePointerEvents: !0,
        onCloseAutoFocus: A(e.onCloseAutoFocus, (e) => {
          e.preventDefault(), n.triggerRef.current?.focus();
        }),
        onPointerDownOutside: A(e.onPointerDownOutside, (e) => {
          let t = e.detail.originalEvent,
            n = t.button === 0 && t.ctrlKey === !0;
          (t.button === 2 || n) && e.preventDefault();
        }),
        onFocusOutside: A(e.onFocusOutside, (e) => e.preventDefault()),
      })
    );
  }),
  hb = _.forwardRef((e, t) => {
    let n = eb(fb, e.__scopeDialog),
      r = _.useRef(!1),
      i = _.useRef(!1);
    return (0, P.jsx)(gb, {
      ...e,
      ref: t,
      trapFocus: !1,
      disableOutsidePointerEvents: !1,
      onCloseAutoFocus: (t) => {
        e.onCloseAutoFocus?.(t),
          t.defaultPrevented ||
            (r.current || n.triggerRef.current?.focus(), t.preventDefault()),
          (r.current = !1),
          (i.current = !1);
      },
      onInteractOutside: (t) => {
        e.onInteractOutside?.(t),
          t.defaultPrevented ||
            ((r.current = !0),
            t.detail.originalEvent.type === `pointerdown` && (i.current = !0));
        let a = t.target;
        n.triggerRef.current?.contains(a) && t.preventDefault(),
          t.detail.originalEvent.type === `focusin` &&
            i.current &&
            t.preventDefault();
      },
    });
  }),
  gb = _.forwardRef((e, t) => {
    let {
        __scopeDialog: n,
        trapFocus: r,
        onOpenAutoFocus: i,
        onCloseAutoFocus: a,
        ...o
      } = e,
      s = eb(fb, n),
      c = _.useRef(null),
      l = M(t, c);
    return (
      wv(),
      (0, P.jsxs)(P.Fragment, {
        children: [
          (0, P.jsx)(dv, {
            asChild: !0,
            loop: !0,
            trapped: r,
            onMountAutoFocus: i,
            onUnmountAutoFocus: a,
            children: (0, P.jsx)(Oe, {
              role: `dialog`,
              id: s.contentId,
              "aria-describedby": s.descriptionId,
              "aria-labelledby": s.titleId,
              "data-state": Cb(s.open),
              ...o,
              ref: l,
              onDismiss: () => s.onOpenChange(!1),
            }),
          }),
          (0, P.jsxs)(P.Fragment, {
            children: [
              (0, P.jsx)(Db, { titleId: s.titleId }),
              (0, P.jsx)(kb, { contentRef: c, descriptionId: s.descriptionId }),
            ],
          }),
        ],
      })
    );
  }),
  _b = `DialogTitle`,
  vb = _.forwardRef((e, t) => {
    let { __scopeDialog: n, ...r } = e,
      i = eb(_b, n);
    return (0, P.jsx)(ve.h2, { id: i.titleId, ...r, ref: t });
  });
vb.displayName = _b;
var yb = `DialogDescription`,
  bb = _.forwardRef((e, t) => {
    let { __scopeDialog: n, ...r } = e,
      i = eb(yb, n);
    return (0, P.jsx)(ve.p, { id: i.descriptionId, ...r, ref: t });
  });
bb.displayName = yb;
var xb = `DialogClose`,
  Sb = _.forwardRef((e, t) => {
    let { __scopeDialog: n, ...r } = e,
      i = eb(xb, n);
    return (0, P.jsx)(ve.button, {
      type: `button`,
      ...r,
      ref: t,
      onClick: A(e.onClick, () => i.onOpenChange(!1)),
    });
  });
Sb.displayName = xb;
function Cb(e) {
  return e ? `open` : `closed`;
}
var wb = `DialogTitleWarning`,
  [Tb, Eb] = re(wb, { contentName: fb, titleName: _b, docsSlug: `dialog` }),
  Db = ({ titleId: e }) => {
    let t = Eb(wb),
      n = `\`${t.contentName}\` requires a \`${t.titleName}\` for the component to be accessible for screen reader users.

If you want to hide the \`${t.titleName}\`, you can wrap it with our VisuallyHidden component.

For more information, see https://radix-ui.com/primitives/docs/components/${t.docsSlug}`;
    return (
      _.useEffect(() => {
        e && (document.getElementById(e) || console.error(n));
      }, [n, e]),
      null
    );
  },
  Ob = `DialogDescriptionWarning`,
  kb = ({ contentRef: e, descriptionId: t }) => {
    let n = `Warning: Missing \`Description\` or \`aria-describedby={undefined}\` for {${Eb(Ob).contentName}}.`;
    return (
      _.useEffect(() => {
        let r = e.current?.getAttribute(`aria-describedby`);
        t && r && (document.getElementById(t) || console.warn(n));
      }, [n, e, t]),
      null
    );
  },
  Ab = tb,
  jb = rb,
  Mb = sb,
  Nb = lb,
  Pb = pb,
  Fb = vb,
  Ib = bb,
  Lb = Sb,
  Rb = Ab,
  zb = Mb,
  Bb = _.forwardRef(({ className: e, ...t }, n) =>
    (0, P.jsx)(Nb, {
      ref: n,
      className: V(
        `fixed inset-0 z-50 bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0`,
        e,
      ),
      ...t,
    }),
  );
Bb.displayName = Nb.displayName;
var Vb = _.forwardRef(({ className: e, children: t, ...n }, r) =>
  (0, P.jsxs)(zb, {
    children: [
      (0, P.jsx)(Bb, {}),
      (0, P.jsxs)(Pb, {
        ref: r,
        className: V(
          `fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg`,
          e,
        ),
        ...n,
        children: [
          t,
          (0, P.jsxs)(Lb, {
            className: `absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground`,
            children: [
              (0, P.jsx)(wn, { className: `h-4 w-4` }),
              (0, P.jsx)(`span`, { className: `sr-only`, children: `Close` }),
            ],
          }),
        ],
      }),
    ],
  }),
);
Vb.displayName = Pb.displayName;
var Hb = ({ className: e, ...t }) =>
  (0, P.jsx)(`div`, {
    className: V(`flex flex-col space-y-1.5 text-center sm:text-left`, e),
    ...t,
  });
Hb.displayName = `DialogHeader`;
var Ub = _.forwardRef(({ className: e, ...t }, n) =>
  (0, P.jsx)(Fb, {
    ref: n,
    className: V(`text-lg font-semibold leading-none tracking-tight`, e),
    ...t,
  }),
);
Ub.displayName = Fb.displayName;
var Wb = _.forwardRef(({ className: e, ...t }, n) =>
  (0, P.jsx)(Ib, {
    ref: n,
    className: V(`text-sm text-muted-foreground`, e),
    ...t,
  }),
);
Wb.displayName = Ib.displayName;
function Gb({
  label: e,
  players: t = [],
  value: n,
  onChange: r,
  excludeIds: i = [],
}) {
  let [a, o] = (0, _.useState)(!1),
    [s, c] = (0, _.useState)(``),
    l = t.find((e) => e.id === n),
    u = (0, _.useMemo)(() => {
      let e = new Set(i.filter(Boolean)),
        n = s.trim().toLowerCase();
      return t
        .filter((t) => !e.has(t.id))
        .filter(
          (e) =>
            !n ||
            M_(e).toLowerCase().includes(n) ||
            String(e.username || ``)
              .toLowerCase()
              .includes(n),
        )
        .slice(0, 60);
    }, [t, i, s]);
  return (0, P.jsxs)(P.Fragment, {
    children: [
      (0, P.jsxs)(`button`, {
        type: `button`,
        onClick: () => o(!0),
        className: `flex min-h-[44px] w-full items-center gap-2.5 rounded-sm border border-input bg-card px-3 py-2 text-left transition-colors hover:border-foreground/40`,
        children: [
          l
            ? (0, P.jsxs)(P.Fragment, {
                children: [
                  (0, P.jsx)(w_, { name: M_(l), src: l.avatar_url, size: 26 }),
                  (0, P.jsx)(`span`, {
                    className: `min-w-0 flex-1 truncate font-heading text-sm font-medium`,
                    children: M_(l),
                  }),
                ],
              })
            : (0, P.jsx)(`span`, {
                className: `flex-1 text-sm text-muted-foreground`,
                children: e || `Choose a player`,
              }),
          (0, P.jsx)(on, {
            className: `h-4 w-4 shrink-0 text-muted-foreground`,
            "aria-hidden": `true`,
          }),
        ],
      }),
      (0, P.jsx)(Rb, {
        open: a,
        onOpenChange: o,
        children: (0, P.jsxs)(Vb, {
          className: `gap-0 p-0 sm:max-w-md`,
          children: [
            (0, P.jsx)(Hb, {
              className: `border-b border-border px-4 py-3 text-left`,
              children: (0, P.jsx)(Ub, {
                className: `font-heading text-base`,
                children: e || `Choose a player`,
              }),
            }),
            (0, P.jsx)(`div`, {
              className: `border-b border-border px-4 py-2.5`,
              children: (0, P.jsxs)(`div`, {
                className: `relative`,
                children: [
                  (0, P.jsx)(gn, {
                    className: `absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground`,
                    "aria-hidden": `true`,
                  }),
                  (0, P.jsx)(`input`, {
                    value: s,
                    onChange: (e) => c(e.target.value),
                    placeholder: `Search players`,
                    "aria-label": `Search players`,
                    className: `h-11 w-full rounded-sm border border-input bg-background pl-9 pr-3 text-sm outline-none focus:border-foreground/40`,
                  }),
                ],
              }),
            }),
            (0, P.jsxs)(`ul`, {
              className: `max-h-[52vh] overflow-y-auto py-1`,
              children: [
                u.map((e) =>
                  (0, P.jsx)(
                    `li`,
                    {
                      children: (0, P.jsxs)(`button`, {
                        type: `button`,
                        onClick: () => {
                          r(e.id), o(!1), c(``);
                        },
                        className: `flex min-h-[52px] w-full items-center gap-2.5 px-4 py-2 text-left hover:bg-secondary ${n === e.id ? `bg-secondary` : ``}`,
                        children: [
                          (0, P.jsx)(w_, {
                            name: M_(e),
                            src: e.avatar_url,
                            size: 30,
                          }),
                          (0, P.jsxs)(`span`, {
                            className: `min-w-0 flex-1`,
                            children: [
                              (0, P.jsx)(`span`, {
                                className: `block truncate font-heading text-sm font-medium`,
                                children: M_(e),
                              }),
                              (0, P.jsxs)(`span`, {
                                className: `block font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground`,
                                children: [
                                  `rank `,
                                  e.singles_rank || `—`,
                                  ` · `,
                                  e.singles_rating || 1400,
                                ],
                              }),
                            ],
                          }),
                        ],
                      }),
                    },
                    e.id,
                  ),
                ),
                !u.length &&
                  (0, P.jsx)(`li`, {
                    className: `px-4 py-8 text-center text-sm text-muted-foreground`,
                    children: `No players found.`,
                  }),
              ],
            }),
          ],
        }),
      }),
    ],
  });
}
function Kb({ value: e = `default`, onChange: t, label: n = `Paddle` }) {
  return (0, P.jsx)(`div`, {
    className: `flex shrink-0 overflow-hidden rounded-sm border border-border`,
    role: `group`,
    "aria-label": n,
    children: [`default`, `modded`].map((n) => {
      let r = (e || `default`) === n;
      return (0, P.jsx)(
        `button`,
        {
          type: `button`,
          "aria-pressed": r,
          onClick: () => t(n),
          className: `min-h-[30px] px-2 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors ${r ? `bg-primary text-primary-foreground` : `bg-card text-muted-foreground hover:text-foreground`}`,
          children: n,
        },
        n,
      );
    }),
  });
}
function qb({ value: e, onChange: t, label: n }) {
  let r = Number(e) || 0,
    i = (e) => t(String(Math.max(0, Math.min(40, e))));
  return (0, P.jsxs)(`div`, {
    className: `flex items-center gap-1`,
    children: [
      (0, P.jsx)(`button`, {
        type: `button`,
        "aria-label": `Decrease ${n}`,
        onClick: () => i(r - 1),
        disabled: r <= 0,
        className: `h-10 w-10 rounded-sm border border-border bg-card text-lg leading-none transition-colors hover:border-foreground/40 disabled:opacity-30`,
        children: `−`,
      }),
      (0, P.jsx)(`input`, {
        inputMode: `numeric`,
        pattern: `[0-9]*`,
        value: e,
        "aria-label": n,
        onChange: (e) => t(e.target.value.replace(/[^0-9]/g, ``).slice(0, 2)),
        className: `h-10 w-12 rounded-sm border border-input bg-card text-center font-mono text-base tabular-nums outline-none focus:border-foreground/40`,
      }),
      (0, P.jsx)(`button`, {
        type: `button`,
        "aria-label": `Increase ${n}`,
        onClick: () => i(r + 1),
        className: `h-10 w-10 rounded-sm border border-border bg-card text-lg leading-none transition-colors hover:border-foreground/40`,
        children: `+`,
      }),
    ],
  });
}
function Jb(e, t) {
  let n = Number(t);
  if (n !== 11 && n !== 21)
    return { ok: !1, error: `Choose a game target of 11 or 21.` };
  if (!Array.isArray(e) || e.length === 0)
    return { ok: !1, error: `Add at least one game.` };
  if (e.length > 5) return { ok: !1, error: `A match is at most five games.` };
  let r = 0,
    i = 0;
  for (let t of e) {
    let e = Number(t?.a),
      a = Number(t?.b);
    if (!Number.isInteger(e) || !Number.isInteger(a) || e < 0 || a < 0)
      return { ok: !1, error: `Scores must be whole numbers.` };
    let o = Math.max(e, a),
      s = Math.min(e, a);
    if (o < n)
      return { ok: !1, error: `Every game must reach ${n} for the winner.` };
    if (o === n && o - s < 2)
      return { ok: !1, error: `A game at ${n} needs a two-point lead.` };
    if (o > n && o - s !== 2)
      return { ok: !1, error: `Past ${n}-${n}, a game is won by two.` };
    e > a ? (r += 1) : (i += 1);
  }
  return r === i
    ? { ok: !1, error: `The games are level — the match needs a winner.` }
    : { ok: !0, gamesA: r, gamesB: i, winnerSide: r > i ? `a` : `b` };
}
function Yb({ options: e, value: t, onChange: n, label: r }) {
  return (0, P.jsx)(`div`, {
    className: `flex gap-1`,
    role: `group`,
    "aria-label": r,
    children: e.map((e) =>
      (0, P.jsx)(
        `button`,
        {
          type: `button`,
          "aria-pressed": t === e.value,
          onClick: () => n(e.value),
          className: `min-h-[42px] flex-1 rounded-sm border font-heading text-sm font-medium transition-colors ${t === e.value ? `border-foreground bg-primary text-primary-foreground` : `border-border bg-card text-muted-foreground hover:text-foreground`}`,
          children: e.label,
        },
        e.value,
      ),
    ),
  });
}
function Xb() {
  let e = as(),
    { player: t } = Rg(),
    [n, r] = (0, _.useState)(`singles`),
    [i, a] = (0, _.useState)(11),
    [o, s] = (0, _.useState)(``),
    [c, l] = (0, _.useState)(``),
    [u, d] = (0, _.useState)(``),
    [f, p] = (0, _.useState)({}),
    [m, h] = (0, _.useState)([
      { a: ``, b: `` },
      { a: ``, b: `` },
    ]),
    [g, v] = (0, _.useState)(``),
    [y, b] = (0, _.useState)(!1),
    { data: x = [] } = Ca({
      queryKey: [`players`],
      queryFn: async () =>
        (await $.entities.Player.list({ limit: 300 })).items || [],
    }),
    S = (e) => f[e] || `default`,
    C = (e, t) => p((n) => ({ ...n, [e]: t })),
    w = m.filter((e) => e.a !== `` && e.b !== ``),
    T = (0, _.useMemo)(() => Jb(w, i), [w, i]),
    E = (e, t, n) => {
      h((r) => r.map((r, i) => (i === e ? { ...r, [t]: n } : r)));
    };
  return (0, P.jsxs)(P.Fragment, {
    children: [
      (0, P.jsx)(Z_, {
        eyebrow: `New result`,
        title: `Record a match`,
        description: `Every player in the match has to confirm the result before it counts.`,
      }),
      (0, P.jsxs)(`div`, {
        className: `mx-auto max-w-2xl space-y-6 px-4 py-6 pb-28 sm:px-6`,
        children: [
          (0, P.jsxs)(`section`, {
            className: `space-y-2`,
            children: [
              (0, P.jsx)(`p`, {
                className: `font-display text-[0.58rem] uppercase tracking-[0.22em] text-muted-foreground`,
                children: `Format`,
              }),
              (0, P.jsx)(Yb, {
                label: `Match format`,
                value: n,
                onChange: (e) => r(e),
                options: [
                  { value: `singles`, label: `Singles` },
                  { value: `doubles`, label: `Doubles` },
                ],
              }),
              (0, P.jsx)(Yb, {
                label: `Game target`,
                value: i,
                onChange: (e) => a(e),
                options: [
                  { value: 11, label: `To 11` },
                  { value: 21, label: `To 21` },
                ],
              }),
            ],
          }),
          (0, P.jsxs)(`section`, {
            className: `space-y-2`,
            children: [
              (0, P.jsx)(`p`, {
                className: `font-display text-[0.58rem] uppercase tracking-[0.22em] text-muted-foreground`,
                children: `Your side`,
              }),
              (0, P.jsxs)(`div`, {
                className: `space-y-2 rounded-sm border border-border bg-card p-3`,
                children: [
                  (0, P.jsxs)(`div`, {
                    className: `flex items-center gap-3`,
                    children: [
                      (0, P.jsx)(w_, {
                        name: M_(t),
                        src: t?.avatar_url,
                        size: 30,
                      }),
                      (0, P.jsx)(`span`, {
                        className: `min-w-0 flex-1 truncate font-heading text-sm font-semibold`,
                        children: t ? M_(t) : `You`,
                      }),
                      (0, P.jsx)(Kb, {
                        value: S(t?.id),
                        onChange: (e) => C(t?.id, e),
                      }),
                    ],
                  }),
                  n === `doubles` &&
                    (0, P.jsxs)(`div`, {
                      className: `flex items-center gap-2 border-t border-border pt-2`,
                      children: [
                        (0, P.jsx)(`div`, {
                          className: `min-w-0 flex-1`,
                          children: (0, P.jsx)(Gb, {
                            label: `Pick your partner`,
                            players: x,
                            value: o,
                            onChange: s,
                            excludeIds: [t?.id, c, u],
                          }),
                        }),
                        (0, P.jsx)(Kb, {
                          label: `Partner paddle`,
                          value: S(o),
                          onChange: (e) => C(o, e),
                        }),
                      ],
                    }),
                ],
              }),
            ],
          }),
          (0, P.jsxs)(`section`, {
            className: `space-y-2`,
            children: [
              (0, P.jsx)(`p`, {
                className: `font-display text-[0.58rem] uppercase tracking-[0.22em] text-muted-foreground`,
                children: `Opponents`,
              }),
              (0, P.jsxs)(`div`, {
                className: `space-y-2 rounded-sm border border-border bg-card p-3`,
                children: [
                  (0, P.jsxs)(`div`, {
                    className: `flex items-center gap-2`,
                    children: [
                      (0, P.jsx)(`div`, {
                        className: `min-w-0 flex-1`,
                        children: (0, P.jsx)(Gb, {
                          label: `Pick an opponent`,
                          players: x,
                          value: c,
                          onChange: l,
                          excludeIds: [t?.id, o, u],
                        }),
                      }),
                      (0, P.jsx)(Kb, {
                        label: `Opponent paddle`,
                        value: S(c),
                        onChange: (e) => C(c, e),
                      }),
                    ],
                  }),
                  n === `doubles` &&
                    (0, P.jsxs)(`div`, {
                      className: `flex items-center gap-2 border-t border-border pt-2`,
                      children: [
                        (0, P.jsx)(`div`, {
                          className: `min-w-0 flex-1`,
                          children: (0, P.jsx)(Gb, {
                            label: `Pick the second opponent`,
                            players: x,
                            value: u,
                            onChange: d,
                            excludeIds: [t?.id, o, c],
                          }),
                        }),
                        (0, P.jsx)(Kb, {
                          label: `Second opponent paddle`,
                          value: S(u),
                          onChange: (e) => C(u, e),
                        }),
                      ],
                    }),
                ],
              }),
            ],
          }),
          (0, P.jsxs)(`section`, {
            className: `space-y-2`,
            children: [
              (0, P.jsxs)(`div`, {
                className: `flex items-center justify-between`,
                children: [
                  (0, P.jsx)(`p`, {
                    className: `font-display text-[0.58rem] uppercase tracking-[0.22em] text-muted-foreground`,
                    children: `Games`,
                  }),
                  (0, P.jsxs)(`span`, {
                    className: `font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground`,
                    children: [`to `, i],
                  }),
                ],
              }),
              (0, P.jsx)(`div`, {
                className: `space-y-2`,
                children: m.map((e, t) =>
                  (0, P.jsxs)(
                    `div`,
                    {
                      className: `rounded-sm border border-border bg-card px-3 py-2.5`,
                      children: [
                        (0, P.jsxs)(`div`, {
                          className: `flex items-center justify-between`,
                          children: [
                            (0, P.jsxs)(`span`, {
                              className: `font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground`,
                              children: [`Game `, t + 1],
                            }),
                            m.length > 1 &&
                              (0, P.jsx)(`button`, {
                                type: `button`,
                                "aria-label": `Remove game ${t + 1}`,
                                onClick: () =>
                                  h((e) => e.filter((e, n) => n !== t)),
                                className: `-mr-1.5 rounded-sm p-2 text-muted-foreground transition-colors hover:text-destructive`,
                                children: (0, P.jsx)(yn, {
                                  className: `h-4 w-4`,
                                  "aria-hidden": `true`,
                                }),
                              }),
                          ],
                        }),
                        (0, P.jsxs)(`div`, {
                          className: `mt-1.5 grid grid-cols-2 gap-2`,
                          children: [
                            (0, P.jsxs)(`div`, {
                              children: [
                                (0, P.jsx)(`p`, {
                                  className: `mb-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground`,
                                  children: `You`,
                                }),
                                (0, P.jsx)(qb, {
                                  label: `Your score, game ${t + 1}`,
                                  value: e.a,
                                  onChange: (e) => E(t, `a`, e),
                                }),
                              ],
                            }),
                            (0, P.jsxs)(`div`, {
                              className: `flex flex-col items-end`,
                              children: [
                                (0, P.jsx)(`p`, {
                                  className: `mb-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground`,
                                  children: `Them`,
                                }),
                                (0, P.jsx)(qb, {
                                  label: `Opponent score, game ${t + 1}`,
                                  value: e.b,
                                  onChange: (e) => E(t, `b`, e),
                                }),
                              ],
                            }),
                          ],
                        }),
                      ],
                    },
                    t,
                  ),
                ),
              }),
              m.length < 5 &&
                (0, P.jsxs)(`button`, {
                  type: `button`,
                  onClick: () => h((e) => [...e, { a: ``, b: `` }]),
                  className: `inline-flex min-h-[40px] items-center gap-1.5 rounded-sm border border-dashed border-border px-3 text-sm text-muted-foreground hover:text-foreground`,
                  children: [
                    (0, P.jsx)(hn, {
                      className: `h-4 w-4`,
                      "aria-hidden": `true`,
                    }),
                    `Add game`,
                  ],
                }),
            ],
          }),
          T.ok &&
            (0, P.jsxs)(`p`, {
              className: `rounded-sm border border-success/30 bg-success/10 px-3 py-2 text-sm text-success`,
              children: [
                `Your side wins `,
                T.gamesA,
                `–`,
                T.gamesB,
                `. Everyone will be asked to confirm.`,
              ],
            }),
          g &&
            (0, P.jsx)(`p`, {
              className: `rounded-sm border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive`,
              children: g,
            }),
        ],
      }),
      (0, P.jsx)(`div`, {
        className: `fixed inset-x-0 bottom-[58px] z-20 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:bottom-0`,
        children: (0, P.jsx)(`div`, {
          className: `mx-auto max-w-2xl`,
          children: (0, P.jsxs)(Qg, {
            onClick: async () => {
              if ((v(``), !t)) {
                v(`Create your player profile first.`);
                return;
              }
              if (!c || (n === `doubles` && (!o || !u))) {
                v(`Pick every player in the match.`);
                return;
              }
              if (!T.ok) {
                v(T.error);
                return;
              }
              let r = [{ player_id: t.id, paddle: S(t.id) }];
              n === `doubles` && r.push({ player_id: o, paddle: S(o) });
              let a = [{ player_id: c, paddle: S(c) }];
              n === `doubles` && a.push({ player_id: u, paddle: S(u) }), b(!0);
              try {
                let t = await $.functions.invoke(`submitMatch`, {
                  format: n,
                  target: i,
                  side_a: r,
                  side_b: a,
                  games: w.map((e) => ({ a: Number(e.a), b: Number(e.b) })),
                });
                if (t.data?.error) throw Error(t.data.error);
                e(`/matches/${t.data.match.id}`);
              } catch (e) {
                v(
                  e.response?.data?.error ||
                    e.message ||
                    `Could not submit that match.`,
                );
              } finally {
                b(!1);
              }
            },
            disabled: y,
            size: `lg`,
            className: `h-12 w-full rounded-sm text-[15px]`,
            children: [
              y &&
                (0, P.jsx)(ln, {
                  className: `mr-2 h-4 w-4 animate-spin`,
                  "aria-hidden": `true`,
                }),
              `Submit for sign-off`,
            ],
          }),
        }),
      }),
    ],
  });
}
function Zb({ label: e, value: t }) {
  return (0, P.jsxs)(`div`, {
    className: `rounded-sm border border-border bg-card px-3 py-2.5`,
    children: [
      (0, P.jsx)(`p`, {
        className: `font-mono text-lg leading-none tabular-nums`,
        children: t,
      }),
      (0, P.jsx)(`p`, {
        className: `mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground`,
        children: e,
      }),
    ],
  });
}
function Qb() {
  let { username: e } = ls(),
    { data: t, isLoading: n } = Ca({
      queryKey: [`player`, e],
      queryFn: async () => {
        let { items: t } = await $.entities.Player.filter(
          { username_lower: String(e || ``).toLowerCase() },
          { limit: 1 },
        );
        return t[0] || null;
      },
    }),
    { data: r = [] } = Ca({
      queryKey: [`player-matches`, t?.id],
      enabled: !!t?.id,
      queryFn: async () =>
        (
          await $.entities.Match.filter(
            { all_player_ids: t.id, status: `verified` },
            { sort: `-created_date`, limit: 20 },
          )
        ).items || [],
    });
  if (
    ((0, _.useEffect)(() => {
      if (!n && !t) {
        let e = document.createElement(`meta`);
        return (
          (e.name = `prerender-status-code`),
          (e.content = `404`),
          document.head.appendChild(e),
          () => e.remove()
        );
      }
    }, [n, t]),
    n)
  )
    return (0, P.jsx)(`div`, {
      className: `flex justify-center py-24`,
      children: (0, P.jsx)(`div`, {
        className: `h-7 w-7 animate-spin rounded-full border-2 border-border border-t-foreground`,
      }),
    });
  if (!t)
    return (0, P.jsx)(`div`, {
      className: `mx-auto max-w-2xl px-4 py-16 sm:px-6`,
      children: (0, P.jsx)(Q_, {
        title: `No player with that username`,
        body: `Check the spelling, or browse the ladder to find who you are looking for.`,
        action: (0, P.jsx)(q, {
          to: `/leaderboard`,
          className: `rounded-sm bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground`,
          children: `Back to the ladder`,
        }),
      }),
    });
  let i = (t.singles_wins || 0) + (t.singles_losses || 0),
    a = (t.doubles_wins || 0) + (t.doubles_losses || 0);
  return (0, P.jsxs)(P.Fragment, {
    children: [
      (0, P.jsx)(Z_, { eyebrow: `@${t.username}`, title: M_(t) }),
      (0, P.jsxs)(`div`, {
        className: `mx-auto max-w-5xl px-4 py-6 sm:px-6`,
        children: [
          (0, P.jsxs)(`div`, {
            className: `flex flex-col gap-5 sm:flex-row sm:items-start`,
            children: [
              (0, P.jsxs)(`div`, {
                className: `flex items-center gap-4`,
                children: [
                  (0, P.jsx)(w_, { name: M_(t), src: t.avatar_url, size: 72 }),
                  (0, P.jsxs)(`div`, {
                    children: [
                      (0, P.jsx)(`p`, {
                        className: `font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground`,
                        children: `Singles rank`,
                      }),
                      (0, P.jsx)(`p`, {
                        className: `font-heading text-2xl font-bold leading-none`,
                        children: t.singles_rank ? `#${t.singles_rank}` : `—`,
                      }),
                      t.under_review &&
                        (0, P.jsx)(`p`, {
                          className: `mt-1 inline-flex rounded-sm border border-destructive/40 px-1.5 py-0.5 font-mono text-[9px] uppercase text-destructive`,
                          children: `under review`,
                        }),
                    ],
                  }),
                ],
              }),
              (0, P.jsxs)(`div`, {
                className: `sm:ml-auto sm:w-64`,
                children: [
                  (0, P.jsx)(q_, { xp: t.xp || 0 }),
                  t.bio &&
                    (0, P.jsx)(`p`, {
                      className: `mt-3 text-sm leading-relaxed text-muted-foreground`,
                      children: t.bio,
                    }),
                ],
              }),
            ],
          }),
          (0, P.jsxs)(`div`, {
            className: `mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4`,
            children: [
              (0, P.jsx)(Zb, {
                label: `Singles rating`,
                value: t.singles_rating || 1400,
              }),
              (0, P.jsx)(Zb, {
                label: `Doubles rating`,
                value: t.doubles_rating || 1400,
              }),
              (0, P.jsx)(Zb, {
                label: `Singles record`,
                value: E_(t.singles_wins, t.singles_losses),
              }),
              (0, P.jsx)(Zb, {
                label: `Doubles record`,
                value: E_(t.doubles_wins, t.doubles_losses),
              }),
            ],
          }),
          (0, P.jsxs)(`div`, {
            className: `mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4`,
            children: [
              (0, P.jsx)(Zb, { label: `Verified matches`, value: i + a }),
              (0, P.jsx)(Zb, {
                label: `Wins`,
                value: (t.singles_wins || 0) + (t.doubles_wins || 0),
              }),
              (0, P.jsx)(Zb, {
                label: `Losses`,
                value: (t.singles_losses || 0) + (t.doubles_losses || 0),
              }),
              (0, P.jsx)(Zb, { label: `Level`, value: t.level || 1 }),
            ],
          }),
          (0, P.jsxs)(`section`, {
            className: `mt-8`,
            children: [
              (0, P.jsx)(`h2`, {
                className: `font-display text-[0.58rem] uppercase tracking-[0.22em] text-muted-foreground`,
                children: `Match history`,
              }),
              r.length === 0
                ? (0, P.jsx)(`div`, {
                    className: `mt-3`,
                    children: (0, P.jsx)(Q_, {
                      title: `No verified matches yet`,
                      body: `Only matches all players have signed off appear here.`,
                    }),
                  })
                : (0, P.jsx)(`ul`, {
                    className: `mt-3 overflow-hidden rounded-sm border border-border bg-card`,
                    children: r.map((e) => (0, P.jsx)(z_, { match: e }, e.id)),
                  }),
            ],
          }),
        ],
      }),
    ],
  });
}
function $b() {
  let { user: e } = kg(),
    { player: t, isLoading: n } = Rg(),
    r = ca(),
    [i, a] = (0, _.useState)(``),
    [o, s] = (0, _.useState)(``),
    [c, l] = (0, _.useState)(``),
    [u, d] = (0, _.useState)(``),
    { data: f = [] } = Ca({
      queryKey: [`challenges`, e?.id],
      enabled: !!e?.id,
      queryFn: async () =>
        (await $.entities.Challenge.list({ limit: 100 })).items || [],
    }),
    p = Number(t?.singles_rank) || 0,
    { data: m = [], isLoading: h } = Ca({
      queryKey: [`challenge-targets`, p],
      enabled: p > 1,
      queryFn: async () =>
        (
          await $.entities.Player.filter(
            { singles_rank: { $gte: Math.max(1, p - 3), $lte: p - 1 } },
            { sort: `singles_rank`, limit: 5 },
          )
        ).items || [],
    });
  (0, _.useEffect)(() => {
    e?.id &&
      $.functions
        .invoke(`syncLadder`, {})
        .then(() => {
          r.invalidateQueries({ queryKey: [`challenges`] }),
            r.invalidateQueries({ queryKey: [`players`] }),
            r.invalidateQueries({ queryKey: [`my-player`] });
        })
        .catch(() => {});
  }, [e?.id, r]);
  let g = () => {
      r.invalidateQueries({ queryKey: [`challenges`] }),
        r.invalidateQueries({ queryKey: [`players`] });
    },
    v = async (e, t, n) => {
      a(n), s(``);
      try {
        let n = await $.functions.invoke(e, t);
        if (n.data?.error) throw Error(n.data.error);
        return g(), !0;
      } catch (e) {
        return (
          s(e.response?.data?.error || e.message || `Something went wrong.`), !1
        );
      } finally {
        a(``);
      }
    },
    y = f.filter((t) => t.defender_user_id === e?.id && t.status === `open`),
    b = f.filter(
      (t) =>
        t.challenger_user_id === e?.id &&
        [`open`, `accepted`].includes(t.status),
    ),
    x = f.filter((e) => !y.includes(e) && !b.includes(e)).slice(0, 8);
  return (0, P.jsxs)(P.Fragment, {
    children: [
      (0, P.jsx)(Z_, {
        eyebrow: `Rank duels`,
        title: `Challenges`,
        description: `Challenge up to three places above you. The window is 72 hours, and a forfeit is only awarded after review.`,
      }),
      (0, P.jsxs)(`div`, {
        className: `mx-auto max-w-2xl space-y-7 px-4 py-6 sm:px-6`,
        children: [
          o &&
            (0, P.jsx)(`p`, {
              className: `rounded-sm border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive`,
              children: o,
            }),
          (0, P.jsxs)(`section`, {
            children: [
              (0, P.jsx)(`h2`, {
                className: `font-display text-[0.58rem] uppercase tracking-[0.22em] text-muted-foreground`,
                children: `Incoming`,
              }),
              y.length === 0
                ? (0, P.jsx)(`p`, {
                    className: `mt-2 text-sm text-muted-foreground`,
                    children: `No open challenges against you.`,
                  })
                : (0, P.jsx)(`ul`, {
                    className: `mt-2 space-y-2`,
                    children: y.map((e) =>
                      (0, P.jsxs)(
                        `li`,
                        {
                          className: `rounded-sm border border-border bg-card p-3`,
                          children: [
                            (0, P.jsxs)(`div`, {
                              className: `flex items-start justify-between gap-2`,
                              children: [
                                (0, P.jsxs)(`div`, {
                                  className: `min-w-0`,
                                  children: [
                                    (0, P.jsxs)(`p`, {
                                      className: `font-heading text-sm font-semibold`,
                                      children: [
                                        e.challenger_name,
                                        ` (#`,
                                        e.challenger_rank,
                                        `)`,
                                      ],
                                    }),
                                    (0, P.jsx)(`p`, {
                                      className: `mt-0.5 text-xs text-muted-foreground`,
                                      children: k_(e.expires_at),
                                    }),
                                  ],
                                }),
                                (0, P.jsx)(L_, { status: e.status }),
                              ],
                            }),
                            e.message &&
                              (0, P.jsxs)(`p`, {
                                className: `mt-2 rounded-sm bg-secondary/60 px-2.5 py-1.5 text-xs`,
                                children: [`“`, e.message, `”`],
                              }),
                            (0, P.jsxs)(`div`, {
                              className: `mt-3 grid grid-cols-2 gap-2`,
                              children: [
                                (0, P.jsxs)(Qg, {
                                  onClick: () =>
                                    v(
                                      `respondChallenge`,
                                      {
                                        challenge_id: e.id,
                                        decision: `accept`,
                                      },
                                      `accept-${e.id}`,
                                    ),
                                  disabled: !!i,
                                  className: `h-11 rounded-sm`,
                                  children: [
                                    i === `accept-${e.id}` &&
                                      (0, P.jsx)(ln, {
                                        className: `mr-2 h-4 w-4 animate-spin`,
                                        "aria-hidden": `true`,
                                      }),
                                    `Accept`,
                                  ],
                                }),
                                (0, P.jsx)(Qg, {
                                  onClick: () =>
                                    v(
                                      `respondChallenge`,
                                      {
                                        challenge_id: e.id,
                                        decision: `decline`,
                                      },
                                      `decline-${e.id}`,
                                    ),
                                  disabled: !!i,
                                  variant: `outline`,
                                  className: `h-11 rounded-sm`,
                                  children: `Decline`,
                                }),
                              ],
                            }),
                          ],
                        },
                        e.id,
                      ),
                    ),
                  }),
            ],
          }),
          (0, P.jsxs)(`section`, {
            children: [
              (0, P.jsx)(`h2`, {
                className: `font-display text-[0.58rem] uppercase tracking-[0.22em] text-muted-foreground`,
                children: `Yours in progress`,
              }),
              b.length === 0
                ? (0, P.jsx)(`p`, {
                    className: `mt-2 text-sm text-muted-foreground`,
                    children: `You have no open challenges.`,
                  })
                : (0, P.jsx)(`ul`, {
                    className: `mt-2 space-y-2`,
                    children: b.map((e) =>
                      (0, P.jsx)(
                        `li`,
                        {
                          className: `rounded-sm border border-border bg-card p-3`,
                          children: (0, P.jsxs)(`div`, {
                            className: `flex items-start justify-between gap-2`,
                            children: [
                              (0, P.jsxs)(`div`, {
                                className: `min-w-0`,
                                children: [
                                  (0, P.jsxs)(`p`, {
                                    className: `font-heading text-sm font-semibold`,
                                    children: [
                                      `vs `,
                                      e.defender_name,
                                      ` (#`,
                                      e.defender_rank,
                                      `)`,
                                    ],
                                  }),
                                  (0, P.jsx)(`p`, {
                                    className: `mt-0.5 text-xs text-muted-foreground`,
                                    children:
                                      e.status === `open`
                                        ? k_(e.expires_at)
                                        : `Accepted — record the match when you play it`,
                                  }),
                                ],
                              }),
                              (0, P.jsx)(L_, { status: e.status }),
                            ],
                          }),
                        },
                        e.id,
                      ),
                    ),
                  }),
            ],
          }),
          (0, P.jsxs)(`section`, {
            children: [
              (0, P.jsx)(`h2`, {
                className: `font-display text-[0.58rem] uppercase tracking-[0.22em] text-muted-foreground`,
                children: `Challenge upward`,
              }),
              n
                ? (0, P.jsx)(`p`, {
                    className: `mt-2 text-sm text-muted-foreground`,
                    children: `Loading the ladder…`,
                  })
                : p <= 1
                  ? (0, P.jsx)(`p`, {
                      className: `mt-2 text-sm text-muted-foreground`,
                      children: `You are top of the ladder — there is nobody above you to challenge.`,
                    })
                  : (0, P.jsxs)(P.Fragment, {
                      children: [
                        (0, P.jsx)(`ul`, {
                          className: `mt-2 space-y-2`,
                          children: (m.length ? m : []).map((e) =>
                            (0, P.jsx)(
                              `li`,
                              {
                                children: (0, P.jsxs)(`button`, {
                                  type: `button`,
                                  onClick: () => l(e.id),
                                  className: `flex min-h-[54px] w-full items-center gap-3 rounded-sm border px-3 py-2 text-left transition-colors ${c === e.id ? `border-foreground bg-secondary` : `border-border bg-card hover:border-foreground/40`}`,
                                  children: [
                                    (0, P.jsx)(`span`, {
                                      className: `w-6 font-mono text-xs text-muted-foreground`,
                                      children: e.singles_rank,
                                    }),
                                    (0, P.jsxs)(`span`, {
                                      className: `min-w-0 flex-1`,
                                      children: [
                                        (0, P.jsx)(`span`, {
                                          className: `block truncate font-heading text-sm font-semibold`,
                                          children:
                                            e.display_name || e.username,
                                        }),
                                        (0, P.jsxs)(`span`, {
                                          className: `block font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground`,
                                          children: [
                                            e.singles_rating,
                                            ` rating`,
                                          ],
                                        }),
                                      ],
                                    }),
                                    (0, P.jsx)(`span`, {
                                      className: `font-mono text-[10px] uppercase text-brand`,
                                      children:
                                        c === e.id ? `selected` : `challenge`,
                                    }),
                                  ],
                                }),
                              },
                              e.id,
                            ),
                          ),
                        }),
                        m.length === 0 &&
                          !h &&
                          (0, P.jsx)(`p`, {
                            className: `mt-2 text-sm text-muted-foreground`,
                            children: `There is nobody directly above you to challenge right now.`,
                          }),
                        (0, P.jsxs)(`div`, {
                          className: `mt-3 space-y-2`,
                          children: [
                            (0, P.jsx)(`textarea`, {
                              value: u,
                              onChange: (e) => d(e.target.value),
                              rows: 2,
                              maxLength: 200,
                              placeholder: `Add a note (optional) — e.g. 'Court at 4pm?'`,
                              className: `w-full rounded-sm border border-input bg-card px-3 py-2 text-sm outline-none focus:border-foreground/40`,
                            }),
                            (0, P.jsxs)(Qg, {
                              onClick: async () => {
                                (await v(
                                  `createChallenge`,
                                  { defender_player_id: c, message: u },
                                  `create`,
                                )) && (l(``), d(``));
                              },
                              disabled: !c || !!i,
                              className: `h-12 w-full rounded-sm`,
                              children: [
                                i === `create` &&
                                  (0, P.jsx)(ln, {
                                    className: `mr-2 h-4 w-4 animate-spin`,
                                    "aria-hidden": `true`,
                                  }),
                                `Send challenge`,
                              ],
                            }),
                          ],
                        }),
                      ],
                    }),
            ],
          }),
          x.length > 0 &&
            (0, P.jsxs)(`section`, {
              children: [
                (0, P.jsx)(`h2`, {
                  className: `font-display text-[0.58rem] uppercase tracking-[0.22em] text-muted-foreground`,
                  children: `Recent`,
                }),
                (0, P.jsx)(`ul`, {
                  className: `mt-2 divide-y divide-border overflow-hidden rounded-sm border border-border bg-card`,
                  children: x.map((t) => {
                    let n = t.challenger_user_id === e?.id;
                    return (0, P.jsxs)(
                      `li`,
                      {
                        className: `space-y-2 px-3 py-2.5`,
                        children: [
                          (0, P.jsxs)(`div`, {
                            className: `flex items-center justify-between gap-2`,
                            children: [
                              (0, P.jsx)(`span`, {
                                className: `min-w-0 truncate font-heading text-sm`,
                                children: n
                                  ? `You → ${t.defender_name}`
                                  : `${t.challenger_name} → You`,
                              }),
                              (0, P.jsx)(L_, { status: t.status }),
                            ],
                          }),
                          t.status === `expired` &&
                            n &&
                            !t.review_requested &&
                            (0, P.jsx)(Qg, {
                              onClick: () =>
                                v(
                                  `resolveChallenge`,
                                  { challenge_id: t.id, action: `request` },
                                  `review-${t.id}`,
                                ),
                              variant: `outline`,
                              className: `h-9 w-full rounded-sm text-xs`,
                              disabled: !!i,
                              children: `Request a review`,
                            }),
                          t.status === `expired` &&
                            n &&
                            t.review_requested &&
                            (0, P.jsx)(`p`, {
                              className: `text-xs text-warning`,
                              children: `Review requested — an admin will decide.`,
                            }),
                        ],
                      },
                      t.id,
                    );
                  }),
                }),
              ],
            }),
          (0, P.jsx)(Q_, {
            title: `How challenges move rank`,
            body: `Beating someone above you takes their place. Silence never does: an unanswered challenge is only resolved after an admin review.`,
            action: (0, P.jsx)(q, {
              to: `/rules`,
              className: `rounded-sm border border-border bg-card px-4 py-2 text-sm font-medium hover:border-foreground/40`,
              children: `Read the rules`,
            }),
          }),
        ],
      }),
    ],
  });
}
var ex = Symbol(`radix.slottable`);
function tx(e) {
  let t = ({ children: e }) => (0, P.jsx)(P.Fragment, { children: e });
  return (t.displayName = `${e}.Slottable`), (t.__radixId = ex), t;
}
var nx = `AlertDialog`,
  [rx, ix] = F(nx, [Qy]),
  ax = Qy(),
  ox = (e) => {
    let { __scopeAlertDialog: t, ...n } = e,
      r = ax(t);
    return (0, P.jsx)(Ab, { ...r, ...n, modal: !0 });
  };
ox.displayName = nx;
var sx = `AlertDialogTrigger`,
  cx = _.forwardRef((e, t) => {
    let { __scopeAlertDialog: n, ...r } = e,
      i = ax(n);
    return (0, P.jsx)(jb, { ...i, ...r, ref: t });
  });
cx.displayName = sx;
var lx = `AlertDialogPortal`,
  ux = (e) => {
    let { __scopeAlertDialog: t, ...n } = e,
      r = ax(t);
    return (0, P.jsx)(Mb, { ...r, ...n });
  };
ux.displayName = lx;
var dx = `AlertDialogOverlay`,
  fx = _.forwardRef((e, t) => {
    let { __scopeAlertDialog: n, ...r } = e,
      i = ax(n);
    return (0, P.jsx)(Nb, { ...i, ...r, ref: t });
  });
fx.displayName = dx;
var px = `AlertDialogContent`,
  [mx, hx] = rx(px),
  gx = tx(`AlertDialogContent`),
  _x = _.forwardRef((e, t) => {
    let { __scopeAlertDialog: n, children: r, ...i } = e,
      a = ax(n),
      o = _.useRef(null),
      s = M(t, o),
      c = _.useRef(null);
    return (0, P.jsx)(Tb, {
      contentName: px,
      titleName: vx,
      docsSlug: `alert-dialog`,
      children: (0, P.jsx)(mx, {
        scope: n,
        cancelRef: c,
        children: (0, P.jsxs)(Pb, {
          role: `alertdialog`,
          ...a,
          ...i,
          ref: s,
          onOpenAutoFocus: A(i.onOpenAutoFocus, (e) => {
            e.preventDefault(), c.current?.focus({ preventScroll: !0 });
          }),
          onPointerDownOutside: (e) => e.preventDefault(),
          onInteractOutside: (e) => e.preventDefault(),
          children: [
            (0, P.jsx)(gx, { children: r }),
            (0, P.jsx)(Ex, { contentRef: o }),
          ],
        }),
      }),
    });
  });
_x.displayName = px;
var vx = `AlertDialogTitle`,
  yx = _.forwardRef((e, t) => {
    let { __scopeAlertDialog: n, ...r } = e,
      i = ax(n);
    return (0, P.jsx)(Fb, { ...i, ...r, ref: t });
  });
yx.displayName = vx;
var bx = `AlertDialogDescription`,
  xx = _.forwardRef((e, t) => {
    let { __scopeAlertDialog: n, ...r } = e,
      i = ax(n);
    return (0, P.jsx)(Ib, { ...i, ...r, ref: t });
  });
xx.displayName = bx;
var Sx = `AlertDialogAction`,
  Cx = _.forwardRef((e, t) => {
    let { __scopeAlertDialog: n, ...r } = e,
      i = ax(n);
    return (0, P.jsx)(Lb, { ...i, ...r, ref: t });
  });
Cx.displayName = Sx;
var wx = `AlertDialogCancel`,
  Tx = _.forwardRef((e, t) => {
    let { __scopeAlertDialog: n, ...r } = e,
      { cancelRef: i } = hx(wx, n),
      a = ax(n),
      o = M(t, i);
    return (0, P.jsx)(Lb, { ...a, ...r, ref: o });
  });
Tx.displayName = wx;
var Ex = ({ contentRef: e }) => {
    let t = `\`${px}\` requires a description for the component to be accessible for screen reader users.

You can add a description to the \`${px}\` by passing a \`${bx}\` component as a child, which also benefits sighted users by adding visible context to the dialog.

Alternatively, you can use your own component as a description by assigning it an \`id\` and passing the same value to the \`aria-describedby\` prop in \`${px}\`. If the description is confusing or duplicative for sighted users, you can use the \`@radix-ui/react-visually-hidden\` primitive as a wrapper around your description component.

For more information, see https://radix-ui.com/primitives/docs/components/alert-dialog`;
    return (
      _.useEffect(() => {
        document.getElementById(e.current?.getAttribute(`aria-describedby`)) ||
          console.warn(t);
      }, [t, e]),
      null
    );
  },
  Dx = ox,
  Ox = cx,
  kx = ux,
  Ax = fx,
  jx = _x,
  Mx = Cx,
  Nx = Tx,
  Px = yx,
  Fx = xx,
  Ix = Dx,
  Lx = Ox,
  Rx = kx,
  zx = _.forwardRef(({ className: e, ...t }, n) =>
    (0, P.jsx)(Ax, {
      className: V(
        `fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0`,
        e,
      ),
      ...t,
      ref: n,
    }),
  );
zx.displayName = Ax.displayName;
var Bx = _.forwardRef(({ className: e, ...t }, n) =>
  (0, P.jsxs)(Rx, {
    children: [
      (0, P.jsx)(zx, {}),
      (0, P.jsx)(jx, {
        ref: n,
        className: V(
          `fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg`,
          e,
        ),
        ...t,
      }),
    ],
  }),
);
Bx.displayName = jx.displayName;
var Vx = ({ className: e, ...t }) =>
  (0, P.jsx)(`div`, {
    className: V(`flex flex-col space-y-2 text-center sm:text-left`, e),
    ...t,
  });
Vx.displayName = `AlertDialogHeader`;
var Hx = ({ className: e, ...t }) =>
  (0, P.jsx)(`div`, {
    className: V(
      `flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2`,
      e,
    ),
    ...t,
  });
Hx.displayName = `AlertDialogFooter`;
var Ux = _.forwardRef(({ className: e, ...t }, n) =>
  (0, P.jsx)(Px, { ref: n, className: V(`text-lg font-semibold`, e), ...t }),
);
Ux.displayName = Px.displayName;
var Wx = _.forwardRef(({ className: e, ...t }, n) =>
  (0, P.jsx)(Fx, {
    ref: n,
    className: V(`text-sm text-muted-foreground`, e),
    ...t,
  }),
);
Wx.displayName = Fx.displayName;
var Gx = _.forwardRef(({ className: e, ...t }, n) =>
  (0, P.jsx)(Mx, { ref: n, className: V(Zg(), e), ...t }),
);
Gx.displayName = Mx.displayName;
var Kx = _.forwardRef(({ className: e, ...t }, n) =>
  (0, P.jsx)(Nx, {
    ref: n,
    className: V(Zg({ variant: `outline` }), `mt-2 sm:mt-0`, e),
    ...t,
  }),
);
Kx.displayName = Nx.displayName;
function qx({ email: e }) {
  let { logout: t } = kg(),
    [n, r] = (0, _.useState)(!1),
    [i, a] = (0, _.useState)(!1),
    [o, s] = (0, _.useState)(``),
    [c, l] = (0, _.useState)(``);
  return (0, P.jsxs)(`div`, {
    className: `space-y-3`,
    children: [
      (0, P.jsxs)(`section`, {
        className: `border border-border bg-card p-4`,
        children: [
          (0, P.jsx)(`h2`, {
            className: `font-display text-[0.55rem] uppercase tracking-[0.16em] text-muted-foreground`,
            children: `Account`,
          }),
          (0, P.jsx)(`p`, {
            className: `mt-2 break-all font-mono text-[11px] text-muted-foreground`,
            children: e,
          }),
          (0, P.jsxs)(`div`, {
            className: `mt-3 flex flex-wrap gap-2`,
            children: [
              (0, P.jsxs)(`button`, {
                type: `button`,
                onClick: async () => {
                  r(!0), l(``), s(``);
                  try {
                    await $.auth.resetPasswordRequest(e),
                      s(`Password reset link sent to ${e}.`);
                  } catch (e) {
                    l(e.message || `Could not send the reset link.`);
                  } finally {
                    r(!1);
                  }
                },
                disabled: n,
                className: `inline-flex items-center gap-1.5 border border-border bg-card px-3 py-2 text-sm font-medium hover:border-foreground/50 disabled:opacity-60`,
                children: [
                  n
                    ? (0, P.jsx)(ln, {
                        className: `h-4 w-4 animate-spin`,
                        "aria-hidden": `true`,
                      })
                    : (0, P.jsx)(cn, {
                        className: `h-4 w-4`,
                        "aria-hidden": `true`,
                      }),
                  `Change password`,
                ],
              }),
              (0, P.jsxs)(`button`, {
                type: `button`,
                onClick: () => t(!0),
                className: `inline-flex items-center gap-1.5 border border-border bg-card px-3 py-2 text-sm font-medium hover:border-foreground/50`,
                children: [
                  (0, P.jsx)(fn, {
                    className: `h-4 w-4`,
                    "aria-hidden": `true`,
                  }),
                  `Sign out`,
                ],
              }),
            ],
          }),
          o &&
            (0, P.jsx)(`p`, {
              className: `mt-3 text-xs text-success`,
              children: o,
            }),
        ],
      }),
      (0, P.jsxs)(`section`, {
        className: `border border-destructive/40 bg-destructive/5 p-4`,
        children: [
          (0, P.jsx)(`h2`, {
            className: `font-display text-[0.55rem] uppercase tracking-[0.16em] text-destructive`,
            children: `Delete account`,
          }),
          (0, P.jsx)(`p`, {
            className: `mt-2 text-[13px] leading-relaxed text-muted-foreground`,
            children: `Removes your profile, your ladder spot, open challenges and any result still waiting on your confirmation. Verified match history stays on the board.`,
          }),
          (0, P.jsxs)(Ix, {
            children: [
              (0, P.jsx)(Lx, {
                asChild: !0,
                children: (0, P.jsxs)(Qg, {
                  variant: `outline`,
                  size: `sm`,
                  className: `mt-3 border-destructive/50 text-destructive`,
                  children: [
                    (0, P.jsx)(yn, {
                      className: `mr-1.5 h-4 w-4`,
                      "aria-hidden": `true`,
                    }),
                    `Delete my account`,
                  ],
                }),
              }),
              (0, P.jsxs)(Bx, {
                children: [
                  (0, P.jsxs)(Vx, {
                    children: [
                      (0, P.jsx)(Ux, { children: `Delete your account?` }),
                      (0, P.jsx)(Wx, {
                        children: `This cannot be undone. You will lose your rating, level and ladder position.`,
                      }),
                    ],
                  }),
                  (0, P.jsxs)(Hx, {
                    children: [
                      (0, P.jsx)(Kx, { children: `Keep my account` }),
                      (0, P.jsx)(Gx, {
                        onClick: async () => {
                          a(!0), l(``);
                          try {
                            let e = await $.functions.invoke(`deleteAccount`, {
                              confirm: `DELETE`,
                            });
                            if (e.data?.error) throw Error(e.data.error);
                            t(!0);
                          } catch (e) {
                            l(
                              e.response?.data?.error ||
                                e.message ||
                                `Could not delete your account.`,
                            ),
                              a(!1);
                          }
                        },
                        disabled: i,
                        className: `bg-destructive text-destructive-foreground hover:bg-destructive/90`,
                        children: i ? `Deleting…` : `Delete for good`,
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
      c &&
        (0, P.jsx)(`p`, {
          className: `border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive`,
          children: c,
        }),
    ],
  });
}
var Jx = _.forwardRef(({ className: e, type: t, ...n }, r) =>
  (0, P.jsx)(`input`, {
    type: t,
    className: V(
      `flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm`,
      e,
    ),
    ref: r,
    ...n,
  }),
);
Jx.displayName = `Input`;
var Yx = [
    `a`,
    `button`,
    `div`,
    `form`,
    `h2`,
    `h3`,
    `img`,
    `input`,
    `label`,
    `li`,
    `nav`,
    `ol`,
    `p`,
    `select`,
    `span`,
    `svg`,
    `ul`,
  ].reduce((e, t) => {
    let n = Wg(`Primitive.${t}`),
      r = _.forwardRef((e, r) => {
        let { asChild: i, ...a } = e,
          o = i ? n : t;
        return (
          typeof window < `u` && (window[Symbol.for(`radix-ui`)] = !0),
          (0, P.jsx)(o, { ...a, ref: r })
        );
      });
    return (r.displayName = `Primitive.${t}`), { ...e, [t]: r };
  }, {}),
  Xx = `Label`,
  Zx = _.forwardRef((e, t) =>
    (0, P.jsx)(Yx.label, {
      ...e,
      ref: t,
      onMouseDown: (t) => {
        t.target.closest(`button, input, select, textarea`) ||
          (e.onMouseDown?.(t),
          !t.defaultPrevented && t.detail > 1 && t.preventDefault());
      },
    }),
  );
Zx.displayName = Xx;
var Qx = Zx,
  $x = Xt(
    `text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70`,
  ),
  eS = _.forwardRef(({ className: e, ...t }, n) =>
    (0, P.jsx)(Qx, { ref: n, className: V($x(), e), ...t }),
  );
eS.displayName = Qx.displayName;
function tS() {
  let { user: e } = kg(),
    { player: t, refetch: n } = Rg(),
    r = ca(),
    [i, a] = (0, _.useState)({
      username: ``,
      display_name: ``,
      bio: ``,
      avatar_url: ``,
    }),
    [o, s] = (0, _.useState)(!1),
    [c, l] = (0, _.useState)(!1),
    [u, d] = (0, _.useState)(``),
    [f, p] = (0, _.useState)(!1);
  (0, _.useEffect)(() => {
    t &&
      a({
        username: t.username || ``,
        display_name: t.display_name || ``,
        bio: t.bio || ``,
        avatar_url: t.avatar_url || ``,
      });
  }, [t?.id]);
  let m = (e, t) => {
    a((n) => ({ ...n, [e]: t })), p(!1);
  };
  return t
    ? (0, P.jsxs)(P.Fragment, {
        children: [
          (0, P.jsx)(Z_, {
            eyebrow: `Account`,
            title: `My profile`,
            description: `Your username and photo are public. Your email is never shown.`,
          }),
          (0, P.jsxs)(`div`, {
            className: `mx-auto max-w-2xl space-y-6 px-4 py-6 sm:px-6`,
            children: [
              (0, P.jsxs)(`section`, {
                className: `rounded-sm border border-border bg-card p-4`,
                children: [
                  (0, P.jsxs)(`div`, {
                    className: `flex items-center gap-4`,
                    children: [
                      (0, P.jsx)(w_, {
                        name: M_(t),
                        src: i.avatar_url,
                        size: 64,
                      }),
                      (0, P.jsxs)(`div`, {
                        className: `min-w-0 flex-1`,
                        children: [
                          (0, P.jsx)(`p`, {
                            className: `truncate font-heading text-lg font-semibold`,
                            children: M_(t),
                          }),
                          (0, P.jsxs)(`p`, {
                            className: `font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground`,
                            children: [
                              `rank `,
                              t.singles_rank || `—`,
                              ` · `,
                              t.singles_rating,
                              ` singles ·`,
                              ` `,
                              E_(t.singles_wins, t.singles_losses),
                            ],
                          }),
                        ],
                      }),
                      (0, P.jsx)(q, {
                        to: `/players/${t.username}`,
                        className: `shrink-0 rounded-sm border border-border px-2.5 py-1.5 text-xs font-medium hover:border-foreground/40`,
                        children: `View`,
                      }),
                    ],
                  }),
                  (0, P.jsx)(`div`, {
                    className: `mt-4`,
                    children: (0, P.jsx)(q_, { xp: t.xp || 0 }),
                  }),
                ],
              }),
              (0, P.jsxs)(`form`, {
                onSubmit: async (e) => {
                  e.preventDefault(), s(!0), d(``);
                  try {
                    let e = await $.functions.invoke(`updatePlayer`, i);
                    if (e.data?.error) throw Error(e.data.error);
                    await n(),
                      r.invalidateQueries({ queryKey: [`players`] }),
                      p(!0);
                  } catch (e) {
                    d(
                      e.response?.data?.error ||
                        e.message ||
                        `Could not save your profile.`,
                    );
                  } finally {
                    s(!1);
                  }
                },
                className: `space-y-4`,
                children: [
                  (0, P.jsx)(`div`, {
                    className: `flex items-center gap-3`,
                    children: (0, P.jsxs)(`label`, {
                      className: `inline-flex cursor-pointer items-center gap-2 rounded-sm border border-border bg-card px-3 py-2 text-sm font-medium hover:border-foreground/40`,
                      children: [
                        (0, P.jsx)(sn, {
                          className: `h-4 w-4`,
                          "aria-hidden": `true`,
                        }),
                        c ? `Uploading…` : `Change photo`,
                        (0, P.jsx)(`input`, {
                          type: `file`,
                          accept: `image/*`,
                          className: `sr-only`,
                          onChange: async (e) => {
                            let t = e.target.files?.[0];
                            if (t) {
                              l(!0), d(``);
                              try {
                                let { file_url: e } =
                                  await $.integrations.Core.UploadPublicFile({
                                    file: t,
                                  });
                                a((t) => ({ ...t, avatar_url: e }));
                              } catch (e) {
                                d(e.message || `Could not upload that image.`);
                              } finally {
                                l(!1);
                              }
                            }
                          },
                          disabled: c,
                        }),
                      ],
                    }),
                  }),
                  (0, P.jsxs)(`div`, {
                    className: `space-y-1.5`,
                    children: [
                      (0, P.jsx)(eS, {
                        htmlFor: `username`,
                        children: `Username`,
                      }),
                      (0, P.jsx)(Jx, {
                        id: `username`,
                        value: i.username,
                        onChange: (e) => m(`username`, e.target.value),
                        className: `h-12 rounded-sm`,
                        required: !0,
                      }),
                    ],
                  }),
                  (0, P.jsxs)(`div`, {
                    className: `space-y-1.5`,
                    children: [
                      (0, P.jsx)(eS, {
                        htmlFor: `display_name`,
                        children: `Display name`,
                      }),
                      (0, P.jsx)(Jx, {
                        id: `display_name`,
                        value: i.display_name,
                        onChange: (e) => m(`display_name`, e.target.value),
                        className: `h-12 rounded-sm`,
                      }),
                    ],
                  }),
                  (0, P.jsxs)(`div`, {
                    className: `space-y-1.5`,
                    children: [
                      (0, P.jsx)(eS, { htmlFor: `bio`, children: `Bio` }),
                      (0, P.jsx)(`textarea`, {
                        id: `bio`,
                        value: i.bio,
                        onChange: (e) => m(`bio`, e.target.value),
                        rows: 3,
                        maxLength: 280,
                        placeholder: `Paddle of choice, signature shot, trash talk.`,
                        className: `w-full rounded-sm border border-input bg-card px-3 py-2 text-sm outline-none focus:border-foreground/40`,
                      }),
                    ],
                  }),
                  u &&
                    (0, P.jsx)(`p`, {
                      className: `rounded-sm border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive`,
                      children: u,
                    }),
                  f &&
                    (0, P.jsx)(`p`, {
                      className: `rounded-sm border border-success/30 bg-success/10 px-3 py-2 text-sm text-success`,
                      children: `Profile saved.`,
                    }),
                  (0, P.jsxs)(Qg, {
                    type: `submit`,
                    disabled: o || c,
                    className: `h-12 w-full rounded-sm`,
                    children: [
                      o &&
                        (0, P.jsx)(ln, {
                          className: `mr-2 h-4 w-4 animate-spin`,
                          "aria-hidden": `true`,
                        }),
                      `Save changes`,
                    ],
                  }),
                ],
              }),
              (0, P.jsxs)(`section`, {
                className: `space-y-3 border-t border-border pt-5`,
                children: [
                  (0, P.jsxs)(`div`, {
                    className: `flex flex-wrap gap-2`,
                    children: [
                      (0, P.jsx)(q, {
                        to: `/matches`,
                        className: `rounded-sm border border-border bg-card px-3 py-2 text-sm font-medium hover:border-foreground/40`,
                        children: `My matches`,
                      }),
                      e?.role === `admin` &&
                        (0, P.jsxs)(q, {
                          to: `/admin/reviews`,
                          className: `inline-flex items-center gap-1.5 rounded-sm border border-border bg-card px-3 py-2 text-sm font-medium hover:border-foreground/40`,
                          children: [
                            (0, P.jsx)(_n, {
                              className: `h-4 w-4`,
                              "aria-hidden": `true`,
                            }),
                            `Review queue`,
                          ],
                        }),
                    ],
                  }),
                  (0, P.jsx)(qx, { email: e?.email }),
                  (0, P.jsx)(`p`, {
                    className: `text-xs text-muted-foreground`,
                    children: `Your photo is stored publicly — anyone with the link can open it.`,
                  }),
                ],
              }),
            ],
          }),
        ],
      })
    : null;
}
var nS = [
  {
    title: `Verification`,
    items: [
      `Every player in a match must confirm the submitted result. Singles needs both players; doubles needs all four.`,
      `A result stays pending until the last sign-off arrives. Anyone can decline or dispute it instead.`,
      `Declined and disputed matches never touch ratings, levels, records or ladder positions.`,
      `Only verified matches appear in public stats and match history.`,
    ],
  },
  {
    title: `Rating`,
    items: [
      `Each format has its own pool: a singles rating and a doubles rating. Doubles results never move your singles rating.`,
      `Ratings use a standard Elo-style expected score, so beating a stronger opponent is worth more than beating a weaker one.`,
      `New players move faster (K 48) for their first 10 matches, then 32 up to 30 matches, then 24.`,
      `Who won is all that counts — running up the score earns nothing extra.`,
      `Farming protection: every match you complete against the same opponent inside 180 days is worth less. After six meetings, a win against them earns zero rating.`,
      `Rating is capped at +45 / −45 per match and never drops below 700.`,
    ],
  },
  {
    title: `Level`,
    items: [
      `Level is earned by turning up: every verified match gives experience, plus a bonus for winning and for games won.`,
      `Responding to a challenge also earns a little experience.`,
      `Level grows without limit and never affects rating, rank or matchmaking. It is a record of activity, not a shortcut.`,
    ],
  },
  {
    title: `The singles ladder`,
    items: [
      `Singles is a positional ladder. Everyone has a numbered spot, and new players join at the bottom.`,
      `Beat someone above you and you take their spot; everyone between the two of you slides down one place.`,
      `Beating someone below you never moves your position — it only affects rating.`,
      `Doubles has no positions: it is ranked by doubles rating, so you climb it by beating pairs rated above you.`,
      `Overall blends both ratings, weighted by how many matches you have played in each.`,
    ],
  },
  {
    title: `Challenges, forfeits and inactivity`,
    items: [
      `You can challenge a player up to three places above you. Only one challenge can be open at a time.`,
      `The challenged player has 72 hours to accept or decline. Declining is allowed and costs nothing — refusing a challenge never hands over a rank.`,
      `If the window closes with no answer, the challenge expires and is counted against the defender.`,
      `Silence is never enough on its own: the challenger can request a review, and an admin decides whether to award the position as a forfeit.`,
      `A forfeit moves the ladder position only. Ratings stay untouched, because no match was played.`,
      `Two unanswered challenges, or a player inactive for 30 days with an open dispute, puts a 'review' badge next to their name on the ladder.`,
    ],
  },
];
function rS() {
  return (0, P.jsxs)(P.Fragment, {
    children: [
      (0, P.jsx)(Z_, {
        eyebrow: `House rules`,
        title: `How rating, level and challenges work`,
        description: `Short version: only verified results count, rating measures who you beat, level measures how much you play, and rank is a position you have to take.`,
      }),
      (0, P.jsxs)(`div`, {
        className: `mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6`,
        children: [
          nS.map((e) =>
            (0, P.jsxs)(
              `section`,
              {
                children: [
                  (0, P.jsx)(`h2`, {
                    className: `font-heading text-lg font-semibold tracking-tight`,
                    children: e.title,
                  }),
                  (0, P.jsx)(`ul`, {
                    className: `mt-3 space-y-2`,
                    children: e.items.map((e) =>
                      (0, P.jsxs)(
                        `li`,
                        {
                          className: `flex gap-2.5 text-sm leading-relaxed text-muted-foreground`,
                          children: [
                            (0, P.jsx)(`span`, {
                              className: `mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand`,
                              "aria-hidden": `true`,
                            }),
                            (0, P.jsx)(`span`, { children: e }),
                          ],
                        },
                        e,
                      ),
                    ),
                  }),
                ],
              },
              e.title,
            ),
          ),
          (0, P.jsxs)(`div`, {
            className: `flex flex-wrap gap-2 border-t border-border pt-6`,
            children: [
              (0, P.jsx)(q, {
                to: `/leaderboard`,
                className: `rounded-sm border border-border bg-card px-4 py-2.5 text-sm font-medium hover:border-foreground/40`,
                children: `View the ladder`,
              }),
              (0, P.jsx)(q, {
                to: `/matches/new`,
                className: `rounded-sm bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground`,
                children: `Record a match`,
              }),
            ],
          }),
        ],
      }),
    ],
  });
}
function iS() {
  let e = as(),
    t = ca(),
    [n, r] = (0, _.useState)(
      () => new URLSearchParams(window.location.search).get(`username`) || ``,
    ),
    [i, a] = (0, _.useState)(``),
    [o, s] = (0, _.useState)(``),
    [c, l] = (0, _.useState)(!1),
    [u, d] = (0, _.useState)(``),
    [f, p] = (0, _.useState)(!1);
  return (0, P.jsxs)(P.Fragment, {
    children: [
      (0, P.jsx)(Z_, {
        eyebrow: `Step 1 of 1`,
        title: `Claim your spot on the ladder`,
        description: `Your username becomes your public profile at penged.dev. Your email stays private.`,
      }),
      (0, P.jsx)(`div`, {
        className: `mx-auto max-w-lg px-4 py-8 sm:px-6`,
        children: (0, P.jsxs)(`form`, {
          onSubmit: async (r) => {
            r.preventDefault(), d(``), p(!0);
            try {
              let r = await $.functions.invoke(`createPlayer`, {
                username: n.trim(),
                display_name: i.trim() || n.trim(),
                avatar_url: o,
              });
              if (r.data?.error) throw Error(r.data.error);
              await t.invalidateQueries({ queryKey: [`my-player`] }),
                await t.invalidateQueries({ queryKey: [`players`] }),
                e(`/`, { replace: !0 });
            } catch (e) {
              d(
                e.response?.data?.error ||
                  e.message ||
                  `Could not create your profile.`,
              );
            } finally {
              p(!1);
            }
          },
          className: `space-y-5`,
          children: [
            (0, P.jsxs)(`div`, {
              className: `flex items-center gap-4`,
              children: [
                (0, P.jsx)(w_, { name: i || n || `?`, src: o, size: 64 }),
                (0, P.jsxs)(`label`, {
                  className: `inline-flex cursor-pointer items-center gap-2 rounded-sm border border-border bg-card px-3 py-2 text-sm font-medium hover:border-foreground/40`,
                  children: [
                    (0, P.jsx)(sn, {
                      className: `h-4 w-4`,
                      "aria-hidden": `true`,
                    }),
                    c ? `Uploading…` : o ? `Change photo` : `Add photo`,
                    (0, P.jsx)(`input`, {
                      type: `file`,
                      accept: `image/*`,
                      className: `sr-only`,
                      onChange: async (e) => {
                        let t = e.target.files?.[0];
                        if (t) {
                          l(!0), d(``);
                          try {
                            let { file_url: e } =
                              await $.integrations.Core.UploadPublicFile({
                                file: t,
                              });
                            s(e);
                          } catch (e) {
                            d(e.message || `Could not upload that image.`);
                          } finally {
                            l(!1);
                          }
                        }
                      },
                      disabled: c,
                    }),
                  ],
                }),
              ],
            }),
            (0, P.jsxs)(`div`, {
              className: `space-y-1.5`,
              children: [
                (0, P.jsx)(eS, { htmlFor: `username`, children: `Username` }),
                (0, P.jsx)(Jx, {
                  id: `username`,
                  value: n,
                  onChange: (e) => r(e.target.value),
                  placeholder: `e.g. topspin_tom`,
                  autoComplete: `username`,
                  className: `h-12 rounded-sm`,
                  required: !0,
                }),
                (0, P.jsx)(`p`, {
                  className: `text-xs text-muted-foreground`,
                  children: `3–20 characters. Letters, numbers, dots, dashes or underscores.`,
                }),
              ],
            }),
            (0, P.jsxs)(`div`, {
              className: `space-y-1.5`,
              children: [
                (0, P.jsx)(eS, {
                  htmlFor: `displayName`,
                  children: `Display name`,
                }),
                (0, P.jsx)(Jx, {
                  id: `displayName`,
                  value: i,
                  onChange: (e) => a(e.target.value),
                  placeholder: `Optional — how your name shows on the ladder`,
                  className: `h-12 rounded-sm`,
                }),
              ],
            }),
            u &&
              (0, P.jsx)(`p`, {
                className: `rounded-sm border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive`,
                children: u,
              }),
            (0, P.jsxs)(Qg, {
              type: `submit`,
              size: `lg`,
              className: `h-12 w-full rounded-sm`,
              disabled: f || c,
              children: [
                f &&
                  (0, P.jsx)(ln, {
                    className: `mr-2 h-4 w-4 animate-spin`,
                    "aria-hidden": `true`,
                  }),
                `Create my profile`,
              ],
            }),
            (0, P.jsx)(`p`, {
              className: `text-center text-xs text-muted-foreground`,
              children: `Your photo is stored publicly — anyone with the link can open it.`,
            }),
          ],
        }),
      }),
    ],
  });
}
function aS() {
  let { user: e } = kg(),
    t = ca(),
    [n, r] = (0, _.useState)(``),
    [i, a] = (0, _.useState)(``),
    { data: o = [] } = Ca({
      queryKey: [`review-queue`],
      enabled: e?.role === `admin`,
      queryFn: async () =>
        (
          await $.entities.Challenge.filter(
            { status: `expired` },
            { sort: `-created_date`, limit: 100 },
          )
        ).items || [],
    }),
    s = async (e, n) => {
      r(`${n}-${e.id}`), a(``);
      try {
        let r = await $.functions.invoke(`resolveChallenge`, {
          challenge_id: e.id,
          action: n,
        });
        if (r.data?.error) throw Error(r.data.error);
        t.invalidateQueries({ queryKey: [`review-queue`] }),
          t.invalidateQueries({ queryKey: [`players`] });
      } catch (e) {
        a(
          e.response?.data?.error ||
            e.message ||
            `Could not resolve that review.`,
        );
      } finally {
        r(``);
      }
    };
  return e?.role === `admin`
    ? (0, P.jsxs)(P.Fragment, {
        children: [
          (0, P.jsx)(Z_, {
            eyebrow: `Admin`,
            title: `Forfeit review`,
            description: `Challenges that ran out of time. A forfeit moves the ladder position only — ratings never change without a played match.`,
          }),
          (0, P.jsxs)(`div`, {
            className: `mx-auto max-w-2xl space-y-3 px-4 py-6 sm:px-6`,
            children: [
              i &&
                (0, P.jsx)(`p`, {
                  className: `rounded-sm border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive`,
                  children: i,
                }),
              o.length === 0
                ? (0, P.jsx)(Q_, {
                    title: `Nothing to review`,
                    body: `No challenge windows have closed without a response.`,
                  })
                : (0, P.jsx)(`ul`, {
                    className: `space-y-2`,
                    children: o.map((e) =>
                      (0, P.jsxs)(
                        `li`,
                        {
                          className: `rounded-sm border border-border bg-card p-3`,
                          children: [
                            (0, P.jsxs)(`p`, {
                              className: `font-heading text-sm font-semibold`,
                              children: [
                                e.challenger_name,
                                ` (#`,
                                e.challenger_rank,
                                `) →`,
                                ` `,
                                e.defender_name,
                                ` (#`,
                                e.defender_rank,
                                `)`,
                              ],
                            }),
                            (0, P.jsxs)(`p`, {
                              className: `mt-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground`,
                              children: [
                                `sent `,
                                T_(e.created_date),
                                ` ·`,
                                ` `,
                                e.review_requested
                                  ? `review requested`
                                  : `no response`,
                              ],
                            }),
                            e.message &&
                              (0, P.jsxs)(`p`, {
                                className: `mt-2 text-xs text-muted-foreground`,
                                children: [`“`, e.message, `”`],
                              }),
                            (0, P.jsxs)(`div`, {
                              className: `mt-3 grid grid-cols-2 gap-2`,
                              children: [
                                (0, P.jsxs)(Qg, {
                                  onClick: () => s(e, `forfeit`),
                                  disabled: !!n,
                                  className: `h-11 rounded-sm`,
                                  children: [
                                    n === `forfeit-${e.id}` &&
                                      (0, P.jsx)(ln, {
                                        className: `mr-2 h-4 w-4 animate-spin`,
                                        "aria-hidden": `true`,
                                      }),
                                    `Award position`,
                                  ],
                                }),
                                (0, P.jsx)(Qg, {
                                  onClick: () => s(e, `dismiss`),
                                  disabled: !!n,
                                  variant: `outline`,
                                  className: `h-11 rounded-sm`,
                                  children: `Dismiss`,
                                }),
                              ],
                            }),
                          ],
                        },
                        e.id,
                      ),
                    ),
                  }),
            ],
          }),
        ],
      })
    : (0, P.jsx)(`div`, {
        className: `mx-auto max-w-2xl px-4 py-16 sm:px-6`,
        children: (0, P.jsx)(Q_, {
          title: `Admins only`,
          body: `The forfeit review queue is limited to ladder admins.`,
        }),
      });
}
function oS({ icon: e, title: t, subtitle: n, footer: r, children: i }) {
  return (0, P.jsx)(`div`, {
    className: `min-h-screen flex items-center justify-center bg-background px-4`,
    children: (0, P.jsxs)(`div`, {
      className: `w-full max-w-md`,
      children: [
        (0, P.jsxs)(`div`, {
          className: `text-center mb-10`,
          children: [
            (0, P.jsx)(`div`, {
              className: `inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary mb-4`,
              children: (0, P.jsx)(e, {
                className: `w-7 h-7 text-primary-foreground`,
                "aria-hidden": `true`,
              }),
            }),
            (0, P.jsx)(`h1`, {
              className: `text-3xl font-bold tracking-tight text-foreground`,
              children: t,
            }),
            n &&
              (0, P.jsx)(`p`, {
                className: `text-muted-foreground mt-2`,
                children: n,
              }),
          ],
        }),
        (0, P.jsx)(`div`, {
          className: `bg-card rounded-2xl shadow-sm border border-border p-8`,
          children: i,
        }),
        r &&
          (0, P.jsx)(`p`, {
            className: `text-center text-sm text-muted-foreground mt-6`,
            children: r,
          }),
      ],
    }),
  });
}
function sS({ className: e = `w-5 h-5` }) {
  return (0, P.jsxs)(`svg`, {
    className: e,
    viewBox: `0 0 24 24`,
    "aria-hidden": `true`,
    children: [
      (0, P.jsx)(`path`, {
        d: `M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z`,
        fill: `#4285F4`,
      }),
      (0, P.jsx)(`path`, {
        d: `M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z`,
        fill: `#34A853`,
      }),
      (0, P.jsx)(`path`, {
        d: `M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z`,
        fill: `#FBBC05`,
      }),
      (0, P.jsx)(`path`, {
        d: `M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z`,
        fill: `#EA4335`,
      }),
    ],
  });
}
function cS() {
  let e = new URLSearchParams(window.location.search).get(`returnTo`);
  if (!e) return `/`;
  try {
    let t = new URL(e, window.location.origin);
    if (t.origin !== window.location.origin) return `/`;
    for (let e of [
      `access_token`,
      `clear_access_token`,
      `app_id`,
      `app_base_url`,
      `functions_version`,
      `from_url`,
    ])
      t.searchParams.delete(e);
    let n = t.pathname + t.search;
    return !n.startsWith(`/`) || n.startsWith(`//`) || n.includes(`\\`)
      ? `/`
      : n;
  } catch {
    return `/`;
  }
}
function lS() {
  let [e, t] = (0, _.useState)(``),
    [n, r] = (0, _.useState)(``),
    [i, a] = (0, _.useState)(``),
    [o, s] = (0, _.useState)(!1),
    c = cS();
  return (0, P.jsxs)(oS, {
    icon: dn,
    title: `Welcome back`,
    subtitle: `Log in to your account`,
    footer: (0, P.jsxs)(P.Fragment, {
      children: [
        `Don't have an account?`,
        ` `,
        (0, P.jsx)(q, {
          to:
            `/register` +
            (c === `/` ? `` : `?returnTo=` + encodeURIComponent(c)),
          className: `text-primary font-medium hover:underline`,
          children: `Create one`,
        }),
      ],
    }),
    children: [
      (0, P.jsxs)(Qg, {
        variant: `outline`,
        className: `w-full h-12 text-sm font-medium mb-6`,
        onClick: () => {
          $.auth.loginWithProvider(`google`, c);
        },
        children: [
          (0, P.jsx)(sS, { className: `w-5 h-5 mr-2` }),
          `Continue with Google`,
        ],
      }),
      (0, P.jsxs)(`div`, {
        className: `relative mb-6`,
        children: [
          (0, P.jsx)(`div`, {
            className: `absolute inset-0 flex items-center`,
            children: (0, P.jsx)(`div`, {
              className: `w-full border-t border-border`,
            }),
          }),
          (0, P.jsx)(`div`, {
            className: `relative flex justify-center text-xs uppercase`,
            children: (0, P.jsx)(`span`, {
              className: `bg-card px-3 text-muted-foreground`,
              children: `or`,
            }),
          }),
        ],
      }),
      i &&
        (0, P.jsx)(`div`, {
          className: `mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm`,
          children: i,
        }),
      (0, P.jsxs)(`form`, {
        onSubmit: async (t) => {
          t.preventDefault(), a(``), s(!0);
          try {
            await $.auth.loginViaEmailPassword(e, n),
              (window.location.href = c);
          } catch (e) {
            a(e.message || `Invalid email or password`);
          } finally {
            s(!1);
          }
        },
        className: `space-y-4`,
        children: [
          (0, P.jsxs)(`div`, {
            className: `space-y-2`,
            children: [
              (0, P.jsx)(eS, { htmlFor: `email`, children: `Email` }),
              (0, P.jsxs)(`div`, {
                className: `relative`,
                children: [
                  (0, P.jsx)(pn, {
                    className: `absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground`,
                    "aria-hidden": `true`,
                  }),
                  (0, P.jsx)(Jx, {
                    id: `email`,
                    type: `email`,
                    autoComplete: `email`,
                    autoFocus: !0,
                    placeholder: `you@example.com`,
                    value: e,
                    onChange: (e) => t(e.target.value),
                    className: `pl-10 h-12`,
                    required: !0,
                  }),
                ],
              }),
            ],
          }),
          (0, P.jsxs)(`div`, {
            className: `space-y-2`,
            children: [
              (0, P.jsxs)(`div`, {
                className: `flex items-center justify-between`,
                children: [
                  (0, P.jsx)(eS, { htmlFor: `password`, children: `Password` }),
                  (0, P.jsx)(q, {
                    to: `/forgot-password`,
                    className: `text-xs text-primary hover:underline`,
                    children: `Forgot password?`,
                  }),
                ],
              }),
              (0, P.jsxs)(`div`, {
                className: `relative`,
                children: [
                  (0, P.jsx)(un, {
                    className: `absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground`,
                    "aria-hidden": `true`,
                  }),
                  (0, P.jsx)(Jx, {
                    id: `password`,
                    type: `password`,
                    autoComplete: `current-password`,
                    placeholder: `••••••••`,
                    value: n,
                    onChange: (e) => r(e.target.value),
                    className: `pl-10 h-12`,
                    required: !0,
                  }),
                ],
              }),
            ],
          }),
          (0, P.jsx)(Qg, {
            type: `submit`,
            className: `w-full h-12 font-medium`,
            disabled: o,
            children: o
              ? (0, P.jsxs)(P.Fragment, {
                  children: [
                    (0, P.jsx)(ln, { className: `w-4 h-4 mr-2 animate-spin` }),
                    `Logging in...`,
                  ],
                })
              : `Log in`,
          }),
        ],
      }),
    ],
  });
}
var uS = Object.defineProperty,
  dS = Object.defineProperties,
  fS = Object.getOwnPropertyDescriptors,
  pS = Object.getOwnPropertySymbols,
  mS = Object.prototype.hasOwnProperty,
  hS = Object.prototype.propertyIsEnumerable,
  gS = (e, t, n) =>
    t in e
      ? uS(e, t, { enumerable: !0, configurable: !0, writable: !0, value: n })
      : (e[t] = n),
  _S = (e, t) => {
    for (var n in (t ||= {})) mS.call(t, n) && gS(e, n, t[n]);
    if (pS) for (var n of pS(t)) hS.call(t, n) && gS(e, n, t[n]);
    return e;
  },
  vS = (e, t) => dS(e, fS(t)),
  yS = (e, t) => {
    var n = {};
    for (var r in e) mS.call(e, r) && t.indexOf(r) < 0 && (n[r] = e[r]);
    if (e != null && pS)
      for (var r of pS(e)) t.indexOf(r) < 0 && hS.call(e, r) && (n[r] = e[r]);
    return n;
  };
function bS(e) {
  return [setTimeout(e, 0), setTimeout(e, 10), setTimeout(e, 50)];
}
function xS(e) {
  let t = _.useRef();
  return (
    _.useEffect(() => {
      t.current = e;
    }),
    t.current
  );
}
var SS = 18,
  CS = 40,
  wS = `${CS}px`,
  TS = [
    `[data-lastpass-icon-root]`,
    `com-1password-button`,
    `[data-dashlanecreated]`,
    `[style$="2147483647 !important;"]`,
  ].join(`,`);
function ES({
  containerRef: e,
  inputRef: t,
  pushPasswordManagerStrategy: n,
  isFocused: r,
}) {
  let [i, a] = _.useState(!1),
    [o, s] = _.useState(!1),
    [c, l] = _.useState(!1),
    u = _.useMemo(
      () =>
        n !== `none` &&
        (n === `increase-width` || n === `experimental-no-flickering`) &&
        i &&
        o,
      [i, o, n],
    ),
    d = _.useCallback(() => {
      let r = e.current,
        i = t.current;
      if (!r || !i || c || n === `none`) return;
      let o = r,
        s = o.getBoundingClientRect().left + o.offsetWidth,
        u = o.getBoundingClientRect().top + o.offsetHeight / 2,
        d = s - SS,
        f = u;
      (document.querySelectorAll(TS).length === 0 &&
        document.elementFromPoint(d, f) === r) ||
        (a(!0), l(!0));
    }, [e, t, c, n]);
  return (
    _.useEffect(() => {
      let t = e.current;
      if (!t || n === `none`) return;
      function r() {
        let e = window.innerWidth - t.getBoundingClientRect().right;
        s(e >= CS);
      }
      r();
      let i = setInterval(r, 1e3);
      return () => {
        clearInterval(i);
      };
    }, [e, n]),
    _.useEffect(() => {
      let e = r || document.activeElement === t.current;
      if (n === `none` || !e) return;
      let i = setTimeout(d, 0),
        a = setTimeout(d, 2e3),
        o = setTimeout(d, 5e3),
        s = setTimeout(() => {
          l(!0);
        }, 6e3);
      return () => {
        clearTimeout(i), clearTimeout(a), clearTimeout(o), clearTimeout(s);
      };
    }, [t, r, n, d]),
    { hasPWMBadge: i, willPushPWMBadge: u, PWM_BADGE_SPACE_WIDTH: wS }
  );
}
var DS = _.createContext({}),
  OS = _.forwardRef((e, t) => {
    var n = e,
      {
        value: r,
        onChange: i,
        maxLength: a,
        textAlign: o = `left`,
        pattern: s,
        placeholder: c,
        inputMode: l = `numeric`,
        onComplete: u,
        pushPasswordManagerStrategy: d = `increase-width`,
        pasteTransformer: f,
        containerClassName: p,
        noScriptCSSFallback: m = AS,
        render: h,
        children: g,
      } = n,
      v = yS(n, [
        `value`,
        `onChange`,
        `maxLength`,
        `textAlign`,
        `pattern`,
        `placeholder`,
        `inputMode`,
        `onComplete`,
        `pushPasswordManagerStrategy`,
        `pasteTransformer`,
        `containerClassName`,
        `noScriptCSSFallback`,
        `render`,
        `children`,
      ]),
      y;
    let [b, x] = _.useState(
        typeof v.defaultValue == `string` ? v.defaultValue : ``,
      ),
      S = r ?? b,
      C = xS(S),
      w = _.useCallback(
        (e) => {
          i?.(e), x(e);
        },
        [i],
      ),
      T = _.useMemo(
        () => (s ? (typeof s == `string` ? new RegExp(s) : s) : null),
        [s],
      ),
      E = _.useRef(null),
      D = _.useRef(null),
      O = _.useRef({
        value: S,
        onChange: w,
        isIOS:
          typeof window < `u` &&
          (y = window == null ? void 0 : window.CSS)?.supports?.call(
            y,
            `-webkit-touch-callout`,
            `none`,
          ),
      }),
      ee = _.useRef({
        prev: [
          E.current?.selectionStart,
          E.current?.selectionEnd,
          E.current?.selectionDirection,
        ],
      });
    _.useImperativeHandle(t, () => E.current, []),
      _.useEffect(() => {
        let e = E.current,
          t = D.current;
        if (!e || !t) return;
        O.current.value !== e.value && O.current.onChange(e.value),
          (ee.current.prev = [
            e.selectionStart,
            e.selectionEnd,
            e.selectionDirection,
          ]);
        function n() {
          if (document.activeElement !== e) {
            M(null), P(null);
            return;
          }
          let t = e.selectionStart,
            n = e.selectionEnd,
            r = e.selectionDirection,
            i = e.maxLength,
            a = e.value,
            o = ee.current.prev,
            s = -1,
            c = -1,
            l;
          if (a.length !== 0 && t !== null && n !== null) {
            let e = t === n,
              r = t === a.length && a.length < i;
            if (e && !r) {
              let e = t;
              if (e === 0) (s = 0), (c = 1), (l = `forward`);
              else if (e === i) (s = e - 1), (c = e), (l = `backward`);
              else if (i > 1 && a.length > 1) {
                let t = 0;
                if (o[0] !== null && o[1] !== null) {
                  l = e < o[1] ? `backward` : `forward`;
                  let n = o[0] === o[1] && o[0] < i;
                  l === `backward` && !n && (t = -1);
                }
                (s = t + e), (c = t + e + 1);
              }
            }
            s !== -1 &&
              c !== -1 &&
              s !== c &&
              E.current.setSelectionRange(s, c, l);
          }
          let u = s === -1 ? t : s,
            d = c === -1 ? n : c,
            f = l ?? r;
          M(u), P(d), (ee.current.prev = [u, d, f]);
        }
        if (
          (document.addEventListener(`selectionchange`, n, { capture: !0 }),
          n(),
          document.activeElement === e && ne(!0),
          !document.getElementById(`input-otp-style`))
        ) {
          let e = document.createElement(`style`);
          if (
            ((e.id = `input-otp-style`), document.head.appendChild(e), e.sheet)
          ) {
            let t = `background: transparent !important; color: transparent !important; border-color: transparent !important; opacity: 0 !important; box-shadow: none !important; -webkit-box-shadow: none !important; -webkit-text-fill-color: transparent !important;`;
            kS(
              e.sheet,
              `[data-input-otp]::selection { background: transparent !important; color: transparent !important; }`,
            ),
              kS(e.sheet, `[data-input-otp]:autofill { ${t} }`),
              kS(e.sheet, `[data-input-otp]:-webkit-autofill { ${t} }`),
              kS(
                e.sheet,
                `@supports (-webkit-touch-callout: none) { [data-input-otp] { letter-spacing: -.6em !important; font-weight: 100 !important; font-stretch: ultra-condensed; font-optical-sizing: none !important; left: -1px !important; right: 1px !important; } }`,
              ),
              kS(
                e.sheet,
                `[data-input-otp] + * { pointer-events: all !important; }`,
              );
          }
        }
        let r = () => {
          t && t.style.setProperty(`--root-height`, `${e.clientHeight}px`);
        };
        r();
        let i = new ResizeObserver(r);
        return (
          i.observe(e),
          () => {
            document.removeEventListener(`selectionchange`, n, { capture: !0 }),
              i.disconnect();
          }
        );
      }, []);
    let [te, k] = _.useState(!1),
      [A, ne] = _.useState(!1),
      [j, M] = _.useState(null),
      [N, P] = _.useState(null);
    _.useEffect(() => {
      bS(() => {
        var e;
        (e = E.current) == null || e.dispatchEvent(new Event(`input`));
        let t = E.current?.selectionStart,
          n = E.current?.selectionEnd,
          r = E.current?.selectionDirection;
        t !== null && n !== null && (M(t), P(n), (ee.current.prev = [t, n, r]));
      });
    }, [S, A]),
      _.useEffect(() => {
        C !== void 0 && S !== C && C.length < a && S.length === a && u?.(S);
      }, [a, u, C, S]);
    let re = ES({
        containerRef: D,
        inputRef: E,
        pushPasswordManagerStrategy: d,
        isFocused: A,
      }),
      F = _.useCallback(
        (e) => {
          let t = e.currentTarget.value.slice(0, a);
          if (t.length > 0 && T && !T.test(t)) {
            e.preventDefault();
            return;
          }
          typeof C == `string` &&
            t.length < C.length &&
            document.dispatchEvent(new Event(`selectionchange`)),
            w(t);
        },
        [a, w, C, T],
      ),
      ie = _.useCallback(() => {
        var e;
        if (E.current) {
          let t = Math.min(E.current.value.length, a - 1),
            n = E.current.value.length;
          (e = E.current) == null || e.setSelectionRange(t, n), M(t), P(n);
        }
        ne(!0);
      }, [a]),
      ae = _.useCallback(
        (e) => {
          let t = E.current;
          if (!f && (!O.current.isIOS || !e.clipboardData || !t)) return;
          let n = e.clipboardData.getData(`text/plain`),
            r = f ? f(n) : n;
          e.preventDefault();
          let i = E.current?.selectionStart,
            o = E.current?.selectionEnd,
            s = (
              i === o
                ? S.slice(0, i) + r + S.slice(i)
                : S.slice(0, i) + r + S.slice(o)
            ).slice(0, a);
          if (s.length > 0 && T && !T.test(s)) return;
          (t.value = s), w(s);
          let c = Math.min(s.length, a - 1),
            l = s.length;
          t.setSelectionRange(c, l), M(c), P(l);
        },
        [a, w, T, S],
      ),
      oe = _.useMemo(
        () => ({
          position: `relative`,
          cursor: v.disabled ? `default` : `text`,
          userSelect: `none`,
          WebkitUserSelect: `none`,
          pointerEvents: `none`,
        }),
        [v.disabled],
      ),
      se = _.useMemo(
        () => ({
          position: `absolute`,
          inset: 0,
          width: re.willPushPWMBadge
            ? `calc(100% + ${re.PWM_BADGE_SPACE_WIDTH})`
            : `100%`,
          clipPath: re.willPushPWMBadge
            ? `inset(0 ${re.PWM_BADGE_SPACE_WIDTH} 0 0)`
            : void 0,
          height: `100%`,
          display: `flex`,
          textAlign: o,
          opacity: `1`,
          color: `transparent`,
          pointerEvents: `all`,
          background: `transparent`,
          caretColor: `transparent`,
          border: `0 solid transparent`,
          outline: `0 solid transparent`,
          boxShadow: `none`,
          lineHeight: `1`,
          letterSpacing: `-.5em`,
          fontSize: `var(--root-height)`,
          fontFamily: `monospace`,
          fontVariantNumeric: `tabular-nums`,
        }),
        [re.PWM_BADGE_SPACE_WIDTH, re.willPushPWMBadge, o],
      ),
      ce = _.useMemo(
        () =>
          _.createElement(
            `input`,
            vS(_S({ autoComplete: v.autoComplete || `one-time-code` }, v), {
              "data-input-otp": !0,
              "data-input-otp-placeholder-shown": S.length === 0 || void 0,
              "data-input-otp-mss": j,
              "data-input-otp-mse": N,
              inputMode: l,
              pattern: T?.source,
              "aria-placeholder": c,
              style: se,
              maxLength: a,
              value: S,
              ref: E,
              onPaste: (e) => {
                var t;
                ae(e), (t = v.onPaste) == null || t.call(v, e);
              },
              onChange: F,
              onMouseOver: (e) => {
                var t;
                k(!0), (t = v.onMouseOver) == null || t.call(v, e);
              },
              onMouseLeave: (e) => {
                var t;
                k(!1), (t = v.onMouseLeave) == null || t.call(v, e);
              },
              onFocus: (e) => {
                var t;
                ie(), (t = v.onFocus) == null || t.call(v, e);
              },
              onBlur: (e) => {
                var t;
                ne(!1), (t = v.onBlur) == null || t.call(v, e);
              },
            }),
          ),
        [F, ie, ae, l, se, a, N, j, v, T?.source, S],
      ),
      le = _.useMemo(
        () => ({
          slots: Array.from({ length: a }).map((e, t) => {
            let n =
                A &&
                j !== null &&
                N !== null &&
                ((j === N && t === j) || (t >= j && t < N)),
              r = S[t] === void 0 ? null : S[t];
            return {
              char: r,
              placeholderChar: S[0] === void 0 ? (c?.[t] ?? null) : null,
              isActive: n,
              hasFakeCaret: n && r === null,
            };
          }),
          isFocused: A,
          isHovering: !v.disabled && te,
        }),
        [A, te, a, N, j, v.disabled, S],
      ),
      ue = _.useMemo(
        () => (h ? h(le) : _.createElement(DS.Provider, { value: le }, g)),
        [g, le, h],
      );
    return _.createElement(
      _.Fragment,
      null,
      m !== null &&
        _.createElement(`noscript`, null, _.createElement(`style`, null, m)),
      _.createElement(
        `div`,
        { ref: D, "data-input-otp-container": !0, style: oe, className: p },
        ue,
        _.createElement(
          `div`,
          { style: { position: `absolute`, inset: 0, pointerEvents: `none` } },
          ce,
        ),
      ),
    );
  });
OS.displayName = `Input`;
function kS(e, t) {
  try {
    e.insertRule(t);
  } catch {
    console.error(`input-otp could not insert CSS rule:`, t);
  }
}
var AS = `
[data-input-otp] {
  --nojs-bg: white !important;
  --nojs-fg: black !important;

  background-color: var(--nojs-bg) !important;
  color: var(--nojs-fg) !important;
  caret-color: var(--nojs-fg) !important;
  letter-spacing: .25em !important;
  text-align: center !important;
  border: 1px solid var(--nojs-fg) !important;
  border-radius: 4px !important;
  width: 100% !important;
}
@media (prefers-color-scheme: dark) {
  [data-input-otp] {
    --nojs-bg: black !important;
    --nojs-fg: white !important;
  }
}`,
  jS = _.forwardRef(({ className: e, containerClassName: t, ...n }, r) =>
    (0, P.jsx)(OS, {
      ref: r,
      containerClassName: V(
        `flex items-center gap-2 has-[:disabled]:opacity-50`,
        t,
      ),
      className: V(`disabled:cursor-not-allowed`, e),
      ...n,
    }),
  );
jS.displayName = `InputOTP`;
var MS = _.forwardRef(({ className: e, ...t }, n) =>
  (0, P.jsx)(`div`, { ref: n, className: V(`flex items-center`, e), ...t }),
);
MS.displayName = `InputOTPGroup`;
var NS = _.forwardRef(({ index: e, className: t, ...n }, r) => {
  let { char: i, hasFakeCaret: a, isActive: o } = _.useContext(DS).slots[e];
  return (0, P.jsxs)(`div`, {
    ref: r,
    className: V(
      `relative flex h-9 w-9 items-center justify-center border-y border-r border-input text-sm shadow-sm transition-all first:rounded-l-md first:border-l last:rounded-r-md`,
      o && `z-10 ring-1 ring-ring`,
      t,
    ),
    ...n,
    children: [
      i,
      a &&
        (0, P.jsx)(`div`, {
          className: `pointer-events-none absolute inset-0 flex items-center justify-center`,
          children: (0, P.jsx)(`div`, {
            className: `h-4 w-px animate-caret-blink bg-foreground duration-1000`,
          }),
        }),
    ],
  });
});
NS.displayName = `InputOTPSlot`;
var PS = _.forwardRef(({ ...e }, t) =>
  (0, P.jsx)(`div`, {
    ref: t,
    role: `separator`,
    ...e,
    children: (0, P.jsx)(mn, {}),
  }),
);
PS.displayName = `InputOTPSeparator`;
function FS() {
  let [e, t] = (0, _.useState)(``),
    [n, r] = (0, _.useState)(``),
    [i, a] = (0, _.useState)(``),
    [o, s] = (0, _.useState)(``),
    [c, l] = (0, _.useState)(``),
    [u, d] = (0, _.useState)(!1),
    [f, p] = (0, _.useState)(!1),
    [m, h] = (0, _.useState)(``);
  return f
    ? (0, P.jsxs)(oS, {
        icon: pn,
        title: `Verify your email`,
        subtitle: `We sent a code to ${n}`,
        children: [
          c &&
            (0, P.jsx)(`div`, {
              className: `mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm`,
              children: c,
            }),
          (0, P.jsx)(`div`, {
            className: `flex justify-center mb-6`,
            children: (0, P.jsx)(jS, {
              maxLength: 6,
              value: m,
              onChange: h,
              autoFocus: !0,
              autoComplete: `one-time-code`,
              children: (0, P.jsxs)(MS, {
                children: [
                  (0, P.jsx)(NS, { index: 0 }),
                  (0, P.jsx)(NS, { index: 1 }),
                  (0, P.jsx)(NS, { index: 2 }),
                  (0, P.jsx)(NS, { index: 3 }),
                  (0, P.jsx)(NS, { index: 4 }),
                  (0, P.jsx)(NS, { index: 5 }),
                ],
              }),
            }),
          }),
          (0, P.jsx)(Qg, {
            className: `w-full h-12 font-medium`,
            onClick: async () => {
              l(``), d(!0);
              try {
                let t = await $.auth.verifyOtp({ email: n, otpCode: m });
                t?.access_token && $.auth.setToken(t.access_token);
                let r = cS();
                window.location.href =
                  r && r !== `/`
                    ? r
                    : `/welcome?username=${encodeURIComponent(e.trim())}`;
              } catch (e) {
                l(e.message || `Invalid verification code`);
              } finally {
                d(!1);
              }
            },
            disabled: u || m.length < 6,
            children: u
              ? (0, P.jsxs)(P.Fragment, {
                  children: [
                    (0, P.jsx)(ln, { className: `w-4 h-4 mr-2 animate-spin` }),
                    `Verifying...`,
                  ],
                })
              : `Verify`,
          }),
          (0, P.jsxs)(`p`, {
            className: `text-center text-sm text-muted-foreground mt-4`,
            children: [
              `Didn't receive the code?`,
              ` `,
              (0, P.jsx)(`button`, {
                onClick: async () => {
                  l(``);
                  try {
                    await $.auth.resendOtp(n),
                      ee({
                        title: `Code sent`,
                        description: `Check your email for the new code.`,
                      });
                  } catch (e) {
                    l(e.message || `Failed to resend code`);
                  }
                },
                className: `text-primary font-medium hover:underline`,
                children: `Resend`,
              }),
            ],
          }),
        ],
      })
    : (0, P.jsxs)(oS, {
        icon: Sn,
        title: `Create your account`,
        subtitle: `Claim your username and set a password`,
        footer: (0, P.jsxs)(P.Fragment, {
          children: [
            `Already have an account?`,
            ` `,
            (0, P.jsx)(q, {
              to:
                `/login` +
                (cS() === `/` ? `` : `?returnTo=` + encodeURIComponent(cS())),
              className: `text-primary font-medium hover:underline`,
              children: `Log in`,
            }),
          ],
        }),
        children: [
          (0, P.jsxs)(Qg, {
            variant: `outline`,
            className: `w-full h-12 text-sm font-medium mb-6`,
            onClick: () => {
              $.auth.loginWithProvider(`google`, cS());
            },
            children: [
              (0, P.jsx)(sS, { className: `w-5 h-5 mr-2` }),
              `Continue with Google`,
            ],
          }),
          (0, P.jsxs)(`div`, {
            className: `relative mb-6`,
            children: [
              (0, P.jsx)(`div`, {
                className: `absolute inset-0 flex items-center`,
                children: (0, P.jsx)(`div`, {
                  className: `w-full border-t border-border`,
                }),
              }),
              (0, P.jsx)(`div`, {
                className: `relative flex justify-center text-xs uppercase`,
                children: (0, P.jsx)(`span`, {
                  className: `bg-card px-3 text-muted-foreground`,
                  children: `or`,
                }),
              }),
            ],
          }),
          c &&
            (0, P.jsx)(`div`, {
              className: `mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm`,
              children: c,
            }),
          (0, P.jsxs)(`form`, {
            onSubmit: async (t) => {
              if ((t.preventDefault(), l(``), i !== o)) {
                l(`Passwords do not match`);
                return;
              }
              let r = e.trim();
              if (!/^[a-zA-Z0-9._-]{3,20}$/.test(r)) {
                l(
                  `Username must be 3-20 characters: letters, numbers, dots, dashes or underscores.`,
                );
                return;
              }
              d(!0);
              try {
                if (
                  (
                    await $.entities.Player.filter(
                      { username_lower: r.toLowerCase() },
                      { limit: 1 },
                    ).catch(() => ({ items: [] }))
                  ).items.length
                ) {
                  l(`That username is already taken.`);
                  return;
                }
                await $.auth.register({ email: n, password: i }), p(!0);
              } catch (e) {
                l(e.message || `Registration failed`);
              } finally {
                d(!1);
              }
            },
            className: `space-y-4`,
            children: [
              (0, P.jsxs)(`div`, {
                className: `space-y-2`,
                children: [
                  (0, P.jsx)(eS, { htmlFor: `username`, children: `Username` }),
                  (0, P.jsxs)(`div`, {
                    className: `relative`,
                    children: [
                      (0, P.jsx)(rn, {
                        className: `absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground`,
                        "aria-hidden": `true`,
                      }),
                      (0, P.jsx)(Jx, {
                        id: `username`,
                        autoComplete: `username`,
                        autoFocus: !0,
                        placeholder: `topspin_tom`,
                        value: e,
                        onChange: (e) => t(e.target.value),
                        className: `pl-10 h-12`,
                        required: !0,
                      }),
                    ],
                  }),
                  (0, P.jsx)(`p`, {
                    className: `text-xs text-muted-foreground`,
                    children: `Your public identity on the ladder — 3–20 characters.`,
                  }),
                ],
              }),
              (0, P.jsxs)(`div`, {
                className: `space-y-2`,
                children: [
                  (0, P.jsx)(eS, { htmlFor: `email`, children: `Email` }),
                  (0, P.jsxs)(`div`, {
                    className: `relative`,
                    children: [
                      (0, P.jsx)(pn, {
                        className: `absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground`,
                        "aria-hidden": `true`,
                      }),
                      (0, P.jsx)(Jx, {
                        id: `email`,
                        type: `email`,
                        autoComplete: `email`,
                        placeholder: `you@example.com`,
                        value: n,
                        onChange: (e) => r(e.target.value),
                        className: `pl-10 h-12`,
                        required: !0,
                      }),
                    ],
                  }),
                ],
              }),
              (0, P.jsxs)(`div`, {
                className: `space-y-2`,
                children: [
                  (0, P.jsx)(eS, { htmlFor: `password`, children: `Password` }),
                  (0, P.jsxs)(`div`, {
                    className: `relative`,
                    children: [
                      (0, P.jsx)(un, {
                        className: `absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground`,
                        "aria-hidden": `true`,
                      }),
                      (0, P.jsx)(Jx, {
                        id: `password`,
                        type: `password`,
                        autoComplete: `new-password`,
                        placeholder: `••••••••`,
                        value: i,
                        onChange: (e) => a(e.target.value),
                        className: `pl-10 h-12`,
                        required: !0,
                      }),
                    ],
                  }),
                ],
              }),
              (0, P.jsxs)(`div`, {
                className: `space-y-2`,
                children: [
                  (0, P.jsx)(eS, {
                    htmlFor: `confirm`,
                    children: `Confirm Password`,
                  }),
                  (0, P.jsxs)(`div`, {
                    className: `relative`,
                    children: [
                      (0, P.jsx)(un, {
                        className: `absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground`,
                        "aria-hidden": `true`,
                      }),
                      (0, P.jsx)(Jx, {
                        id: `confirm`,
                        type: `password`,
                        autoComplete: `new-password`,
                        placeholder: `••••••••`,
                        value: o,
                        onChange: (e) => s(e.target.value),
                        className: `pl-10 h-12`,
                        required: !0,
                      }),
                    ],
                  }),
                ],
              }),
              (0, P.jsx)(Qg, {
                type: `submit`,
                className: `w-full h-12 font-medium`,
                disabled: u,
                children: u
                  ? (0, P.jsxs)(P.Fragment, {
                      children: [
                        (0, P.jsx)(ln, {
                          className: `w-4 h-4 mr-2 animate-spin`,
                        }),
                        `Creating account...`,
                      ],
                    })
                  : `Create account`,
              }),
            ],
          }),
        ],
      });
}
function IS() {
  let [e, t] = (0, _.useState)(``),
    [n, r] = (0, _.useState)(!1),
    [i, a] = (0, _.useState)(!1);
  return (0, P.jsx)(oS, {
    icon: pn,
    title: `Reset password`,
    subtitle: `We'll send you a link to reset it`,
    footer: (0, P.jsxs)(q, {
      to: `/login`,
      className: `text-primary font-medium hover:underline`,
      children: [
        (0, P.jsx)(tn, { className: `w-3 h-3 inline mr-1` }),
        `Back to log in`,
      ],
    }),
    children: i
      ? (0, P.jsx)(`p`, {
          className: `text-sm text-foreground text-center`,
          children: `If an account exists with that email, you'll receive a password reset link shortly.`,
        })
      : (0, P.jsxs)(`form`, {
          onSubmit: async (t) => {
            t.preventDefault(), r(!0);
            try {
              await $.auth.resetPasswordRequest(e);
            } catch {
            } finally {
              r(!1), a(!0);
            }
          },
          className: `space-y-4`,
          children: [
            (0, P.jsxs)(`div`, {
              className: `space-y-2`,
              children: [
                (0, P.jsx)(eS, { htmlFor: `email`, children: `Email address` }),
                (0, P.jsxs)(`div`, {
                  className: `relative`,
                  children: [
                    (0, P.jsx)(pn, {
                      className: `absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground`,
                      "aria-hidden": `true`,
                    }),
                    (0, P.jsx)(Jx, {
                      id: `email`,
                      type: `email`,
                      autoComplete: `email`,
                      autoFocus: !0,
                      placeholder: `you@example.com`,
                      value: e,
                      onChange: (e) => t(e.target.value),
                      className: `pl-10 h-12`,
                      required: !0,
                    }),
                  ],
                }),
              ],
            }),
            (0, P.jsx)(Qg, {
              type: `submit`,
              className: `w-full h-12 font-medium`,
              disabled: n,
              children: n
                ? (0, P.jsxs)(P.Fragment, {
                    children: [
                      (0, P.jsx)(ln, {
                        className: `w-4 h-4 mr-2 animate-spin`,
                      }),
                      `Sending...`,
                    ],
                  })
                : `Send reset link`,
            }),
          ],
        }),
  });
}
function LS() {
  let [e] = Ec(),
    t = e.get(`token`),
    [n, r] = (0, _.useState)(``),
    [i, a] = (0, _.useState)(``),
    [o, s] = (0, _.useState)(``),
    [c, l] = (0, _.useState)(!1);
  return t
    ? (0, P.jsxs)(oS, {
        icon: un,
        title: `New password`,
        subtitle: `Enter your new password below`,
        children: [
          o &&
            (0, P.jsx)(`div`, {
              className: `mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm`,
              children: o,
            }),
          (0, P.jsxs)(`form`, {
            onSubmit: async (e) => {
              if ((e.preventDefault(), s(``), n !== i)) {
                s(`Passwords do not match`);
                return;
              }
              l(!0);
              try {
                await $.auth.resetPassword({ resetToken: t, newPassword: n }),
                  (window.location.href = `/login`);
              } catch (e) {
                s(e.message || `Failed to reset password`);
              } finally {
                l(!1);
              }
            },
            className: `space-y-4`,
            children: [
              (0, P.jsxs)(`div`, {
                className: `space-y-2`,
                children: [
                  (0, P.jsx)(eS, {
                    htmlFor: `password`,
                    children: `New Password`,
                  }),
                  (0, P.jsxs)(`div`, {
                    className: `relative`,
                    children: [
                      (0, P.jsx)(un, {
                        className: `absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground`,
                        "aria-hidden": `true`,
                      }),
                      (0, P.jsx)(Jx, {
                        id: `password`,
                        type: `password`,
                        autoComplete: `new-password`,
                        autoFocus: !0,
                        placeholder: `••••••••`,
                        value: n,
                        onChange: (e) => r(e.target.value),
                        className: `pl-10 h-12`,
                        required: !0,
                      }),
                    ],
                  }),
                ],
              }),
              (0, P.jsxs)(`div`, {
                className: `space-y-2`,
                children: [
                  (0, P.jsx)(eS, {
                    htmlFor: `confirm`,
                    children: `Confirm Password`,
                  }),
                  (0, P.jsxs)(`div`, {
                    className: `relative`,
                    children: [
                      (0, P.jsx)(un, {
                        className: `absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground`,
                        "aria-hidden": `true`,
                      }),
                      (0, P.jsx)(Jx, {
                        id: `confirm`,
                        type: `password`,
                        autoComplete: `new-password`,
                        placeholder: `••••••••`,
                        value: i,
                        onChange: (e) => a(e.target.value),
                        className: `pl-10 h-12`,
                        required: !0,
                      }),
                    ],
                  }),
                ],
              }),
              (0, P.jsx)(Qg, {
                type: `submit`,
                className: `w-full h-12 font-medium`,
                disabled: c,
                children: c
                  ? (0, P.jsxs)(P.Fragment, {
                      children: [
                        (0, P.jsx)(ln, {
                          className: `w-4 h-4 mr-2 animate-spin`,
                        }),
                        `Resetting...`,
                      ],
                    })
                  : `Reset password`,
              }),
            ],
          }),
        ],
      })
    : (0, P.jsx)(oS, {
        icon: bn,
        title: `Invalid reset link`,
        subtitle: `This password reset link is missing or invalid`,
        footer: (0, P.jsx)(q, {
          to: `/forgot-password`,
          className: `text-primary font-medium hover:underline`,
          children: `Request a new link`,
        }),
        children: (0, P.jsx)(`p`, {
          className: `text-sm text-foreground text-center`,
          children: `The link you used appears to be incomplete. Please request a new password reset email.`,
        }),
      });
}
var RS = () => {
  let {
    isLoadingAuth: e,
    isLoadingPublicSettings: t,
    authError: n,
    navigateToLogin: r,
  } = kg();
  if (t || e)
    return (0, P.jsx)(`div`, {
      className: `fixed inset-0 flex items-center justify-center`,
      children: (0, P.jsx)(`div`, {
        className: `w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin`,
      }),
    });
  if (n) {
    if (n.type === `user_not_registered`) return (0, P.jsx)(Ag, {});
    if (n.type === `auth_required`) return r(), null;
  }
  return (0, P.jsxs)(Fs, {
    children: [
      (0, P.jsxs)(Ns, {
        element: (0, P.jsx)(Fg, {}),
        children: [
          (0, P.jsx)(Ns, { path: `/`, element: (0, P.jsx)(X_, {}) }),
          (0, P.jsx)(Ns, { path: `/leaderboard`, element: (0, P.jsx)(ev, {}) }),
          (0, P.jsx)(Ns, { path: `/matches`, element: (0, P.jsx)(tv, {}) }),
          (0, P.jsx)(Ns, { path: `/matches/:id`, element: (0, P.jsx)(rv, {}) }),
          (0, P.jsx)(Ns, {
            path: `/players/:username`,
            element: (0, P.jsx)(Qb, {}),
          }),
          (0, P.jsx)(Ns, { path: `/rules`, element: (0, P.jsx)(rS, {}) }),
          (0, P.jsxs)(Ns, {
            element: (0, P.jsx)(Lg, {
              unauthenticatedElement: (0, P.jsx)(js, {
                to: `/login`,
                replace: !0,
              }),
            }),
            children: [
              (0, P.jsx)(Ns, { path: `/welcome`, element: (0, P.jsx)(iS, {}) }),
              (0, P.jsxs)(Ns, {
                element: (0, P.jsx)(zg, {}),
                children: [
                  (0, P.jsx)(Ns, {
                    path: `/matches/new`,
                    element: (0, P.jsx)(Xb, {}),
                  }),
                  (0, P.jsx)(Ns, {
                    path: `/challenges`,
                    element: (0, P.jsx)($b, {}),
                  }),
                  (0, P.jsx)(Ns, {
                    path: `/profile`,
                    element: (0, P.jsx)(tS, {}),
                  }),
                  (0, P.jsx)(Ns, {
                    path: `/admin/reviews`,
                    element: (0, P.jsx)(aS, {}),
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
      (0, P.jsx)(Ns, { path: `/login`, element: (0, P.jsx)(lS, {}) }),
      (0, P.jsx)(Ns, { path: `/register`, element: (0, P.jsx)(FS, {}) }),
      (0, P.jsx)(Ns, { path: `/forgot-password`, element: (0, P.jsx)(IS, {}) }),
      (0, P.jsx)(Ns, { path: `/reset-password`, element: (0, P.jsx)(LS, {}) }),
      (0, P.jsx)(Ns, { path: `*`, element: (0, P.jsx)(Eg, {}) }),
    ],
  });
};
function zS() {
  return (0, P.jsx)(Og, {
    children: (0, P.jsxs)(la, {
      client: wa,
      children: [
        (0, P.jsxs)(bc, { children: [(0, P.jsx)(Mg, {}), (0, P.jsx)(RS, {})] }),
        (0, P.jsx)(ni, {}),
      ],
    }),
  });
}
g.createRoot(document.getElementById(`root`)).render((0, P.jsx)(zS, {}));
