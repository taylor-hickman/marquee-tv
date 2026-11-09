import dns from "node:dns";
import { isIP, Socket } from "node:net";

// The PR gate reaches no third party (build plan 6.1). Every TCP connection
// (fetch, http, https, Postgres) resolves its host with dns.lookup, unless the
// host is an IP. Names other than localhost don't resolve and IPs other than
// loopback refuse to connect, so a third-party host fails as if offline.
// Localhost, such as the local Supabase stack, is untouched, and so is an MSW
// mock, which never resolves the name.
const localNames = new Set(["localhost", "127.0.0.1", "::1"]);
const blocked = (host: string) =>
  Object.assign(
    new Error(`Blocked ${host}: tests reach only localhost. Mock it with MSW.`),
    { code: "ENOTFOUND", hostname: host },
  );

const lookup = dns.lookup;
dns.lookup = function (hostname: string, ...rest: unknown[]) {
  if (localNames.has(hostname)) {
    return (lookup as (...a: unknown[]) => void)(hostname, ...rest);
  }
  const callback = rest.at(-1) as (error: Error) => void;
  process.nextTick(() => callback(blocked(hostname)));
} as typeof dns.lookup;

// Socket#connect takes (options), (port, host?) or (path), and Node's own
// callers pass those arguments pre-packed in an array.
function hostOf(args: unknown[]): string | undefined {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  if (typeof first === "object" && first !== null) {
    return (first as { host?: string }).host;
  }
  return typeof args[1] === "string" ? args[1] : undefined;
}

const connect = Socket.prototype.connect;
Socket.prototype.connect = function (this: Socket, ...args: unknown[]) {
  const host = hostOf(args)?.replace(/^\[(.*)\]$/, "$1");
  if (host && isIP(host) && !localNames.has(host)) {
    process.nextTick(() => this.destroy(blocked(host)));
    return this;
  }
  return (connect as (...a: unknown[]) => Socket).apply(this, args);
} as typeof connect;
