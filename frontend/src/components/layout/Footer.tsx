import { CONTRACT_ADDRESS, STUDIO_EXPLORER_URL } from "../../lib/constants";
import { truncateAddress } from "../../lib/format";

export function Footer() {
  return (
    <footer className="border-t border-cloud mt-24">
      <div className="max-w-[1200px] mx-auto px-6 py-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <p className="text-[13px] text-fog font-[var(--font-cosmica)] max-w-md">
          RACE//FINAL settles public competition outcomes by independent validator
          consensus on GenLayer. No backend, no oracle, no admin override.
        </p>
        <a
          href={`${STUDIO_EXPLORER_URL}`}
          target="_blank"
          rel="noreferrer"
          className="text-[13px] font-[var(--font-cosmica)] text-iron hover:text-obsidian border border-cloud rounded-[12px] px-3 py-1.5"
        >
          Contract {truncateAddress(CONTRACT_ADDRESS)} · StudioNet
        </a>
      </div>
    </footer>
  );
}
