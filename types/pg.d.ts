declare module "pg" {
  export type QueryResult<Row = any> = {
    rows: Row[];
    rowCount: number;
  };

  export type PoolClient = {
    query<Row = any>(text: string, params?: any[]): Promise<QueryResult<Row>>;
    release(): void;
  };

  export type SslConfig =
    | boolean
    | {
        rejectUnauthorized?: boolean;
        ca?: string;
        cert?: string;
        key?: string;
      };

  export type PoolConfig = {
    connectionString?: string;
    ssl?: SslConfig;
    max?: number;
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
  };

  export class Pool {
    constructor(config?: PoolConfig);
    query<Row = any>(text: string, params?: any[]): Promise<QueryResult<Row>>;
    connect(): Promise<PoolClient>;
    end(): Promise<void>;
  }

  const pgDefault: {
    Pool: typeof Pool;
  };

  export default pgDefault;
}
