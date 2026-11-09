// Thrown by the module stubs (T3) until a lane card fills them in.
export class NotImplemented extends Error {
  constructor(what: string) {
    super(`${what} is not implemented`);
    this.name = "NotImplemented";
  }
}

export function notImplemented(what: string): never {
  throw new NotImplemented(what);
}
