"use client";
/* One card component per research category. Each renders from the category_data payload
   the corresponding agent emitted; shimmer skeleton while pending, error note when failed. */
import { createContext, useContext } from "react";
import {
  Buildings,
  ChartLineUp,
  Bank,
  Newspaper,
  TrendUp,
  Users,
  Package,
  Globe,
  Sword,
  Storefront,
  CurrencyDollar,
  ChatsCircle,
  Certificate,
  ArrowUpRight,
  ShieldCheck,
  SealCheck,
  WarningCircle,
  Gauge,
  Clock,
  StackSimple,
  Briefcase,
  Star,
  XLogo,
  LinkedinLogo,
  GithubLogo,
  YoutubeLogo,
  InstagramLogo,
  FacebookLogo,
  TiktokLogo,
  DiscordLogo,
  TelegramLogo,
  RedditLogo,
  LinkSimple,
  type Icon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { api, fmtMoney } from "@/lib/api";
import { JobLiveState } from "@/hooks/useJobEvents";
import { Sparkline } from "./Sparkline";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Payload = Record<string, any>;

/* Whether the run is still in progress. Drives the empty-vs-skeleton decision: a card with no
   data means "still loading" while running, but "this agent wasn't part of the run" once done. */
const RunContext = createContext<{ running: boolean }>({ running: true });

function Card({
  title,
  icon: Icon,
  children,
  wide = false,
}: {
  title: string;
  icon: Icon;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <section
      className={`panel rise flex flex-col gap-2.5 p-4 hover:border-[var(--border-strong)] ${
        wide ? "md:col-span-2" : ""
      }`}
    >
      <h3 className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-[var(--muted)] uppercase">
        <Icon weight="duotone" className="h-4 w-4 text-[var(--accent)]" />
        {title}
      </h3>
      {children}
    </section>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-2">
      <div className="skeleton h-3 w-3/4" />
      <div className="skeleton h-3 w-1/2" />
      <div className="skeleton h-3 w-2/3" />
    </div>
  );
}

function CardShell({
  title,
  icon,
  state,
  wide,
  render,
}: {
  title: string;
  icon: Icon;
  state?: { status: string; payload: Payload };
  wide?: boolean;
  render: (p: Payload) => React.ReactNode;
}) {
  const { running } = useContext(RunContext);
  return (
    <Card title={title} icon={icon} wide={wide}>
      {state == null ? (
        running ? (
          <Skeleton />
        ) : (
          <p className="text-sm text-[var(--faint)]">Not part of this run</p>
        )
      ) : state.status === "failed" ? (
        <p className="text-sm text-[var(--neg)]">
          Agent failed: {String(state.payload?.error ?? "unknown error")}
        </p>
      ) : (
        render(state.payload)
      )}
    </Card>
  );
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-0.5 text-xs text-[var(--accent)] hover:text-[var(--accent-bright)] hover:underline"
    >
      {children}
      <ArrowUpRight weight="bold" className="h-3 w-3" />
    </a>
  );
}

/* Legitimacy: a proportional meter in the accent (never a colored status light — per the
   app's design rules) plus one thin bar per signal. Flags use the warning icon already
   used elsewhere on the page. */
function SignalBar({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] text-[var(--text)]">{label}</span>
        <span className="truncate text-[11px] text-[var(--muted)]">{detail}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-[var(--panel-2)]">
        <div
          className="h-full rounded-full bg-[var(--accent)] transition-[width]"
          style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }}
        />
      </div>
    </div>
  );
}

/* Stock card body that polls the live quote every 30s while the page is open, so the price
   and market cap stay current without re-running the whole research. */
function LiveStock({ payload: p }: { payload: Payload }) {
  const ticker = p.ticker as string | undefined;
  const { data: live } = useQuery({
    queryKey: ["quote", ticker],
    queryFn: () => api.quote(ticker!),
    enabled: Boolean(p.available && ticker),
    refetchInterval: 30_000,
    staleTime: 20_000,
  });
  if (!p.listed) return <p className="text-sm text-[var(--muted)]">{p.message ?? "Not publicly traded"}</p>;
  if (!p.available) return <p className="text-sm text-[var(--muted)]">{p.message ?? "Quote unavailable"}</p>;
  const price = live?.price ?? p.price;
  const marketCap = live?.market_cap ?? p.market_cap;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-2xl font-semibold text-[var(--text-strong)]">{price}</span>
        <span className="text-xs text-[var(--muted)]">
          {p.currency} · {p.ticker}
        </span>
        {live && <span className="ml-auto text-[10px] tracking-wide text-[var(--faint)] uppercase">live</span>}
      </div>
      <p className="text-xs text-[var(--muted)]">
        Mkt cap <span className="font-mono">{fmtMoney(marketCap)}</span> · 52w{" "}
        <span className="font-mono">
          {p.fifty_two_week_low}–{p.fifty_two_week_high}
        </span>
      </p>
      <Sparkline series={p.series ?? []} />
    </div>
  );
}

/* Dashboard is layered: a full-width Executive Summary (synthesis) on top, then the cards
   grouped into labelled sections instead of one flat grid. */
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-[11px] font-semibold tracking-[0.14em] text-[var(--muted)] uppercase">
        {label}
      </h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  );
}

/* Executive Summary: scorecard tiles + SWOT quadrants + merged timeline, from the synthesis
   agent. Stays hidden until it arrives (it completes last) to keep the Snapshot clean. */
function SynthesisCard({ state }: { state?: { status: string; payload: Payload } }) {
  if (state == null || state.status === "failed") return null;
  const p = state.payload;
  const swot = p.swot ?? {};
  const quadrants = [
    { key: "strengths", label: "Strengths", items: swot.strengths ?? [] },
    { key: "weaknesses", label: "Weaknesses", items: swot.weaknesses ?? [] },
    { key: "opportunities", label: "Opportunities", items: swot.opportunities ?? [] },
    { key: "threats", label: "Threats", items: swot.threats ?? [] },
  ];
  return (
    <section className="panel rise flex flex-col gap-4 p-5">
      <h3 className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-[var(--muted)] uppercase">
        <Gauge weight="duotone" className="h-4 w-4 text-[var(--accent)]" />
        Executive Summary
      </h3>
      {(p.scorecard ?? []).length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {p.scorecard.map((c: Payload) => (
            <div key={c.label} className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2.5">
              <div className="text-[10px] tracking-wide text-[var(--muted)] uppercase">{c.label}</div>
              <div className="font-mono text-lg font-semibold text-[var(--text-strong)]">{c.value}</div>
              {c.sub && <div className="text-[10px] text-[var(--muted)]">{c.sub}</div>}
            </div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:col-span-2">
          {quadrants.map((q) => (
            <div key={q.key} className="rounded-xl border border-[var(--border)] p-3">
              <div className="mb-1.5 text-[11px] font-semibold tracking-wide text-[var(--muted)] uppercase">
                {q.label}
              </div>
              <ul className="flex flex-col gap-1">
                {q.items.length === 0 ? (
                  <li className="text-[12px] text-[var(--faint)]">—</li>
                ) : (
                  q.items.map((it: string, i: number) => (
                    <li key={i} className="flex gap-1.5 text-[12px] leading-snug text-[var(--text)]">
                      <span className="text-[var(--accent)]">–</span>
                      {it}
                    </li>
                  ))
                )}
              </ul>
            </div>
          ))}
        </div>
        {(p.timeline ?? []).length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-[var(--muted)] uppercase">
              <Clock weight="duotone" className="h-3.5 w-3.5 text-[var(--accent)]" />
              Timeline
            </div>
            <ul className="flex flex-col gap-1.5 border-l border-[var(--border)] pl-3">
              {p.timeline.map((e: Payload, i: number) => (
                <li key={i} className="flex gap-2.5 text-[13px]">
                  <span className="w-[74px] shrink-0 font-mono text-[11px] text-[var(--faint)]">{e.date}</span>
                  <span className="truncate text-[var(--text)]">{e.label}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

/* Official channels: every social/profile account detected across platforms, shown as a strip
   at the very bottom of the dashboard. */
const SOCIAL_ICON: Record<string, Icon> = {
  X: XLogo,
  LinkedIn: LinkedinLogo,
  GitHub: GithubLogo,
  YouTube: YoutubeLogo,
  Instagram: InstagramLogo,
  Facebook: FacebookLogo,
  TikTok: TiktokLogo,
  Discord: DiscordLogo,
  Telegram: TelegramLogo,
  Reddit: RedditLogo,
};

function SocialChannels({ state }: { state?: { status: string; payload: Payload } }) {
  const socials: Payload[] = state?.payload?.socials ?? [];
  if (socials.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 text-[11px] font-semibold tracking-[0.14em] text-[var(--muted)] uppercase">
        Official channels
      </h2>
      <div className="flex flex-wrap gap-2">
        {socials.map((s) => {
          const Ic = SOCIAL_ICON[s.platform] ?? LinkSimple;
          return (
            <a
              key={s.platform + s.handle}
              href={s.url}
              target="_blank"
              rel="noreferrer"
              className="press flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2 hover:border-[var(--accent-line)]"
            >
              <Ic weight="fill" className="h-4 w-4 text-[var(--accent)]" />
              <span className="text-[13px] font-medium text-[var(--text-strong)]">{s.platform}</span>
              <span className="font-mono text-[11px] text-[var(--faint)]">
                {s.handle.startsWith("@") || s.platform === "X" ? s.handle : `@${s.handle}`}
              </span>
            </a>
          );
        })}
      </div>
    </section>
  );
}

export function DashboardGrid({
  categories,
  running = true,
}: {
  categories: JobLiveState["categories"];
  running?: boolean;
}) {
  return (
    <RunContext.Provider value={{ running }}>
    <div className="flex flex-col gap-7">
      <SynthesisCard state={categories.synthesis} />
      <Section label="Snapshot">
      <CardShell
        title="Overview"
        icon={Buildings}
        state={categories.overview}
        wide
        render={(p) => (
          <div className="flex flex-col gap-2.5 text-sm">
            {p.summary && (
              <p className="leading-relaxed text-[var(--text)]">{String(p.summary).slice(0, 480)}…</p>
            )}
            <div className="mt-0.5 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px]">
              {(p.facts ?? []).map((f: Payload) => (
                <span key={f.predicate}>
                  <span className="text-[var(--muted)]">{String(f.predicate).replace(/_/g, " ")}: </span>
                  <span className="text-[var(--text-strong)]">{f.text}</span>
                </span>
              ))}
            </div>
            {p.wikipedia_url && <ExtLink href={p.wikipedia_url}>Wikipedia</ExtLink>}
          </div>
        )}
      />
      <CardShell
        title="Profile"
        icon={Storefront}
        state={categories.profile}
        wide
        render={(p) =>
          !p.available ? (
            <p className="text-sm text-[var(--muted)]">{p.message ?? "No profile available"}</p>
          ) : (
            <div className="flex flex-col gap-2.5 text-sm">
              {p.what_they_do && <p className="leading-relaxed text-[var(--text)]">{p.what_they_do}</p>}
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
                {p.business_model && (
                  <span>
                    <span className="text-[var(--muted)]">model: </span>
                    <span className="text-[var(--text-strong)]">{p.business_model}</span>
                  </span>
                )}
                {p.target_market && (
                  <span>
                    <span className="text-[var(--muted)]">market: </span>
                    <span className="text-[var(--text-strong)]">{p.target_market}</span>
                  </span>
                )}
                {p.headquarters && (
                  <span>
                    <span className="text-[var(--muted)]">HQ: </span>
                    <span className="text-[var(--text-strong)]">{p.headquarters}</span>
                  </span>
                )}
              </div>
              {(p.offerings ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {p.offerings.slice(0, 10).map((o: string) => (
                    <span
                      key={o}
                      className="rounded-full border border-[var(--border)] bg-[var(--panel-2)] px-2.5 py-1 text-xs text-[var(--text)]"
                    >
                      {o}
                    </span>
                  ))}
                </div>
              )}
              {(p.pricing ?? []).length > 0 && (
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {p.pricing.slice(0, 6).map((t: Payload, i: number) => (
                    <div key={i} className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-2.5 py-1.5">
                      <div className="text-[12px] font-medium text-[var(--text-strong)]">{t.name || "Plan"}</div>
                      {t.price && <div className="font-mono text-[13px] text-[var(--accent)]">{t.price}</div>}
                      {t.detail && <div className="text-[10px] text-[var(--muted)]">{t.detail}</div>}
                    </div>
                  ))}
                </div>
              )}
              {p.site && <ExtLink href={p.site}>{new URL(p.site).hostname.replace(/^www\./, "")}</ExtLink>}
            </div>
          )
        }
      />
      <CardShell
        title="Legitimacy"
        icon={ShieldCheck}
        state={categories.legitimacy}
        wide
        render={(p) => (
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex items-center gap-4">
              <div className="flex items-baseline gap-1">
                <span className="font-mono text-3xl font-semibold text-[var(--text-strong)]">
                  {p.score ?? "—"}
                </span>
                <span className="text-xs text-[var(--muted)]">/100</span>
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-[var(--text-strong)]">{p.verdict}</div>
                {p.domain && <div className="truncate text-[11px] text-[var(--muted)]">{p.domain}</div>}
              </div>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--panel-2)]">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-[width]"
                style={{ width: `${Math.max(0, Math.min(100, Number(p.score) || 0))}%` }}
              />
            </div>
            {p.assessment && <p className="leading-relaxed text-[var(--text)]">{p.assessment}</p>}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {(p.signals ?? []).map((s: Payload) => (
                <SignalBar key={s.label} label={s.label} value={s.value} detail={s.detail} />
              ))}
            </div>
            {(p.corroboration ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {p.corroboration.map((c: string) => (
                  <span
                    key={c}
                    className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--panel-2)] px-2.5 py-1 text-[11px] text-[var(--text)]"
                  >
                    <SealCheck weight="fill" className="h-3.5 w-3.5 text-[var(--accent)]" />
                    {c}
                  </span>
                ))}
              </div>
            )}
            {(p.flags ?? []).length > 0 && (
              <ul className="flex flex-col gap-1">
                {p.flags.map((f: string) => (
                  <li key={f} className="flex items-start gap-1.5 text-[12px] text-[var(--muted)]">
                    <WarningCircle weight="fill" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--neg)]" />
                    {f}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      />
      <CardShell
        title="Stock"
        icon={ChartLineUp}
        state={categories.stock}
        render={(p) => <LiveStock payload={p} />}
      />
      </Section>
      <Section label="Financials & funding">
      <CardShell
        title="Financials"
        icon={Bank}
        state={categories.financials}
        render={(p) =>
          !p.public ? (
            <div className="text-sm text-[var(--muted)]">
              <p>{p.message}</p>
              {p.wikidata_revenue && <p className="mt-1">Wikidata revenue: {p.wikidata_revenue}</p>}
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 text-sm">
              {(p.revenue_series ?? []).length > 0 && (
                <div>
                  <p className="mb-1.5 text-[11px] tracking-wide text-[var(--muted)] uppercase">
                    Annual revenue (SEC)
                  </p>
                  <div className="flex flex-col gap-0.5">
                    {p.revenue_series.slice(-4).map(([fy, v]: [number, number]) => (
                      <div key={fy} className="flex justify-between font-mono text-[13px]">
                        <span className="text-[var(--muted)]">FY{fy}</span>
                        <span className="text-[var(--text-strong)]">{fmtMoney(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(p.filings ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {p.filings.slice(0, 5).map((f: Payload) => (
                    <a
                      key={f.url}
                      href={f.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-2 py-0.5 font-mono text-[11px] text-[var(--accent)] hover:border-[var(--accent-line)]"
                    >
                      {f.form} · {f.filed_at}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )
        }
      />
      <CardShell
        title="Funding"
        icon={CurrencyDollar}
        state={categories.funding}
        render={(p) =>
          !p.available ? (
            <p className="text-sm text-[var(--muted)]">{p.message ?? "No funding data"}</p>
          ) : !p.is_funded && (p.rounds ?? []).length === 0 ? (
            <p className="text-sm text-[var(--muted)]">{p.message ?? "No external funding found"}</p>
          ) : (
            <div className="flex flex-col gap-2.5 text-sm">
              <div className="flex flex-wrap gap-x-5 gap-y-1">
                {p.total_raised && (
                  <div>
                    <div className="text-[10px] tracking-wide text-[var(--muted)] uppercase">Total raised</div>
                    <div className="font-mono text-lg font-semibold text-[var(--text-strong)]">{p.total_raised}</div>
                  </div>
                )}
                {p.valuation && (
                  <div>
                    <div className="text-[10px] tracking-wide text-[var(--muted)] uppercase">Valuation</div>
                    <div className="font-mono text-lg font-semibold text-[var(--text-strong)]">{p.valuation}</div>
                  </div>
                )}
              </div>
              {(p.rounds ?? []).length > 0 && (
                <div className="flex flex-col divide-y divide-[var(--border)]">
                  {p.rounds.slice(0, 5).map((r: Payload, i: number) => (
                    <div key={i} className="flex items-center justify-between gap-2 py-1.5 first:pt-0 last:pb-0">
                      <span className="text-[13px] text-[var(--text-strong)]">{r.stage || "Round"}</span>
                      <span className="font-mono text-[12px] text-[var(--accent)]">{r.amount || "—"}</span>
                      <span className="ml-auto shrink-0 font-mono text-[11px] text-[var(--faint)]">{r.date || ""}</span>
                    </div>
                  ))}
                </div>
              )}
              {(p.investors ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {p.investors.slice(0, 10).map((inv: string) => (
                    <span
                      key={inv}
                      className="rounded-full border border-[var(--border)] bg-[var(--panel-2)] px-2 py-0.5 text-[11px] text-[var(--text)]"
                    >
                      {inv}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        }
      />
      </Section>
      <Section label="Coverage & community">
      <CardShell
        title="News"
        icon={Newspaper}
        state={categories.news}
        wide
        render={(p) => (
          <div className="flex flex-col gap-2 text-sm">
            <p className="flex items-center gap-3 text-[11px] tracking-wide text-[var(--muted)] uppercase">
              <span>
                <span className="font-mono text-[var(--pos)]">{p.tone_summary?.positive ?? 0}</span> positive
              </span>
              <span>
                <span className="font-mono text-[var(--neg)]">{p.tone_summary?.negative ?? 0}</span> negative
              </span>
              <span>
                <span className="font-mono">{p.tone_summary?.neutral ?? 0}</span> neutral
              </span>
            </p>
            <div className="flex flex-col divide-y divide-[var(--border)]">
              {(p.articles ?? []).slice(0, 7).map((a: Payload) => (
                <a
                  key={a.url}
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex gap-3 py-1.5 first:pt-0 last:pb-0"
                >
                  <span className="truncate text-[13px] text-[var(--text)] group-hover:text-[var(--text-strong)]">
                    {a.title}
                  </span>
                  <span className="ml-auto shrink-0 font-mono text-[11px] text-[var(--faint)]">
                    {a.published_at ?? ""}
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}
      />
      <CardShell
        title="Hacker News"
        icon={TrendUp}
        state={categories.news}
        render={(p) => (
          <div className="flex flex-col divide-y divide-[var(--border)] text-sm">
            {(p.hn_stories ?? []).slice(0, 6).map((a: Payload) => (
              <a
                key={a.source_url}
                href={a.source_url}
                target="_blank"
                rel="noreferrer"
                className="group py-1.5 first:pt-0 last:pb-0"
              >
                <span className="line-clamp-1 text-[13px] text-[var(--text)] group-hover:text-[var(--text-strong)]">
                  {a.title}
                </span>
                <span className="font-mono text-[11px] text-[var(--faint)]">
                  {a.points ?? 0} pts · {a.comments ?? 0} comments
                </span>
              </a>
            ))}
            {(p.hn_stories ?? []).length === 0 && <p className="text-[var(--muted)]">No HN coverage found</p>}
          </div>
        )}
      />
      <CardShell
        title="Community"
        icon={ChatsCircle}
        state={categories.social}
        wide
        render={(p) =>
          (p.posts ?? []).length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No Reddit discussion found</p>
          ) : (
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex flex-wrap items-center gap-3 text-[11px] tracking-wide text-[var(--muted)] uppercase">
                <span>
                  <span className="font-mono text-[var(--pos)]">{p.tone_summary?.positive ?? 0}</span> positive
                </span>
                <span>
                  <span className="font-mono text-[var(--neg)]">{p.tone_summary?.negative ?? 0}</span> negative
                </span>
                {(p.subreddits ?? []).length > 0 && (
                  <span className="ml-auto normal-case">
                    {p.subreddits.slice(0, 4).map((s: Payload) => s.name).join("  ")}
                  </span>
                )}
              </div>
              <div className="flex flex-col divide-y divide-[var(--border)]">
                {(p.posts ?? []).slice(0, 7).map((post: Payload) => (
                  <a
                    key={post.url}
                    href={post.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex gap-3 py-1.5 first:pt-0 last:pb-0"
                  >
                    <span className="truncate text-[13px] text-[var(--text)] group-hover:text-[var(--text-strong)]">
                      {post.title}
                    </span>
                    {post.points != null ? (
                      <span className="ml-auto shrink-0 font-mono text-[11px] text-[var(--faint)]">
                        ↑{post.points} · {post.comments ?? 0}c
                      </span>
                    ) : (
                      post.publisher && (
                        <span className="ml-auto shrink-0 font-mono text-[11px] text-[var(--faint)]">
                          {post.publisher}
                        </span>
                      )
                    )}
                  </a>
                ))}
              </div>
            </div>
          )
        }
      />
      </Section>
      <Section label="People, products & IP">
      <CardShell
        title="Key People"
        icon={Users}
        state={categories.people}
        render={(p) => (
          <ul className="flex flex-col divide-y divide-[var(--border)] text-sm">
            {(p.people ?? []).slice(0, 12).map((person: Payload) => {
              const href = person.wikidata_url ?? person.url;
              return (
                <li key={person.name + person.role} className="flex items-center justify-between gap-2 py-1.5 first:pt-0 last:pb-0">
                  {href ? (
                    <a href={href} target="_blank" rel="noreferrer" className="text-[var(--text)] hover:text-[var(--text-strong)]">
                      {person.name}
                    </a>
                  ) : (
                    <span className="text-[var(--text)]">{person.name}</span>
                  )}
                  <span className="shrink-0 text-xs text-[var(--muted)]">{String(person.role).replace(/_/g, " ")}</span>
                </li>
              );
            })}
            {(p.people ?? []).length === 0 && <p className="text-[var(--muted)]">No structured data found</p>}
          </ul>
        )}
      />
      <CardShell
        title="Products"
        icon={Package}
        state={categories.products}
        render={(p) => (
          <div className="flex flex-wrap gap-1.5">
            {(p.products ?? []).map((prod: Payload) => (
              <span
                key={prod.name}
                className="rounded-full border border-[var(--border)] bg-[var(--panel-2)] px-2.5 py-1 text-xs text-[var(--text)]"
              >
                {prod.name}
              </span>
            ))}
            {(p.products ?? []).length === 0 && (
              <p className="text-sm text-[var(--muted)]">No structured product data found</p>
            )}
          </div>
        )}
      />
      <CardShell
        title="Web Presence"
        icon={Globe}
        state={categories.web_presence}
        render={(p) => (
          <div className="flex flex-col gap-2.5 text-sm">
            <div className="flex flex-wrap gap-1.5">
              {(p.links ?? []).map((l: Payload) => (
                <a
                  key={l.url}
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-2 py-0.5 text-xs text-[var(--accent)] hover:border-[var(--accent-line)]"
                >
                  {l.label}
                </a>
              ))}
            </div>
            {(p.repos ?? []).slice(0, 4).map((r: Payload) => (
              <a key={r.url} href={r.url} target="_blank" rel="noreferrer" className="group text-[13px]">
                <span className="text-[var(--text)] group-hover:text-[var(--text-strong)]">{r.name}</span>
                <span className="ml-2 font-mono text-[11px] text-[var(--faint)]">
                  ★ {r.stars} {r.language ? `· ${r.language}` : ""}
                </span>
              </a>
            ))}
            {(p.languages ?? []).length > 0 && (
              <p className="text-[11px] text-[var(--muted)]">Tech signals: {p.languages.join(", ")}</p>
            )}
          </div>
        )}
      />
      <CardShell
        title="Operational Signals"
        icon={StackSimple}
        state={categories.signals}
        wide
        render={(p) =>
          !p.available ? (
            <p className="text-sm text-[var(--muted)]">{p.message ?? "No operational signals found"}</p>
          ) : (
            <div className="flex flex-col gap-3 text-sm">
              {(p.tech ?? []).length > 0 && (
                <div>
                  <div className="mb-1.5 text-[10px] tracking-wide text-[var(--muted)] uppercase">Tech stack</div>
                  <div className="flex flex-wrap gap-1.5">
                    {p.tech.map((t: Payload) => (
                      <span
                        key={t.name}
                        className="rounded-full border border-[var(--border)] bg-[var(--panel-2)] px-2.5 py-1 text-xs text-[var(--text)]"
                      >
                        {t.name}
                        <span className="ml-1 text-[10px] text-[var(--faint)]">{t.category}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {p.hiring?.available && (
                <div>
                  <div className="mb-1 flex items-center gap-1.5 text-[10px] tracking-wide text-[var(--muted)] uppercase">
                    <Briefcase weight="duotone" className="h-3.5 w-3.5 text-[var(--accent)]" />
                    Hiring
                  </div>
                  <p className="text-[13px] text-[var(--text)]">
                    <span className="font-mono font-semibold text-[var(--text-strong)]">{p.hiring.open_roles}</span>{" "}
                    open roles via {p.hiring.source}
                  </p>
                  {(p.hiring.sample ?? []).length > 0 && (
                    <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                      {p.hiring.sample.slice(0, 4).map((r: Payload) => r.title).filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
              )}
              {p.reviews?.available && (
                <div>
                  <div className="mb-1 flex items-center gap-1.5 text-[10px] tracking-wide text-[var(--muted)] uppercase">
                    <Star weight="fill" className="h-3.5 w-3.5 text-[var(--accent)]" />
                    Reviews
                  </div>
                  <p className="text-[13px] text-[var(--text)]">
                    <span className="font-mono font-semibold text-[var(--text-strong)]">{p.reviews.rating}</span>/5
                    {p.reviews.count != null && (
                      <span className="text-[var(--muted)]"> · {p.reviews.count.toLocaleString()} reviews</span>
                    )}
                    {p.reviews.url && (
                      <>
                        {" · "}
                        <ExtLink href={p.reviews.url}>{p.reviews.source}</ExtLink>
                      </>
                    )}
                  </p>
                </div>
              )}
            </div>
          )
        }
      />
      <CardShell
        title="Patents"
        icon={Certificate}
        state={categories.patents}
        render={(p) =>
          (p.count ?? 0) === 0 ? (
            <p className="text-sm text-[var(--muted)]">{p.message ?? "No patents found"}</p>
          ) : (
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-2xl font-semibold text-[var(--text-strong)]">{p.count}</span>
                <span className="text-xs text-[var(--muted)]">patents on file</span>
              </div>
              <div className="flex flex-col divide-y divide-[var(--border)]">
                {(p.patents ?? []).slice(0, 5).map((pt: Payload) => (
                  <a
                    key={pt.patent_id}
                    href={pt.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex gap-3 py-1.5 first:pt-0 last:pb-0"
                  >
                    <span className="truncate text-[13px] text-[var(--text)] group-hover:text-[var(--text-strong)]">
                      {pt.title}
                    </span>
                    <span className="ml-auto shrink-0 font-mono text-[11px] text-[var(--faint)]">{pt.date ?? ""}</span>
                  </a>
                ))}
              </div>
            </div>
          )
        }
      />
      <CardShell
        title="Competitors"
        icon={Sword}
        state={categories.competitors}
        render={(p) => (
          <div className="flex flex-col gap-2 text-sm">
            {(p.competitors ?? []).map((c: Payload) => (
              <div key={c.name}>
                <span className="text-[var(--text)]">{c.name}</span>
                {c.reason && <p className="text-[11px] text-[var(--muted)]">{c.reason}</p>}
              </div>
            ))}
            {(p.competitors ?? []).length === 0 && (
              <p className="text-[var(--muted)]">{p.message ?? "None identified"}</p>
            )}
          </div>
        )}
      />
      </Section>
      <SocialChannels state={categories.web_presence} />
    </div>
    </RunContext.Provider>
  );
}
