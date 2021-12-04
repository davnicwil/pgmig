declare type Logger = (level: string, message: string) => void;
export declare function run(pg: any, { user, host, database, password, port, migrationsDirectory, migrationsTable, log, }: {
    user: string;
    host: string;
    database: string;
    password: string;
    port: number;
    migrationsDirectory: string;
    migrationsTable?: string;
    log: Logger;
}): Promise<void>;
export {};
