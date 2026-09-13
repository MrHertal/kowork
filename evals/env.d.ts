declare module "virtual:opencode-server" {
  export namespace Server {
    function listen(opts: { port: number; hostname: string }): Promise<{
      url: string;
      stop(close?: boolean): void | Promise<void>;
    }>;
  }
}
