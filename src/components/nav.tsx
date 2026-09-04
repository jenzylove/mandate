"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectWallet } from "./connect-wallet";
export function Nav() {
  const path = usePathname();
  const links = [["/", "Discover", "⌂"], ["/outcomes", "Outcomes", "⊞"], ["/agents", "Agents", "◇"], ["/my-outcomes", "My outcomes", "▤"]] as const;
  const active = (url: string) => url === "/" ? path === "/" : path.startsWith(url);
  return <><header className="mh-site-header"><div className="mh-nav-shell"><Link className="mh-brand" href="/" aria-label="Mandate home"><svg className="mh-brand-mark" viewBox="0 0 36 36" aria-hidden="true"><path className="mh-mark-frame" d="M3 2h27l4 4v23l-5 5H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z"/><path className="mh-mark-m" d="M8 26V10h4.2l5.8 7.2 5.8-7.2H28v16h-4.8v-8.5L18 24l-5.2-6.5V26Z"/><path className="mh-mark-node" d="m29 2 5 5-5 5-5-5Z"/></svg>mandate<span>.</span></Link><nav aria-label="Main navigation">{links.map(([url,label])=><Link key={url} className={active(url)?"active":""} href={url}>{label}</Link>)}</nav><ConnectWallet/></div></header><nav className="mh-bottom-nav" aria-label="Mobile navigation">{links.map(([url,label,icon])=><Link key={url} className={active(url)?"active":""} href={url}><span>{icon}</span>{label}</Link>)}</nav></>;
}
