import { Link, NavLink } from "react-router-dom";
import { Button } from "../ui/Button";
import { useWallet } from "../../state/WalletProvider";
import { truncateAddress } from "../../lib/format";

const navLink = ({ isActive }: { isActive: boolean }) =>
  `text-[14px] font-[var(--font-cosmica)] transition-colors ${isActive ? "text-obsidian" : "text-fog hover:text-obsidian"}`;

export function Header() {
  const { address, connecting, connect, disconnect, hasInjectedWallet, error } = useWallet();

  return (
    <header className="sticky top-0 z-20 bg-paper/90 backdrop-blur border-b border-cloud">
      <div className="max-w-[1200px] mx-auto px-6 h-[72px] flex items-center justify-between relative">
        <Link to="/" className="flex items-center gap-2">
          <span className="text-[15px] font-[var(--font-cosmica)] font-semibold text-obsidian tracking-tight">
            RACE//FINAL
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          <NavLink to="/contests" className={navLink}>
            Explorer
          </NavLink>
          <NavLink to="/contests/new" className={navLink}>
            Create
          </NavLink>
          <NavLink to="/withdraw" className={navLink}>
            Withdraw
          </NavLink>
        </nav>

        <div className="flex flex-col items-end gap-1">
          {address ? (
            <button
              onClick={disconnect}
              className="text-[14px] font-[var(--font-cosmica)] bg-[#fafafa] text-graphite rounded-[14px] px-4 py-2.5 hover:bg-cloud transition-colors"
              title="Click to disconnect"
            >
              {truncateAddress(address)}
            </button>
          ) : (
            // Always clickable, even if no wallet was detected yet: clicking
            // is itself how the user finds out why (error message below),
            // rather than a disabled button that looks like a dead click.
            <Button onClick={connect} disabled={connecting}>
              {connecting ? "Connecting…" : "Connect wallet"}
            </Button>
          )}
          {error && !address && (
            <p className="absolute top-[76px] right-0 w-64 text-[12px] text-ember text-right leading-snug bg-snow border border-cloud rounded-[14px] px-3 py-2 z-30">
              {error}
            </p>
          )}
        </div>
      </div>
    </header>
  );
}
