interface ImportMetaEnv {
  readonly KOWORK_CHANNEL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
declare module "virtual:opencode-server" {
  export namespace Server {
    type Listener = { stop: () => void };
    function listen(opts: {
      port: number;
      hostname: string;
      username: string;
      password: string;
    }): Promise<Listener>;
  }
  export namespace Config {
    type Info = { version: string };
    function get(): Promise<Info>;
  }
  export namespace Log {
    function init(opts: { level: string }): Promise<void>;
  }
  export namespace Database {
    function Path(): string;
    function Client(): { $client: any };
  }
  export namespace JsonMigration {
    type Progress = { current: number; total: number };
    function run(
      db: unknown,
      opts: { progress: (event: Progress) => void },
    ): Promise<void>;
  }
  export function bootstrap(): Promise<void>;
}
