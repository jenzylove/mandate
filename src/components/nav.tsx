"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectWallet } from "./connect-wallet";
export function Nav() {
  const path = usePathname();
  const links = [["/", "Discover", "⌂"], ["/outcomes", "Outcomes", "⊞"], ["/agents", "Agents", "◇"], ["/my-outcomes", "My outcomes", "▤"]] as const;
  const active = (url: string) => url === "/" ? path === "/" : path.startsWith(url);
  return <><header className="mh-site-header"><div className="mh-nav-shell"><Link className="mh-brand" href="/"><b>m<span>✦</span></b>mandate<span>.</span></Link><nav aria-label="Main navigation">{links.map(([url,label])=><Link key={url} className={active(url)?"active":""} href={url}>{label}</Link>)}</nav><ConnectWallet/></div></header><nav className="mh-bottom-nav" aria-label="Mobile navigation">{links.map(([url,label,icon])=><Link key={url} className={active(url)?"active":""} href={url}><span>{icon}</span>{label}</Link>)}</nav></>;
}
