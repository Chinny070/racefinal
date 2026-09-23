const WEI_PER_GEN = 1_000_000_000_000_000_000n;

export function weiToGen(wei: bigint | number): string {
  const w = typeof wei === "bigint" ? wei : BigInt(Math.trunc(wei));
  const whole = w / WEI_PER_GEN;
  const frac = w % WEI_PER_GEN;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(18, "0").replace(/0+$/, "");
  return `${whole}.${fracStr}`;
}

export function genToWei(gen: number | string): bigint {
  const [whole, frac = ""] = String(gen).split(".");
  const fracPadded = (frac + "0".repeat(18)).slice(0, 18);
  return BigInt(whole || "0") * WEI_PER_GEN + BigInt(fracPadded || "0");
}

export function truncateAddress(address: string, chars = 4): string {
  if (!address || address.length < chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`;
}

export function formatUnixTime(unixSeconds: number): string {
  if (!unixSeconds) return "—";
  return new Date(unixSeconds * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function timeUntil(unixSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = unixSeconds - now;
  if (diff <= 0) return "now";
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function isPast(unixSeconds: number): boolean {
  return Math.floor(Date.now() / 1000) >= unixSeconds;
}

export function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}
