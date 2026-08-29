// TypeScript declarations for Supabase Edge Functions / Deno runtime in the IDE

declare namespace Deno {
  export interface ServeHandlerInfo {
    remoteAddr: {
      transport: "tcp" | "udp";
      hostname: string;
      port: number;
    };
  }

  export type ServeHandler = (
    request: Request,
    info?: ServeHandlerInfo
  ) => Response | Promise<Response>;

  export interface ServeOptions {
    port?: number;
    hostname?: string;
    signal?: AbortSignal;
    onError?: (error: unknown) => Response | Promise<Response>;
    onListen?: (params: { hostname: string; port: number }) => void;
  }

  export function serve(handler: ServeHandler): void;
  export function serve(options: ServeOptions, handler: ServeHandler): void;

  export const env: {
    get(key: string): string | undefined;
    set(key: string, value: string): void;
    delete(key: string): void;
    toObject(): Record<string, string>;
  };
}
