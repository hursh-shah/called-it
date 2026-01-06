declare module "pg" {
  export type QueryResult<Row = any> = {
    rows: Row[];
    rowCount: number;
  };

  export type PoolClient = {
    query<Row = any>(text: string, params?: any[]): Promise<QueryResult<Row>>;
    release(): void;
  };

  export type PoolConfig = {
    connectionString?: string;
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

